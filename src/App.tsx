import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from './services/workspaceRepository';
import { buildHistoricalSeedDataset } from './services/seedData';
import { apiLogin, apiMe, apiLogout, apiDropboxSync, apiAnalyticsOverview, type LiveAnalyticsOverview } from './services/api';
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
  const [isBackendWorkspaceConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(PREVIEW_USER);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [liveAnalytics, setLiveAnalytics] = useState<LiveAnalyticsOverview | null>(null);
  const [liveAnalyticsError, setLiveAnalyticsError] = useState<string | null>(null);

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
    let active = true;
    apiMe().then((apiUser) => {
      if (!active) return;
      if (apiUser) {
        setUserProfile({
          uid: String(apiUser.id),
          email: apiUser.email,
          displayName: apiUser.full_name,
          role: apiUser.role,
          createdAt: new Date().toISOString(),
        });
        setIsAuthenticated(true);
      }
      setAuthReady(true);
    }).catch(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    setAuthNotice(null);
    try {
      const apiUser = await apiLogin(email, password);
      setUserProfile({
        uid: String(apiUser.id),
        email: apiUser.email,
        displayName: apiUser.full_name,
        role: apiUser.role,
        createdAt: new Date().toISOString(),
      });
      setIsAuthenticated(true);
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : 'Sign-in failed.');
      throw err;
    }
  };

  const handleSignOut = async () => {
    apiLogout();
    setIsAuthenticated(false);
    setUserProfile(PREVIEW_USER);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLiveAnalytics(null);
      setLiveAnalyticsError(null);
      return;
    }
    let active = true;
    const stationName = filters.stationId === 'ALL'
      ? undefined
      : workspace.stations.find((station) => station.stationId === filters.stationId)?.canonicalName;
    apiAnalyticsOverview({
      year: filters.year,
      month: filters.month,
      station: stationName,
    }).then((data) => {
      if (active) {
        setLiveAnalytics(data);
        setLiveAnalyticsError(null);
      }
    }).catch((err) => {
      if (active) setLiveAnalyticsError(err instanceof Error ? err.message : 'Live analytics unavailable.');
    });
    return () => { active = false; };
  }, [isAuthenticated, filters.year, filters.month, filters.stationId, workspace.stations]);

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
    if (!isAuthenticated) {
      setAuthNotice('Sign in with a central management administrator account to run Dropbox sync.');
      return;
    }
    try {
      const result = await apiDropboxSync();
      setAuthNotice(`Dropbox sync completed: ${result.files_seen} files checked; ${result.new_or_changed} new or revised; ${result.tracked_workbooks} tracked. Extraction attempted: ${result.imports_attempted ?? 0}; succeeded: ${result.imports_succeeded ?? 0}; failed: ${result.imports_failed ?? 0}. Review the Data Monitor for file-level results.`);
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : 'Dropbox sync failed.');
    }
  };

  const handleUploadWorkbook = async (file: File) => {
    const bundle = await parseExcelWorkbook(file, userProfile.uid, workspace.stations);
    if (isBackendWorkspaceConnected) {
      await commitParsedWorkbookBundle(userProfile.uid, userProfile.email, bundle);
      await refreshCloudWorkspace(userProfile.uid, userProfile.email);
    } else {
      const now = new Date().toISOString();
      setAuthNotice('Workbook parsed in this browser preview only. It has not been saved to PostgreSQL.');
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
    if (isBackendWorkspaceConnected) {
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
    if (isBackendWorkspaceConnected) {
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
    if (isBackendWorkspaceConnected) {
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
        isAuthenticated={isAuthenticated}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        filters={filters}
        onFiltersChange={setFilters}
        stations={workspace.stations}
        years={years}
        latestSync={workspace.syncRuns[0]}
        showGlobalFilters={!hideGlobalFilters}
      >
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
          <strong>Preview environment:</strong> the main dashboard figures are sample/demo data. Dropbox sync now queues workbook extraction into PostgreSQL, but only the currently supported Sukuta template is mapped; other workbook sheets remain raw/unmapped. Summary reconciliation is not yet implemented.
        </div>

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
            liveAnalytics={liveAnalytics}
            liveAnalyticsError={liveAnalyticsError}
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
