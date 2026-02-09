import { getConfig, getAuthHeaders } from "../commands/config.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedPermissions {
    role: string;
    permissions: string[];
    knowledgeBases: string[];
    fetchedAt: number;
}

let cache: CachedPermissions | null = null;
let fetchPromise: Promise<CachedPermissions> | null = null;

async function fetchPermissions(): Promise<CachedPermissions> {
    const config = getConfig();
    if (!config.apiUrl) {
        throw new Error("API not configured");
    }

    const authHeaders = getAuthHeaders();
    if (!authHeaders.Authorization) {
        throw new Error("No active session. Run: husky auth login --agent <name>");
    }

    const url = new URL("/api/auth/whoami", config.apiUrl);

    const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
            ...authHeaders,
            "Content-Type": "application/json",
        },
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error.message || error.error || `HTTP ${res.status}`);
    }

    const data = await res.json() as {
        role: string;
        permissions: string[];
        scopes?: string[];
    };

    const effectiveRole = data.role || config.sessionRole || "unknown";
    const effectivePermissions = data.permissions || [];

    const kbPermissions = effectivePermissions
        .filter((p: string) => p.startsWith("kb:"))
        .map((p: string) => p.replace("kb:", ""));

    return {
        role: effectiveRole,
        permissions: effectivePermissions,
        knowledgeBases: kbPermissions,
        fetchedAt: Date.now(),
    };
}

export async function getPermissions(): Promise<CachedPermissions> {
    const now = Date.now();
    
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
        return cache;
    }

    if (!fetchPromise) {
        fetchPromise = fetchPermissions().then(result => {
            cache = result;
            fetchPromise = null;
            return result;
        }).catch(err => {
            fetchPromise = null;
            throw err;
        });
    }
    
    return fetchPromise;
}

export function clearPermissionsCache(): void {
    cache = null;
    fetchPromise = null;
}

export async function hasPermission(permission: string): Promise<boolean> {
    try {
        const perms = await getPermissions();
        
        if (perms.permissions.includes("*")) return true;
        if (perms.permissions.includes(permission)) return true;
        
        const [scope] = permission.split(":");
        if (perms.permissions.includes(`${scope}:*`)) return true;
        
        return false;
    } catch {
        return false;
    }
}

export async function canAccessKnowledgeBase(kb: string): Promise<boolean> {
    try {
        const perms = await getPermissions();
        return perms.knowledgeBases.includes(kb) || perms.permissions.includes("kb:*");
    } catch {
        return false;
    }
}

export async function getAccessibleKnowledgeBases(): Promise<string[]> {
    try {
        const perms = await getPermissions();
        return perms.knowledgeBases;
    } catch {
        return [];
    }
}

export async function getCurrentRole(): Promise<string | null> {
    try {
        const perms = await getPermissions();
        return perms.role;
    } catch {
        return null;
    }
}

export function getCacheStatus(): { cached: boolean; age: number | null; expiresIn: number | null } {
    if (!cache) {
        return { cached: false, age: null, expiresIn: null };
    }
    
    const age = Date.now() - cache.fetchedAt;
    const expiresIn = Math.max(0, CACHE_TTL_MS - age);
    
    return { cached: true, age, expiresIn };
}
