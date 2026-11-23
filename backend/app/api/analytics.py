from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.database.session import get_db
from app.models.operations import DailyReport, ImportJob, ImportWarning, SourceWorkbook, Station as StationModel, SummarySnapshot
from app.models.integration import DropboxFile, DropboxSyncState
from app.models.user import User

router = APIRouter(prefix="/analytics", tags=["analytics"])


class StationTankCapacityInput(BaseModel):
    station_name: str = Field(min_length=1, max_length=160)
    pms_tank_capacity_litres: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    ago_tank_capacity_litres: float | None = Field(default=None, gt=0, allow_inf_nan=False)

SHIFT_INPUT_COLUMNS = {
    "morning": ("D", "E"),
    "afternoon": ("F", "G"),
    "night": ("H", "I"),
}
PUMP_ROWS = range(5, 13)


def _number(value):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _shift_entry_status(raw_cells):
    raw_cells = raw_cells or {}
    status = {}
    legacy_kotu = (
        str((raw_cells.get("C3") or {}).get("value") or "").strip().upper() == "MORNING"
        and str((raw_cells.get("E3") or {}).get("value") or "").strip().upper() == "AFTERNOON"
        and str((raw_cells.get("G3") or {}).get("value") or "").strip().upper() == "NIGHT"
    )
    shift_columns = (
        {"morning": ("C", "D"), "afternoon": ("E", "F"), "night": ("G", "H")}
        if legacy_kotu else SHIFT_INPUT_COLUMNS
    )
    rows = range(5, 17) if legacy_kotu else PUMP_ROWS
    for shift, columns in shift_columns.items():
        entered = False
        for column in columns:
            for row in rows:
                cell = raw_cells.get(f"{column}{row}") or {}
                if "formula" not in cell and _number(cell.get("value")) is not None:
                    entered = True
                    break
            if entered:
                break
        status[shift] = entered
    return status


def _add(total, value):
    number = _number(value)
    return total if number is None else total + number


def _nullable(total, count):
    return round(total, 2) if count else None


def _base_statement(year, month, station):
    statement = select(DailyReport).join(
        SourceWorkbook, DailyReport.source_workbook_id == SourceWorkbook.id
    )
    if year is not None:
        statement = statement.where(DailyReport.report_date >= date(year, month or 1, 1))
        if month is not None:
            end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
            statement = statement.where(DailyReport.report_date < end)
        else:
            statement = statement.where(DailyReport.report_date < date(year + 1, 1, 1))
    if station:
        statement = statement.where(DailyReport.station_name.ilike(station))
    return statement


@router.get("/overview")
def overview(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    station: str | None = Query(default=None, min_length=1, max_length=160),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    base = _base_statement(year, month, station)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    # Stream only the fields required for the calculations. Loading all ORM
    # entities (especially both JSON columns) at once exceeded Render Free's
    # 512 MiB memory limit on the production dataset.
    stream_query = (
        select(
            DailyReport.report_date,
            DailyReport.station_name,
            DailyReport.raw_cells,
            DailyReport.extracted_data,
        )
        .join(SourceWorkbook, DailyReport.source_workbook_id == SourceWorkbook.id)
    )
    if year is not None:
        stream_query = stream_query.where(DailyReport.report_date >= date(year, month or 1, 1))
        if month is not None:
            end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
            stream_query = stream_query.where(DailyReport.report_date < end)
        else:
            stream_query = stream_query.where(DailyReport.report_date < date(year + 1, 1, 1))
    if station:
        stream_query = stream_query.where(DailyReport.station_name.ilike(station))

    counts = {"mapped": 0, "complete": 0, "pending": 0, "included": 0, "anomalies": 0}
    missing_shift_entries = {"morning": 0, "afternoon": 0, "night": 0}
    sums = {
        "revenue_gmd": [0.0, 0], "pms_litres": [0.0, 0], "ago_litres": [0.0, 0],
        "pms_revenue_gmd": [0.0, 0], "ago_revenue_gmd": [0.0, 0],
        "coupon_sales_gmd": [0.0, 0],
        "cash_reconciliation_difference_gmd": [0.0, 0],
        "pms_stock_difference_litres": [0.0, 0],
        "ago_stock_difference_litres": [0.0, 0],
    }
    station_totals = {}
    monthly_totals = {}
    price_totals = {"revenue_gmd": 0.0, "volume_litres": 0.0, "paired_reports": 0}
    shift_totals = {
        "pms": {"morning": 0.0, "afternoon": 0.0, "night": 0.0},
        "ago": {"morning": 0.0, "afternoon": 0.0, "night": 0.0},
    }

    result = db.execute(
        stream_query.execution_options(stream_results=True, yield_per=100)
    )
    for report_date, station_name, raw_cells, extracted_data in result:
        data = extracted_data or {}
        shifts_data = data.get("shift_sales_litres") or {}
        if not (data.get("template") and shifts_data):
            continue

        counts["mapped"] += 1
        shift_status = _shift_entry_status(raw_cells)
        for shift_name, entered in shift_status.items():
            if not entered:
                missing_shift_entries[shift_name] += 1
        if not all(shift_status.values()):
            counts["pending"] += 1
            continue

        counts["complete"] += 1
        pms = _number(shifts_data.get("pms_total"))
        ago = _number(shifts_data.get("ago_total"))
        revenue_data = data.get("sales_revenue") or {}
        revenue = _number(revenue_data.get("total_gmd"))
        pms_revenue = _number(revenue_data.get("pms_gmd"))
        ago_revenue = _number(revenue_data.get("ago_gmd"))
        coupon_sales = _number((data.get("cash_reconciliation") or {}).get("coupons"))
        if any(value is not None and value < 0 for value in (pms, ago, revenue, pms_revenue, ago_revenue, coupon_sales)):
            counts["anomalies"] += 1
            continue

        counts["included"] += 1
        if revenue is not None and pms is not None and ago is not None:
            price_totals["revenue_gmd"] += revenue
            price_totals["volume_litres"] += pms + ago
            price_totals["paired_reports"] += 1
        values = {
            "revenue_gmd": revenue,
            "pms_litres": pms,
            "ago_litres": ago,
            "pms_revenue_gmd": pms_revenue,
            "ago_revenue_gmd": ago_revenue,
            "coupon_sales_gmd": coupon_sales,
            "cash_reconciliation_difference_gmd": (data.get("cash_reconciliation") or {}).get("difference"),
            "pms_stock_difference_litres": ((data.get("stock_control") or {}).get("pms") or {}).get("difference"),
            "ago_stock_difference_litres": ((data.get("stock_control") or {}).get("ago") or {}).get("difference"),
        }
        for key, value in values.items():
            number = _number(value)
            if number is not None:
                sums[key][0] += number
                sums[key][1] += 1

        name = _canonical_station(station_name)
        key = name.casefold()
        item = station_totals.setdefault(key, {"station_name": name, "report_count": 0, "pms": [0.0, 0], "ago": [0.0, 0], "revenue": [0.0, 0], "pms_revenue": [0.0, 0], "ago_revenue": [0.0, 0], "coupons": [0.0, 0]})
        item["report_count"] += 1
        for key, value in (("pms", pms), ("ago", ago), ("revenue", revenue), ("pms_revenue", pms_revenue), ("ago_revenue", ago_revenue), ("coupons", coupon_sales)):
            if value is not None:
                item[key][0] += value
                item[key][1] += 1

        month_key = report_date.strftime("%Y-%m")
        month_item = monthly_totals.setdefault(month_key, {
            "month": month_key, "pms_litres": 0.0, "ago_litres": 0.0,
            "revenue_gmd": 0.0, "pms_revenue_gmd": 0.0, "ago_revenue_gmd": 0.0,
            "coupon_sales_gmd": 0.0, "completed_reports": 0,
        })
        month_item["completed_reports"] += 1
        if pms is not None:
            month_item["pms_litres"] += pms
        if ago is not None:
            month_item["ago_litres"] += ago
        if revenue is not None:
            month_item["revenue_gmd"] += revenue
        if pms_revenue is not None:
            month_item["pms_revenue_gmd"] += pms_revenue
        if ago_revenue is not None:
            month_item["ago_revenue_gmd"] += ago_revenue
        if coupon_sales is not None:
            month_item["coupon_sales_gmd"] += coupon_sales

        for product_key in ("pms", "ago"):
            product_shifts = shifts_data.get(product_key) or {}
            for shift_key in ("morning", "afternoon", "night"):
                shift_value = _number(product_shifts.get(shift_key))
                if shift_value is not None:
                    shift_totals[product_key][shift_key] += shift_value

    stations = [
        {
            "station_name": item["station_name"],
            "report_count": item["report_count"],
            "pms_litres": _nullable(*item["pms"]),
            "ago_litres": _nullable(*item["ago"]),
            "revenue_gmd": _nullable(*item["revenue"]),
            "coupon_sales_gmd": _nullable(*item["coupons"]),
            "pms_revenue_gmd": _nullable(*item["pms_revenue"]),
            "ago_revenue_gmd": _nullable(*item["ago_revenue"]),
        }
        for name, item in station_totals.items()
    ]
    stations.sort(key=lambda item: item["revenue_gmd"] or 0, reverse=True)

    warning_count = db.query(ImportWarning).join(
        ImportJob, ImportWarning.import_job_id == ImportJob.id
    ).count()

    recent_query = (
        select(
            DailyReport.report_date,
            DailyReport.station_name,
            DailyReport.worksheet_name,
            DailyReport.completeness,
            DailyReport.source_reference,
            DailyReport.raw_cells,
            DailyReport.extracted_data,
        )
        .join(SourceWorkbook, DailyReport.source_workbook_id == SourceWorkbook.id)
    )
    if year is not None:
        recent_query = recent_query.where(DailyReport.report_date >= date(year, month or 1, 1))
        if month is not None:
            end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
            recent_query = recent_query.where(DailyReport.report_date < end)
        else:
            recent_query = recent_query.where(DailyReport.report_date < date(year + 1, 1, 1))
    if station:
        recent_query = recent_query.where(DailyReport.station_name.ilike(station))

    recent_reports = []
    for report_date, station_name, worksheet_name, completeness, source_reference, raw_cells, extracted_data in db.execute(
        recent_query.order_by(DailyReport.report_date.desc()).limit(12)
    ):
        data = extracted_data or {}
        mapped = bool(data.get("template") and data.get("shift_sales_litres"))
        status = "unmapped"
        if mapped:
            status = "complete" if all(_shift_entry_status(raw_cells).values()) else "pending"
        recent_reports.append({
            "report_date": report_date.isoformat(),
            "station_name": station_name,
            "worksheet_name": worksheet_name,
            "completeness": completeness,
            "source_reference": source_reference,
            "mapped": mapped,
            "report_status": status,
        })

    complete_count = counts["complete"]
    pending_count = counts["pending"]
    return {
        "data_status": "mapped_extraction_available" if counts["mapped"] else "no_mapped_extractions",
        "period": {"year": year, "month": month, "station": station},
        "records": {
            "total": total,
            "mapped": counts["mapped"],
            "complete": complete_count,
            "pending": pending_count,
            "included_in_kpis": counts["included"],
            "excluded_anomalies": counts["anomalies"],
            "raw_or_unmapped": total - counts["mapped"],
            "coupon_sales_reports": sums["coupon_sales_gmd"][1],
            "revenue_reports": sums["revenue_gmd"][1],
            "price_calculation_reports": price_totals["paired_reports"],
        },
        "kpis": {
            **{key: _nullable(*value) for key, value in sums.items()},
            "average_revenue_per_completed_report_gmd": round(sums["revenue_gmd"][0] / sums["revenue_gmd"][1], 2) if sums["revenue_gmd"][1] else None,
            "average_selling_price_gmd_per_litre": round(
                price_totals["revenue_gmd"] / price_totals["volume_litres"], 4
            ) if price_totals["paired_reports"] and price_totals["volume_litres"] > 0 else None,
        },
        "monthly_trends": [
            {
                **item,
                "pms_litres": round(item["pms_litres"], 2),
                "ago_litres": round(item["ago_litres"], 2),
                "revenue_gmd": round(item["revenue_gmd"], 2),
                "pms_revenue_gmd": round(item["pms_revenue_gmd"], 2),
                "ago_revenue_gmd": round(item["ago_revenue_gmd"], 2),
                "coupon_sales_gmd": round(item["coupon_sales_gmd"], 2),
                "total_volume_litres": round(item["pms_litres"] + item["ago_litres"], 2),
            }
            for _, item in sorted(monthly_totals.items())
        ],
        "shift_totals": {
            product: {shift: round(value, 2) for shift, value in shifts.items()}
            for product, shifts in shift_totals.items()
        },
        "missing_shift_entries": missing_shift_entries,
        "stations": stations,
        "validation_warning_count": warning_count,
        "recent_reports": recent_reports,
    }


def _sum_present(*values):
    present = [_number(value) for value in values]
    present = [value for value in present if value is not None]
    return round(sum(present), 2) if present else None


def _canonical_station(name):
    cleaned = (name or "Unresolved station").strip()
    return cleaned.title()


def _production_report_row(report_id, report_date, station_name, worksheet_name, completeness, source_reference, imported_at, raw_cells, data):
    data = data or {}
    shifts = data.get("shift_sales_litres") or {}
    pms_shifts = shifts.get("pms") or {}
    ago_shifts = shifts.get("ago") or {}
    revenue = data.get("sales_revenue") or {}
    meters = data.get("meter_totals") or {}
    stock = data.get("stock_control") or {}
    pms_stock = stock.get("pms") or {}
    ago_stock = stock.get("ago") or {}
    cash = data.get("cash_reconciliation") or {}
    credit = data.get("credit_sales") or {}
    delivery = data.get("delivery_totals") or {}
    pms_delivery = delivery.get("pms") or {}
    ago_delivery = delivery.get("ago") or {}
    pms_total = _number(shifts.get("pms_total"))
    ago_total = _number(shifts.get("ago_total"))
    total_revenue = _number(revenue.get("total_gmd"))
    anomaly = any(value is not None and value < 0 for value in (pms_total, ago_total, total_revenue))
    if anomaly:
        pms_total = ago_total = total_revenue = None

    pump_readings = []
    pumps = data.get("pump_meters") or []
    if data.get("template") == "kotu_legacy_v1":
        for pump in pumps:
            for shift_name in ("Morning", "Afternoon", "Night"):
                reading = (pump.get("shifts") or {}).get(shift_name.lower()) or {}
                opening = _number(reading.get("opening"))
                closing = _number(reading.get("closing"))
                throughput = _number(reading.get("throughput"))
                if opening is None and closing is None:
                    continue
                flag = "negative_movement" if throughput is not None and throughput < 0 else (
                    "missing_meter" if opening is None or closing is None else "normal"
                )
                pump_readings.append({
                    "pumpId": str(pump.get("pump_label") or "Unknown pump"),
                    "island": str(pump.get("island") or ""),
                    "product": pump.get("product") if pump.get("product") in ("PMS", "AGO") else "PMS",
                    "shift": shift_name,
                    "openingMeter": opening,
                    "closingMeter": closing,
                    "throughput": throughput,
                    "flag": flag,
                })
    else:
        shift_columns = {
            "Morning": ("D", "E"),
            "Afternoon": ("F", "G"),
            "Night": ("H", "I"),
        }
        for index, pump in enumerate(pumps):
            row_number = index + 5
            for shift_name, (opening_col, closing_col) in shift_columns.items():
                opening_cell = (raw_cells or {}).get(f"{opening_col}{row_number}") or {}
                closing_cell = (raw_cells or {}).get(f"{closing_col}{row_number}") or {}
                opening = _number(opening_cell.get("value"))
                closing = _number(closing_cell.get("value"))
                reading = (pump.get("shifts") or {}).get(shift_name.lower()) or {}
                opening = opening if opening is not None else _number(reading.get("opening"))
                closing = closing if closing is not None else _number(reading.get("closing"))
                if opening is None and closing is None:
                    continue
                throughput = (closing - opening) if opening is not None and closing is not None else _number(reading.get("throughput"))
                flag = "negative_movement" if throughput is not None and throughput < 0 else (
                    "missing_meter" if opening is None or closing is None else "normal"
                )
                pump_readings.append({
                    "pumpId": str(pump.get("pump_label") or f"Pump {index + 1}"),
                    "island": str(pump.get("island") or ""),
                    "product": pump.get("product") if pump.get("product") in ("PMS", "AGO") else "PMS",
                    "shift": shift_name,
                    "openingMeter": opening,
                    "closingMeter": closing,
                    "throughput": throughput,
                    "flag": flag,
                })

    deliveries = data.get("deliveries") or []
    origins = sorted({str(item.get("origin")).strip() for item in deliveries if item.get("origin")})
    destinations = sorted({str(item.get("destination")).strip() for item in deliveries if item.get("destination")})
    diversion_descriptions = [
        f"{item.get('origin') or 'Unknown'} → {item.get('destination') or 'Unknown'}"
        for item in deliveries if _number(item.get("diversion")) not in (None, 0)
    ]

    def val(obj, key):
        return _number((obj or {}).get(key))

    pms_return = val((meters.get("return_to_tank") or {}), "pms")
    ago_return = val((meters.get("return_to_tank") or {}), "ago")
    direct = _sum_present(val(pms_delivery, "direct"), val(ago_delivery, "direct"))
    diverted = _sum_present(val(pms_delivery, "diversion"), val(ago_delivery, "diversion"))
    shortage = _sum_present(val(pms_delivery, "shortage"), val(ago_delivery, "shortage"))
    received = _sum_present(val(pms_delivery, "received"), val(ago_delivery, "received"))

    return {
        "ownerUid": "production",
        "reportId": str(report_id),
        "stationId": _canonical_station(station_name),
        "stationName": _canonical_station(station_name),
        "territory": "",
        "workbookId": str(report_id),
        "workbookPath": source_reference or "",
        "workbookRevision": "",
        "worksheetName": worksheet_name,
        "reportDate": report_date.isoformat(),
        "year": report_date.year,
        "month": report_date.month,
        "weekNumber": report_date.isocalendar().week,
        "weekday": report_date.strftime("%A"),
        "completeness": "warning" if completeness == "warning" else "imported",
        "pmsMorningLitres": val(pms_shifts, "morning"),
        "pmsAfternoonLitres": val(pms_shifts, "afternoon"),
        "pmsNightLitres": val(pms_shifts, "night"),
        "pmsTotalLitres": pms_total,
        "pmsSalesGmd": None if anomaly else val(revenue, "pms_gmd"),
        "pmsReturnToTankLitres": pms_return,
        "pmsCashFuelGmd": None,
        "agoMorningLitres": val(ago_shifts, "morning"),
        "agoAfternoonLitres": val(ago_shifts, "afternoon"),
        "agoNightLitres": val(ago_shifts, "night"),
        "agoTotalLitres": ago_total,
        "agoSalesGmd": None if anomaly else val(revenue, "ago_gmd"),
        "agoReturnToTankLitres": ago_return,
        "agoCashFuelGmd": None,
        "totalFuelSalesGmd": total_revenue,
        "pmsOpeningStock": val(pms_stock, "opening"),
        "pmsReceipts": val(pms_stock, "receipts"),
        "pmsTheoreticalStock": val(pms_stock, "theoretical"),
        "pmsClosingStock": val(pms_stock, "closing"),
        "pmsStockDiff": val(pms_stock, "difference"),
        "pmsStockControlRatio": val(pms_stock, "control_ratio"),
        "agoOpeningStock": val(ago_stock, "opening"),
        "agoReceipts": val(ago_stock, "receipts"),
        "agoTheoreticalStock": val(ago_stock, "theoretical"),
        "agoClosingStock": val(ago_stock, "closing"),
        "agoStockDiff": val(ago_stock, "difference"),
        "agoStockControlRatio": val(ago_stock, "control_ratio"),
        "directDeliveryLitres": direct,
        "diversionLitres": diverted,
        "diversionDirection": "; ".join(diversion_descriptions) or None,
        "shortageLitres": shortage,
        "receivedLitres": received,
        "deliveryOrigin": "; ".join(origins) or None,
        "deliveryDestination": "; ".join(destinations) or None,
        "creditSalesGmd": val(credit, "amount"),
        "couponsGmd": val(cash, "coupons"),
        "qmoneyGmd": val(cash, "qmoney"),
        "waychitGmd": val(cash, "waychit"),
        "chequesGmd": val(cash, "cheques"),
        "cashGmd": val(cash, "cash"),
        "bankedGmd": val(cash, "banked"),
        "reconciliationDiffGmd": val(cash, "difference"),
        "generatorRuntimeHrs": (val(data.get("generator"), "runtime_minutes") / 60) if val(data.get("generator"), "runtime_minutes") is not None else None,
        "generatorRefuelLitres": None,
        "cashpowerKwh": val(data.get("cashpower"), "kwh"),
        "cashpowerPurchaseGmd": val(data.get("cashpower"), "purchase_gmd"),
        "noteText": str(data.get("notes") or ""),
        "sourceRowRef": source_reference or "",
        "pumpReadings": pump_readings,
        "createdAt": imported_at.isoformat() if imported_at else "",
        "updatedAt": imported_at.isoformat() if imported_at else "",
        "productionStatus": "anomaly" if anomaly else "complete",
    }


@router.get("/metadata")
def production_metadata(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return filter options without loading report JSON payloads."""
    available_years = [
        int(value) for value in db.scalars(
            select(func.extract("year", DailyReport.report_date)).distinct().order_by(
                func.extract("year", DailyReport.report_date)
            )
        ).all() if value is not None
    ]
    station_rows = db.scalars(
        select(StationModel).where(StationModel.active.is_(True))
    ).all()
    names = {row.name for row in station_rows}
    names.update(db.scalars(select(DailyReport.station_name).distinct()).all())
    capacity_by_name = {
        row.name.strip().casefold(): row for row in station_rows
    }
    stations = {}
    for value in names:
        display = _canonical_station(value)
        configured = capacity_by_name.get((value or "").strip().casefold())
        item = stations.setdefault(display.casefold(), {
            "stationId": display,
            "canonicalName": display,
            "territory": "",
            "tankCapacityPms": None,
            "tankCapacityAgo": None,
        })
        if configured:
            if configured.pms_tank_capacity_litres is not None:
                item["tankCapacityPms"] = configured.pms_tank_capacity_litres
            if configured.ago_tank_capacity_litres is not None:
                item["tankCapacityAgo"] = configured.ago_tank_capacity_litres
    return {
        "years": available_years,
        "stations": sorted(stations.values(), key=lambda item: item["canonicalName"].casefold()),
    }


@router.put("/station-capacities")
def update_station_tank_capacities(
    payload: StationTankCapacityInput,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    station_name = payload.station_name.strip()
    if not station_name:
        raise HTTPException(status_code=422, detail="Station name cannot be blank.")
    if payload.pms_tank_capacity_litres is None and payload.ago_tank_capacity_litres is None:
        raise HTTPException(status_code=422, detail="Enter at least one tank capacity.")
    station_key = station_name.casefold()
    station = db.scalar(
        select(StationModel).where(
            or_(
                func.lower(func.trim(StationModel.name)) == station_key,
                StationModel.station_key == station_key[:100],
            )
        )
    )
    if station is None:
        station = StationModel(
            station_key=station_key[:100],
            name=_canonical_station(station_name),
            folder_path="",
            active=True,
        )
        db.add(station)
    station.pms_tank_capacity_litres = payload.pms_tank_capacity_litres
    station.ago_tank_capacity_litres = payload.ago_tank_capacity_litres
    db.commit()
    db.refresh(station)
    return {
        "station_name": station.name,
        "pms_tank_capacity_litres": station.pms_tank_capacity_litres,
        "ago_tank_capacity_litres": station.ago_tank_capacity_litres,
    }



def _nested_value(data, path):
    current = data or {}
    for key in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return _number(current)


@router.get("/reconciliations")
def production_reconciliations(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    station: str | None = Query(default=None, min_length=1, max_length=160),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Compare supported SUMMARY worksheet rows with their extracted daily sheets."""
    field_map = {
        "morning pms": ("Morning PMS", "PMS", "shift_sales_litres.pms.morning", 1.0),
        "morning ago": ("Morning AGO", "AGO", "shift_sales_litres.ago.morning", 1.0),
        "afternoon pms": ("Afternoon PMS", "PMS", "shift_sales_litres.pms.afternoon", 1.0),
        "afternoon ago": ("Afternoon AGO", "AGO", "shift_sales_litres.ago.afternoon", 1.0),
        "night pms": ("Night PMS", "PMS", "shift_sales_litres.pms.night", 1.0),
        "night ago": ("Night AGO", "AGO", "shift_sales_litres.ago.night", 1.0),
        "pms": ("PMS Total", "PMS", "shift_sales_litres.pms_total", 1.0),
        "ago": ("AGO Total", "AGO", "shift_sales_litres.ago_total", 1.0),
        "fuel sales": ("Fuel Sales", "GROUP", "sales_revenue.total_gmd", 1.0),
        "total credit sales": ("Total Credit Sales", "GROUP", "credit_sales.amount", 1.0),
        "r/tank (pms)": ("Return to Tank", "PMS", "meter_totals.return_to_tank.pms", 1.0),
        "r/tank (ago)": ("Return to Tank", "AGO", "meter_totals.return_to_tank.ago", 1.0),
        "cash-fuel": ("Cash Fuel", "GROUP", "cash_reconciliation.cash", 1.0),
        "direct (pms)": ("Direct Delivery", "PMS", "delivery_totals.pms.direct", 1.0),
        "diversion (pms)": ("Diversion", "PMS", "delivery_totals.pms.diversion", 1.0),
        "shortage (pms)": ("Shortage", "PMS", "delivery_totals.pms.shortage", 1.0),
        "received (pms)": ("Received", "PMS", "delivery_totals.pms.received", 1.0),
        "direct (ago)": ("Direct Delivery", "AGO", "delivery_totals.ago.direct", 1.0),
        "diversion (ago)": ("Diversion", "AGO", "delivery_totals.ago.diversion", 1.0),
        "shortage (ago)": ("Shortage", "AGO", "delivery_totals.ago.shortage", 1.0),
        "received (ago)": ("Received", "AGO", "delivery_totals.ago.received", 1.0),
        "theoretical stock (pms)": ("Theoretical Stock", "PMS", "stock_control.pms.theoretical", 1.0),
        "opening stock (pms)": ("Opening Stock", "PMS", "stock_control.pms.opening", 1.0),
        "closing stock (pms)": ("Closing Stock", "PMS", "stock_control.pms.closing", 1.0),
        "difference (pms)": ("Stock Difference", "PMS", "stock_control.pms.difference", 1.0),
        "control (pms)": ("Stock Control Ratio", "PMS", "stock_control.pms.control_ratio", 0.005),
        "theoretical stock (ago)": ("Theoretical Stock", "AGO", "stock_control.ago.theoretical", 1.0),
        "opening stock (ago)": ("Opening Stock", "AGO", "stock_control.ago.opening", 1.0),
        "closing stock (ago)": ("Closing Stock", "AGO", "stock_control.ago.closing", 1.0),
        "difference (ago)": ("Stock Difference", "AGO", "stock_control.ago.difference", 1.0),
        "control (ago)": ("Stock Control Ratio", "AGO", "stock_control.ago.control_ratio", 0.005),
        "generator runtime (mins)": ("Generator Runtime", "GROUP", "generator.runtime_minutes", 1.0),
        "generator refuel (gmd)": ("Generator Refuel", "GROUP", "generator.refuel_gmd", 1.0),
        "cashpower (kwh)": ("Cashpower Consumption", "GROUP", "cashpower.kwh", 1.0),
        "cashpower purchase (gmd)": ("Cashpower Purchase", "GROUP", "cashpower.purchase_gmd", 1.0),
        "coupons": ("Coupons", "GROUP", "cash_reconciliation.coupons", 1.0),
        "qmoney": ("Qmoney", "GROUP", "cash_reconciliation.qmoney", 1.0),
        "waychit": ("Waychit", "GROUP", "cash_reconciliation.waychit", 1.0),
        "cheques": ("Cheques", "GROUP", "cash_reconciliation.cheques", 1.0),
        "credit sales": ("Credit Sales", "GROUP", "cash_reconciliation.credit_sales", 1.0),
        "cash": ("Cash", "GROUP", "cash_reconciliation.cash", 1.0),
        "banked": ("Banked", "GROUP", "cash_reconciliation.banked", 1.0),
        "difference": ("Cash Reconciliation Difference", "GROUP", "cash_reconciliation.difference", 1.0),
    }
    snapshots = db.execute(
        select(SummarySnapshot, SourceWorkbook)
        .join(SourceWorkbook, SummarySnapshot.source_workbook_id == SourceWorkbook.id)
        .order_by(SourceWorkbook.id)
    ).all()
    checks = []
    supported_workbooks = set()
    for snapshot, source in snapshots:
        raw = snapshot.raw_cells or {}
        headers = {}
        for coordinate, cell in raw.items():
            letters = "".join(ch for ch in coordinate if ch.isalpha())
            digits = "".join(ch for ch in coordinate if ch.isdigit())
            if digits == "1" and letters:
                header = str((cell or {}).get("value") or "").strip().casefold()
                if header in field_map:
                    headers[letters] = field_map[header]
        if not headers:
            continue
        supported_workbooks.add(source.id)
        daily_rows = {
            report.report_date.isoformat(): report
            for report in db.scalars(
                select(DailyReport).where(DailyReport.source_workbook_id == source.id)
            ).all()
        }
        for coordinate, cell in raw.items():
            letters = "".join(ch for ch in coordinate if ch.isalpha())
            digits = "".join(ch for ch in coordinate if ch.isdigit())
            if letters != "F" or not digits or digits == "1":
                continue
            row_number = int(digits)
            date_value = (cell or {}).get("value")
            report_date = str(date_value)[:10] if date_value else ""
            try:
                parsed_date = date.fromisoformat(report_date)
            except ValueError:
                continue
            if year is not None and parsed_date.year != year:
                continue
            if month is not None and parsed_date.month != month:
                continue
            if station and source.file_name and not any(
                report.station_name.strip().casefold() == station.strip().casefold()
                for report in daily_rows.values()
            ):
                continue
            daily = daily_rows.get(report_date)
            station_name = (
                str((raw.get(f"G{row_number}") or {}).get("value") or
                    (daily.station_name if daily else "Unresolved station"))
            )
            if station and station_name.strip().casefold() != station.strip().casefold():
                continue
            for column, (field_name, product, data_path, tolerance) in headers.items():
                summary_value = _number((raw.get(f"{column}{row_number}") or {}).get("value"))
                daily_value = _nested_value(daily.extracted_data, data_path) if daily else None
                variance = round(daily_value - summary_value, 4) if daily_value is not None and summary_value is not None else None
                if daily_value is None:
                    result = "missing_daily"
                elif summary_value is None:
                    result = "missing_summary"
                elif abs(variance) <= tolerance:
                    result = "matched" if abs(variance) < 0.0001 else "within_tolerance"
                else:
                    result = "variance_exceeded"
                checks.append({
                    "ownerUid": "production",
                    "reconciliationId": f"{source.id}-{report_date}-{column}",
                    "workbookId": str(source.id),
                    "stationId": _canonical_station(station_name),
                    "stationName": _canonical_station(station_name),
                    "year": parsed_date.year,
                    "month": parsed_date.month,
                    "reportDate": report_date,
                    "fieldName": field_name,
                    "product": product,
                    "dailyDerivedValue": daily_value,
                    "summaryValue": summary_value,
                    "variance": variance,
                    "tolerance": tolerance,
                    "result": result,
                    "sourceWorkbook": source.file_name,
                })
    return {
        "checks": checks,
        "supported_workbooks": len(supported_workbooks),
        "total_workbooks_with_summary": len(snapshots),
        "unsupported_workbooks": max(0, len(snapshots) - len(supported_workbooks)),
        "check_count": len(checks),
    }


@router.get("/reports")
def production_reports(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    station: str | None = Query(default=None, min_length=1, max_length=160),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=250, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    statement = (
        select(
            DailyReport.id,
            DailyReport.report_date,
            DailyReport.station_name,
            DailyReport.worksheet_name,
            DailyReport.completeness,
            DailyReport.source_reference,
            DailyReport.imported_at,
            DailyReport.raw_cells,
            DailyReport.extracted_data,
        )
        .join(SourceWorkbook, DailyReport.source_workbook_id == SourceWorkbook.id)
        .order_by(DailyReport.report_date.desc(), DailyReport.id.desc())
    )
    if year is not None:
        statement = statement.where(DailyReport.report_date >= date(year, month or 1, 1))
        if month is not None:
            end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
            statement = statement.where(DailyReport.report_date < end)
        else:
            statement = statement.where(DailyReport.report_date < date(year + 1, 1, 1))
    if station:
        statement = statement.where(func.lower(func.trim(DailyReport.station_name)) == station.strip().lower())

    # Bound each request's database and JSON payload. The frontend can request
    # subsequent pages without forcing the API process to retain the full history.
    page_rows = db.execute(
        statement.offset((page - 1) * page_size).limit(page_size + 1)
    ).all()
    has_more = len(page_rows) > page_size
    page_rows = page_rows[:page_size]

    reports = []
    stations = {}
    for row in page_rows:
        (report_id, report_date, station_name, worksheet_name, completeness,
         source_reference, imported_at, raw_cells, extracted_data) = row
        data = extracted_data or {}
        if not (data.get("template") and data.get("shift_sales_litres")):
            continue
        if not all(_shift_entry_status(raw_cells).values()):
            continue
        report = _production_report_row(
            report_id, report_date, station_name, worksheet_name, completeness,
            source_reference, imported_at, raw_cells, data
        )
        reports.append(report)
        key = (station_name or "Unresolved station").strip().casefold()
        display = _canonical_station(station_name)
        if key not in stations:
            stations[key] = {"stationId": display, "canonicalName": display, "territory": ""}
    available_years = [
        int(value) for value in db.scalars(
            select(func.extract("year", DailyReport.report_date)).distinct().order_by(
                func.extract("year", DailyReport.report_date)
            )
        ).all() if value is not None
    ]
    station_rows = db.scalars(select(StationModel.name).where(StationModel.active.is_(True))).all()
    station_options = {}
    for value in station_rows:
        display = _canonical_station(value)
        station_options.setdefault(display.casefold(), {
            "stationId": display, "canonicalName": display, "territory": ""
        })
    for item in stations.values():
        station_options.setdefault(item["canonicalName"].casefold(), item)

    return {
        "reports": reports,
        "years": available_years,
        "stations": sorted(station_options.values(), key=lambda item: item["canonicalName"].casefold()),
        "record_count": len(reports),
        "page": page,
        "page_size": page_size,
        "has_more": has_more,
    }


@router.get("/monitor")
def production_monitor(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    station_names = {
        row.id: _canonical_station(row.name)
        for row in db.scalars(select(StationModel)).all()
    }
    file_rows = db.execute(
        select(DropboxFile, SourceWorkbook)
        .outerjoin(SourceWorkbook, SourceWorkbook.dropbox_file_id == DropboxFile.dropbox_id)
        .order_by(DropboxFile.modified_at.desc())
    ).all()
    workbook_counts = {}
    summary_ids = set(db.scalars(select(SummarySnapshot.source_workbook_id).distinct()).all())
    for source in db.scalars(select(SourceWorkbook)).all():
        workbook_counts[source.id] = 0
    for source_id, count in db.execute(
        select(DailyReport.source_workbook_id, func.count(DailyReport.id)).group_by(DailyReport.source_workbook_id)
    ).all():
        workbook_counts[source_id] = count

    workbooks = []
    for dropbox_file, source in file_rows:
        path_parts = [part for part in dropbox_file.path_lower.split("/") if part]
        try:
            root_index = next(i for i, part in enumerate(path_parts) if part.casefold() == "logix retail")
            path_station = path_parts[root_index + 1]
        except (StopIteration, IndexError):
            path_station = "Unresolved station"
        station_name = station_names.get(source.station_id, _canonical_station(path_station)) if source else _canonical_station(path_station)
        source_id = source.id if source else None
        daily_count = workbook_counts.get(source_id, 0) if source_id is not None else 0
        has_summary = source_id in summary_ids if source_id is not None else False
        path_year = next((int(part) for part in path_parts if part.isdigit() and len(part) == 4), 0)
        workbooks.append({
            "ownerUid": "production",
            "workbookId": str(source.id if source else dropbox_file.id),
            "stationId": station_name,
            "stationName": station_name,
            "year": (source.reporting_year or path_year) if source else path_year,
            "month": source.reporting_month or 0 if source else 0,
            "dropboxFileId": dropbox_file.dropbox_id,
            "path": dropbox_file.path_lower,
            "revision": dropbox_file.revision,
            "fileName": source.file_name if source else dropbox_file.name,
            "sizeBytes": dropbox_file.size_bytes,
            "sheetCount": daily_count + (1 if has_summary else 0),
            "dailySheetsFound": daily_count,
            "hasSummarySheet": has_summary,
            "templateVersion": "Imported extraction" if daily_count else "Unmapped",
            "calculationVersion": "",
            "status": (
                "failed" if dropbox_file.import_status == "failed"
                else "warning" if dropbox_file.import_status == "needs_review"
                else "imported" if dropbox_file.import_status == "imported"
                else "incomplete"
            ),
            "modifiedAt": dropbox_file.modified_at.isoformat() if dropbox_file.modified_at else "",
            "importedAt": source.imported_at.isoformat() if source and source.imported_at else "",
        })

    job_rows = db.execute(
        select(ImportJob, SourceWorkbook)
        .join(SourceWorkbook, ImportJob.source_workbook_id == SourceWorkbook.id)
        .order_by(ImportJob.started_at.desc())
        .limit(500)
    ).all()
    import_jobs = []
    for job, source in job_rows:
        import_jobs.append({
            "ownerUid": "production",
            "jobId": str(job.id),
            "workbookId": str(source.id),
            "fileName": source.file_name,
            "stationName": station_names.get(source.station_id, "Unresolved station"),
            "year": source.reporting_year or 0,
            "month": source.reporting_month or 0,
            "status": job.status,
            "recordsExtracted": job.records_extracted,
            "warningsCount": job.warnings_count,
            "errorsCount": job.errors_count,
            "errorSummary": job.error_summary or "",
            "startedAt": job.started_at.isoformat() if job.started_at else "",
            "completedAt": job.completed_at.isoformat() if job.completed_at else "",
        })

    warning_rows = db.execute(
        select(ImportWarning, ImportJob, SourceWorkbook)
        .join(ImportJob, ImportWarning.import_job_id == ImportJob.id)
        .join(SourceWorkbook, ImportJob.source_workbook_id == SourceWorkbook.id)
        .order_by(ImportJob.started_at.desc())
        .limit(1000)
    ).all()
    warnings = []
    for warning, job, source in warning_rows:
        warnings.append({
            "ownerUid": "production",
            "warningId": str(warning.id),
            "jobId": str(job.id),
            "workbookId": str(source.id),
            "stationId": station_names.get(source.station_id, ""),
            "stationName": station_names.get(source.station_id, "Unresolved station"),
            "reportDate": "",
            "worksheet": warning.worksheet_name,
            "field": warning.cell_reference or "",
            "severity": warning.severity,
            "message": warning.message,
            "sourceReference": source.path_lower,
            "createdAt": job.started_at.isoformat() if job.started_at else "",
        })

    state = db.scalar(select(DropboxSyncState).where(DropboxSyncState.state_key == "primary"))
    return {
        "workbooks": workbooks,
        "importJobs": import_jobs,
        "importWarnings": warnings,
        "syncStatus": {
            "configured": bool(state),
            "rootPath": "/Logix Retail",
            "lastSyncAt": state.last_sync_at.isoformat() if state and state.last_sync_at else None,
            "lastStatus": state.last_status if state else "never",
            "lastError": state.last_error if state else None,
            "trackedWorkbooks": db.query(DropboxFile).count(),
        },
        "syncRuns": [],
        "auditLogs": [],
    }
