from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.operations import DailyReport, ImportJob, ImportWarning, SourceWorkbook, Station as StationModel, SummarySnapshot
from app.models.integration import DropboxFile, DropboxSyncState
from app.models.user import User

router = APIRouter(prefix="/analytics", tags=["analytics"])

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
    for shift, columns in SHIFT_INPUT_COLUMNS.items():
        entered = False
        for column in columns:
            for row in PUMP_ROWS:
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
    sums = {
        "revenue_gmd": [0.0, 0], "pms_litres": [0.0, 0], "ago_litres": [0.0, 0],
        "cash_reconciliation_difference_gmd": [0.0, 0],
        "pms_stock_difference_litres": [0.0, 0],
        "ago_stock_difference_litres": [0.0, 0],
    }
    station_totals = {}

    result = db.execute(
        stream_query.execution_options(stream_results=True, yield_per=100)
    )
    for station_name, raw_cells, extracted_data in result:
        data = extracted_data or {}
        shifts_data = data.get("shift_sales_litres") or {}
        if not (data.get("template") and shifts_data):
            continue

        counts["mapped"] += 1
        if not all(_shift_entry_status(raw_cells).values()):
            counts["pending"] += 1
            continue

        counts["complete"] += 1
        pms = _number(shifts_data.get("pms_total"))
        ago = _number(shifts_data.get("ago_total"))
        revenue = _number((data.get("sales_revenue") or {}).get("total_gmd"))
        if any(value is not None and value < 0 for value in (pms, ago, revenue)):
            counts["anomalies"] += 1
            continue

        counts["included"] += 1
        values = {
            "revenue_gmd": revenue,
            "pms_litres": pms,
            "ago_litres": ago,
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
        item = station_totals.setdefault(key, {"station_name": name, "report_count": 0, "pms": [0.0, 0], "ago": [0.0, 0], "revenue": [0.0, 0]})
        item["report_count"] += 1
        for key, value in (("pms", pms), ("ago", ago), ("revenue", revenue)):
            if value is not None:
                item[key][0] += value
                item[key][1] += 1

    stations = [
        {
            "station_name": item["station_name"],
            "report_count": item["report_count"],
            "pms_litres": _nullable(*item["pms"]),
            "ago_litres": _nullable(*item["ago"]),
            "revenue_gmd": _nullable(*item["revenue"]),
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
        },
        "kpis": {key: _nullable(*value) for key, value in sums.items()},
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
    shift_columns = {
        "Morning": ("D", "E"),
        "Afternoon": ("F", "G"),
        "Night": ("H", "I"),
    }
    pumps = data.get("pump_meters") or []
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


@router.get("/reports")
def production_reports(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    station: str | None = Query(default=None, min_length=1, max_length=160),
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

    reports = []
    years = set()
    stations = {}
    result = db.execute(statement.execution_options(stream_results=True, yield_per=100))
    for row in result:
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
        years.add(report_date.year)
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
        if source is None:
            continue
        path_parts = [part for part in dropbox_file.path_lower.split("/") if part]
        try:
            root_index = next(i for i, part in enumerate(path_parts) if part.casefold() == "logix retail")
            path_station = path_parts[root_index + 1]
        except (StopIteration, IndexError):
            path_station = "Unresolved station"
        station_name = station_names.get(source.station_id, _canonical_station(path_station))
        workbooks.append({
            "ownerUid": "production",
            "workbookId": str(source.id),
            "stationId": station_name,
            "stationName": station_name,
            "year": source.reporting_year or 0,
            "month": source.reporting_month or 0,
            "dropboxFileId": source.dropbox_file_id,
            "path": source.path_lower,
            "revision": source.revision,
            "fileName": source.file_name,
            "sizeBytes": dropbox_file.size_bytes,
            "sheetCount": workbook_counts.get(source.id, 0) + (1 if source.id in summary_ids else 0),
            "dailySheetsFound": workbook_counts.get(source.id, 0),
            "hasSummarySheet": source.id in summary_ids,
            "templateVersion": "Imported extraction" if workbook_counts.get(source.id, 0) else "Unmapped",
            "calculationVersion": "",
            "status": (
                "failed" if dropbox_file.import_status == "failed"
                else "warning" if dropbox_file.import_status == "needs_review"
                else "imported" if dropbox_file.import_status == "imported"
                else "incomplete"
            ),
            "modifiedAt": dropbox_file.modified_at.isoformat() if dropbox_file.modified_at else "",
            "importedAt": source.imported_at.isoformat() if source.imported_at else "",
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
            "retryCount": 0,
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
