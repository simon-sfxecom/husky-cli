import { getConfig, setConfig } from "../commands/config.js";
import { hostname, userInfo, platform } from "os";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
// Get or generate persistent worker identity (stored in ~/.husky/config.json)
export function getWorkerIdentity() {
    const config = getConfig();
    // Generate worker ID if not exists
    if (!config.workerId) {
        const newId = `cli-${randomUUID().slice(0, 8)}`;
        setConfig("workerId", newId);
        config.workerId = newId;
    }
    // Generate worker name if not exists
    if (!config.workerName) {
        const name = `Claude Code @ ${hostname()}`;
        setConfig("workerName", name);
        config.workerName = name;
    }
    // Get agent version from package.json
    let agentVersion = "unknown";
    try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));
        agentVersion = pkg.version;
    }
    catch {
        // Ignore errors reading package.json
    }
    return {
        workerId: config.workerId,
        workerName: config.workerName,
        hostname: hostname(),
        username: userInfo().username,
        platform: platform(),
        agentVersion,
    };
}
// Generate a unique session ID for this CLI instance
export function generateSessionId() {
    return `sess-${randomUUID().slice(0, 8)}`;
}
// Register or update worker with API, return workerId
export async function ensureWorkerRegistered(apiUrl, apiKey) {
    const identity = getWorkerIdentity();
    // Try to get existing worker
    const getRes = await fetch(`${apiUrl}/api/workers/${identity.workerId}`, {
        headers: { "x-api-key": apiKey },
    });
    if (getRes.ok) {
        // Worker exists, just return the ID
        return identity.workerId;
    }
    if (getRes.status === 404) {
        // Register new worker
        const registerRes = await fetch(`${apiUrl}/api/workers`, {
            method: "POST",
            headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
                name: identity.workerName,
                type: "claude-code",
                hostname: identity.hostname,
                username: identity.username,
                platform: identity.platform,
                agentVersion: identity.agentVersion,
            }),
        });
        if (!registerRes.ok) {
            console.error(`Warning: Failed to register worker: ${registerRes.status}`);
            return identity.workerId;
        }
        const worker = await registerRes.json();
        // Update local config with server-assigned ID if different
        if (worker.id !== identity.workerId) {
            setConfig("workerId", worker.id);
            return worker.id;
        }
    }
    return identity.workerId;
}
// Register a new session with API
export async function registerSession(apiUrl, apiKey, workerId, sessionId) {
    try {
        await fetch(`${apiUrl}/api/workers/sessions`, {
            method: "POST",
            headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
                id: sessionId,
                workerId,
                pid: process.pid,
                workingDirectory: process.cwd(),
            }),
        });
    }
    catch {
        // Silently fail - session registration is optional
    }
}
// Send session heartbeat
export async function sessionHeartbeat(apiUrl, apiKey, sessionId, currentTaskId) {
    try {
        await fetch(`${apiUrl}/api/workers/sessions/${sessionId}/heartbeat`, {
            method: "POST",
            headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ currentTaskId }),
        });
    }
    catch {
        // Silently fail
    }
}
