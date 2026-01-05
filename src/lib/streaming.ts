/**
 * StreamClient - Sends output to Husky Dashboard via SSE
 * Uses batching to reduce API calls
 */
export class StreamClient {
  private buffer: Array<{ content: string; type: string }> = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private flushIntervalMs = 500; // Batch window: 500ms
  private maxBufferSize = 50; // Force flush after 50 items

  constructor(
    private apiUrl: string,
    private sessionId: string,
    private apiKey: string
  ) {}

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const items = [...this.buffer];
    this.buffer = [];

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/api/vm-sessions/${this.sessionId}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify({
            batch: items.map((item) => ({
              ...item,
              timestamp: new Date().toISOString(),
            })),
          }),
        }
      );

      if (!response.ok) {
        console.error(`Stream error: ${response.status}`);
      }
    } catch (error) {
      console.error("Stream connection error:", error);
    }
  }

  private scheduleFlush(): void {
    if (this.buffer.length >= this.maxBufferSize) {
      // Force immediate flush if buffer is full
      this.flushBuffer();
      return;
    }

    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => {
        this.flushBuffer();
      }, this.flushIntervalMs);
    }
  }

  async send(
    content: string,
    type: "stdout" | "stderr" | "system" | "plan"
  ): Promise<void> {
    this.buffer.push({ content, type });
    this.scheduleFlush();
  }

  // Immediate send for important messages (system, plan)
  async sendImmediate(
    content: string,
    type: "stdout" | "stderr" | "system" | "plan"
  ): Promise<void> {
    this.buffer.push({ content, type });
    await this.flushBuffer();
  }

  stdout(content: string): Promise<void> {
    return this.send(content, "stdout");
  }

  stderr(content: string): Promise<void> {
    return this.send(content, "stderr");
  }

  system(content: string): Promise<void> {
    return this.sendImmediate(content, "system");
  }

  plan(content: string): Promise<void> {
    return this.sendImmediate(content, "plan");
  }

  // Force flush remaining buffer (call before exit)
  async flush(): Promise<void> {
    await this.flushBuffer();
  }
}

/**
 * Update session status in Husky Dashboard
 */
export async function updateSessionStatus(
  apiUrl: string,
  sessionId: string,
  apiKey: string,
  status: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${apiUrl}/api/webhooks/vm/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        sessionId,
        status,
        ...data,
      }),
    });
  } catch (error) {
    console.error("Failed to update session status:", error);
  }
}

/**
 * Submit plan for approval
 */
export async function submitPlan(
  apiUrl: string,
  sessionId: string,
  apiKey: string,
  plan: {
    steps: Array<{
      order: number;
      description: string;
      files: string[];
      risk: "low" | "medium" | "high";
    }>;
    estimatedCost: number;
    estimatedRuntime: number;
  }
): Promise<void> {
  await fetch(`${apiUrl}/api/vm-sessions/${sessionId}/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      ...plan,
      createdAt: new Date().toISOString(),
    }),
  });
}

/**
 * Wait for plan approval from user
 */
export async function waitForApproval(
  apiUrl: string,
  sessionId: string,
  apiKey: string,
  timeoutMs: number = 1800000 // 30 minutes default
): Promise<"approved" | "rejected" | "timeout"> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(
        `${apiUrl}/api/vm-sessions/${sessionId}/approval-status`,
        {
          headers: {
            "X-API-Key": apiKey,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();

        if (data.status === "approved") {
          return "approved";
        }

        if (data.status === "rejected") {
          return "rejected";
        }

        // Still pending, continue waiting
      }
    } catch (error) {
      console.error("Error checking approval status:", error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return "timeout";
}
