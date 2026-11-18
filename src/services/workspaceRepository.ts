import type { AuditLog, DailyReport, ImportJob, ImportWarning, SavedReport, SourceWorkbook, Station, SummaryReconciliation, SyncRun } from "../types/logix";
import { buildHistoricalSeedDataset } from "./seedData";
import type { ParsedWorkbookBundle } from "./workbookEngine";

export interface WorkspaceData {
  stations: Station[];
  workbooks: SourceWorkbook[];
  dailyReports: DailyReport[];
  reconciliations: SummaryReconciliation[];
  importJobs: ImportJob[];
  importWarnings: ImportWarning[];
  syncRuns: SyncRun[];
  savedReports: SavedReport[];
  auditLogs: AuditLog[];
}

// Offline demonstration adapter only. Live reporting records are not yet wired to PostgreSQL.
export async function loadWorkspaceData(_uid: string): Promise<WorkspaceData> {
  return { stations: [], workbooks: [], dailyReports: [], reconciliations: [], importJobs: [], importWarnings: [], syncRuns: [], savedReports: [], auditLogs: [] };
}
export async function seedHistoricalWorkspace(uid: string, email: string): Promise<WorkspaceData> {
  return buildHistoricalSeedDataset(uid, email) as WorkspaceData;
}
export async function commitParsedWorkbookBundle(_uid: string, _email: string, _bundle: ParsedWorkbookBundle): Promise<void> {
  throw new Error("Workbook persistence is not enabled yet. Use the backend import pipeline after workbook mapping validation.");
}
export async function recordManualSyncRun(_uid: string, _email: string, _cursor: string, _filesSeen: number): Promise<SyncRun> {
  throw new Error("Dropbox sync must be run through the authenticated backend API.");
}
export async function saveReportPreset(_preset: SavedReport): Promise<void> {
  throw new Error("Report preset API is not connected yet.");
}
export async function deleteReportPreset(_id: string): Promise<void> {
  throw new Error("Report preset API is not connected yet.");
}
export async function logAuditAction(_uid: string, _email: string, _action: string, _entity: string, _id: string, _details: string): Promise<void> {
  throw new Error("Audit API is not connected yet.");
}
