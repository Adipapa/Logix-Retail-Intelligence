import { useState } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  CalendarRange,
  DatabaseZap,
  Droplets,
  FileDown,
  Fuel,
  Gauge,
  LogOut,
  Menu,
  Scale,
  Truck,
  X,
} from 'lucide-react';
import { formatDateTime, formatMonthName } from '../lib/formatters';
import type { GlobalFilters, RouteId, Station, SyncRun, UserProfile } from '../types/logix';

interface NavItem {
  id: RouteId;
  label: string;
  group: 'Operations' | 'Control & Finance' | 'Analytics & Sync';
  icon: typeof Activity;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Executive Overview', group: 'Operations', icon: Activity },
  { id: 'stations', label: 'Stations', group: 'Operations', icon: Building2 },
  { id: 'fuel-sales', label: 'Fuel Sales', group: 'Operations', icon: Fuel },
  { id: 'pump-performance', label: 'Pump Performance', group: 'Operations', icon: Gauge },
  { id: 'stock-control', label: 'Stock Control', group: 'Control & Finance', icon: Droplets },
  { id: 'deliveries', label: 'Deliveries & Transfers', group: 'Control & Finance', icon: Truck },
  { id: 'reconciliation', label: 'Reconciliation', group: 'Control & Finance', icon: Scale },
  { id: 'historical', label: 'Historical (2022–26)', group: 'Analytics & Sync', icon: CalendarRange },
  { id: 'reports', label: 'Reports & Exports', group: 'Analytics & Sync', icon: FileDown },
  { id: 'data-monitor', label: 'Data & Sync Monitor', group: 'Analytics & Sync', icon: DatabaseZap },
];

const ROUTE_TITLES: Record<RouteId, string> = {
  dashboard: 'Executive Overview',
  stations: 'Station Directory & Coverage',
  'station-detail': 'Station Performance',
  'fuel-sales': 'Fuel Sales Analytics',
  'pump-performance': 'Pump Performance',
  'stock-control': 'Stock Control',
  deliveries: 'Deliveries & Transfers',
  reconciliation: 'Financial & Summary Reconciliation',
  historical: 'Historical Analytics',
  reports: 'Reports & Exports',
  'data-monitor': 'Data & Sync Monitor',
};

interface ShellProps {
  activeRoute: RouteId;
  onNavigate: (route: RouteId) => void;
  user: UserProfile;
  isAuthenticated: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  filters: GlobalFilters;
  onFiltersChange: (next: GlobalFilters) => void;
  stations: Station[];
  years: number[];
  latestSync: SyncRun | undefined;
  showGlobalFilters?: boolean;
  children: React.ReactNode;
}

export function Shell({
  activeRoute,
  onNavigate,
  user,
  isAuthenticated,
  onSignIn,
  onSignOut,
  filters,
  onFiltersChange,
  stations,
  years,
  latestSync,
  showGlobalFilters = true,
  children,
}: ShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const groups: Array<NavItem['group']> = ['Operations', 'Control & Finance', 'Analytics & Sync'];

  const renderNav = () => (
    <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto" aria-label="Primary navigation">
      {groups.map((group) => (
        <div key={group}>
          <div className="px-3 mb-2 text-[11px] font-medium text-slate-500">{group}</div>
          <div className="space-y-0.5">
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              const isActive =
                activeRoute === item.id ||
                (activeRoute === 'station-detail' && item.id === 'stations');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-slate-900 text-white font-medium'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-14 px-5 border-b border-slate-200 flex items-center gap-2.5">
          <BarChart3 className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Logix Retail
          </span>
        </div>
        {renderNav()}
        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <div className="font-medium text-slate-700">
            {isAuthenticated ? 'Central Management' : 'Central Management (Local)'}
          </div>
          <div className="truncate">
            {isAuthenticated ? user.email : 'Sign in anytime for cloud sync'}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-full bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display text-base font-bold text-slate-900">Logix Retail</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
                aria-label="Close navigation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderNav()}
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb / Freshness / Account Action */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">Logix Retail</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {ROUTE_TITLES[activeRoute]}
              </h1>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
            <span>Last Dropbox sync:</span>
            <span className="font-mono tabular-nums text-slate-700">
              {latestSync ? formatDateTime(latestSync.completedAt) : 'Not synced'}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-600 truncate max-w-[180px]">
              {user.displayName}
            </span>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Sign in with Google</span>
              </button>
            )}
          </div>
        </header>

        {/* Shared Global Filters Toolbar */}
        {showGlobalFilters && (
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 no-print">
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Filter by station"
                value={filters.stationId}
                onChange={(e) => onFiltersChange({ ...filters, stationId: e.target.value })}
                className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Stations ({stations.length})</option>
                {stations.map((s) => (
                  <option key={s.stationId} value={s.stationId}>
                    {s.canonicalName} ({s.territory})
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by year"
                value={filters.year}
                onChange={(e) => onFiltersChange({ ...filters, year: e.target.value })}
                className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Years (2022–2026)</option>
                {years.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by month"
                value={filters.month}
                onChange={(e) => onFiltersChange({ ...filters, month: e.target.value })}
                className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Months</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m)}>
                    {formatMonthName(m)}
                  </option>
                ))}
              </select>

              <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-md">
                {(['ALL', 'PMS', 'AGO'] as const).map((fuel) => (
                  <button
                    key={fuel}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, fuelType: fuel })}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      filters.fuelType === fuel
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {fuel === 'ALL' ? 'PMS + AGO' : fuel}
                  </button>
                ))}
              </div>

              <select
                aria-label="Filter by reporting status"
                value={filters.status}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    status: e.target.value as GlobalFilters['status'],
                  })
                }
                className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Statuses</option>
                <option value="imported">Imported</option>
                <option value="warning">Warning</option>
                <option value="incomplete">Incomplete</option>
                <option value="failed">Failed</option>
              </select>

              <input
                type="search"
                value={filters.search}
                onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
                placeholder="Search date, worksheet, note..."
                className="h-9 px-3 text-xs bg-white border border-slate-200 rounded-md text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[190px] flex-1 max-w-xs"
              />

              <button
                type="button"
                onClick={() =>
                  onFiltersChange({
                    stationId: 'ALL',
                    year: '2025',
                    month: '1',
                    fuelType: 'ALL',
                    shift: 'ALL',
                    status: 'ALL',
                    search: '',
                  })
                }
                className="h-9 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
