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
  records: { total: number; mapped: number; raw_or_unmapped: number };
  kpis: {
    revenue_gmd: number | null;
    pms_litres: number | null;
    ago_litres: number | null;
    cash_reconciliation_difference_gmd: number | null;
    pms_stock_difference_litres: number | null;
    ago_stock_difference_litres: number | null;
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
