interface WorkerIdentity {
    workerId: string;
    workerName: string;
    hostname: string;
    username: string;
    platform: string;
    agentVersion: string;
}
export declare function getWorkerIdentity(): WorkerIdentity;
export declare function generateSessionId(): string;
export declare function ensureWorkerRegistered(apiUrl: string, apiKey: string): Promise<string>;
export declare function registerSession(apiUrl: string, apiKey: string, workerId: string, sessionId: string): Promise<void>;
export declare function sessionHeartbeat(apiUrl: string, apiKey: string, sessionId: string, currentTaskId?: string | null): Promise<void>;
export {};
