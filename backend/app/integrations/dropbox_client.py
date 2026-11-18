import dropbox
from dropbox.files import FileMetadata
from app.core.config import settings

class DropboxNotConfigured(RuntimeError):
    pass

def get_client() -> dropbox.Dropbox:
    if settings.dropbox_refresh_token and settings.dropbox_app_key and settings.dropbox_app_secret:
        return dropbox.Dropbox(
            oauth2_refresh_token=settings.dropbox_refresh_token,
            app_key=settings.dropbox_app_key,
            app_secret=settings.dropbox_app_secret,
        )
    if settings.dropbox_access_token:
        return dropbox.Dropbox(oauth2_access_token=settings.dropbox_access_token)
    raise DropboxNotConfigured(
        "Dropbox is not configured. Set the OAuth refresh token, app key and app secret in backend/.env."
    )

def is_supported_workbook(name: str) -> bool:
    return name.lower().endswith((".xlsx", ".xlsm"))

def entry_to_record(entry: FileMetadata) -> dict:
    return {
        "dropbox_id": entry.id,
        "path_lower": entry.path_lower,
        "name": entry.name,
        "revision": entry.rev,
        "size_bytes": entry.size,
        "modified_at": entry.server_modified,
    }

def _collect(result):
    entries = [
        entry_to_record(item) for item in result.entries
        if isinstance(item, FileMetadata) and is_supported_workbook(item.name)
    ]
    while result.has_more:
        result = get_client().files_list_folder_continue(result.cursor)
        entries.extend(
            entry_to_record(item) for item in result.entries
            if isinstance(item, FileMetadata) and is_supported_workbook(item.name)
        )
    return entries, result.cursor

def scan_folder(cursor: str | None = None):
    client = get_client()
    if cursor:
        result = client.files_list_folder_continue(cursor)
    else:
        result = client.files_list_folder(
            settings.dropbox_root_path or "",
            recursive=True,
            include_deleted=True,
            limit=2000,
        )
    return _collect(result)

def reset_cursor():
    return scan_folder(None)

def download_file(path_lower: str) -> bytes:
    """Download the exact current Dropbox revision's bytes for server-side extraction."""
    client = get_client()
    _metadata, response = client.files_download(path_lower)
    return response.content
