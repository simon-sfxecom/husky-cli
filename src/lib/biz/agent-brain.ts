import { QdrantClient } from './qdrant.js';
import { EmbeddingService } from './embeddings.js';
import { getConfig } from '../../commands/config.js';
import { randomUUID } from 'crypto';

const MEMORIES_COLLECTION = 'agent-memories';
const VECTOR_SIZE = 768;

export const AGENT_TYPES = ['support', 'claude', 'gotess', 'supervisor', 'worker'] as const;
export type AgentType = typeof AGENT_TYPES[number];

export interface Memory {
    id: string;
    agent: string;
    agentType?: string;
    content: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, unknown>;
}

export interface RecallResult {
    memory: Memory;
    score: number;
}

export interface AgentBrainOptions {
    agentId: string;
    agentType?: AgentType;
    projectId?: string;
}

export function isValidAgentType(value: string | undefined): value is AgentType {
    return value !== undefined && AGENT_TYPES.includes(value as AgentType);
}

export function getAgentType(): AgentType | undefined {
    const envType = process.env.HUSKY_AGENT_TYPE;
    if (isValidAgentType(envType)) {
        return envType;
    }
    
    const config = getConfig();
    const configType = config.agentType;
    if (isValidAgentType(configType)) {
        return configType;
    }
    
    return undefined;
}

export class AgentBrain {
    private qdrant: QdrantClient;
    private embeddings: EmbeddingService;
    private agentId: string;
    private agentType?: AgentType;

    constructor(agentIdOrOptions: string | AgentBrainOptions, projectId?: string) {
        let options: AgentBrainOptions;
        if (typeof agentIdOrOptions === 'string') {
            options = { agentId: agentIdOrOptions, projectId };
        } else {
            options = agentIdOrOptions;
        }
        
        const config = getConfig();
        
        this.agentId = options.agentId;
        this.agentType = options.agentType || getAgentType();
        
        this.qdrant = QdrantClient.fromConfig();
        
        const gcpProject = options.projectId || config.gcpProjectId || process.env.GOOGLE_CLOUD_PROJECT || 'tigerv0';
        this.embeddings = new EmbeddingService({ 
            projectId: gcpProject,
            location: config.gcpLocation || 'europe-west1'
        });
    }

    getDatabaseInfo(): { agentType?: AgentType; databaseName: string } {
        return {
            agentType: this.agentType,
            databaseName: `qdrant:${MEMORIES_COLLECTION}`,
        };
    }

    private async ensureCollection(): Promise<void> {
        try {
            await this.qdrant.getCollection(MEMORIES_COLLECTION);
        } catch {
            await this.qdrant.createCollection(MEMORIES_COLLECTION, VECTOR_SIZE);
        }
    }

    async remember(content: string, tags: string[] = [], metadata?: Record<string, unknown>): Promise<string> {
        await this.ensureCollection();
        
        const embedding = await this.embeddings.embed(content);
        const id = randomUUID();
        const now = new Date().toISOString();
        
        await this.qdrant.upsertOne(MEMORIES_COLLECTION, id, embedding, {
            agent: this.agentId,
            agentType: this.agentType || 'default',
            content,
            tags,
            metadata: metadata || {},
            createdAt: now,
            updatedAt: now,
        });
        
        return id;
    }

    async recall(query: string, limit: number = 5, minScore: number = 0.5): Promise<RecallResult[]> {
        await this.ensureCollection();
        
        const queryEmbedding = await this.embeddings.embed(query);
        
        const filter = {
            must: [
                { key: 'agent', match: { value: this.agentId } }
            ]
        };
        
        if (this.agentType) {
            filter.must.push({ key: 'agentType', match: { value: this.agentType } } as typeof filter.must[0]);
        }
        
        const results = await this.qdrant.search(MEMORIES_COLLECTION, queryEmbedding, limit, {
            filter,
            scoreThreshold: minScore,
        });
        
        return results.map(r => ({
            memory: {
                id: String(r.id),
                agent: String(r.payload?.agent || ''),
                agentType: String(r.payload?.agentType || ''),
                content: String(r.payload?.content || ''),
                tags: (r.payload?.tags as string[]) || [],
                createdAt: new Date(String(r.payload?.createdAt || new Date().toISOString())),
                updatedAt: new Date(String(r.payload?.updatedAt || new Date().toISOString())),
                metadata: r.payload?.metadata as Record<string, unknown>,
            },
            score: r.score,
        }));
    }

    async recallByTags(tags: string[], limit: number = 10): Promise<Memory[]> {
        if (tags.length === 0) {
            return [];
        }
        
        await this.ensureCollection();
        
        const filter = {
            must: [
                { key: 'agent', match: { value: this.agentId } },
                { 
                    should: tags.map(tag => ({
                        key: 'tags',
                        match: { any: [tag] }
                    }))
                }
            ]
        };
        
        const results = await this.qdrant.scroll(MEMORIES_COLLECTION, {
            filter,
            limit,
            with_payload: true,
        });
        
        return results
            .map(r => ({
                id: String(r.id),
                agent: String(r.payload?.agent || ''),
                agentType: String(r.payload?.agentType || ''),
                content: String(r.payload?.content || ''),
                tags: (r.payload?.tags as string[]) || [],
                createdAt: new Date(String(r.payload?.createdAt || new Date().toISOString())),
                updatedAt: new Date(String(r.payload?.updatedAt || new Date().toISOString())),
                metadata: r.payload?.metadata as Record<string, unknown>,
            }))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    async forget(memoryId: string): Promise<void> {
        await this.ensureCollection();
        await this.qdrant.deletePoints(MEMORIES_COLLECTION, [memoryId]);
    }

    async listMemories(limit: number = 20): Promise<Memory[]> {
        await this.ensureCollection();
        
        const filter = {
            must: [
                { key: 'agent', match: { value: this.agentId } }
            ]
        };
        
        if (this.agentType) {
            filter.must.push({ key: 'agentType', match: { value: this.agentType } } as typeof filter.must[0]);
        }
        
        const results = await this.qdrant.scroll(MEMORIES_COLLECTION, {
            filter,
            limit,
            with_payload: true,
        });
        
        return results
            .map(r => ({
                id: String(r.id),
                agent: String(r.payload?.agent || ''),
                agentType: String(r.payload?.agentType || ''),
                content: String(r.payload?.content || ''),
                tags: (r.payload?.tags as string[]) || [],
                createdAt: new Date(String(r.payload?.createdAt || new Date().toISOString())),
                updatedAt: new Date(String(r.payload?.updatedAt || new Date().toISOString())),
                metadata: r.payload?.metadata as Record<string, unknown>,
            }))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    async stats(): Promise<{ count: number; tags: Record<string, number> }> {
        await this.ensureCollection();
        
        const filter = {
            must: [
                { key: 'agent', match: { value: this.agentId } }
            ]
        };
        
        if (this.agentType) {
            filter.must.push({ key: 'agentType', match: { value: this.agentType } } as typeof filter.must[0]);
        }
        
        const results = await this.qdrant.scroll(MEMORIES_COLLECTION, {
            filter,
            limit: 1000,
            with_payload: true,
        });
        
        const tagCounts: Record<string, number> = {};
        
        for (const r of results) {
            const tags = (r.payload?.tags as string[]) || [];
            for (const tag of tags) {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
        }
        
        return {
            count: results.length,
            tags: tagCounts,
        };
    }
}

export default AgentBrain;
