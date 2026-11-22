from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from dropbox.exceptions import AuthError, ApiError

from app.api.deps import require_admin, get_current_user
from app.core.config import settings
from app.database.session import get_db
from app.models.user import User
from app.models.integration import DropboxFile, DropboxSyncState
from app.integrations.dropbox_client import DropboxNotConfigured, scan_folder, reset_cursor
from app.integrations.dropbox_import_queue import process_pending_workbooks


router = APIRouter(prefix="/integrations/dropbox", tags=["Dropbox"])


@router.get("/status")
def status(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    state = db.scalar(
        select(DropboxSyncState).where(DropboxSyncState.state_key == "primary")
    )
    return {
        "configured": bool(
            settings.dropbox_refresh_token
            and settings.dropbox_app_key
            and settings.dropbox_app_secret
        ) or bool(settings.dropbox_access_token),
        "root_path": settings.dropbox_root_path or "/",
        "last_sync_at": state.last_sync_at.isoformat() if state and state.last_sync_at else None,
        "last_status": state.last_status if state else "never",
        "last_error": state.last_error if state else None,
        "tracked_workbooks": db.query(DropboxFile).count(),
    }


@router.post("/sync")
def sync_now(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    state = db.scalar(
        select(DropboxSyncState).where(DropboxSyncState.state_key == "primary")
    )
    if not state:
        state = DropboxSyncState(state_key="primary", last_status="never")
        db.add(state)
        db.flush()

    try:
        try:
            records, next_cursor = scan_folder(state.cursor)
        except ApiError as exc:
            # A stale cursor must trigger a full inventory, not be silently advanced.
            is_reset = getattr(exc.error, "is_reset", lambda: False)()
            if state.cursor and is_reset:
                records, next_cursor = reset_cursor()
            else:
                raise

        changed = 0
        for item in records:
            existing = db.scalar(
                select(DropboxFile).where(DropboxFile.dropbox_id == item["dropbox_id"])
            )
            if existing is None:
                db.add(DropboxFile(**item))
                changed += 1
            elif existing.revision != item["revision"]:
                for key, value in item.items():
                    setattr(existing, key, value)
                existing.import_status = "pending"
                existing.last_import_error = None
                changed += 1

        # Save the inventory cursor before processing the import queue.
        state.cursor = next_cursor
        state.last_sync_at = datetime.now(timezone.utc)
        state.last_status = "completed"
        state.last_error = None
        db.commit()

        # Import a larger batch; remaining pending files stay queued for later runs.
        import_results = process_pending_workbooks(db, limit=50)
        return {
            "status": "completed",
            "files_seen": len(records),
            "new_or_changed": changed,
            "tracked_workbooks": db.query(DropboxFile).count(),
            "last_sync_at": state.last_sync_at.isoformat(),
            "imports_attempted": len(import_results),
            "imports_succeeded": sum(
                1 for item in import_results if item.get("status") == "imported"
            ),
            "imports_failed": sum(
                1 for item in import_results if item.get("status") == "failed"
            ),
            "imports_needing_review": sum(
                1 for item in import_results if item.get("status") == "needs_review"
            ),
            "import_results": import_results,
        }
    except DropboxNotConfigured as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc))
    except (AuthError, ApiError) as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Dropbox API error: {exc}")
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Dropbox sync failed: {exc}")

@router.post("/reprocess-legacy-2022")
def reprocess_legacy_2022(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    # Re-import only the three existing Kotu 2022 workbooks from their current
    # Dropbox revisions. This refreshes extracted fields without changing source files.
    legacy_paths = [
        "/logix retail/kotu/2022/9 kotu daily sales september 2022.xlsm",
        "/logix retail/kotu/2022/11 kotu daily sales november 2022.xlsm",
        "/logix retail/kotu/2022/12 kotu daily sales decemmber 2022.xlsm",
    ]
    items = db.scalars(
        select(DropboxFile).where(DropboxFile.path_lower.in_(legacy_paths))
    ).all()
    if len(items) != len(legacy_paths):
        found = {item.path_lower for item in items}
        missing = [path for path in legacy_paths if path not in found]
        raise HTTPException(status_code=404, detail=f"Some legacy Kotu 2022 workbooks are not indexed: {missing}")

    for item in items:
        item.import_status = "pending"
        item.last_import_error = None
    db.commit()

    results = process_pending_workbooks(db, limit=len(legacy_paths))
    succeeded = sum(1 for item in results if item.get("status") == "imported")
    failed = len(results) - succeeded
    return {
        "status": "completed" if failed == 0 else "partial",
        "workbooks_attempted": len(results),
        "workbooks_succeeded": succeeded,
        "workbooks_failed": failed,
        "results": results,
    }

