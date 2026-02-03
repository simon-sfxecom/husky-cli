/**
 * Insights Command - Aggregated Session Analytics
 *
 * Part of the self-improving system. Provides commands for:
 * - Viewing recent errors across sessions
 * - Listing learnings
 * - Showing suggested improvements
 * - Aggregated statistics
 */

import { Command } from "commander";
import { getConfig } from "./config.js";
import { getApiClient } from "../lib/api-client.js";
import type { AgentSession, SessionSummary } from "../types/session.js";

// ============================================================================
// Helpers
// ============================================================================

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

function parseDuration(since: string): Date {
  const match = since.match(/^(\d+)([dhwm])$/);
  if (!match) {
    throw new Error("Invalid duration format. Use: 7d, 24h, 2w, 1m");
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const now = new Date();
  switch (unit) {
    case "h":
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    case "d":
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case "w":
      return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
    case "m":
      return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
    default:
      throw new Error("Invalid duration unit. Use: h, d, w, m");
  }
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

export const insightsCommand = new Command("insights")
  .description("View aggregated session insights and analytics");

// -------------------------------------------------------------------------
// Errors
// -------------------------------------------------------------------------

insightsCommand
  .command("errors")
  .description("List recent errors from analyzed sessions")
  .option("--since <duration>", "Time window (e.g., 7d, 24h, 2w)", "7d")
  .option("-l, --limit <num>", "Max errors to show", "20")
  .option("--type <type>", "Filter by error type")
  .option("--preventable", "Show only preventable errors")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    ensureConfig();
    const api = getApiClient();

    try {
      // Get analyzed sessions
      const result = await api.get<{ sessions: AgentSession[] }>(
        "/api/sessions?status=analyzed&limit=50"
      );

      const sinceDate = parseDuration(options.since);
      const limit = parseInt(options.limit, 10);

      // Extract errors from summaries
      const allErrors: Array<{
        sessionId: string;
        analyzedAt: Date;
        error: SessionSummary["errors"][0];
      }> = [];

      for (const session of result.sessions) {
        if (!session.summary?.errors) continue;

        const analyzedAt = new Date(session.analyzedAt || session.createdAt);
        if (analyzedAt < sinceDate) continue;

        for (const error of session.summary.errors) {
          if (options.type && error.type !== options.type) continue;
          if (options.preventable && !error.preventable) continue;

          allErrors.push({
            sessionId: session.id,
            analyzedAt,
            error,
          });
        }
      }

      // Sort by date, most recent first
      allErrors.sort((a, b) => b.analyzedAt.getTime() - a.analyzedAt.getTime());
      const errors = allErrors.slice(0, limit);

      if (options.json) {
        console.log(JSON.stringify({ success: true, errors, count: errors.length }));
        return;
      }

      console.log(`\n  Errors (last ${options.since}, ${errors.length} found)\n`);

      if (errors.length === 0) {
        console.log("  No errors found.");
        console.log("");
        return;
      }

      // Group by error type
      const byType = new Map<string, typeof errors>();
      for (const e of errors) {
        const list = byType.get(e.error.type) || [];
        list.push(e);
        byType.set(e.error.type, list);
      }

      for (const [type, typeErrors] of byType) {
        console.log(`  [${type}] (${typeErrors.length})`);
        for (const e of typeErrors.slice(0, 5)) {
          const preventable = e.error.preventable ? " (preventable)" : "";
          console.log(`    ${formatDate(e.analyzedAt)} | ${truncate(e.error.description, 50)}${preventable}`);
          console.log(`       ${truncate(e.error.solution, 55)}`);
        }
        if (typeErrors.length > 5) {
          console.log(`    ... and ${typeErrors.length - 5} more`);
        }
        console.log("");
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Learnings
// -------------------------------------------------------------------------

insightsCommand
  .command("learnings")
  .description("List learnings from analyzed sessions")
  .option("--since <duration>", "Time window (e.g., 7d, 24h, 2w)", "7d")
  .option("-l, --limit <num>", "Max learnings to show", "20")
  .option("-t, --tags <tags>", "Filter by tags (comma-separated)")
  .option("--confidence <level>", "Filter by confidence (low, medium, high)")
  .option("--saved-only", "Show only learnings saved to brain")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    ensureConfig();
    const api = getApiClient();

    try {
      const result = await api.get<{ sessions: AgentSession[] }>(
        "/api/sessions?status=analyzed&limit=50"
      );

      const sinceDate = parseDuration(options.since);
      const limit = parseInt(options.limit, 10);
      const filterTags = options.tags ? options.tags.split(",").map((t: string) => t.trim()) : [];

      const allLearnings: Array<{
        sessionId: string;
        analyzedAt: Date;
        learning: SessionSummary["learnings"][0];
      }> = [];

      for (const session of result.sessions) {
        if (!session.summary?.learnings) continue;

        const analyzedAt = new Date(session.analyzedAt || session.createdAt);
        if (analyzedAt < sinceDate) continue;

        for (const learning of session.summary.learnings) {
          if (options.confidence && learning.confidence !== options.confidence) continue;
          if (options.savedOnly && !learning.savedToBrain) continue;
          if (filterTags.length > 0) {
            const hasTag = filterTags.some((t: string) => learning.tags.includes(t));
            if (!hasTag) continue;
          }

          allLearnings.push({
            sessionId: session.id,
            analyzedAt,
            learning,
          });
        }
      }

      allLearnings.sort((a, b) => b.analyzedAt.getTime() - a.analyzedAt.getTime());
      const learnings = allLearnings.slice(0, limit);

      if (options.json) {
        console.log(JSON.stringify({ success: true, learnings, count: learnings.length }));
        return;
      }

      console.log(`\n  Learnings (last ${options.since}, ${learnings.length} found)\n`);

      if (learnings.length === 0) {
        console.log("  No learnings found.");
        console.log("");
        return;
      }

      for (const l of learnings) {
        const tags = l.learning.tags.length > 0 ? ` [${l.learning.tags.join(", ")}]` : "";
        const confidence = l.learning.confidence;
        const saved = l.learning.savedToBrain ? " " : "";
        console.log(`  ${formatDate(l.analyzedAt)} | [${confidence}]${saved} ${truncate(l.learning.content, 60)}${tags}`);
      }
      console.log("");
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Improvements
// -------------------------------------------------------------------------

insightsCommand
  .command("improvements")
  .description("List suggested improvements from analyzed sessions")
  .option("--since <duration>", "Time window (e.g., 7d, 24h, 2w)", "30d")
  .option("-l, --limit <num>", "Max improvements to show", "20")
  .option("--priority <priority>", "Filter by priority (low, medium, high)")
  .option("--area <area>", "Filter by area")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    ensureConfig();
    const api = getApiClient();

    try {
      const result = await api.get<{ sessions: AgentSession[] }>(
        "/api/sessions?status=analyzed&limit=100"
      );

      const sinceDate = parseDuration(options.since);
      const limit = parseInt(options.limit, 10);

      const allImprovements: Array<{
        sessionId: string;
        analyzedAt: Date;
        improvement: SessionSummary["improvements"][0];
      }> = [];

      for (const session of result.sessions) {
        if (!session.summary?.improvements) continue;

        const analyzedAt = new Date(session.analyzedAt || session.createdAt);
        if (analyzedAt < sinceDate) continue;

        for (const improvement of session.summary.improvements) {
          if (options.priority && improvement.priority !== options.priority) continue;
          if (options.area && !improvement.area.toLowerCase().includes(options.area.toLowerCase())) continue;

          allImprovements.push({
            sessionId: session.id,
            analyzedAt,
            improvement,
          });
        }
      }

      // Sort by priority (high first), then by date
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      allImprovements.sort((a, b) => {
        const pA = priorityOrder[a.improvement.priority] ?? 3;
        const pB = priorityOrder[b.improvement.priority] ?? 3;
        if (pA !== pB) return pA - pB;
        return b.analyzedAt.getTime() - a.analyzedAt.getTime();
      });

      const improvements = allImprovements.slice(0, limit);

      if (options.json) {
        console.log(JSON.stringify({ success: true, improvements, count: improvements.length }));
        return;
      }

      console.log(`\n  Suggested Improvements (last ${options.since}, ${improvements.length} found)\n`);

      if (improvements.length === 0) {
        console.log("  No improvements found.");
        console.log("");
        return;
      }

      // Group by area
      const byArea = new Map<string, typeof improvements>();
      for (const i of improvements) {
        const list = byArea.get(i.improvement.area) || [];
        list.push(i);
        byArea.set(i.improvement.area, list);
      }

      for (const [area, areaImprovements] of byArea) {
        console.log(`   ${area}`);
        for (const i of areaImprovements) {
          const priority = i.improvement.priority.toUpperCase().padEnd(6);
          console.log(`    [${priority}] ${truncate(i.improvement.suggestion, 55)}`);
        }
        console.log("");
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------------
// Stats
// -------------------------------------------------------------------------

insightsCommand
  .command("stats")
  .description("Show aggregated statistics across sessions")
  .option("--since <duration>", "Time window (e.g., 7d, 24h, 2w)", "7d")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    ensureConfig();
    const api = getApiClient();

    try {
      // Get all sessions (not just analyzed)
      const result = await api.get<{ sessions: AgentSession[] }>(
        "/api/sessions?limit=100"
      );

      const sinceDate = parseDuration(options.since);

      // Filter by date
      const sessions = result.sessions.filter((s) => {
        const createdAt = new Date(s.createdAt);
        return createdAt >= sinceDate;
      });

      // Calculate stats
      const totalSessions = sessions.length;
      const analyzedSessions = sessions.filter((s) => s.status === "analyzed").length;
      const activeSessions = sessions.filter((s) => s.status === "active").length;

      let totalLogs = 0;
      let totalErrors = 0;
      let totalDurationMinutes = 0;
      const toolUsage: Record<string, number> = {};
      const errorTypes: Record<string, number> = {};
      let totalLearnings = 0;
      let totalImprovements = 0;

      for (const session of sessions) {
        totalLogs += session.logCount || 0;
        totalErrors += session.errorCount || 0;

        if (session.summary) {
          totalDurationMinutes += session.summary.stats.durationMinutes || 0;
          totalLearnings += session.summary.learnings.length;
          totalImprovements += session.summary.improvements.length;

          // Aggregate tool usage
          for (const [tool, count] of Object.entries(session.summary.stats.toolUsage || {})) {
            toolUsage[tool] = (toolUsage[tool] || 0) + count;
          }

          // Aggregate error types
          for (const error of session.summary.errors) {
            errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
          }
        }
      }

      const stats = {
        period: options.since,
        totalSessions,
        analyzedSessions,
        activeSessions,
        totalLogs,
        totalErrors,
        totalDurationMinutes,
        totalLearnings,
        totalImprovements,
        toolUsage,
        errorTypes,
      };

      if (options.json) {
        console.log(JSON.stringify({ success: true, stats }));
        return;
      }

      console.log(`\n  Session Stats (last ${options.since})`);
      console.log(`  ${"".repeat(40)}`);
      console.log("");
      console.log(`  Sessions:        ${totalSessions}`);
      console.log(`    Active:        ${activeSessions}`);
      console.log(`    Analyzed:      ${analyzedSessions}`);
      console.log("");
      console.log(`  Activity:`);
      console.log(`    Total logs:    ${totalLogs.toLocaleString()}`);
      console.log(`    Total errors:  ${totalErrors.toLocaleString()}`);
      console.log(`    Duration:      ${Math.round(totalDurationMinutes / 60)} hours`);
      console.log("");
      console.log(`  Analysis:`);
      console.log(`    Learnings:     ${totalLearnings}`);
      console.log(`    Improvements:  ${totalImprovements}`);
      console.log("");

      // Top tools
      const sortedTools = Object.entries(toolUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (sortedTools.length > 0) {
        console.log(`  Top Tools:`);
        for (const [tool, count] of sortedTools) {
          console.log(`    ${tool.padEnd(20)} ${count.toLocaleString()}`);
        }
        console.log("");
      }

      // Error types
      const sortedErrors = Object.entries(errorTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (sortedErrors.length > 0) {
        console.log(`  Error Types:`);
        for (const [type, count] of sortedErrors) {
          console.log(`    ${type.padEnd(20)} ${count}`);
        }
        console.log("");
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

export default insightsCommand;
