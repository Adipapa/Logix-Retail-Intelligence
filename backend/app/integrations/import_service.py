from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.operations import SourceWorkbook, DailyReport, SummarySnapshot, ImportJob, ImportWarning
from app.integrations.workbook_inspector import inspect_workbook

def import_workbook_bytes(db: Session, *, dropbox_file_id: str, revision: str, path_lower: str, content: bytes):
    inspected = inspect_workbook(content, path_lower)
    ident = inspected["identity"]
    source = db.scalar(select(SourceWorkbook).where(SourceWorkbook.dropbox_file_id==dropbox_file_id, SourceWorkbook.revision==revision))
    if source is None:
        source = SourceWorkbook(dropbox_file_id=dropbox_file_id, revision=revision, path_lower=path_lower,
            file_name=ident["file_name"], reporting_year=ident["year"], reporting_month=ident["month"], status="inspected")
        db.add(source); db.flush()
    else:
        source.path_lower=path_lower; source.status="inspected"; source.last_error=None
    job=ImportJob(source_workbook_id=source.id,status="processing")
    db.add(job); db.flush()
    for item in inspected["daily_sheets"]:
        report_date=datetime.fromisoformat(item["date"]).date()
        record=db.scalar(select(DailyReport).where(DailyReport.source_workbook_id==source.id,DailyReport.report_date==report_date))
        values=dict(source_workbook_id=source.id,source_revision=revision,station_name=ident["station_name"] or "Unresolved station",
            report_date=report_date,worksheet_name=item["worksheet"],template_version="unmapped",completeness="raw_only",
            raw_cells=item["cells"],extracted_data={},source_reference=f"{ident['file_name']} [{item['worksheet']}]")
        if record is None: db.add(DailyReport(**values))
        else:
            for key,value in values.items(): setattr(record,key,value)
    snapshot=db.scalar(select(SummarySnapshot).where(SummarySnapshot.source_workbook_id==source.id))
    if snapshot is None: db.add(SummarySnapshot(source_workbook_id=source.id,raw_cells=inspected["summary_cells"],extracted_data={}))
    else: snapshot.raw_cells=inspected["summary_cells"]
    for warning in inspected["warnings"]:
        db.add(ImportWarning(import_job_id=job.id,worksheet_name=warning["worksheet"],cell_reference=None,severity=warning["severity"],message=warning["message"]))
    job.records_extracted=len(inspected["daily_sheets"]); job.warnings_count=len(inspected["warnings"])
    job.errors_count=sum(1 for w in inspected["warnings"] if w["severity"]=="error")
    job.status="completed_with_warnings" if job.warnings_count else "completed"
    job.completed_at=datetime.now(timezone.utc); source.imported_at=job.completed_at
    source.status="raw_imported" if job.errors_count==0 else "needs_review"
    db.commit()
    return {"source_workbook_id":source.id,"job_id":job.id,"records_extracted":job.records_extracted,
        "warnings":inspected["warnings"],"sheet_summaries":inspected["sheet_summaries"],
        "daily_dates":[x["date"] for x in inspected["daily_sheets"]],"status":source.status}
