/**
 * StreamClient - Sends output to Husky Dashboard via SSE
 */
export class StreamClient {
    apiUrl;
    sessionId;
    apiKey;
    constructor(apiUrl, sessionId, apiKey) {
        this.apiUrl = apiUrl;
        this.sessionId = sessionId;
        this.apiKey = apiKey;
    }
    async send(content, type) {
        try {
            const response = await fetch(`${this.apiUrl}/api/vm-sessions/${this.sessionId}/stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": this.apiKey,
                },
                body: JSON.stringify({
                    content,
                    type,
                    timestamp: new Date().toISOString(),
                }),
            });
            if (!response.ok) {
                console.error(`Stream error: ${response.status}`);
            }
        }
        catch (error) {
            // Don't fail the main process if streaming fails
            console.error("Stream connection error:", error);
        }
    }
    stdout(content) {
        return this.send(content, "stdout");
    }
    stderr(content) {
        return this.send(content, "stderr");
    }
    system(content) {
        return this.send(content, "system");
    }
    plan(content) {
        return this.send(content, "plan");
    }
    // Batch send multiple lines
    async sendLines(lines, type) {
        for (const line of lines) {
            await this.send(line, type);
        }
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
