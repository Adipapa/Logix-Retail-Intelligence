from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.operations import DailyReport, ImportJob, ImportWarning, SourceWorkbook
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

        name = station_name or "Unresolved station"
        item = station_totals.setdefault(name, {"report_count": 0, "pms": [0.0, 0], "ago": [0.0, 0], "revenue": [0.0, 0]})
        item["report_count"] += 1
        for key, value in (("pms", pms), ("ago", ago), ("revenue", revenue)):
            if value is not None:
                item[key][0] += value
                item[key][1] += 1

    stations = [
        {
            "station_name": name,
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
