/**
 * StreamClient - Sends output to Husky Dashboard via SSE
 * Uses batching to reduce API calls
 */
export declare class StreamClient {
    private apiUrl;
    private sessionId;
    private apiKey;
    private buffer;
    private flushTimeout;
    private flushIntervalMs;
    private maxBufferSize;
    constructor(apiUrl: string, sessionId: string, apiKey: string);
    private flushBuffer;
    private scheduleFlush;
    send(content: string, type: "stdout" | "stderr" | "system" | "plan"): Promise<void>;
    sendImmediate(content: string, type: "stdout" | "stderr" | "system" | "plan"): Promise<void>;
    stdout(content: string): Promise<void>;
    stderr(content: string): Promise<void>;
    system(content: string): Promise<void>;
    plan(content: string): Promise<void>;
    flush(): Promise<void>;
}
/**
 * Update session status in Husky Dashboard
 */
export declare function updateSessionStatus(apiUrl: string, sessionId: string, apiKey: string, status: string, data?: Record<string, unknown>): Promise<void>;
/**
 * Submit plan for approval
 */
export declare function submitPlan(apiUrl: string, sessionId: string, apiKey: string, plan: {
    steps: Array<{
        order: number;
        description: string;
        files: string[];
        risk: "low" | "medium" | "high";
    }>;
    estimatedCost: number;
    estimatedRuntime: number;
}): Promise<void>;
/**
 * Wait for plan approval from user
 */
export declare function waitForApproval(apiUrl: string, sessionId: string, apiKey: string, timeoutMs?: number): Promise<"approved" | "rejected" | "timeout">;
