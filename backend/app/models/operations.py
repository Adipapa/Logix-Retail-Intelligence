from datetime import datetime, timezone
from sqlalchemy import Date, DateTime, Float, Integer, String, Text, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base

class Station(Base):
    __tablename__ = "stations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    station_key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    folder_path: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
    pms_tank_capacity_litres: Mapped[float | None] = mapped_column(Float, nullable=True)
    ago_tank_capacity_litres: Mapped[float | None] = mapped_column(Float, nullable=True)

class SourceWorkbook(Base):
    __tablename__ = "source_workbooks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dropbox_file_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    revision: Mapped[str] = mapped_column(String(255), nullable=False)
    path_lower: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    station_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    reporting_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reporting_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="discovered", nullable=False)
    imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (UniqueConstraint("dropbox_file_id", "revision", name="uq_source_workbook_revision"),)

class DailyReport(Base):
    __tablename__ = "daily_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_workbook_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_revision: Mapped[str] = mapped_column(String(255), nullable=False)
    station_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    station_name: Mapped[str] = mapped_column(String(160), nullable=False)
    report_date: Mapped[object] = mapped_column(Date, nullable=False, index=True)
    worksheet_name: Mapped[str] = mapped_column(String(120), nullable=False)
    template_version: Mapped[str] = mapped_column(String(80), default="unmapped", nullable=False)
    completeness: Mapped[str] = mapped_column(String(30), default="raw_only", nullable=False)
    raw_cells: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    extracted_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source_reference: Mapped[str] = mapped_column(String(255), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    __table_args__ = (UniqueConstraint("source_workbook_id", "report_date", name="uq_daily_report_workbook_date"),)

class SummarySnapshot(Base):
    __tablename__ = "summary_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_workbook_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    worksheet_name: Mapped[str] = mapped_column(String(120), nullable=False, default="SUMMARY")
    raw_cells: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    extracted_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

class ImportJob(Base):
    __tablename__ = "import_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_workbook_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    records_extracted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warnings_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

class ImportWarning(Base):
    __tablename__ = "import_warnings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_job_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    worksheet_name: Mapped[str] = mapped_column(String(120), nullable=False)
    cell_reference: Mapped[str | None] = mapped_column(String(40), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
