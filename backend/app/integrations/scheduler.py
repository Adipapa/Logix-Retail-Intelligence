from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select
from dropbox.exceptions import ApiError
from app.database.session import SessionLocal
from app.core.config import settings
from app.models.integration import DropboxFile, DropboxSyncState
from app.integrations.dropbox_client import scan_folder, reset_cursor\nfrom app.integrations.dropbox_import_queue import process_pending_workbooks

_scheduler = BackgroundScheduler(timezone="UTC")

def run_scheduled_inventory():
    if not (settings.dropbox_refresh_token or settings.dropbox_access_token):
        return
    with SessionLocal() as db:
        state = db.scalar(select(DropboxSyncState).where(DropboxSyncState.state_key == "primary"))
        if state is None:
            state = DropboxSyncState(state_key="primary", last_status="never")
            db.add(state)
            db.flush()
        try:
            try:
                records, next_cursor = scan_folder(state.cursor)
            except ApiError as exc:
                reset_check = getattr(exc.error, "is_reset", lambda: False)
                if state.cursor and reset_check():
                    records, next_cursor = reset_cursor()
                else:
                    raise
            for item in records:
                existing = db.scalar(select(DropboxFile).where(DropboxFile.dropbox_id == item["dropbox_id"]))
                if existing is None:
                    db.add(DropboxFile(**item))
                elif existing.revision != item["revision"]:
                    for key, value in item.items():
                        setattr(existing, key, value)
                    existing.import_status = "pending"
                    existing.last_import_error = None
            state.cursor = next_cursor
            state.last_sync_at = datetime.now(timezone.utc)
            state.last_status = "completed"
            state.last_error = None
            db.commit()
        except Exception as exc:
            db.rollback()
            state = db.scalar(select(DropboxSyncState).where(DropboxSyncState.state_key == "primary"))
            if state:
                state.last_status = "failed"
                state.last_error = str(exc)[:4000]
                db.commit()

def start_scheduler():
    if not _scheduler.running:
        _scheduler.add_job(run_scheduled_inventory, "interval", minutes=15,
                           id="dropbox_inventory", replace_existing=True,
                           max_instances=1, coalesce=True)
        _scheduler.start()

def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
