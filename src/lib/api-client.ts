import { getConfig, getSessionConfig, clearSessionConfig, ensureValidSession } from "../commands/config.js";

function isSessionExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  skipAuth?: boolean;
  signal?: AbortSignal;
}

async function doFetch(
  url: URL,
  method: string,
  authHeader: Record<string, string>,
  body?: unknown,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(url.toString(), {
    method,
    headers: {
      ...authHeader,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
}

function getAuthHeader(
  session: ReturnType<typeof getSessionConfig>
): Record<string, string> {
  if (session?.token && session.expiresAt) {
    if (isSessionExpired(session.expiresAt)) {
      clearSessionConfig();
      throw new Error("Session expired. Run: husky auth login --agent <name>");
    }

    return { "Authorization": `Bearer ${session.token}` };
  }

  throw new Error("No active session. Run: husky auth login --agent <name>");
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const config = getConfig();
  if (!config.apiUrl) {
    throw new Error("API URL not configured. Run: husky config set api-url <url>");
  }

  if (!options.skipAuth) {
    const ok = await ensureValidSession();
    if (!ok) {
      throw new Error("No active session. Run: husky auth login --agent <name>");
    }
  }

  const session = getSessionConfig();
  const method = options.method || "GET";
  const url = new URL(path, config.apiUrl);

  const authHeader = options.skipAuth 
    ? {} 
    : getAuthHeader(session);

  const res = await doFetch(url, method, authHeader, options.body, options.signal);

  if (!res.ok) {
    if (res.status === 401) {
      clearSessionConfig();
    }

    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.message || error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export function getApiClient() {
  return {
    get: <T>(path: string) => apiRequest<T>(path),
    post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
    put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
    patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
    delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
  };
}
