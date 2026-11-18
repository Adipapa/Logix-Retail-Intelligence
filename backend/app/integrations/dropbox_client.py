from datetime import datetime, timezone
import dropbox
from dropbox.exceptions import AuthError, ApiError
from dropbox.files import FileMetadata, FolderMetadata
from app.core.config import settings

class DropboxNotConfigured(RuntimeError):
    pass

def get_client() -> dropbox.Dropbox:
    if not settings.dropbox_access_token:
        raise DropboxNotConfigured("Dropbox is not configured. Add DROPBOX_ACCESS_TOKEN to backend/.env.")
    return dropbox.Dropbox(oauth2_access_token=settings.dropbox_access_token)

def is_supported_workbook(name: str) -> bool:
    lower = name.lower()
    return lower.endswith((".xlsx", ".xlsm"))

def entry_to_record(entry: FileMetadata) -> dict:
    modified = entry.server_modified
    if modified and modified.tzinfo is None:
        modified = modified.replace(tzinfo=timezone.utc)
    return {
        "dropbox_id": entry.id,
        "path_lower": entry.path_lower,
        "name": entry.name,
        "revision": entry.rev,
        "size_bytes": entry.size,
        "modified_at": modified,
    }

def scan_folder(cursor: str | None = None):
    client = get_client()
    if cursor:
        result = client.files_list_folder_continue(cursor)
    else:
        result = client.files_list_folder(
            settings.dropbox_root_path or "",
            recursive=True,
            include_deleted=False,
            limit=2000,
        )
    entries = [entry_to_record(e) for e in result.entries if isinstance(e, FileMetadata) and is_supported_workbook(e.name)]
    while result.has_more:
        result = client.files_list_folder_continue(result.cursor)
        entries.extend(entry_to_record(e) for e in result.entries if isinstance(e, FileMetadata) and is_supported_workbook(e.name))
    return entries, result.cursor

def reset_cursor():
    client = get_client()
    result = client.files_list_folder(settings.dropbox_root_path or "", recursive=True, include_deleted=False, limit=2000)
    entries = [entry_to_record(e) for e in result.entries if isinstance(e, FileMetadata) and is_supported_workbook(e.name)]
    while result.has_more:
        result = client.files_list_folder_continue(result.cursor)
        entries.extend(entry_to_record(e) for e in result.entries if isinstance(e, FileMetadata) and is_supported_workbook(e.name))
    return entries, result.cursor
