/**
 * Error Hints System
 *
 * Provides helpful hints and references to `husky explain` when users encounter errors.
 * This makes the CLI more user-friendly by guiding users to relevant documentation.
 */

/**
 * Map of error categories to their corresponding `husky explain` topics
 */
export enum ExplainTopic {
  TASK = "task",
  CONFIG = "config",
  ROADMAP = "roadmap",
  CHANGELOG = "changelog",
  AGENT = "agent",
}

/**
 * Common error patterns and their associated help topics
 */
interface ErrorPattern {
  keywords: string[];
  topic: ExplainTopic;
  specificHint?: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    keywords: ["task id", "HUSKY_TASK_ID", "task status", "task complete", "task start"],
    topic: ExplainTopic.TASK,
  },
  {
    keywords: ["api url", "api key", "not configured", "config set", "authentication"],
    topic: ExplainTopic.CONFIG,
  },
  {
    keywords: ["roadmap", "phase", "feature"],
    topic: ExplainTopic.ROADMAP,
  },
  {
    keywords: ["changelog", "version", "commits"],
    topic: ExplainTopic.CHANGELOG,
  },
  {
    keywords: ["workflow", "agent", "session"],
    topic: ExplainTopic.AGENT,
  },
];

/**
 * Detect which explain topic is most relevant based on error message
 */
function detectExplainTopic(message: string): ExplainTopic | null {
  const lowerMessage = message.toLowerCase();

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.keywords.some(keyword => lowerMessage.includes(keyword))) {
      return pattern.topic;
    }
  }

  return null;
}

/**
 * Format a hint message for a specific explain topic
 */
function formatHint(topic: ExplainTopic, customHint?: string): string {
  if (customHint) {
    return `\n💡 Hint: ${customHint}\n   Run: husky explain ${topic}`;
  }

  const hints: Record<ExplainTopic, string> = {
    [ExplainTopic.TASK]: "For task workflow help",
    [ExplainTopic.CONFIG]: "For configuration help",
    [ExplainTopic.ROADMAP]: "For roadmap commands help",
    [ExplainTopic.CHANGELOG]: "For changelog commands help",
    [ExplainTopic.AGENT]: "For agent workflow examples",
  };

  return `\n💡 ${hints[topic]}: husky explain ${topic}`;
}

/**
 * Print an error message with an automatic hint based on content
 */
export function errorWithAutoHint(message: string, exitCode = 1): never {
  console.error(`Error: ${message}`);

  const topic = detectExplainTopic(message);
  if (topic) {
    console.error(formatHint(topic));
  }

  process.exit(exitCode);
}

/**
 * Print an error message with a specific hint topic
 */
export function errorWithHint(message: string, topic: ExplainTopic, customHint?: string, exitCode = 1): never {
  console.error(`Error: ${message}`);
  console.error(formatHint(topic, customHint));
  process.exit(exitCode);
}

/**
 * Print an error message with no hint (for errors where no help is available)
 */
export function errorWithoutHint(message: string, exitCode = 1): never {
  console.error(`Error: ${message}`);
  process.exit(exitCode);
}

/**
 * Predefined error helpers for common scenarios
 */
export const ErrorHelpers = {
  /**
   * Error: Task ID not provided
   */
  missingTaskId: () => {
    errorWithHint(
      "Task ID required. Use --id or set HUSKY_TASK_ID environment variable.",
      ExplainTopic.TASK,
      "Learn about task ID usage and environment variables"
    );
  },

  /**
   * Error: API URL not configured
   */
  missingApiUrl: () => {
    errorWithHint(
      "API URL not configured. Run: husky config set api-url <url>",
      ExplainTopic.CONFIG,
      "Learn how to configure the CLI"
    );
  },

  /**
   * Error: API key not configured
   */
  missingApiKey: () => {
    errorWithHint(
      "API key not configured. Run: husky config set api-key <key>",
      ExplainTopic.CONFIG,
      "Learn how to configure authentication"
    );
  },

  /**
   * Error: Both API URL and key not configured
   */
  missingConfig: () => {
    errorWithHint(
      "API URL and key required. Run: husky config test",
      ExplainTopic.CONFIG,
      "Learn about CLI configuration"
    );
  },

  /**
   * Error: Permission denied
   */
  permissionDenied: (operation: string) => {
    errorWithAutoHint(`Permission denied: ${operation}`);
  },

  /**
   * Error: Invalid task status
   */
  invalidTaskStatus: (status: string) => {
    errorWithHint(
      `Invalid status: ${status}. Valid statuses: backlog, in_progress, review, done`,
      ExplainTopic.TASK,
      "See all available task statuses"
    );
  },

  /**
   * Error: Task operation failed
   */
  taskOperationFailed: (operation: string, reason: string) => {
    errorWithHint(
      `Failed to ${operation}: ${reason}`,
      ExplainTopic.TASK,
      "Learn about task management"
    );
  },

  /**
   * Error: API request failed
   */
  apiRequestFailed: (status: number, message: string) => {
    if (status === 401) {
      errorWithHint(
        "Authentication failed. Check your API key.",
        ExplainTopic.CONFIG,
        "Learn how to configure authentication"
      );
    } else if (status === 403) {
      errorWithAutoHint(`Permission denied: ${message}`);
    } else if (status === 404) {
      errorWithoutHint(`Resource not found: ${message}`);
    } else {
      errorWithAutoHint(`API error (${status}): ${message}`);
    }
  },
};

/**
 * Format a warning message with a hint (non-fatal)
 */
export function warningWithHint(message: string, topic: ExplainTopic, customHint?: string): void {
  console.warn(`⚠ Warning: ${message}`);
  console.warn(formatHint(topic, customHint).replace("💡", "ℹ️"));
}
