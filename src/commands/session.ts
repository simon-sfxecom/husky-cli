/**
 * Session Command - Agent Session Logging & Analysis
 *
 * Part of the self-improving system. Provides commands for:
 * - Logging tool calls during a session
 * - Exporting session data before VM shutdown
 * - Triggering analysis
 * - Searching for similar problems/solutions
 */

import { Command } from "commander";
import { getConfig } from "./config.js";
import { getApiClient } from "../lib/api-client.js";
import * as fs from "fs";
import * as path from "path";
import type {
  AgentSession,
  SessionLogEntry,
  SessionSummary,
  SearchResult,
} from "../types/session.js";

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_AGENT_ID = process.env.HUSKY_AGENT_ID || "default";
const DEFAULT_VM_NAME = process.env.HUSKY_VM_NAME || process.env.HOSTNAME || "local";

// Local session state file for tracking current session
const SESSION_STATE_FILE = path.join(
  process.env.HOME || "/tmp",
  ".husky",
  "current-session.json"
);

interface LocalSessionState {
  sessionId: string;
  vmName: string;
  agentId: string;
  startedAt: string;
  pendingLogs: Array<{
    tool: string;
    toolInput: string;
    toolOutput: string;
    status: "success" | "error" | "warning";
    errorType?: string;
    duration?: number;
    timestamp: string;
  }>;
}

function loadLocalState(): LocalSessionState | null {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_STATE_FILE, "utf-8"));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function saveLocalState(state: LocalSessionState): void {
  const dir = path.dirname(SESSION_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function clearLocalState(): void {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      fs.unlinkSync(SESSION_STATE_FILE);
    }
  } catch {
    // Ignore errors
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ensureConfig() {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("Error: API URL not configured. Run: husky config set api-url <url>");
    process.exit(1);
  }
  return config;
}

// ============================================================================
// Command Definition
// ============================================================================

export const sessionCommand = new Command("session")
  .description("Agent session logging and analysis (self-improving system)");

// -------------------------------------------------------------------------
// Session Management
// -------------------------------------------------------------------------

sessionCommand
  .command("init")
  .description("Initialize a new session (typically called at VM startup)")
  .option("--vm-name <name>", "VM name", DEFAULT_VM_NAME)
  .option("--agent-id <id>", "Agent ID", DEFAULT_AGENT_ID)
  .option("--agent-name <name>", "Agent display name")
  .option("--task-id <id>", "Associated task ID")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    ensureConfig();
    const api = getApiClient();

    try {
      const session = await api.post<AgentSession>("/api/sessions", {
        vmName: options.vmName,
        agentId: options.agentId,
        agentName: options.agentName,
        taskId: options.taskId,
      });

      // Save local state
      saveLocalState({
        sessionId: session.id,
        vmName: options.vmName,
        agentId: options.agentId,
        startedAt: new Date().toISOString(),
        pendingLogs: [],
      });

      // Set environment variable for hooks
      console.log(`export HUSKY_SESSION_ID="${session.id}"`);

      if (options.json) {
        console.log(JSON.stringify({ success: true, session }));
      } else {
        console.log(`  Session initialized: ${session.id}`);
        console.log(`  VM: ${options.vmName}`);
        console.log(`  Agent: ${options.agentId}`);
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

sessionCommand
  .command("current")
  .description("Show current session info")
  .option("--vm-name <name>", "VM name filter", DEFAULT_VM_NAME)
  .option("--agent-id <id>", "Agent ID filter")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    // First check local state
    const localState = loadLocalState();

    if (localState) {
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          source: "local",
          sessionId: localState.sessionId,
          vmName: localState.vmName,
          agentId: localState.agentId,
          startedAt: localState.startedAt,
          pendingLogs: localState.pendingLogs.length,
        }));
      } else {
        console.log(`\n  Current Session (local state)`);
        console.log(`  ID: ${localState.sessionId}`);
        console.log(`  VM: ${localState.vmName}`);
        console.log(`  Agent: ${localState.agentId}`);
        console.log(`  Started: ${formatDate(localState.startedAt)}`);
        console.log(`  Pending logs: ${localState.pendingLogs.length}`);
        console.log("");
      }
      return;
    }

    // Fall back to API
    ensureConfig();
    const api = getApiClient();

    try {
      const params = new URLSearchParams();
      if (options.vmName) params.set("vmName", options.vmName);
      if (options.agentId) params.set("agentId", options.agentId);

      const result = await api.get<{ session: AgentSession }>(
        `/api/sessions/current?${params.toString()}`
      );

      if (options.json) {
        console.log(JSON.stringify({ success: true, source: "api", session: result.session }));
      } else {
        const s = result.session;
        console.log(`\n  Current Session`);
        console.log(`  ID: ${s.id}`);
        console.log(`  VM: ${s.vmName}`);
        console.log(`  Agent: ${s.agentId}`);
        console.log(`  Status: ${s.status}`);
        console.log(`  Logs: ${s.logCount} (${s.errorCount} errors)`);
        console.log(`  Started: ${formatDate(s.startedAt)}`);
        console.log("");
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }));
      } else {
        console.log("  No active session found");
      }
    }
  });

sessionCommand
  .command("list")
  .description("List recent sessions")
  .option("-s, --status <status>", "Filter by status (active, exported, analyzed)")
  .option("--vm-name <name>", "Filter by VM name")
  .option("--agent-id <id>", "Filter by agent ID")
  .option("-l, --limit <num>", "Max results", "20")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    ensureConfig();
    const api = getApiClient();

    try {
      const params = new URLSearchParams();
      if (options.status) params.set("status", options.status);
      if (options.vmName) params.set("vmName", options.vmName);
      if (options.agentId) params.set("agentId", options.agentId);
      params.set("limit", options.limit);

      const result = await api.get<{ sessions: AgentSession[] }>(
        `/api/sessions?${params.toString()}`
      );

      if (options.json) {
        console.log(JSON.stringify({ success: true, sessions: result.sessions }));
        return;
      }

      console.log(`\n  Sessions (${result.sessions.length})\n`);

      if (result.sessions.length === 0) {
        console.log("  No sessions found.");
        return;
      }

      for (const s of result.sessions) {
        const date = formatDate(s.createdAt);
        const status = s.status.padEnd(10);
        const logs = `${s.logCount} logs`.padEnd(12);
        console.log(`  ${date} | ${status} | ${logs} | ${s.vmName}/${s.agentId}`);
      }
      console.log("");
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Logging
// -------------------------------------------------------------------------

sessionCommand
  .command("log")
  .description("Add a log entry to current session (for PostToolUse hook)")
  .option("--session-id <id>", "Session ID (or uses current)")
  .option("--tool <name>", "Tool name", "unknown")
  .option("--input <text>", "Tool input (truncated to 1KB)")
  .option("--output <text>", "Tool output (truncated to 5KB)")
  .option("--status <status>", "Status: success, error, warning", "success")
  .option("--error-type <type>", "Error type if status is error")
  .option("--duration <ms>", "Duration in milliseconds")
  .option("--buffer", "Buffer locally instead of sending immediately")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const localState = loadLocalState();
    const sessionId = options.sessionId || localState?.sessionId || process.env.HUSKY_SESSION_ID;

    if (!sessionId) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: "No session ID" }));
      } else {
        console.error("Error: No session ID. Run 'husky session init' first.");
      }
      process.exit(1);
    }

    const logEntry = {
      tool: options.tool,
      toolInput: truncate(options.input || "", 1024),
      toolOutput: truncate(options.output || "", 5120),
      status: options.status as "success" | "error" | "warning",
      errorType: options.errorType,
      duration: options.duration ? parseInt(options.duration, 10) : undefined,
      timestamp: new Date().toISOString(),
    };

    // Buffer mode: store locally
    if (options.buffer && localState) {
      localState.pendingLogs.push(logEntry);
      saveLocalState(localState);

      if (options.json) {
        console.log(JSON.stringify({ success: true, buffered: true, pending: localState.pendingLogs.length }));
      }
      return;
    }

    // Send to API
    ensureConfig();
    const api = getApiClient();

    try {
      const vmName = localState?.vmName || DEFAULT_VM_NAME;
      const agentId = localState?.agentId || DEFAULT_AGENT_ID;

      await api.post(`/api/sessions/${sessionId}/logs`, {
        vmName,
        agentId,
        ...logEntry,
      });

      if (options.json) {
        console.log(JSON.stringify({ success: true, sessionId }));
      }
    } catch (error) {
      // Fail silently in non-json mode (don't disrupt main workflow)
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }));
      }
    }
  });

// -------------------------------------------------------------------------
// Export (for VM shutdown)
// -------------------------------------------------------------------------

sessionCommand
  .command("export")
  .description("Export buffered logs to Firestore (for VM shutdown)")
  .option("--session-id <id>", "Session ID (or uses current)")
  .option("--to-firestore", "Export to Firestore (default)")
  .option("--force", "Export even if no pending logs")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const localState = loadLocalState();
    const sessionId = options.sessionId || localState?.sessionId || process.env.HUSKY_SESSION_ID;

    if (!sessionId) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: "No session ID" }));
      } else {
        console.error("Error: No session ID. Run 'husky session init' first.");
      }
      process.exit(1);
    }

    if (!localState?.pendingLogs.length && !options.force) {
      if (options.json) {
        console.log(JSON.stringify({ success: true, logsExported: 0, message: "No pending logs" }));
      } else {
        console.log("  No pending logs to export.");
      }
      return;
    }

    ensureConfig();
    const api = getApiClient();

    try {
      const vmName = localState?.vmName || DEFAULT_VM_NAME;
      const agentId = localState?.agentId || DEFAULT_AGENT_ID;

      const logs = (localState?.pendingLogs || []).map((log) => ({
        vmName,
        agentId,
        ...log,
      }));

      if (logs.length > 0) {
        const result = await api.post<{ success: boolean; logsImported: number }>(
          `/api/sessions/${sessionId}/export`,
          { logs }
        );

        // Clear local state after successful export
        clearLocalState();

        if (options.json) {
          console.log(JSON.stringify(result));
        } else {
          console.log(`  Exported ${result.logsImported} logs to session ${sessionId}`);
        }
      } else {
        // Just update status
        await api.patch(`/api/sessions/${sessionId}`, { status: "exported" });

        if (options.json) {
          console.log(JSON.stringify({ success: true, logsExported: 0 }));
        } else {
          console.log(`  Session ${sessionId} marked as exported`);
        }
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Analysis
// -------------------------------------------------------------------------

sessionCommand
  .command("analyze")
  .description("Trigger session analysis")
  .option("--session-id <id>", "Session ID (or uses current)")
  .option("--sync", "Wait for analysis to complete (not recommended)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const localState = loadLocalState();
    const sessionId = options.sessionId || localState?.sessionId || process.env.HUSKY_SESSION_ID;

    if (!sessionId) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: "No session ID" }));
      } else {
        console.error("Error: No session ID.");
      }
      process.exit(1);
    }

    ensureConfig();
    const api = getApiClient();

    try {
      const result = await api.post<{ success: boolean; taskId?: string; message?: string }>(
        `/api/sessions/${sessionId}/analyze`,
        { async: !options.sync }
      );

      if (options.json) {
        console.log(JSON.stringify(result));
      } else {
        if (result.taskId) {
          console.log(`  Analysis task created: ${result.taskId}`);
        } else {
          console.log(`  ${result.message || "Analysis triggered"}`);
        }
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Get Logs (for analyzer worker)
// -------------------------------------------------------------------------

sessionCommand
  .command("get-logs")
  .description("Get logs for a session (for analyzer worker)")
  .option("--session-id <id>", "Session ID", "")
  .option("-l, --limit <num>", "Max results", "500")
  .option("--offset <num>", "Offset", "0")
  .option("--status <status>", "Filter by status")
  .option("--json", "Output as JSON")
  .option("--format <format>", "Output format (json, text)", "text")
  .action(async (options) => {
    if (!options.sessionId) {
      console.error("Error: --session-id is required");
      process.exit(1);
    }

    ensureConfig();
    const api = getApiClient();

    try {
      const params = new URLSearchParams();
      params.set("limit", options.limit);
      params.set("offset", options.offset);
      if (options.status) params.set("status", options.status);

      const result = await api.get<{ logs: SessionLogEntry[]; count: number }>(
        `/api/sessions/${options.sessionId}/logs?${params.toString()}`
      );

      if (options.json || options.format === "json") {
        console.log(JSON.stringify(result));
        return;
      }

      console.log(`\n  Logs for session ${options.sessionId} (${result.count})\n`);

      for (const log of result.logs) {
        const time = formatDate(log.timestamp);
        const status = log.status === "error" ? "" : log.status === "warning" ? "" : "";
        console.log(`  ${time} | ${status} ${log.tool.padEnd(20)} | ${truncate(log.toolInput, 50)}`);
      }
      console.log("");
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Save Summary (for analyzer worker)
// -------------------------------------------------------------------------

sessionCommand
  .command("save-summary")
  .description("Save analysis summary (for analyzer worker)")
  .option("--session-id <id>", "Session ID", "")
  .option("--file <path>", "JSON file with summary data")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    if (!options.sessionId) {
      console.error("Error: --session-id is required");
      process.exit(1);
    }

    if (!options.file) {
      console.error("Error: --file is required");
      process.exit(1);
    }

    let summaryData: unknown;
    try {
      const content = fs.readFileSync(options.file, "utf-8");
      summaryData = JSON.parse(content);
    } catch (error) {
      console.error("Error reading summary file:", (error as Error).message);
      process.exit(1);
    }

    ensureConfig();
    const api = getApiClient();

    try {
      const result = await api.post<{ success: boolean; summary: SessionSummary }>(
        `/api/sessions/${options.sessionId}/summary`,
        summaryData
      );

      if (options.json) {
        console.log(JSON.stringify(result));
      } else {
        console.log(`  Summary saved for session ${options.sessionId}`);
        console.log(`  Learnings: ${result.summary.learnings.length}`);
        console.log(`  Errors: ${result.summary.errors.length}`);
        console.log(`  Improvements: ${result.summary.improvements.length}`);
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Search
// -------------------------------------------------------------------------

sessionCommand
  .command("search <query>")
  .description("Search for similar problems/solutions across sessions")
  .option("--type <type>", "Search type: all, errors, learnings", "all")
  .option("-l, --limit <num>", "Max results", "10")
  .option("--json", "Output as JSON")
  .action(async (query, options) => {
    ensureConfig();
    const api = getApiClient();

    try {
      const result = await api.post<{
        query: string;
        type: string;
        results: SearchResult[];
        count: number;
      }>("/api/sessions/search", {
        query,
        type: options.type,
        limit: parseInt(options.limit, 10),
      });

      if (options.json) {
        console.log(JSON.stringify(result));
        return;
      }

      console.log(`\n  Search: "${query}" (${result.count} results)\n`);

      if (result.results.length === 0) {
        console.log("  No matching sessions found.");
        console.log("");
        return;
      }

      for (const r of result.results) {
        const dateInfo = r.analyzedAt ? formatDate(r.analyzedAt) : "not analyzed";
        const similarity = r.similarity ? ` ${r.similarity}% match` : "";
        console.log(`  Session ${r.sessionId.slice(0, 8)}... (${dateInfo})${similarity}`);

        if (r.match.learnings.length > 0) {
          for (const l of r.match.learnings.slice(0, 2)) {
            console.log(`     ${truncate(l.content, 70)}`);
          }
        }

        if (r.match.errors.length > 0) {
          for (const e of r.match.errors.slice(0, 2)) {
            console.log(`     ${truncate(e.description, 70)}`);
          }
        }
        console.log("");
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Summary
// -------------------------------------------------------------------------

sessionCommand
  .command("summary")
  .description("Get analysis summary for a session")
  .option("--session-id <id>", "Session ID (or uses current)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const localState = loadLocalState();
    const sessionId = options.sessionId || localState?.sessionId || process.env.HUSKY_SESSION_ID;

    if (!sessionId) {
      console.error("Error: No session ID.");
      process.exit(1);
    }

    ensureConfig();
    const api = getApiClient();

    try {
      const result = await api.get<{ summary: SessionSummary }>(
        `/api/sessions/${sessionId}/summary`
      );

      if (options.json) {
        console.log(JSON.stringify(result));
        return;
      }

      const s = result.summary;
      console.log(`\n  Session Summary: ${sessionId.slice(0, 8)}...`);
      console.log(`  Analyzed: ${formatDate(s.analyzedAt)} by ${s.analyzedBy}`);
      console.log("");

      console.log(`  Stats:`);
      console.log(`    Total logs: ${s.stats.totalLogs}`);
      console.log(`    Errors: ${s.stats.errorCount}`);
      console.log(`    Duration: ${s.stats.durationMinutes} min`);
      console.log("");

      if (s.learnings.length > 0) {
        console.log(`  Learnings (${s.learnings.length}):`);
        for (const l of s.learnings) {
          const saved = l.savedToBrain ? " [saved to brain]" : "";
          console.log(`    - ${truncate(l.content, 70)}${saved}`);
        }
        console.log("");
      }

      if (s.errors.length > 0) {
        console.log(`  Errors (${s.errors.length}):`);
        for (const e of s.errors) {
          console.log(`    - [${e.type}] ${truncate(e.description, 60)}`);
          console.log(`       ${truncate(e.solution, 60)}`);
        }
        console.log("");
      }

      if (s.improvements.length > 0) {
        console.log(`  Improvements (${s.improvements.length}):`);
        for (const i of s.improvements) {
          console.log(`    - [${i.priority}] ${i.area}: ${truncate(i.suggestion, 50)}`);
        }
        console.log("");
      }
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        console.log("  Session has not been analyzed yet.");
        console.log("  Run: husky session analyze --session-id " + sessionId);
      } else {
        console.error("Error:", (error as Error).message);
        process.exit(1);
      }
    }
  });

// -------------------------------------------------------------------------
// Embed
// -------------------------------------------------------------------------

sessionCommand
  .command("embed")
  .description("Generate vector embeddings for a session (requires analysis)")
  .option("--session-id <id>", "Session ID (or uses current)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const localState = loadLocalState();
    const sessionId = options.sessionId || localState?.sessionId || process.env.HUSKY_SESSION_ID;

    if (!sessionId) {
      console.error("Error: No session ID. Use --session-id or set HUSKY_SESSION_ID.");
      process.exit(1);
    }

    ensureConfig();
    const api = getApiClient();

    try {
      if (!options.json) {
        console.log(`Generating embeddings for session ${sessionId.slice(0, 8)}...`);
      }

      const result = await api.post<{
        success: boolean;
        sessionId: string;
        embeddingsGenerated: number;
        embeddings: Array<{ chunkId: string; type: string; content: string }>;
      }>(`/api/sessions/${sessionId}/embed`);

      if (options.json) {
        console.log(JSON.stringify(result));
        return;
      }

      console.log(`✓ Generated ${result.embeddingsGenerated} embeddings`);
      console.log("");

      const learnings = result.embeddings.filter(e => e.type === "learning");
      const errors = result.embeddings.filter(e => e.type === "error");

      if (learnings.length > 0) {
        console.log(`  Learnings embedded: ${learnings.length}`);
      }
      if (errors.length > 0) {
        console.log(`  Errors embedded: ${errors.length}`);
      }

      console.log("");
      console.log("  Session can now be found via semantic search:");
      console.log("  husky session search \"your query\"");
    } catch (error) {
      if ((error as Error).message.includes("must be analyzed")) {
        console.error("Error: Session must be analyzed before embedding.");
        console.error("Run: husky session analyze --session-id " + sessionId);
      } else {
        console.error("Error:", (error as Error).message);
      }
      process.exit(1);
    }
  });

export default sessionCommand;
