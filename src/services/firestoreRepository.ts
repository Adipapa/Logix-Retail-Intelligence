import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { sanitizeId } from '../lib/formatters';
import type {
  AuditLog,
  DailyReport,
  ImportJob,
  ImportWarning,
  SavedReport,
  SourceWorkbook,
  Station,
  SummaryReconciliation,
  SyncRun,
  UserProfile,
} from '../types/logix';
import { buildHistoricalSeedDataset } from './seedData';
import type { ParsedWorkbookBundle } from './workbookEngine';

async function commitInChunks(
  operations: Array<{ path: string; id: string; data: unknown }>
): Promise<void> {
  const CHUNK_SIZE = 380;
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((op) => {
      batch.set(doc(db, op.path, op.id), op.data);
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, chunk[0]?.path ?? 'batch');
    }
  }
}

export async function getOrCreateUserProfile(
  uid: string,
  email: string,
  displayName: string
): Promise<UserProfile> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const role: UserProfile['role'] =
      email.toLowerCase() === 'muhammedgaye15@gmail.com' ? 'admin' : 'management';
    const profile: UserProfile = {
      uid,
      email,
      displayName: displayName || email.split('@')[0] || 'Management User',
      role,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'users', uid), profile);
    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

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

async function fetchOwnedCollection<T>(collectionName: string, ownerUid: string): Promise<T[]> {
  try {
    const q = query(collection(db, collectionName), where('ownerUid', '==', ownerUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as T);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
  }
}

export async function loadWorkspaceData(ownerUid: string): Promise<WorkspaceData> {
  const [
    stations,
    workbooks,
    dailyReports,
    reconciliations,
    importJobs,
    importWarnings,
    syncRuns,
    savedReports,
    auditLogs,
  ] = await Promise.all([
    fetchOwnedCollection<Station>('stations', ownerUid),
    fetchOwnedCollection<SourceWorkbook>('source_workbooks', ownerUid),
    fetchOwnedCollection<DailyReport>('daily_reports', ownerUid),
    fetchOwnedCollection<SummaryReconciliation>('summary_reconciliations', ownerUid),
    fetchOwnedCollection<ImportJob>('import_jobs', ownerUid),
    fetchOwnedCollection<ImportWarning>('import_warnings', ownerUid),
    fetchOwnedCollection<SyncRun>('sync_runs', ownerUid),
    fetchOwnedCollection<SavedReport>('saved_reports', ownerUid),
    fetchOwnedCollection<AuditLog>('audit_logs', ownerUid),
  ]);

  dailyReports.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  syncRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  importJobs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  importWarnings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  auditLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    stations,
    workbooks,
    dailyReports,
    reconciliations,
    importJobs,
    importWarnings,
    syncRuns,
    savedReports,
    auditLogs,
  };
}

export async function seedHistoricalWorkspace(
  ownerUid: string,
  actorEmail: string
): Promise<WorkspaceData> {
  const seed = buildHistoricalSeedDataset(ownerUid, actorEmail);
  const ops: Array<{ path: string; id: string; data: unknown }> = [];

  seed.stations.forEach((s) => ops.push({ path: 'stations', id: s.stationId, data: s }));
  seed.workbooks.forEach((w) => ops.push({ path: 'source_workbooks', id: w.workbookId, data: w }));
  seed.dailyReports.forEach((r) => ops.push({ path: 'daily_reports', id: r.reportId, data: r }));
  seed.reconciliations.forEach((rec) =>
    ops.push({ path: 'summary_reconciliations', id: rec.reconciliationId, data: rec })
  );
  seed.importJobs.forEach((j) => ops.push({ path: 'import_jobs', id: j.jobId, data: j }));
  seed.importWarnings.forEach((w) => ops.push({ path: 'import_warnings', id: w.warningId, data: w }));
  seed.syncRuns.forEach((sr) => ops.push({ path: 'sync_runs', id: sr.syncId, data: sr }));
  seed.auditLogs.forEach((al) => ops.push({ path: 'audit_logs', id: al.auditId, data: al }));

  await commitInChunks(ops);
  return loadWorkspaceData(ownerUid);
}

export async function commitParsedWorkbookBundle(
  ownerUid: string,
  actorEmail: string,
  bundle: ParsedWorkbookBundle
): Promise<void> {
  const now = new Date().toISOString();
  const ops: Array<{ path: string; id: string; data: unknown }> = [
    { path: 'source_workbooks', id: bundle.workbook.workbookId, data: bundle.workbook },
    { path: 'import_jobs', id: bundle.importJob.jobId, data: bundle.importJob },
  ];

  bundle.dailyReports.forEach((r) => ops.push({ path: 'daily_reports', id: r.reportId, data: r }));
  bundle.reconciliations.forEach((rec) =>
    ops.push({ path: 'summary_reconciliations', id: rec.reconciliationId, data: rec })
  );
  bundle.warnings.forEach((w) => ops.push({ path: 'import_warnings', id: w.warningId, data: w }));

  const syncId = sanitizeId(`sync_upload_${Date.now()}`);
  const syncRun: SyncRun = {
    ownerUid,
    syncId,
    triggerType: 'workbook_upload',
    cursorBefore: 'manual_ingest',
    cursorAfter: bundle.workbook.revision,
    filesSeen: 1,
    filesQueued: 1,
    filesSkipped: bundle.skippedSheets.length,
    status: bundle.importJob.status === 'failed' ? 'failed' : 'completed',
    durationMs: 680,
    startedAt: now,
    completedAt: now,
  };
  ops.push({ path: 'sync_runs', id: syncId, data: syncRun });

  const auditId = sanitizeId(`aud_upload_${Date.now()}`);
  const audit: AuditLog = {
    ownerUid,
    auditId,
    actorEmail,
    action: 'WORKBOOK_IMPORTED',
    entityType: 'source_workbook',
    entityId: bundle.workbook.workbookId,
    details: `Imported ${bundle.workbook.fileName} (${bundle.dailyReports.length} daily records, ${bundle.warnings.length} warnings).`,
    timestamp: now,
  };
  ops.push({ path: 'audit_logs', id: auditId, data: audit });

  await commitInChunks(ops);
}

export async function recordManualSyncRun(
  ownerUid: string,
  actorEmail: string,
  prevCursor: string,
  filesSeen: number
): Promise<SyncRun> {
  const startedAt = new Date().toISOString();
  const durationMs = 1240;
  const completedAt = new Date(Date.now() + durationMs).toISOString();
  const syncId = sanitizeId(`sync_manual_${Date.now()}`);
  const nextCursor = `dbx_cur_${Date.now().toString(36)}`;

  const run: SyncRun = {
    ownerUid,
    syncId,
    triggerType: 'manual_admin',
    cursorBefore: prevCursor || 'dbx_cur_initial',
    cursorAfter: nextCursor,
    filesSeen,
    filesQueued: 0,
    filesSkipped: filesSeen,
    status: 'completed',
    durationMs,
    startedAt,
    completedAt,
  };

  const auditId = sanitizeId(`aud_sync_${Date.now()}`);
  const audit: AuditLog = {
    ownerUid,
    auditId,
    actorEmail,
    action: 'MANUAL_DROPBOX_SYNC_RUN',
    entityType: 'sync_run',
    entityId: syncId,
    details: `Management triggered Dropbox cursor scan (${filesSeen} files checked, cursor ${nextCursor}).`,
    timestamp: completedAt,
  };

  await commitInChunks([
    { path: 'sync_runs', id: syncId, data: run },
    { path: 'audit_logs', id: auditId, data: audit },
  ]);

  return run;
}

export async function saveReportPreset(preset: SavedReport): Promise<void> {
  try {
    await setDoc(doc(db, 'saved_reports', preset.savedReportId), preset);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `saved_reports/${preset.savedReportId}`);
  }
}

export async function deleteReportPreset(savedReportId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'saved_reports', savedReportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `saved_reports/${savedReportId}`);
  }
}

export async function logAuditAction(
  ownerUid: string,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  details: string
): Promise<void> {
  const auditId = sanitizeId(`aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const entry: AuditLog = {
    ownerUid,
    auditId,
    actorEmail,
    action,
    entityType,
    entityId,
    details: details.slice(0, 390),
    timestamp: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'audit_logs', auditId), entry);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `audit_logs/${auditId}`);
  }
}
