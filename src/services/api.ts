const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

export interface ApiUser {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "management";
  is_active: boolean;
}

export async function apiLogin(email: string, password: string): Promise<ApiUser> {
  const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Login failed");
  const data = await response.json();
  localStorage.setItem("logix_api_token", data.access_token);
  return data.user;
}

export async function apiMe(): Promise<ApiUser | null> {
  const token = localStorage.getItem("logix_api_token");
  if (!token) return null;
  const response = await fetch(`${API_BASE}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    localStorage.removeItem("logix_api_token");
    return null;
  }
  return response.json();
}

export function apiLogout() {
  localStorage.removeItem("logix_api_token");
}

export async function apiDropboxSync(): Promise<{
  status: string;
  files_seen: number;
  new_or_changed: number;
  tracked_workbooks: number;
  imports_attempted?: number;
  imports_succeeded?: number;
  imports_failed?: number;
}> {
  const token = localStorage.getItem("logix_api_token");
  const response = await fetch(`${API_BASE}/api/v1/integrations/dropbox/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token || ""}` },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Dropbox inventory sync failed");
  return response.json();
}


export interface LiveAnalyticsOverview {
  data_status: "mapped_extraction_available" | "no_mapped_extractions";
  period: { year: number | null; month: number | null; station: string | null };
  records: { total: number; mapped: number; complete: number; pending: number; included_in_kpis: number; excluded_anomalies: number; raw_or_unmapped: number };
  kpis: {
    revenue_gmd: number | null;
    pms_litres: number | null;
    ago_litres: number | null;
    cash_reconciliation_difference_gmd: number | null;
    pms_stock_difference_litres: number | null;
    ago_stock_difference_litres: number | null;
    average_revenue_per_completed_report_gmd: number | null;
    average_selling_price_gmd_per_litre: number | null;
  };
  monthly_trends: Array<{
    month: string;
    pms_litres: number;
    ago_litres: number;
    revenue_gmd: number;
    completed_reports: number;
    total_volume_litres: number;
  }>;
  shift_totals: {
    pms: { morning: number; afternoon: number; night: number };
    ago: { morning: number; afternoon: number; night: number };
  };
  stations: Array<{
    station_name: string;
    report_count: number;
    pms_litres: number | null;
    ago_litres: number | null;
    revenue_gmd: number | null;
  }>;
  validation_warning_count: number;
  recent_reports: Array<{
    report_date: string;
    station_name: string;
    worksheet_name: string;
    completeness: string;
    source_reference: string;
    mapped: boolean;
    report_status: "complete" | "pending" | "unmapped";
  }>;
}

export async function apiAnalyticsOverview(filters: {
  year?: string;
  month?: string;
  station?: string;
} = {}): Promise<LiveAnalyticsOverview> {
  const token = localStorage.getItem("logix_api_token");
  if (!token) throw new Error("Sign in to view live PostgreSQL analytics.");
  const params = new URLSearchParams();
  if (filters.year && filters.year !== "ALL") params.set("year", filters.year);
  if (filters.month && filters.month !== "ALL" && filters.year && filters.year !== "ALL") params.set("month", filters.month);
  if (filters.station && filters.station !== "ALL") params.set("station", filters.station);
  const query = params.toString();
  const response = await fetch(`${API_BASE}/api/v1/analytics/overview${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Unable to load live analytics.");
  return response.json();
}


export interface ProductionReportsResponse {
  reports: import("../types/logix").DailyReport[];
  years: number[];
  stations: Array<{ stationId: string; canonicalName: string; territory: string }>;
  record_count: number;
}

interface ProductionReportsPage extends ProductionReportsResponse {
  page: number;
  page_size: number;
  has_more: boolean;
}

export async function apiProductionReports(filters: {
  year?: string;
  month?: string;
  station?: string;
} = {}): Promise<ProductionReportsResponse> {
  const token = localStorage.getItem("logix_api_token");
  if (!token) throw new Error("Sign in to load production reports.");

  const reports: import("../types/logix").DailyReport[] = [];
  let page = 1;
  let metadata: Pick<ProductionReportsResponse, "years" | "stations"> = { years: [], stations: [] };

  // Fetch bounded pages so the API never has to materialize the complete
  // historical dataset in one request. Existing screens still receive the
  // same combined response shape.
  while (true) {
    const params = new URLSearchParams({ page: String(page), page_size: "250" });
    if (filters.year && filters.year !== "ALL") params.set("year", filters.year);
    if (filters.month && filters.month !== "ALL" && filters.year && filters.year !== "ALL") params.set("month", filters.month);
    if (filters.station && filters.station !== "ALL") params.set("station", filters.station);

    const response = await fetch(`${API_BASE}/api/v1/analytics/reports?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Unable to load production reports.");

    const result: ProductionReportsPage = await response.json();
    reports.push(...result.reports);
    metadata = { years: result.years, stations: result.stations };
    if (!result.has_more) break;
    page += 1;
  }

  return { reports, years: metadata.years, stations: metadata.stations, record_count: reports.length };
}


export interface ProductionMonitorResponse {
  workbooks: import("../types/logix").SourceWorkbook[];
  importJobs: import("../types/logix").ImportJob[];
  importWarnings: import("../types/logix").ImportWarning[];
  syncRuns: import("../types/logix").SyncRun[];
  auditLogs: import("../types/logix").AuditLog[];
  syncStatus: {
    configured: boolean;
    rootPath: string;
    lastSyncAt: string | null;
    lastStatus: string;
    lastError: string | null;
    trackedWorkbooks: number;
  };
}

export async function apiProductionMonitor(): Promise<ProductionMonitorResponse> {
  const token = localStorage.getItem("logix_api_token");
  if (!token) throw new Error("Sign in to load production monitoring data.");
  const response = await fetch(`${API_BASE}/api/v1/analytics/monitor`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Unable to load production monitoring data.");
  return response.json();
}


export async function apiReprocessLegacy2022(): Promise<{
  status: string;
  workbooks_attempted: number;
  workbooks_succeeded: number;
  workbooks_failed: number;
  results: Array<{ file?: string; status: string; error?: string; records_extracted?: number }>;
}> {
  const token = localStorage.getItem("logix_api_token");
  if (!token) throw new Error("Sign in to reprocess the legacy 2022 workbooks.");
  const response = await fetch(`${API_BASE}/api/v1/integrations/dropbox/reprocess-legacy-2022`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Legacy workbook reprocessing failed.");
  return response.json();
}
