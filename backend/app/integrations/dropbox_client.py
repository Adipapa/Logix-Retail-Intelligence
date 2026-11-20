import dropbox
from dropbox.files import FileMetadata
from pathlib import PurePosixPath

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
        "Dropbox is not configured. Set the OAuth refresh token, app key and app secret in the backend environment."
    )


def is_supported_workbook(name: str) -> bool:
    normalized_name = name.casefold()
    if "conflicted copy" in normalized_name:
        return False
    return normalized_name.endswith((".xlsx", ".xlsm"))


def _parts(path: str) -> list[str]:
    return [part for part in PurePosixPath(path).parts if part not in ("/", "")]


def station_folder_info(path_lower: str, root_path: str | None = None) -> dict | None:
    """Identify a workbook's station folder below the configured Dropbox root.

    Workbooks directly in the root, Cleanup folders, and paths outside the
    configured root are excluded. A workbook must be at least one folder below
    its station folder (for example, Station/2024/file.xlsx).
    """
    parts = _parts(path_lower)
    lower_parts = [part.casefold() for part in parts]

    if "cleanup" in lower_parts:
        return None

    root_parts = _parts(root_path or "")
    root_lower = [part.casefold() for part in root_parts]

    if root_lower and lower_parts[:len(root_lower)] == root_lower:
        relative = parts[len(root_parts):]
    else:
        try:
            root_index = lower_parts.index("logix retail")
        except ValueError:
            return None
        relative = parts[root_index + 1:]

    if len(relative) < 2:
        return None

    station_name = relative[0].strip()
    if not station_name or station_name.casefold() in {"cleanup", ".", ".."}:
        return None

    station_path = "/" + "/".join(parts[:len(parts) - len(relative) + 1])
    return {"station_name": station_name, "station_path": station_path}


def is_station_workbook_path(path_lower: str) -> bool:
    return station_folder_info(path_lower, settings.dropbox_root_path) is not None


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
    def accepted(item):
        return (
            isinstance(item, FileMetadata)
            and is_supported_workbook(item.name)
            and is_station_workbook_path(item.path_lower)
        )

    entries = [entry_to_record(item) for item in result.entries if accepted(item)]
    while result.has_more:
        result = get_client().files_list_folder_continue(result.cursor)
        entries.extend(entry_to_record(item) for item in result.entries if accepted(item))
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
