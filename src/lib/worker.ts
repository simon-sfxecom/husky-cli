import { getConfig, setConfig } from "../commands/config.js";
import { hostname, userInfo, platform } from "os";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getApiClient } from "./api-client.js";

interface WorkerIdentity {
  workerId: string;
  workerName: string;
  hostname: string;
  username: string;
  platform: string;
  agentVersion: string;
}

// Get or generate persistent worker identity (stored in ~/.husky/config.json)
export function getWorkerIdentity(): WorkerIdentity {
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
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "../../package.json"), "utf-8")
    );
    agentVersion = pkg.version;
  } catch {
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
export function generateSessionId(): string {
  return `sess-${randomUUID().slice(0, 8)}`;
}

// Register or update worker with API, return workerId
// Note: apiUrl and apiKey parameters kept for backwards compatibility but not used
export async function ensureWorkerRegistered(
  _apiUrl?: string,
  _apiKey?: string
): Promise<string> {
  const identity = getWorkerIdentity();
  const api = getApiClient();

  try {
    // Try to get existing worker
    await api.get(`/api/workers/${identity.workerId}`);
    // Worker exists, just return the ID
    return identity.workerId;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "";
    if (!errorMsg.includes("404")) {
      // Unexpected error, return local ID
      return identity.workerId;
    }
  }

  // Worker not found (404), register new worker
  try {
    const worker = await api.post<{ id: string }>("/api/workers", {
      name: identity.workerName,
      type: "claude-code",
      hostname: identity.hostname,
      username: identity.username,
      platform: identity.platform,
      agentVersion: identity.agentVersion,
    });

    // Update local config with server-assigned ID if different
    if (worker.id !== identity.workerId) {
      setConfig("workerId", worker.id);
      return worker.id;
    }
  } catch {
    console.error("Warning: Failed to register worker");
  }

  return identity.workerId;
}

// Register a new session with API
// Note: apiUrl and apiKey parameters kept for backwards compatibility but not used
export async function registerSession(
  _apiUrl: string,
  _apiKey: string,
  workerId: string,
  sessionId: string
): Promise<void> {
  try {
    const api = getApiClient();
    await api.post("/api/workers/sessions", {
      id: sessionId,
      workerId,
      pid: process.pid,
      workingDirectory: process.cwd(),
    });
  } catch {
    // Silently fail - session registration is optional
  }
}

// Send session heartbeat
// Note: apiUrl and apiKey parameters kept for backwards compatibility but not used
export async function sessionHeartbeat(
  _apiUrl: string,
  _apiKey: string,
  sessionId: string,
  currentTaskId?: string | null
): Promise<void> {
  try {
    const api = getApiClient();
    await api.post(`/api/workers/sessions/${sessionId}/heartbeat`, { currentTaskId });
  } catch {
    // Silently fail
  }
}
