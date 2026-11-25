import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReportDetailDrawer } from './components/ReportDetailDrawer';
import { LoginView } from './features/LoginView';
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
  loadWorkspaceData,
  logAuditAction,
  recordManualSyncRun,
  saveReportPreset,
  seedHistoricalWorkspace,
  type WorkspaceData,
} from './services/workspaceRepository';
import { buildHistoricalSeedDataset } from './services/seedData';
import { apiLogin, apiMe, apiLogout, apiDropboxSync, apiAnalyticsOverview, apiProductionMetadata, apiUpdateStationTankCapacities, apiProductionReports, apiProductionMonitor, apiProductionReconciliations, apiReprocessLegacy2022, apiProductionVersion, type LiveAnalyticsOverview, type ProductionMetadataResponse, type ProductionReportsResponse, type ProductionMonitorResponse, type ProductionReconciliationResponse } from './services/api';
import { parseExcelWorkbook } from './services/workbookEngine';
import { readProductionCache, writeProductionCache } from './services/productionCache';
import type {
  DailyReport,
  GlobalFilters,
  RouteId,
  SavedReport,
  SyncRun,
  UserProfile,
  Station,
} from './types/logix';

const PREVIEW_USER: UserProfile = {
  uid: '',
  email: '',
  displayName: 'Not signed in',
  role: 'management',
  createdAt: '',
};

function emptyWorkspace(): WorkspaceData {
  return {
    stations: [], workbooks: [], dailyReports: [], reconciliations: [],
    importJobs: [], importWarnings: [], syncRuns: [], savedReports: [], auditLogs: [],
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(PREVIEW_USER);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [liveAnalytics, setLiveAnalytics] = useState<LiveAnalyticsOverview | null>(null);
  const [liveAnalyticsError, setLiveAnalyticsError] = useState<string | null>(null);
  const [productionMetadata, setProductionMetadata] = useState<ProductionMetadataResponse | null>(null);
  const [productionData, setProductionData] = useState<ProductionReportsResponse | null>(null);
  const [productionDataError, setProductionDataError] = useState<string | null>(null);
  const [loadingProductionData, setLoadingProductionData] = useState(false);
  const [loadedReportFilterKey, setLoadedReportFilterKey] = useState<string | null>(null);
  const [productionMonitor, setProductionMonitor] = useState<ProductionMonitorResponse | null>(null);
  const [productionReconciliations, setProductionReconciliations] = useState<ProductionReconciliationResponse | null>(null);
  const [productionReconciliationError, setProductionReconciliationError] = useState<string | null>(null);
  const [reconciliationPage, setReconciliationPage] = useState(1);

  const [workspace, setWorkspace] = useState<WorkspaceData>(() => emptyWorkspace());
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const initialRoute = parseHashRoute();
  const [activeRoute, setActiveRoute] = useState<RouteId>(initialRoute.route);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(initialRoute.stationId);
  const [inspectedReport, setInspectedReport] = useState<DailyReport | null>(null);

  const [filters, setFilters] = useState<GlobalFilters>({
    stationId: 'ALL',
    year: 'ALL',
    month: 'ALL',
    fuelType: 'ALL',
    shift: 'ALL',
    status: 'ALL',
    search: '',
  });

  // Canonical production station options are deduplicated case-insensitively by the API.
  const productionStations = useMemo<Station[]>(() => (productionMetadata?.stations ?? []).map((station) => ({
    ownerUid: '',
    stationId: station.stationId,
    canonicalName: station.canonicalName,
    territory: station.territory,
    folderPath: '',
    aliases: [station.canonicalName],
    activeStatus: 'active',
    pumpCount: 0,
    tankCapacityPms: station.tankCapacityPms ?? 0,
    tankCapacityAgo: station.tankCapacityAgo ?? 0,
    createdAt: '',
    updatedAt: '',
  })), [productionMetadata]);

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
      setWorkspace(data);
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : 'Unable to load cloud workspace.');
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  // Restore the saved API session on refresh instead of deleting it.
  useEffect(() => {
    let active = true;
    apiMe()
      .then((apiUser) => {
        if (!active || !apiUser) return;
        setUserProfile({
          uid: String(apiUser.id),
          email: apiUser.email,
          displayName: apiUser.full_name,
          role: apiUser.role,
          createdAt: new Date().toISOString(),
        });
        setIsAuthenticated(true);
      })
      .catch((err) => {
        if (active) setAuthNotice(err instanceof Error ? err.message : 'Unable to restore your session.');
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
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
      setAuthNotice(null);
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

  const handleSaveStationTankCapacities = async (
    stationName: string,
    pmsCapacityLitres: number | null,
    agoCapacityLitres: number | null,
  ) => {
    try {
      await apiUpdateStationTankCapacities(stationName, pmsCapacityLitres, agoCapacityLitres);
      setProductionMetadata(await apiProductionMetadata());
      setAuthNotice(`Tank capacities saved for ${stationName}.`);
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : "Unable to save station tank capacities.");
      throw err;
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLiveAnalytics(null);
      setLiveAnalyticsError(null);
      setProductionMetadata(null);
      setProductionData(null);
      setProductionDataError(null);
      setLoadingProductionData(false);
      setLoadedReportFilterKey(null);
      setProductionMonitor(null);
      setProductionReconciliations(null);
      setProductionReconciliationError(null);
      return;
    }
    let active = true;
    const stationName = filters.stationId === 'ALL' ? undefined : filters.stationId;
    const requestFilters = { year: filters.year, month: filters.month, station: stationName };

    // Metadata is loaded through the cache-first snapshot loader below.
    apiAnalyticsOverview(requestFilters)
      .then((analytics) => {
        if (active) {
          setLiveAnalytics(analytics);
          setLiveAnalyticsError(null);
        }
      })
      .catch((err) => {
        if (active) setLiveAnalyticsError(err instanceof Error ? err.message : 'Unable to load executive analytics.');
      });
    return () => { active = false; };
  }, [isAuthenticated, filters.year, filters.month, filters.stationId]);

  const reportRoutes: RouteId[] = [
    'stations', 'station-detail', 'fuel-sales', 'pump-performance', 'stock-control',
    'deliveries', 'reconciliation', 'historical', 'reports',
  ];

  // Cache-first startup: render the saved snapshot immediately, then ask the
  // API for a lightweight version marker. Full data is fetched only on a cache
  // miss or when the database version differs from the saved snapshot.
  useEffect(() => {
    if (!isAuthenticated || !userProfile.uid) return;
    let active = true;
    const loadSnapshot = async () => {
      setLoadingProductionData(true);
      setProductionDataError(null);
      let cached: Awaited<ReturnType<typeof readProductionCache>> = null;
      try {
        cached = await readProductionCache(userProfile.uid);
        if (active && cached) {
          setProductionData(cached.reports);
          setProductionMetadata(cached.metadata);
          setProductionMonitor(cached.monitor);
          setLoadedReportFilterKey('ALL_REPORTS');
          setLoadingProductionData(false);
        }
      } catch {
        // IndexedDB may be disabled by browser policy; continue with live data.
      }

      try {
        const current = await apiProductionVersion();
        if (!active) return;
        if (cached && cached.version === current.version) {
          setLoadingProductionData(false);
          setProductionDataError(null);
          return;
        }

        setLoadingProductionData(true);
        const [reports, metadata, monitor] = await Promise.all([
          apiProductionReports({}),
          apiProductionMetadata(),
          apiProductionMonitor(),
        ]);
        if (!active) return;
        setProductionData(reports);
        setProductionMetadata(metadata);
        setProductionMonitor(monitor);
        setLoadedReportFilterKey('ALL_REPORTS');
        setProductionDataError(null);
        try {
          await writeProductionCache(userProfile.uid, {
            version: current.version,
            savedAt: new Date().toISOString(),
            reports,
            metadata,
            monitor,
          });
        } catch {
          setAuthNotice('Data loaded, but this browser could not save the local production cache.');
        }
      } catch (err) {
        if (!active) return;
        if (!cached) {
          setProductionDataError(err instanceof Error ? err.message : 'Unable to load production data.');
        } else {
          setAuthNotice('Showing saved production data. The live version check failed, so the cache may be out of date.');
        }
      } finally {
        if (active) setLoadingProductionData(false);
      }
    };
    void loadSnapshot();
    return () => { active = false; };
  }, [isAuthenticated, userProfile.uid]);

  // Check the small version marker periodically while the workspace is open.
  // The server's Dropbox scanner runs every 15 minutes; this poll notices an
  // imported change without repeatedly downloading unchanged report data.
  useEffect(() => {
    if (!isAuthenticated || !userProfile.uid) return;
    let active = true;
    let checking = false;
    const checkForProductionUpdates = async () => {
      if (checking) return;
      checking = true;
      try {
        const [cached, current] = await Promise.all([
          readProductionCache(userProfile.uid),
          apiProductionVersion(),
        ]);
        if (!active || !cached || cached.version === current.version) return;
        setLoadingProductionData(true);
        const [reports, metadata, monitor] = await Promise.all([
          apiProductionReports({}),
          apiProductionMetadata(),
          apiProductionMonitor(),
        ]);
        if (!active) return;
        setProductionData(reports);
        setProductionMetadata(metadata);
        setProductionMonitor(monitor);
        setLoadedReportFilterKey('ALL_REPORTS');
        setProductionDataError(null);
        await writeProductionCache(userProfile.uid, {
          version: current.version,
          savedAt: new Date().toISOString(),
          reports,
          metadata,
          monitor,
        });
        setAuthNotice('New production data detected and refreshed.');
      } catch {
        // Keep the last known good cache when a background check fails.
      } finally {
        checking = false;
        if (active) setLoadingProductionData(false);
      }
    };
    const intervalId = window.setInterval(() => {
      void checkForProductionUpdates();
    }, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, userProfile.uid]);

  useEffect(() => {
    setReconciliationPage(1);
  }, [filters.year, filters.month, filters.stationId]);

  // Prefetch the first reconciliation page during startup so the section is
  // ready when management opens it.
  useEffect(() => {
    if (!isAuthenticated) {
      setProductionReconciliations(null);
      setProductionReconciliationError(null);
      return;
    }
    let active = true;
    const station = filters.stationId === 'ALL' ? undefined : filters.stationId;
    apiProductionReconciliations({
      year: filters.year,
      month: filters.month,
      station,
      page: reconciliationPage,
    }).then((result) => {
      if (active) {
        setProductionReconciliations(result);
        setProductionReconciliationError(null);
      }
    }).catch((err) => {
      if (active) setProductionReconciliationError(err instanceof Error ? err.message : 'Unable to load production reconciliations.');
    });
    return () => { active = false; };
  }, [isAuthenticated, filters.year, filters.month, filters.stationId, reconciliationPage]);

  const years = productionMetadata?.years ?? [];

  const filteredReports = useMemo(() => {
    const searchLower = filters.search.trim().toLowerCase();
    return (productionData?.reports ?? []).filter((r) => {
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
  }, [productionData, filters]);

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
    return (productionReconciliations?.checks ?? []).filter((rec) => {
      if (filters.stationId !== 'ALL' && rec.stationId !== filters.stationId) return false;
      if (filters.year !== 'ALL' && String(rec.year) !== filters.year) return false;
      if (filters.month !== 'ALL' && String(rec.month) !== filters.month) return false;
      return true;
    });
  }, [productionReconciliations, filters]);

  const refreshProductionSnapshot = async () => {
    setLoadingProductionData(true);
    try {
      const [version, reports, metadata, monitor] = await Promise.all([
        apiProductionVersion(),
        apiProductionReports({}),
        apiProductionMetadata(),
        apiProductionMonitor(),
      ]);
      setProductionData(reports);
      setProductionMetadata(metadata);
      setProductionMonitor(monitor);
      setLoadedReportFilterKey('ALL_REPORTS');
      setProductionDataError(null);
      try {
        await writeProductionCache(userProfile.uid, {
          version: version.version,
          savedAt: new Date().toISOString(),
          reports,
          metadata,
          monitor,
        });
      } catch {
        setAuthNotice('Data refreshed, but this browser could not save the local cache.');
      }
    } finally {
      setLoadingProductionData(false);
    }
  };

  const handleTriggerManualSync = async () => {
    if (!isAuthenticated) {
      setAuthNotice('Sign in with a central management administrator account to run Dropbox sync.');
      return;
    }
    try {
      const result = await apiDropboxSync();
      await refreshProductionSnapshot();
      setAuthNotice(`Dropbox sync completed: ${result.files_seen} files checked; ${result.new_or_changed} new or revised; ${result.tracked_workbooks} tracked. Extraction attempted: ${result.imports_attempted ?? 0}; succeeded: ${result.imports_succeeded ?? 0}; failed: ${result.imports_failed ?? 0}.`);
      const requestFilters = { year: filters.year, month: filters.month, station: filters.stationId === 'ALL' ? undefined : filters.stationId };
      try {
        setLiveAnalytics(await apiAnalyticsOverview(requestFilters));
        setLiveAnalyticsError(null);
      } catch (analyticsError) {
        setLiveAnalyticsError(analyticsError instanceof Error ? analyticsError.message : 'Unable to refresh executive analytics.');
      }
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : 'Dropbox sync failed.');
    }
  };

  const handleReprocessLegacy2022 = async () => {
    try {
      const result = await apiReprocessLegacy2022();
      await refreshProductionSnapshot();
      const summary = `2022 Kotu reprocessing: ${result.workbooks_succeeded}/${result.workbooks_attempted} workbooks succeeded; ${result.workbooks_failed} failed.`;
      setAuthNotice(summary);
      const stationName = filters.stationId === 'ALL' ? undefined : filters.stationId;
      const requestFilters = { year: filters.year, month: filters.month, station: stationName };
      try {
        setLiveAnalytics(await apiAnalyticsOverview(requestFilters));
        setLiveAnalyticsError(null);
      } catch (err) {
        setLiveAnalyticsError(err instanceof Error ? err.message : 'Unable to refresh executive analytics.');
      }
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : 'Legacy 2022 workbook reprocessing failed.');
    }
  };

  const handleUploadWorkbook = async (file: File) => {
    const bundle = await parseExcelWorkbook(file, userProfile.uid, workspace.stations);
    if (false) {
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
    if (false) {
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
    if (false) {
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
    if (false) {
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

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Loading Logix Retail workspace...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onSignIn={handleSignIn} error={authNotice} />;
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
        stations={productionStations}
        years={years}
        latestSync={workspace.syncRuns[0]}
        latestSyncAt={productionMonitor?.syncStatus.lastSyncAt}
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

        {productionReconciliationError && activeRoute === 'reconciliation' && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
            Production reconciliation data could not be loaded: {productionReconciliationError}
          </div>
        )}

        {productionDataError && activeRoute !== 'dashboard' && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
            Production report data could not be loaded: {productionDataError}
          </div>
        )}

        {loadingProductionData && (
          <div className="mb-4 p-3 bg-white border border-slate-200 rounded-md text-xs text-slate-600">
            Preparing reporting data…
          </div>
        )}

        {activeRoute === 'dashboard' && (
          <ExecutiveOverview
            onNavigate={(r) => navigate(r, null)}
            liveAnalytics={liveAnalytics}
            liveAnalyticsError={liveAnalyticsError}
          />
        )}

        {(activeRoute === 'stations' || activeRoute === 'station-detail') && (
          <StationsView
            stations={productionStations}
            reports={filteredReports}
            workbooks={productionMonitor?.workbooks ?? []}
            selectedStationId={selectedStationId}
            onSelectStation={(id) =>
              id ? navigate('station-detail', id) : navigate('stations', null)
            }
            onInspectReport={setInspectedReport}
            canManageStations={userProfile.role === 'admin'}
            onSaveTankCapacities={handleSaveStationTankCapacities}
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
            stations={productionStations}
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
            supportedWorkbooks={productionReconciliations?.supported_workbooks ?? 0}
            unsupportedWorkbooks={productionReconciliations?.unsupported_workbooks ?? 0}
            page={reconciliationPage}
            pageSize={productionReconciliations?.page_size ?? 100}
            totalChecks={productionReconciliations?.check_count ?? 0}
            hasMore={productionReconciliations?.has_more ?? false}
            onPageChange={setReconciliationPage}
            onInspectReport={setInspectedReport}
          />
        )}

        {activeRoute === 'historical' && (
          <HistoricalAnalyticsView
            allReports={productionData?.reports ?? []}
            stations={productionStations}
            selectedStationId={filters.stationId}
            fuelFilter={filters.fuelType}
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
            workbooks={productionMonitor?.workbooks ?? []}
            importJobs={productionMonitor?.importJobs ?? []}
            importWarnings={productionMonitor?.importWarnings ?? []}
            syncRuns={productionMonitor?.syncRuns ?? []}
            auditLogs={productionMonitor?.auditLogs ?? []}
            syncStatus={productionMonitor?.syncStatus}
            onTriggerManualSync={handleTriggerManualSync}
            onReprocessLegacy2022={handleReprocessLegacy2022}
            onUploadWorkbook={handleUploadWorkbook}
          />
        )}
      </Shell>

      <ReportDetailDrawer report={inspectedReport} onClose={() => setInspectedReport(null)} />
    </>
  );
}