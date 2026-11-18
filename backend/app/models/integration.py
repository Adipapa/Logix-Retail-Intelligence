from datetime import datetime, timezone
from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base

class DropboxSyncState(Base):
    __tablename__ = "dropbox_sync_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    state_key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, default="primary")
    cursor: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str] = mapped_column(String(30), default="never", nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

class DropboxFile(Base):
    __tablename__ = "dropbox_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dropbox_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    path_lower: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    import_status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    last_import_error: Mapped[str | None] = mapped_column(Text, nullable=True)
