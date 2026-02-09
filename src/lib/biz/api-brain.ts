import { getAuthHeaders, getConfig } from "../../commands/config.js";
import { canAccessKnowledgeBase as checkKbAccess } from "../permissions-cache.js";

export interface Memory {
    id: string;
    agent: string;
    agentType?: string;
    content: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
    visibility?: string;
    publishedBy?: string;
    publishedAt?: string;
    useCount?: number;
    endorsements?: number;
    recallCount?: number;
    qualityScore?: number;
    status?: string;
}

export interface RecallResult {
    memory: Memory;
    score: number;
}

export interface BrainStats {
    count: number;
    tags: Record<string, number>;
}

async function apiRequest<T>(
    path: string,
    options: { method?: string; body?: unknown } = {}
): Promise<T> {
    const config = getConfig();
    if (!config.apiUrl) {
        throw new Error("API not configured. Run: husky config set api-url <url>");
    }

    const authHeaders = getAuthHeaders();
    if (!authHeaders.Authorization) {
        throw new Error("Not authenticated. Run: husky auth login --agent <name>");
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...authHeaders,
    };

    const url = new URL(`/api/brain${path}`, config.apiUrl);
    const res = await fetch(url.toString(), {
        method: options.method || "POST",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        if (res.status === 401) {
            throw new Error(error.message || "Authentication failed");
        }
        if (res.status === 403) {
            throw new Error(`Access denied: ${error.error || 'Permission denied to this resource'}`);
        }
        throw new Error(error.message || error.error || `HTTP ${res.status}`);
    }

    return res.json();
}

export class ApiBrain {
    private agentId: string;
    private agentType?: string;
    private knowledgeBase?: string;

    constructor(options: {
        agentId: string;
        agentType?: string;
        knowledgeBase?: string;
    }) {
        this.agentId = options.agentId;
        this.agentType = options.agentType;
        this.knowledgeBase = options.knowledgeBase;
    }

    private async validateKbAccess(): Promise<void> {
        if (!this.knowledgeBase) return;
        
        const hasAccess = await checkKbAccess(this.knowledgeBase);
        if (!hasAccess) {
            throw new Error(`Access denied to knowledge base '${this.knowledgeBase}'. Check your role permissions.`);
        }
    }

    async remember(
        content: string,
        tags: string[] = [],
        metadata?: Record<string, unknown>,
        visibility: string = "private"
    ): Promise<string> {
        await this.validateKbAccess();
        const result = await apiRequest<{ id: string }>("/remember", {
            body: {
                content,
                tags,
                agentId: this.agentId,
                agentType: this.agentType,
                metadata,
                visibility,
                knowledgeBase: this.knowledgeBase,
            },
        });
        return result.id;
    }

    async recall(
        query: string,
        limit: number = 5,
        minScore: number = 0.5
    ): Promise<RecallResult[]> {
        await this.validateKbAccess();
        const result = await apiRequest<{ results: RecallResult[] }>("/recall", {
            body: {
                query,
                limit,
                minScore,
                agentId: this.agentId,
                agentType: this.agentType,
                knowledgeBase: this.knowledgeBase,
            },
        });
        return result.results;
    }

    async list(limit: number = 20): Promise<Memory[]> {
        await this.validateKbAccess();
        const result = await apiRequest<{ memories: Memory[] }>("/list", {
            body: {
                limit,
                agentId: this.agentId,
                agentType: this.agentType,
                knowledgeBase: this.knowledgeBase,
            },
        });
        return result.memories;
    }

    async forget(memoryId: string): Promise<void> {
        await apiRequest<{ success: boolean }>("/forget", {
            body: {
                memoryId,
                knowledgeBase: this.knowledgeBase,
            },
        });
    }

    async stats(): Promise<BrainStats> {
        const result = await apiRequest<{ count: number; tags: Record<string, number> }>("/stats", {
            body: {
                agentId: this.agentId,
                agentType: this.agentType,
                knowledgeBase: this.knowledgeBase,
            },
        });
        return { count: result.count, tags: result.tags };
    }

    async tags(tagList: string[], limit: number = 10): Promise<Memory[]> {
        const result = await apiRequest<{ memories: Memory[] }>("/tags", {
            body: {
                tags: tagList,
                limit,
                agentId: this.agentId,
                agentType: this.agentType,
                knowledgeBase: this.knowledgeBase,
            },
        });
        return result.memories;
    }

    async publish(memoryId: string, visibility: string = "team"): Promise<void> {
        await apiRequest<{ success: boolean }>("/publish", {
            body: { memoryId, visibility },
        });
    }

    async unpublish(memoryId: string): Promise<void> {
        await apiRequest<{ success: boolean }>("/unpublish", {
            body: { memoryId },
        });
    }

    async endorse(memoryId: string): Promise<void> {
        await apiRequest<{ success: boolean }>("/endorse", {
            body: { memoryId },
        });
    }

    getDatabaseInfo(): { agentType?: string; databaseName: string; collectionName: string } {
        return {
            agentType: this.agentType,
            databaseName: `api:${this.knowledgeBase || 'agent-memories'}`,
            collectionName: this.knowledgeBase ? `${this.knowledgeBase}-kb` : 'agent-memories',
        };
    }

    async listMemories(limit: number = 20): Promise<Memory[]> {
        return this.list(limit);
    }

    async recallByTags(tagList: string[], limit: number = 10): Promise<Memory[]> {
        const result = await apiRequest<{ memories: Memory[] }>("/tags", {
            body: {
                tags: tagList,
                limit,
                agentId: this.agentId,
                agentType: this.agentType,
                knowledgeBase: this.knowledgeBase,
            },
        });
        return result.memories;
    }

    async recallShared(
        query: string,
        limit: number = 5,
        minScore: number = 0.5,
        publicOnly: boolean = false
    ): Promise<RecallResult[]> {
        const result = await apiRequest<{ results: RecallResult[] }>("/recall-shared", {
            body: {
                query,
                limit,
                minScore,
                agentType: this.agentType,
                visibility: publicOnly ? 'public' : 'team',
            },
        });
        return result.results;
    }

    async listShared(limit: number = 20, publicOnly: boolean = false): Promise<Memory[]> {
        const result = await apiRequest<{ memories: Memory[] }>("/shared", {
            body: {
                limit,
                agentType: this.agentType,
                visibility: publicOnly ? 'public' : undefined,
            },
        });
        return result.memories;
    }

    async boost(_memoryId: string): Promise<void> {
        throw new Error("boost() is not supported via API. Use direct Qdrant access for quality operations.");
    }

    async downvote(_memoryId: string): Promise<void> {
        throw new Error("downvote() is not supported via API. Use direct Qdrant access for quality operations.");
    }

    async getQuality(_memoryId: string): Promise<{
        recallCount: number;
        boostCount: number;
        downvoteCount: number;
        qualityScore: number;
        status: string;
    }> {
        throw new Error("getQuality() is not supported via API. Use direct Qdrant access for quality operations.");
    }

    async cleanup(
        _dryRun: boolean = true,
        _threshold: number = 0.1,
        _minAgeDays: number = 90,
        _tags?: string[]
    ): Promise<Memory[]> {
        throw new Error("cleanup() is not supported via API. Use direct Qdrant access for admin operations.");
    }

    async purge(_retentionDays: number = 365): Promise<number> {
        throw new Error("purge() is not supported via API. Use direct Qdrant access for admin operations.");
    }

    static async getInfo(): Promise<{
        knowledgeBases: string[];
        accessibleKnowledgeBases: string[];
        role?: string;
    }> {
        return apiRequest<{
            knowledgeBases: string[];
            accessibleKnowledgeBases: string[];
            role?: string;
        }>("/info", { method: "GET" });
    }
}

export function shouldUseApi(): boolean {
    const config = getConfig();
    // Use API if:
    // 1. No Qdrant URL configured (can't use direct access)
    // 2. Or session token is available (preferred auth method)
    if (!config.qdrantUrl) {
        return Boolean(config.apiUrl);
    }
    // If Qdrant is configured, still prefer API if session token exists
    return Boolean(config.apiUrl && config.sessionToken);
}

export default ApiBrain;
