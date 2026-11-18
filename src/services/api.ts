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

export async function apiDropboxSync(): Promise<{ status: string; files_seen: number; new_or_changed: number; tracked_workbooks: number }> {
  const token = localStorage.getItem("logix_api_token");
  const response = await fetch(`${API_BASE}/api/v1/integrations/dropbox/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token || ""}` },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Dropbox inventory sync failed");
  return response.json();
}
