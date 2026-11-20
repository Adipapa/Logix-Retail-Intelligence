from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.operations import DailyReport, ImportJob, ImportWarning, SourceWorkbook
from app.models.user import User

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _number(value):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _sum_present(values):
    present = [value for value in values if value is not None]
    return round(sum(present), 2) if present else None


@router.get("/overview")
def overview(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    station: str | None = Query(default=None, min_length=1, max_length=160),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
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
    records = db.scalars(statement.order_by(DailyReport.report_date.desc())).all()

    mapped = []
    for record in records:
        data = record.extracted_data or {}
        if data.get("template") and data.get("shift_sales_litres"):
            mapped.append((record, data))

    def collect(path):
        values = []
        for _, data in mapped:
            value = data
            for key in path:
                value = value.get(key) if isinstance(value, dict) else None
            values.append(_number(value))
        return values

    pms_values = collect(("shift_sales_litres", "pms_total"))
    ago_values = collect(("shift_sales_litres", "ago_total"))
    revenue_values = collect(("sales_revenue", "total_gmd"))
    cash_diff_values = collect(("cash_reconciliation", "difference"))
    pms_stock_values = collect(("stock_control", "pms", "difference"))
    ago_stock_values = collect(("stock_control", "ago", "difference"))

    station_map = {}
    for record, data in mapped:
        name = record.station_name or "Unresolved station"
        item = station_map.setdefault(name, {"station_name": name, "report_count": 0, "pms_litres": [], "ago_litres": [], "revenue_gmd": []})
        item["report_count"] += 1
        item["pms_litres"].append(_number((data.get("shift_sales_litres") or {}).get("pms_total")))
        item["ago_litres"].append(_number((data.get("shift_sales_litres") or {}).get("ago_total")))
        item["revenue_gmd"].append(_number((data.get("sales_revenue") or {}).get("total_gmd")))

    stations = []
    for item in station_map.values():
        stations.append({
            "station_name": item["station_name"],
            "report_count": item["report_count"],
            "pms_litres": _sum_present(item["pms_litres"]),
            "ago_litres": _sum_present(item["ago_litres"]),
            "revenue_gmd": _sum_present(item["revenue_gmd"]),
        })
    stations.sort(key=lambda item: item["revenue_gmd"] or 0, reverse=True)

    warning_count = db.query(ImportWarning).join(
        ImportJob, ImportWarning.import_job_id == ImportJob.id
    ).count()

    return {
        "data_status": "mapped_extraction_available" if mapped else "no_mapped_extractions",
        "period": {"year": year, "month": month, "station": station},
        "records": {"total": len(records), "mapped": len(mapped), "raw_or_unmapped": len(records) - len(mapped)},
        "kpis": {
            "revenue_gmd": _sum_present(revenue_values),
            "pms_litres": _sum_present(pms_values),
            "ago_litres": _sum_present(ago_values),
            "cash_reconciliation_difference_gmd": _sum_present(cash_diff_values),
            "pms_stock_difference_litres": _sum_present(pms_stock_values),
            "ago_stock_difference_litres": _sum_present(ago_stock_values),
        },
        "stations": stations,
        "validation_warning_count": warning_count,
        "recent_reports": [
            {
                "report_date": record.report_date.isoformat(),
                "station_name": record.station_name,
                "worksheet_name": record.worksheet_name,
                "completeness": record.completeness,
                "source_reference": record.source_reference,
                "mapped": bool(data.get("template")),
            }
            for record, data in [(record, record.extracted_data or {}) for record in records[:12]]
        ],
    }
