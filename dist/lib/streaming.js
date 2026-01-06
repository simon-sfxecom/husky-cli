/**
 * StreamClient - Sends output to Husky Dashboard via SSE
 * Uses batching to reduce API calls
 */
export class StreamClient {
    apiUrl;
    sessionId;
    apiKey;
    buffer = [];
    flushTimeout = null;
    flushIntervalMs = 500; // Batch window: 500ms
    maxBufferSize = 50; // Force flush after 50 items
    constructor(apiUrl, sessionId, apiKey) {
        this.apiUrl = apiUrl;
        this.sessionId = sessionId;
        this.apiKey = apiKey;
    }
    async flushBuffer() {
        if (this.buffer.length === 0)
            return;
        const items = [...this.buffer];
        this.buffer = [];
        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }
        try {
            const response = await fetch(`${this.apiUrl}/api/vm-sessions/${this.sessionId}/stream`, {
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
            });
            if (!response.ok) {
                console.error(`Stream error: ${response.status}`);
            }
        }
        catch (error) {
            console.error("Stream connection error:", error);
        }
    }
    scheduleFlush() {
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
    async send(content, type) {
        this.buffer.push({ content, type });
        this.scheduleFlush();
    }
    // Immediate send for important messages (system, plan)
    async sendImmediate(content, type) {
        this.buffer.push({ content, type });
        await this.flushBuffer();
    }
    stdout(content) {
        return this.send(content, "stdout");
    }
    stderr(content) {
        return this.send(content, "stderr");
    }
    system(content) {
        return this.sendImmediate(content, "system");
    }
    plan(content) {
        return this.sendImmediate(content, "plan");
    }
    // Force flush remaining buffer (call before exit)
    async flush() {
        await this.flushBuffer();
    }
}
/**
 * Update session status in Husky Dashboard
 */
export async function updateSessionStatus(apiUrl, sessionId, apiKey, status, data) {
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
    }
    catch (error) {
        console.error("Failed to update session status:", error);
    }
}
/**
 * Submit plan for approval
 */
export async function submitPlan(apiUrl, sessionId, apiKey, plan) {
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
export async function waitForApproval(apiUrl, sessionId, apiKey, timeoutMs = 1800000 // 30 minutes default
) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`${apiUrl}/api/vm-sessions/${sessionId}/approval-status`, {
                headers: {
                    "X-API-Key": apiKey,
                },
            });
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
        }
        catch (error) {
            console.error("Error checking approval status:", error);
        }
        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
    return "timeout";
}
