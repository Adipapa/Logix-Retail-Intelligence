import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { ReportDetailDrawer } from './components/ReportDetailDrawer';
import { Shell } from './components/Shell';
import { DataSyncMonitorView } from './features/DataSyncMonitorView';
import { DeliveriesView } from './features/DeliveriesView';
import { ExecutiveOverview } from './features/ExecutiveOverview';
import { FuelSalesView } from './features/FuelSalesView';
import { HistoricalAnalyticsView } from './features/HistoricalAnalyticsView';
import { PumpPerformanceView } from './features/PumpPerformanceView';
import { ReconciliationView } from './features/ReconciliationView';
import { ReportsExportView } from './features/ReportsExportView';
import { StationsView } from './features/StationsView';
import { StockControlView } from './features/StockControlView';
import { auth, googleAuthProvider } from './lib/firebase';
import { sanitizeId } from './lib/formatters';
import {
  commitParsedWorkbookBundle,
  deleteReportPreset,
  getOrCreateUserProfile,
  loadWorkspaceData,
  logAuditAction,
  recordManualSyncRun,
  saveReportPreset,
  seedHistoricalWorkspace,
  type WorkspaceData,
} from './services/firestoreRepository';
import { buildHistoricalSeedDataset } from './services/seedData';
import { parseExcelWorkbook } from './services/workbookEngine';
import type {
  DailyReport,
  GlobalFilters,
  RouteId,
  SavedReport,
  SyncRun,
  UserProfile,
} from './types/logix';

const PREVIEW_USER: UserProfile = {
  uid: 'local_management_preview',
  email: 'management@logixretail.gm',
  displayName: 'Management Workspace',
  role: 'management',
  createdAt: new Date().toISOString(),
};

function buildLocalPreviewWorkspace(): WorkspaceData {
  const seed = buildHistoricalSeedDataset(PREVIEW_USER.uid, PREVIEW_USER.email);
  let savedReports: SavedReport[] = [];
  try {
    const raw = localStorage.getItem('logix_preview_saved_reports');
    if (raw) savedReports = JSON.parse(raw) as SavedReport[];
  } catch {
    savedReports = [];
  }
  return {
    ...seed,
    dailyReports: [...seed.dailyReports].sort((a, b) => b.reportDate.localeCompare(a.reportDate)),
    savedReports,
  };
}

function parseHashRoute(): { route: RouteId; stationId: string | null } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || hash === 'dashboard' || hash === 'login') return { route: 'dashboard', stationId: null };
  if (hash.startsWith('stations/')) {
    const id = hash.split('/')[1] || null;
    return { route: id ? 'station-detail' : 'stations', stationId: id };
  }
  const valid: RouteId[] = [
    'dashboard',
    'stations',
    'fuel-sales',
    'pump-performance',
    'stock-control',
    'deliveries',
    'reconciliation',
    'historical',
    'reports',
    'data-monitor',
  ];
  if (valid.includes(hash as RouteId)) {
    return { route: hash as RouteId, stationId: null };
  }
  return { route: 'dashboard', stationId: null };
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [isFirebaseAuthenticated, setIsFirebaseAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(PREVIEW_USER);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<WorkspaceData>(() => buildLocalPreviewWorkspace());
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const initialRoute = parseHashRoute();
  const [activeRoute, setActiveRoute] = useState<RouteId>(initialRoute.route);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(initialRoute.stationId);
  const [inspectedReport, setInspectedReport] = useState<DailyReport | null>(null);

  const [filters, setFilters] = useState<GlobalFilters>({
    stationId: 'ALL',
    year: '2025',
    month: '1',
    fuelType: 'ALL',
    shift: 'ALL',
    status: 'ALL',
    search: '',
  });

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHashRoute();
      setActiveRoute(parsed.route);
      setSelectedStationId(parsed.stationId);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((route: RouteId, stationId: string | null = null) => {
    setActiveRoute(route);
    setSelectedStationId(stationId);
    if (route === 'station-detail' && stationId) {
      window.location.hash = `#/stations/${stationId}`;
    } else {
      window.location.hash = `#/${route}`;
    }
  }, []);

  const refreshCloudWorkspace = useCallback(async (uid: string, email: string) => {
    setLoadingWorkspace(true);
    setAuthNotice(null);
    try {
      let data = await loadWorkspaceData(uid);
      if (data.stations.length === 0) {
        data = await seedHistoricalWorkspace(uid, email);
      }
      setWorkspace(data);
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : 'Unable to load cloud workspace.');
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setIsFirebaseAuthenticated(false);
        setUserProfile(PREVIEW_USER);
        setWorkspace(buildLocalPreviewWorkspace());
        setAuthReady(true);
        return;
      }
      try {
        const profile = await getOrCreateUserProfile(
          fbUser.uid,
          fbUser.email || '',
          fbUser.displayName || 'Management User'
        );
        setIsFirebaseAuthenticated(true);
        setUserProfile(profile);
        setAuthReady(true);
        await refreshCloudWorkspace(profile.uid, profile.email);
      } catch (err) {
        setAuthNotice(err instanceof Error ? err.message : 'Sign-in sync error; staying in local workspace.');
        setIsFirebaseAuthenticated(false);
        setUserProfile(PREVIEW_USER);
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, [refreshCloudWorkspace]);

  const handleSignIn = async () => {
    setAuthNotice(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : 'Google Sign-In was cancelled or blocked.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const years = useMemo(() => {
    const set = new Set(workspace.dailyReports.map((r) => r.year));
    return Array.from(set).sort((a, b) => a - b);
  }, [workspace]);

  const filteredReports = useMemo(() => {
    const searchLower = filters.search.trim().toLowerCase();
    return workspace.dailyReports.filter((r) => {
      if (filters.stationId !== 'ALL' && r.stationId !== filters.stationId) return false;
      if (filters.year !== 'ALL' && String(r.year) !== filters.year) return false;
      if (filters.month !== 'ALL' && String(r.month) !== filters.month) return false;
      if (filters.status !== 'ALL' && r.completeness !== filters.status) return false;
      if (searchLower) {
        const haystack = `${r.reportDate} ${r.stationName} ${r.worksheetName} ${r.noteText} ${r.workbookPath}`.toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      return true;
    });
  }, [workspace, filters]);

  const filteredWarnings = useMemo(() => {
    return workspace.importWarnings.filter((w) => {
      if (filters.stationId !== 'ALL' && w.stationId !== filters.stationId) return false;
      if (filters.year !== 'ALL' && w.reportDate && !w.reportDate.startsWith(filters.year)) {
        return false;
      }
      return true;
    });
  }, [workspace, filters]);

  const filteredReconciliations = useMemo(() => {
    return workspace.reconciliations.filter((rec) => {
      if (filters.stationId !== 'ALL' && rec.stationId !== filters.stationId) return false;
      if (filters.year !== 'ALL' && String(rec.year) !== filters.year) return false;
      if (filters.month !== 'ALL' && String(rec.month) !== filters.month) return false;
      return true;
    });
  }, [workspace, filters]);

  const handleTriggerManualSync = async () => {
    const latestCursor = workspace.syncRuns[0]?.cursorAfter || 'dbx_cur_init';
    if (isFirebaseAuthenticated) {
      await recordManualSyncRun(
        userProfile.uid,
        userProfile.email,
        latestCursor,
        workspace.workbooks.length
      );
      await refreshCloudWorkspace(userProfile.uid, userProfile.email);
      return;
    }

    const now = new Date().toISOString();
    const syncRun: SyncRun = {
      ownerUid: userProfile.uid,
      syncId: sanitizeId(`sync_manual_${Date.now()}`),
      triggerType: 'manual_admin',
      cursorBefore: latestCursor,
      cursorAfter: `dbx_cur_${Date.now().toString(36)}`,
      filesSeen: workspace.workbooks.length,
      filesQueued: 0,
      filesSkipped: workspace.workbooks.length,
      status: 'completed',
      durationMs: 940,
      startedAt: now,
      completedAt: now,
    };
    setWorkspace((prev) => ({
      ...prev,
      syncRuns: [syncRun, ...prev.syncRuns],
      auditLogs: [
        {
          ownerUid: userProfile.uid,
          auditId: sanitizeId(`aud_sync_${Date.now()}`),
          actorEmail: userProfile.email,
          action: 'MANUAL_DROPBOX_SYNC_RUN',
          entityType: 'sync_run',
          entityId: syncRun.syncId,
          details: `Triggered Dropbox cursor scan (${workspace.workbooks.length} files checked).`,
          timestamp: now,
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const handleUploadWorkbook = async (file: File) => {
    const bundle = await parseExcelWorkbook(file, userProfile.uid, workspace.stations);
    if (isFirebaseAuthenticated) {
      await commitParsedWorkbookBundle(userProfile.uid, userProfile.email, bundle);
      await refreshCloudWorkspace(userProfile.uid, userProfile.email);
    } else {
      const now = new Date().toISOString();
      const incomingIds = new Set(bundle.dailyReports.map((r) => r.reportId));
      setWorkspace((prev) => ({
        ...prev,
        workbooks: [bundle.workbook, ...prev.workbooks],
        dailyReports: [
          ...bundle.dailyReports,
          ...prev.dailyReports.filter((r) => !incomingIds.has(r.reportId)),
        ].sort((a, b) => b.reportDate.localeCompare(a.reportDate)),
        reconciliations: [...bundle.reconciliations, ...prev.reconciliations],
        importJobs: [bundle.importJob, ...prev.importJobs],
        importWarnings: [...bundle.warnings, ...prev.importWarnings],
        auditLogs: [
          {
            ownerUid: userProfile.uid,
            auditId: sanitizeId(`aud_upload_${Date.now()}`),
            actorEmail: userProfile.email,
            action: 'WORKBOOK_IMPORTED',
            entityType: 'source_workbook',
            entityId: bundle.workbook.workbookId,
            details: `Imported ${bundle.workbook.fileName} (${bundle.dailyReports.length} daily records).`,
            timestamp: now,
          },
          ...prev.auditLogs,
        ],
      }));
    }

    setFilters((prev) => ({
      ...prev,
      stationId: bundle.workbook.stationId,
      year: String(bundle.workbook.year),
      month: String(bundle.workbook.month),
    }));
  };

  const handleSavePreset = async (preset: SavedReport) => {
    if (isFirebaseAuthenticated) {
      await saveReportPreset(preset);
      await logAuditAction(
        userProfile.uid,
        userProfile.email,
        'REPORT_PRESET_SAVED',
        'saved_report',
        preset.savedReportId,
        `Saved management report filter "${preset.title}".`
      );
      await refreshCloudWorkspace(userProfile.uid, userProfile.email);
      return;
    }

    const next = [preset, ...workspace.savedReports];
    try {
      localStorage.setItem('logix_preview_saved_reports', JSON.stringify(next));
    } catch {
      // Ignore storage quota issues
    }
    setWorkspace((prev) => ({ ...prev, savedReports: next }));
  };

  const handleDeletePreset = async (id: string) => {
    if (isFirebaseAuthenticated) {
      await deleteReportPreset(id);
      await refreshCloudWorkspace(userProfile.uid, userProfile.email);
      return;
    }

    const next = workspace.savedReports.filter((p) => p.savedReportId !== id);
    try {
      localStorage.setItem('logix_preview_saved_reports', JSON.stringify(next));
    } catch {
      // Ignore
    }
    setWorkspace((prev) => ({ ...prev, savedReports: next }));
  };

  const handleLogExport = async (format: 'EXCEL' | 'PDF', rowCount: number) => {
    if (isFirebaseAuthenticated) {
      await logAuditAction(
        userProfile.uid,
        userProfile.email,
        `REPORT_EXPORT_${format}`,
        'export',
        `${filters.stationId}_${filters.year}_${filters.month}`,
        `Exported ${rowCount} daily records as ${format}.`
      );
      const updated = await loadWorkspaceData(userProfile.uid);
      setWorkspace(updated);
      return;
    }

    const now = new Date().toISOString();
    setWorkspace((prev) => ({
      ...prev,
      auditLogs: [
        {
          ownerUid: userProfile.uid,
          auditId: sanitizeId(`aud_exp_${Date.now()}`),
          actorEmail: userProfile.email,
          action: `REPORT_EXPORT_${format}`,
          entityType: 'export',
          entityId: `${filters.stationId}_${filters.year}_${filters.month}`,
          details: `Exported ${rowCount} daily records as ${format}.`,
          timestamp: now,
        },
        ...prev.auditLogs,
      ],
    }));
  };

  if (!authReady && loadingWorkspace) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Loading Logix Retail workspace...</div>
      </div>
    );
  }

  const hideGlobalFilters = activeRoute === 'data-monitor';

  return (
    <>
      <Shell
        activeRoute={activeRoute}
        onNavigate={(r) => navigate(r, null)}
        user={userProfile}
        isAuthenticated={isFirebaseAuthenticated}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        filters={filters}
        onFiltersChange={setFilters}
        stations={workspace.stations}
        years={years}
        latestSync={workspace.syncRuns[0]}
        showGlobalFilters={!hideGlobalFilters}
      >
        {authNotice && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 flex items-center justify-between gap-4">
            <span>{authNotice}</span>
            <button
              type="button"
              onClick={() => setAuthNotice(null)}
              className="text-amber-900 font-medium hover:underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {loadingWorkspace && (
          <div className="mb-4 p-3 bg-white border border-slate-200 rounded-md text-xs text-slate-600">
            Syncing cloud workspace data...
          </div>
        )}

        {activeRoute === 'dashboard' && (
          <ExecutiveOverview
            reports={filteredReports}
            stations={workspace.stations}
            workbooks={workspace.workbooks}
            warnings={filteredWarnings}
            reconciliations={filteredReconciliations}
            onInspectReport={setInspectedReport}
            onSelectStation={(id) => navigate('station-detail', id)}
            onNavigate={(r) => navigate(r, null)}
          />
        )}

        {(activeRoute === 'stations' || activeRoute === 'station-detail') && (
          <StationsView
            stations={workspace.stations}
            reports={filteredReports}
            workbooks={workspace.workbooks}
            selectedStationId={selectedStationId}
            onSelectStation={(id) =>
              id ? navigate('station-detail', id) : navigate('stations', null)
            }
            onInspectReport={setInspectedReport}
          />
        )}

        {activeRoute === 'fuel-sales' && (
          <FuelSalesView
            reports={filteredReports}
            fuelFilter={filters.fuelType}
            onInspectReport={setInspectedReport}
          />
        )}

        {activeRoute === 'pump-performance' && (
          <PumpPerformanceView
            reports={filteredReports}
            fuelFilter={filters.fuelType}
            onInspectReport={setInspectedReport}
          />
        )}

        {activeRoute === 'stock-control' && (
          <StockControlView
            reports={filteredReports}
            fuelFilter={filters.fuelType}
            onInspectReport={setInspectedReport}
          />
        )}

        {activeRoute === 'deliveries' && (
          <DeliveriesView reports={filteredReports} onInspectReport={setInspectedReport} />
        )}

        {activeRoute === 'reconciliation' && (
          <ReconciliationView
            reports={filteredReports}
            reconciliations={filteredReconciliations}
            onInspectReport={setInspectedReport}
          />
        )}

        {activeRoute === 'historical' && (
          <HistoricalAnalyticsView
            allReports={workspace.dailyReports}
            stations={workspace.stations}
            selectedStationId={filters.stationId}
          />
        )}

        {activeRoute === 'reports' && (
          <ReportsExportView
            reports={filteredReports}
            filters={filters}
            onApplyFilters={setFilters}
            savedReports={workspace.savedReports}
            user={userProfile}
            onSavePreset={handleSavePreset}
            onDeletePreset={handleDeletePreset}
            onLogExport={handleLogExport}
          />
        )}

        {activeRoute === 'data-monitor' && (
          <DataSyncMonitorView
            workbooks={workspace.workbooks}
            importJobs={workspace.importJobs}
            importWarnings={workspace.importWarnings}
            syncRuns={workspace.syncRuns}
            auditLogs={workspace.auditLogs}
            onTriggerManualSync={handleTriggerManualSync}
            onUploadWorkbook={handleUploadWorkbook}
          />
        )}
      </Shell>

      <ReportDetailDrawer report={inspectedReport} onClose={() => setInspectedReport(null)} />
    </>
  );
}
