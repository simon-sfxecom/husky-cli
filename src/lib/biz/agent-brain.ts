import { QdrantClient } from './qdrant.js';
import { EmbeddingService } from './embeddings.js';
import { getConfig } from '../../commands/config.js';
import { randomUUID } from 'crypto';
import { sanitizeForEmbedding } from './pii-filter.js';

const DEFAULT_COLLECTION = 'agent-memories';
const VECTOR_SIZE = 768;

export const AGENT_TYPES = ['support', 'claude', 'gotess', 'supervisor', 'worker', 'reviewer', 'e2e_agent', 'pr_agent'] as const;
export type AgentType = typeof AGENT_TYPES[number];

export type MemoryVisibility = 'private' | 'team' | 'public';

export interface Memory {
    id: string;
    agent: string;
    agentType?: string;
    content: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, unknown>;
    // Phase 2: Cross-Agent Sharing
    visibility?: MemoryVisibility;
    publishedBy?: string;
    publishedAt?: string;
    useCount?: number;
    endorsements?: number;
    // Phase 3: Quality & Decay
    recallCount?: number;
    lastRecalledAt?: string;
    boostCount?: number;
    downvoteCount?: number;
    qualityScore?: number;
    status?: 'active' | 'archived' | 'deleted';
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

    getDatabaseInfo(): { agentType?: AgentType; databaseName: string; collectionName: string } {
        const collectionName = this.getCollectionName();
        return {
            agentType: this.agentType,
            databaseName: `qdrant:${collectionName}`,
            collectionName,
        };
    }

    private getCollectionName(): string {
        if (!this.agentType) return DEFAULT_COLLECTION;
        return `${this.agentType}-memories`;
    }

    private async ensureCollection(): Promise<void> {
        const collection = this.getCollectionName();
        try {
            await this.qdrant.getCollection(collection);
        } catch {
            await this.qdrant.createCollection(collection, VECTOR_SIZE);
        }
    }

    async remember(content: string, tags: string[] = [], metadata?: Record<string, unknown>, visibility: MemoryVisibility = 'private', allowPii: boolean = false): Promise<string> {
        await this.ensureCollection();

        // Phase 5: PII Filter (GDPR compliance)
        const sanitizeResult = sanitizeForEmbedding(content, allowPii);
        if (sanitizeResult.redactionCount > 0 && !allowPii) {
            console.warn(`  ⚠️  PII removed from memory content (${sanitizeResult.redactedTypes.join(', ')})`);
        }

        // Use sanitized content for embedding (privacy-safe)
        const embedding = await this.embeddings.embed(sanitizeResult.sanitized);
        const id = randomUUID();
        const now = new Date().toISOString();

        await this.qdrant.upsertOne(this.getCollectionName(), id, embedding, {
            agent: this.agentId,
            agentType: this.agentType || 'default',
            content: sanitizeResult.sanitized, // Store sanitized content
            tags,
            metadata: {
                ...(metadata || {}),
                // Store redaction info for transparency
                piiRedacted: sanitizeResult.redactionCount > 0,
                piiTypes: sanitizeResult.redactedTypes,
            },
            createdAt: now,
            updatedAt: now,
            // Phase 2: Visibility
            visibility,
            publishedBy: visibility !== 'private' ? this.agentId : undefined,
            publishedAt: visibility !== 'private' ? now : undefined,
            useCount: 0,
            endorsements: 0,
            // Phase 3: Quality
            recallCount: 0,
            boostCount: 0,
            downvoteCount: 0,
            qualityScore: 1.0,
            status: 'active',
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
        
        const results = await this.qdrant.search(this.getCollectionName(), queryEmbedding, limit, {
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
        
        const results = await this.qdrant.scroll(this.getCollectionName(), {
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
        await this.qdrant.deletePoints(this.getCollectionName(), [memoryId]);
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
        
        const results = await this.qdrant.scroll(this.getCollectionName(), {
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

        const results = await this.qdrant.scroll(this.getCollectionName(), {
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

    // =========================================================================
    // Phase 2: Cross-Agent Sharing
    // =========================================================================

    /**
     * Publish a memory for sharing
     */
    async publish(memoryId: string, visibility: MemoryVisibility): Promise<void> {
        await this.ensureCollection();
        const now = new Date().toISOString();

        await this.qdrant.setPayload(this.getCollectionName(), memoryId, {
            visibility,
            publishedBy: this.agentId,
            publishedAt: now,
            updatedAt: now,
        });
    }

    /**
     * Unpublish a memory (set to private)
     */
    async unpublish(memoryId: string): Promise<void> {
        await this.ensureCollection();
        const now = new Date().toISOString();

        await this.qdrant.setPayload(this.getCollectionName(), memoryId, {
            visibility: 'private',
            publishedBy: undefined,
            publishedAt: undefined,
            updatedAt: now,
        });
    }

    /**
     * Recall shared memories from other agents
     */
    async recallShared(query: string, limit: number = 5, minScore: number = 0.5, publicOnly: boolean = false): Promise<RecallResult[]> {
        await this.ensureCollection();

        const queryEmbedding = await this.embeddings.embed(query);

        const filter: Record<string, unknown> = {
            must: [
                {
                    should: publicOnly
                        ? [{ key: 'visibility', match: { value: 'public' } }]
                        : [
                              { key: 'visibility', match: { value: 'public' } },
                              ...(this.agentType
                                  ? [{ key: 'visibility', match: { value: 'team' } }, { key: 'agentType', match: { value: this.agentType } }]
                                  : []),
                          ],
                },
                { key: 'status', match: { value: 'active' } },
            ],
        };

        const results = await this.qdrant.search(this.getCollectionName(), queryEmbedding, limit * 3, {
            filter,
            scoreThreshold: minScore,
        });

        return results.slice(0, limit).map(r => ({
            memory: {
                id: String(r.id),
                agent: String(r.payload?.agent || ''),
                agentType: String(r.payload?.agentType || ''),
                content: String(r.payload?.content || ''),
                tags: (r.payload?.tags as string[]) || [],
                createdAt: new Date(String(r.payload?.createdAt || new Date().toISOString())),
                updatedAt: new Date(String(r.payload?.updatedAt || new Date().toISOString())),
                metadata: r.payload?.metadata as Record<string, unknown>,
                visibility: (r.payload?.visibility as MemoryVisibility) || 'private',
                publishedBy: String(r.payload?.publishedBy || ''),
                publishedAt: String(r.payload?.publishedAt || ''),
                useCount: Number(r.payload?.useCount || 0),
                endorsements: Number(r.payload?.endorsements || 0),
            },
            score: r.score,
        }));
    }

    /**
     * List shared memories
     */
    async listShared(limit: number = 20, publicOnly: boolean = false): Promise<Memory[]> {
        await this.ensureCollection();

        const filter: Record<string, unknown> = {
            must: [
                {
                    should: publicOnly
                        ? [{ key: 'visibility', match: { value: 'public' } }]
                        : [
                              { key: 'visibility', match: { value: 'public' } },
                              ...(this.agentType
                                  ? [{ key: 'visibility', match: { value: 'team' } }, { key: 'agentType', match: { value: this.agentType } }]
                                  : []),
                          ],
                },
                { key: 'status', match: { value: 'active' } },
            ],
        };

        const results = await this.qdrant.scroll(this.getCollectionName(), {
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
                visibility: (r.payload?.visibility as MemoryVisibility) || 'private',
                endorsements: Number(r.payload?.endorsements || 0),
            }))
            .sort((a, b) => (b.endorsements || 0) - (a.endorsements || 0));
    }

    // =========================================================================
    // Phase 3: Quality & Decay
    // =========================================================================

    /**
     * Boost a memory (positive feedback)
     */
    async boost(memoryId: string): Promise<void> {
        await this.ensureCollection();
        const point = await this.qdrant.getPoint(this.getCollectionName(), memoryId);
        if (!point) throw new Error('Memory not found');

        const boostCount = Number(point.payload?.boostCount || 0) + 1;
        const downvoteCount = Number(point.payload?.downvoteCount || 0);
        const qualityScore = this.calculateQualityScore(boostCount, downvoteCount);

        await this.qdrant.setPayload(this.getCollectionName(), memoryId, {
            boostCount,
            qualityScore,
            updatedAt: new Date().toISOString(),
        });
    }

    /**
     * Downvote a memory (negative feedback)
     */
    async downvote(memoryId: string): Promise<void> {
        await this.ensureCollection();
        const point = await this.qdrant.getPoint(this.getCollectionName(), memoryId);
        if (!point) throw new Error('Memory not found');

        const boostCount = Number(point.payload?.boostCount || 0);
        const downvoteCount = Number(point.payload?.downvoteCount || 0) + 1;
        const qualityScore = this.calculateQualityScore(boostCount, downvoteCount);

        await this.qdrant.setPayload(this.getCollectionName(), memoryId, {
            downvoteCount,
            qualityScore,
            updatedAt: new Date().toISOString(),
        });
    }

    /**
     * Get quality metrics for a memory
     */
    async getQuality(memoryId: string): Promise<{
        recallCount: number;
        boostCount: number;
        downvoteCount: number;
        qualityScore: number;
        status: string;
    }> {
        await this.ensureCollection();
        const point = await this.qdrant.getPoint(this.getCollectionName(), memoryId);
        if (!point) throw new Error('Memory not found');

        return {
            recallCount: Number(point.payload?.recallCount || 0),
            boostCount: Number(point.payload?.boostCount || 0),
            downvoteCount: Number(point.payload?.downvoteCount || 0),
            qualityScore: Number(point.payload?.qualityScore || 1.0),
            status: String(point.payload?.status || 'active'),
        };
    }

    /**
     * Calculate quality score based on feedback
     */
    private calculateQualityScore(boostCount: number, downvoteCount: number): number {
        // Feedback adjustment: -0.2 to +0.2
        const feedbackBoost = Math.tanh((boostCount - downvoteCount * 2) * 0.1) * 0.2;
        return Math.max(0.1, Math.min(1.5, 1.0 + feedbackBoost));
    }

    /**
     * Calculate effective score with decay
     */
    private calculateEffectiveScore(
        semanticScore: number,
        createdAt: Date,
        recallCount: number,
        boostCount: number,
        downvoteCount: number
    ): number {
        const now = Date.now();
        const ageDays = (now - createdAt.getTime()) / (1000 * 60 * 60 * 24);

        // Exponential decay with agent-type-specific half-life
        // Support agents: 14-day half-life (faster decay for time-sensitive support knowledge)
        // Other agents: 30-day half-life (standard decay)
        const halfLifeDays = this.agentType === 'support' ? 14 : 30;
        const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);

        // Recall boost (logarithmic)
        const recallBoost = Math.log2(recallCount + 1) * 0.1;

        // Feedback adjustment
        const feedbackBoost = Math.tanh((boostCount - downvoteCount * 2) * 0.1) * 0.2;

        // Effective score
        return semanticScore * Math.max(0.1, Math.min(1.5, decayFactor + recallBoost + feedbackBoost));
    }

    /**
     * Archive low-quality memories
     */
    async cleanup(dryRun: boolean = true, threshold: number = 0.1, minAgeDays: number = 90, tags?: string[]): Promise<Memory[]> {
        await this.ensureCollection();

        const filter = {
            must: [
                { key: 'agent', match: { value: this.agentId } },
                { key: 'status', match: { value: 'active' } },
            ],
        };

        if (this.agentType) {
            filter.must.push({ key: 'agentType', match: { value: this.agentType } } as typeof filter.must[0]);
        }

        // Add tag filter if specified
        if (tags && tags.length > 0) {
            (filter.must as Array<Record<string, unknown>>).push({
                should: tags.map(tag => ({
                    key: 'tags',
                    match: { any: [tag] }
                }))
            });
        }

        const results = await this.qdrant.scroll(this.getCollectionName(), {
            filter,
            limit: 1000,
            with_payload: true,
        });

        const toArchive: Memory[] = [];
        const now = Date.now();

        for (const r of results) {
            const createdAt = new Date(String(r.payload?.createdAt || new Date().toISOString()));
            const ageDays = (now - createdAt.getTime()) / (1000 * 60 * 60 * 24);
            const qualityScore = Number(r.payload?.qualityScore || 1.0);
            const recallCount = Number(r.payload?.recallCount || 0);
            const downvoteCount = Number(r.payload?.downvoteCount || 0);
            const boostCount = Number(r.payload?.boostCount || 0);

            // Cleanup criteria
            const shouldArchive =
                (qualityScore < threshold && ageDays > minAgeDays) ||
                (downvoteCount > 3 && boostCount === 0) ||
                (recallCount === 0 && ageDays > 180);

            if (shouldArchive) {
                toArchive.push({
                    id: String(r.id),
                    agent: String(r.payload?.agent || ''),
                    agentType: String(r.payload?.agentType || ''),
                    content: String(r.payload?.content || ''),
                    tags: (r.payload?.tags as string[]) || [],
                    createdAt,
                    updatedAt: new Date(String(r.payload?.updatedAt || new Date().toISOString())),
                    metadata: r.payload?.metadata as Record<string, unknown>,
                    qualityScore,
                    recallCount,
                    downvoteCount,
                    boostCount,
                });

                if (!dryRun) {
                    await this.qdrant.setPayload(this.getCollectionName(), String(r.id), {
                        status: 'archived',
                        updatedAt: new Date().toISOString(),
                    });
                }
            }
        }

        return toArchive;
    }

    /**
     * Permanently delete archived memories
     */
    async purge(retentionDays: number = 365): Promise<number> {
        await this.ensureCollection();

        const filter = {
            must: [
                { key: 'agent', match: { value: this.agentId } },
                { key: 'status', match: { value: 'archived' } },
            ],
        };

        const results = await this.qdrant.scroll(this.getCollectionName(), {
            filter,
            limit: 1000,
            with_payload: true,
        });

        const now = Date.now();
        const toPurge: (string | number)[] = [];

        for (const r of results) {
            const updatedAt = new Date(String(r.payload?.updatedAt || new Date().toISOString()));
            const daysSinceArchived = (now - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

            if (daysSinceArchived > retentionDays) {
                toPurge.push(r.id);
            }
        }

        if (toPurge.length > 0) {
            await this.qdrant.deletePoints(this.getCollectionName(), toPurge);
        }

        return toPurge.length;
    }
}

export default AgentBrain;
