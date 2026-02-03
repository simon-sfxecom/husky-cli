/**
 * Session Types - Shared between session.ts and insights.ts
 */

export interface SessionSummary {
  sessionId: string;
  analyzedAt: Date;
  analyzedBy: string;
  learnings: Array<{
    content: string;
    tags: string[];
    confidence: string;
    savedToBrain: boolean;
    brainMemoryId?: string;
  }>;
  errors: Array<{
    type: string;
    description: string;
    solution: string;
    preventable: boolean;
  }>;
  improvements: Array<{
    area: string;
    suggestion: string;
    priority: string;
  }>;
  stats: {
    totalLogs: number;
    errorCount: number;
    durationMinutes: number;
    toolUsage: Record<string, number>;
  };
}

export interface AgentSession {
  id: string;
  vmName: string;
  agentId: string;
  agentName?: string;
  taskId?: string;
  status: string;
  logCount: number;
  errorCount: number;
  startedAt: Date;
  lastActivityAt: Date;
  exportedAt?: Date;
  analyzedAt?: Date;
  embeddedAt?: Date;
  embeddingCount?: number;
  summary?: SessionSummary;
  createdAt: Date;
}

export interface SessionLogEntry {
  id: string;
  sessionId: string;
  vmName: string;
  agentId: string;
  timestamp: Date;
  tool: string;
  toolInput: string;
  toolOutput: string;
  status: "success" | "error" | "warning";
  errorType?: string;
  duration?: number;
}

export interface SearchResult {
  sessionId: string;
  similarity?: number;
  analyzedAt?: Date;
  match: {
    learnings: Array<{ content: string; tags: string[]; score?: number }>;
    errors: Array<{ description: string; solution: string; score?: number }>;
  };
}
