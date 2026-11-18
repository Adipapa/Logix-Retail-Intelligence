import type { AuditLog, DailyReport, ImportJob, ImportWarning, SavedReport, SourceWorkbook, Station, SummaryReconciliation, SyncRun } from "../types/logix";
import { buildHistoricalSeedDataset } from "./seedData";

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

// Temporary offline workspace adapter. Operational records will be loaded from the API
// once the PostgreSQL reporting endpoints and workbook extraction mapping are validated.
export async function loadWorkspaceData(): Promise<WorkspaceData> {
  return { stations: [], workbooks: [], dailyReports: [], reconciliations: [], importJobs: [], importWarnings: [], syncRuns: [], savedReports: [], auditLogs: [] };
}
export async function seedHistoricalWorkspace(uid: string, email: string): Promise<WorkspaceData> {
  return buildHistoricalSeedDataset(uid, email) as WorkspaceData;
}
export async function commitParsedWorkbookBundle(): Promise<void> {
  throw new Error("Workbook persistence is not enabled yet. Use the backend import pipeline after workbook mapping validation.");
}
export async function recordManualSyncRun(): Promise<SyncRun> {
  throw new Error("Dropbox sync must be run through the authenticated backend API.");
}
export async function saveReportPreset(): Promise<void> {
  throw new Error("Report preset API is not connected yet.");
}
export async function deleteReportPreset(): Promise<void> {
  throw new Error("Report preset API is not connected yet.");
}
export async function logAuditAction(): Promise<void> {
  throw new Error("Audit API is not connected yet.");
}
