import { getConfig, getSessionConfig, setSessionConfig, clearSessionConfig } from "../commands/config.js";

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

let refreshInProgress: Promise<SessionResponse | null> | null = null;

interface SessionAgent {
  id: string;
  name: string;
  emoji?: string;
}

interface SessionResponse {
  token: string;
  expiresAt: string;
  role: string;
  agent: SessionAgent;
}

function isSessionExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

function isSessionExpiringSoon(expiresAt: string | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() - Date.now() < REFRESH_THRESHOLD_MS;
}

async function doRefresh(agentName: string): Promise<SessionResponse | null> {
  const config = getConfig();
  if (!config.apiUrl || !config.apiKey) return null;

  try {
    const url = new URL("/api/auth/session", config.apiUrl);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ agent: agentName }),
    });

    if (!res.ok) return null;

    const session: SessionResponse = await res.json();
    // Extract agent id for storage (API returns object with id, name, emoji)
    setSessionConfig({
      token: session.token,
      expiresAt: session.expiresAt,
      role: session.role,
      agent: session.agent.id,
    });
    return session;
  } catch {
    return null;
  }
}

async function refreshSession(agentName: string): Promise<SessionResponse | null> {
  if (refreshInProgress) {
    return refreshInProgress;
  }

  refreshInProgress = doRefresh(agentName).finally(() => {
    refreshInProgress = null;
  });

  return refreshInProgress;
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  skipAuth?: boolean;
}

async function doFetch(
  url: URL,
  method: string,
  authHeader: Record<string, string>,
  body?: unknown
): Promise<Response> {
  return fetch(url.toString(), {
    method,
    headers: {
      ...authHeader,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function getAuthHeader(
  session: ReturnType<typeof getSessionConfig>,
  apiKey: string | undefined
): Promise<Record<string, string>> {
  // DEBUG: console.log('DEBUG session:', session?.token ? 'exists' : 'missing', session?.expiresAt);
  
  if (session?.token && session.expiresAt) {
    // DEBUG: console.log('DEBUG: Checking expiration...');
    if (isSessionExpired(session.expiresAt)) {
      // DEBUG: console.log('DEBUG: Session expired, refreshing...');
      if (session.agent) {
        const newSession = await refreshSession(session.agent);
        if (newSession) {
          // DEBUG: console.log('DEBUG: Refresh successful, using Bearer token');
          return { "Authorization": `Bearer ${newSession.token}` };
        }
      }
      clearSessionConfig();
      if (apiKey) {
        // DEBUG: console.log('DEBUG: Refresh failed, falling back to API key');
        return { "x-api-key": apiKey };
      }
      throw new Error("Session expired and no API key available for refresh");
    }
    
    if (isSessionExpiringSoon(session.expiresAt) && session.agent) {
      refreshSession(session.agent).catch(() => {});
    }
    // DEBUG: console.log('DEBUG: Using existing Bearer token');
    return { "Authorization": `Bearer ${session.token}` };
  }
  
  if (apiKey) {
    // DEBUG: console.log('DEBUG: No session, using API key');
    return { "x-api-key": apiKey };
  }
  
  throw new Error("No authentication configured. Run: husky auth login --agent <name> or husky config set api-key <key>");
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const config = getConfig();
  if (!config.apiUrl) {
    throw new Error("API URL not configured. Run: husky config set api-url <url>");
  }

  const session = getSessionConfig();
  const method = options.method || "GET";
  const url = new URL(path, config.apiUrl);

  const authHeader = options.skipAuth 
    ? {} 
    : await getAuthHeader(session, config.apiKey);

  const res = await doFetch(url, method, authHeader, options.body);

  if (!res.ok) {
    if (res.status === 401 && session?.token && session.agent) {
      const newSession = await refreshSession(session.agent);
      if (newSession) {
        const retryRes = await doFetch(
          url, 
          method, 
          { "Authorization": `Bearer ${newSession.token}` },
          options.body
        );
        if (retryRes.ok) {
          return retryRes.json();
        }
      }
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
