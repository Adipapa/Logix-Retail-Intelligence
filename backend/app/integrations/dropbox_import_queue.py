from sqlalchemy import select

from app.models.integration import DropboxFile
from app.integrations.dropbox_client import download_file
from app.integrations.import_service import import_workbook_bytes


def process_pending_workbooks(db, limit: int = 50):
    pending = db.scalars(
        select(DropboxFile)
        .where(DropboxFile.import_status == "pending")
        .order_by(DropboxFile.modified_at.asc())
        .limit(limit)
    ).all()

    results = []
    for item in pending:
        try:
            payload = download_file(item.path_lower)
            result = import_workbook_bytes(
                db,
                dropbox_file_id=item.dropbox_id,
                revision=item.revision,
                path_lower=item.path_lower,
                content=payload,
            )
            item.import_status = (
                "imported" if result["status"] == "raw_imported" else "needs_review"
            )
            item.last_import_error = None
            db.commit()
            results.append({
                "file": item.name,
                "status": item.import_status,
                "records_extracted": result["records_extracted"],
                "warnings": len(result["warnings"]),
            })
        except Exception as exc:
            db.rollback()
            current = db.scalar(
                select(DropboxFile).where(DropboxFile.dropbox_id == item.dropbox_id)
            )
            if current:
                current.import_status = "failed"
                current.last_import_error = str(exc)[:4000]
                db.commit()
            results.append({
                "file": item.name,
                "status": "failed",
                "error": str(exc)[:500],
            })

    return results
