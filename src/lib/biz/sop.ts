/**
 * SOP (Standard Operating Procedure) Service
 * 
 * Manages SOPs in Qdrant with semantic search capabilities.
 * SOPs are auto-generated from resolved ticket patterns and can be
 * approved/deprecated by humans.
 */

import { QdrantClient, SearchResult } from './qdrant.js';
import { EmbeddingService } from './embeddings.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export const SOP_STATUSES = ['draft', 'approved', 'deprecated'] as const;
export type SOPStatus = typeof SOP_STATUSES[number];

export interface SOPStep {
    order: number;
    action: string;
    description: string;
    tool?: string;
    required?: boolean;
    conditions?: string;
}

export interface SOP {
    id: string;
    title: string;
    description: string;
    trigger: string;
    category: string;
    steps: SOPStep[];
    source_tickets: number[];
    status: SOPStatus;
    tags: string[];
    created_at: string;
    updated_at: string;
    approved_by?: string;
    approved_at?: string;
    deprecated_by?: string;
    deprecated_at?: string;
    version: number;
    confidence_score?: number;
}

export interface CreateSOPInput {
    title: string;
    description: string;
    trigger: string;
    category: string;
    steps: SOPStep[];
    source_tickets?: number[];
    tags?: string[];
    confidence_score?: number;
}

export interface UpdateSOPInput {
    title?: string;
    description?: string;
    trigger?: string;
    category?: string;
    steps?: SOPStep[];
    tags?: string[];
}

export interface SOPSearchResult {
    sop: SOP;
    score: number;
}

// ============================================================================
// Constants
// ============================================================================

const SOP_COLLECTION = 'knowledge';
const VECTOR_DIM = 768;

// ============================================================================
// SOP Service
// ============================================================================

export class SOPService {
    private qdrant: QdrantClient;
    private embeddings: EmbeddingService;

    constructor() {
        this.qdrant = QdrantClient.fromConfig();
        this.embeddings = EmbeddingService.fromConfig();
    }

    async create(input: CreateSOPInput): Promise<SOP> {
        const id = `sop_${uuidv4().slice(0, 8)}`;
        const now = new Date().toISOString();

        const sop: SOP = {
            id,
            title: input.title,
            description: input.description,
            trigger: input.trigger,
            category: input.category,
            steps: input.steps.map((s, i) => ({
                ...s,
                order: s.order || i + 1,
                required: s.required ?? true,
            })),
            source_tickets: input.source_tickets || [],
            status: 'draft',
            tags: input.tags || [],
            created_at: now,
            updated_at: now,
            version: 1,
            confidence_score: input.confidence_score,
        };

        const embeddingText = this.buildEmbeddingText(sop);
        const vector = await this.embeddings.embed(embeddingText);

        await this.qdrant.upsertOne(SOP_COLLECTION, id, vector, {
            type: 'sop',
            ...this.sopToPayload(sop),
        });

        return sop;
    }

    async get(id: string): Promise<SOP | null> {
        const point = await this.qdrant.getPoint(SOP_COLLECTION, id);
        if (!point || !point.payload) return null;
        
        const payload = point.payload as Record<string, unknown>;
        if (payload.type !== 'sop') return null;

        return this.payloadToSOP(payload);
    }

    async update(id: string, input: UpdateSOPInput): Promise<SOP | null> {
        const existing = await this.get(id);
        if (!existing) return null;

        const now = new Date().toISOString();

        const updated: SOP = {
            ...existing,
            title: input.title ?? existing.title,
            description: input.description ?? existing.description,
            trigger: input.trigger ?? existing.trigger,
            category: input.category ?? existing.category,
            steps: input.steps ?? existing.steps,
            tags: input.tags ?? existing.tags,
            updated_at: now,
            version: existing.version + 1,
        };

        const embeddingText = this.buildEmbeddingText(updated);
        const vector = await this.embeddings.embed(embeddingText);

        await this.qdrant.upsertOne(SOP_COLLECTION, id, vector, {
            type: 'sop',
            ...this.sopToPayload(updated),
        });

        return updated;
    }

    async approve(id: string, approver: string): Promise<SOP | null> {
        const existing = await this.get(id);
        if (!existing) return null;

        if (existing.status !== 'draft') {
            throw new Error(`Cannot approve SOP with status '${existing.status}'. Only draft SOPs can be approved.`);
        }

        const now = new Date().toISOString();

        const updated: SOP = {
            ...existing,
            status: 'approved',
            approved_by: approver,
            approved_at: now,
            updated_at: now,
        };

        const embeddingText = this.buildEmbeddingText(updated);
        const vector = await this.embeddings.embed(embeddingText);

        await this.qdrant.upsertOne(SOP_COLLECTION, id, vector, {
            type: 'sop',
            ...this.sopToPayload(updated),
        });

        return updated;
    }

    async deprecate(id: string, deprecator: string): Promise<SOP | null> {
        const existing = await this.get(id);
        if (!existing) return null;

        const now = new Date().toISOString();

        const updated: SOP = {
            ...existing,
            status: 'deprecated',
            deprecated_by: deprecator,
            deprecated_at: now,
            updated_at: now,
        };

        const embeddingText = this.buildEmbeddingText(updated);
        const vector = await this.embeddings.embed(embeddingText);

        await this.qdrant.upsertOne(SOP_COLLECTION, id, vector, {
            type: 'sop',
            ...this.sopToPayload(updated),
        });

        return updated;
    }

    async delete(id: string): Promise<void> {
        await this.qdrant.deletePoints(SOP_COLLECTION, [id]);
    }

    async list(options: {
        status?: SOPStatus;
        category?: string;
        limit?: number;
    } = {}): Promise<SOP[]> {
        const limit = options.limit || 50;

        const mustConditions: Array<Record<string, unknown>> = [
            { key: 'type', match: { value: 'sop' } }
        ];

        if (options.status) {
            mustConditions.push({ key: 'status', match: { value: options.status } });
        }

        if (options.category) {
            mustConditions.push({ key: 'category', match: { value: options.category } });
        }

        const response = await this.scrollPoints(SOP_COLLECTION, {
            filter: { must: mustConditions },
            limit,
            with_payload: true,
        });

        return response
            .map(p => this.payloadToSOP(p.payload as Record<string, unknown>))
            .filter((sop): sop is SOP => sop !== null);
    }

    async search(query: string, options: {
        limit?: number;
        status?: SOPStatus;
        minScore?: number;
    } = {}): Promise<SOPSearchResult[]> {
        const limit = options.limit || 5;
        const minScore = options.minScore || 0.5;

        const vector = await this.embeddings.embed(query);

        const mustConditions: Array<Record<string, unknown>> = [
            { key: 'type', match: { value: 'sop' } }
        ];

        if (options.status) {
            mustConditions.push({ key: 'status', match: { value: options.status } });
        }

        const results = await this.qdrant.search(SOP_COLLECTION, vector, limit, {
            filter: { must: mustConditions },
            scoreThreshold: minScore,
        });

        return results
            .map(r => {
                const sop = this.payloadToSOP(r.payload as Record<string, unknown>);
                if (!sop) return null;
                return { sop, score: r.score };
            })
            .filter((r): r is SOPSearchResult => r !== null);
    }

    async findByTrigger(trigger: string, options: {
        status?: SOPStatus;
        minScore?: number;
    } = {}): Promise<SOPSearchResult | null> {
        const results = await this.search(trigger, {
            limit: 1,
            status: options.status || 'approved',
            minScore: options.minScore || 0.7,
        });

        return results[0] || null;
    }

    async getByCategory(category: string, status?: SOPStatus): Promise<SOP[]> {
        return this.list({ category, status });
    }

    async getCategories(): Promise<{ category: string; count: number }[]> {
        const sops = await this.list();
        const categoryMap = new Map<string, number>();

        for (const sop of sops) {
            const count = categoryMap.get(sop.category) || 0;
            categoryMap.set(sop.category, count + 1);
        }

        return Array.from(categoryMap.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);
    }

    async stats(): Promise<{
        total: number;
        byStatus: Record<SOPStatus, number>;
        byCategory: Record<string, number>;
    }> {
        const sops = await this.list({ limit: 1000 });

        const byStatus: Record<SOPStatus, number> = {
            draft: 0,
            approved: 0,
            deprecated: 0,
        };

        const byCategory: Record<string, number> = {};

        for (const sop of sops) {
            byStatus[sop.status]++;
            byCategory[sop.category] = (byCategory[sop.category] || 0) + 1;
        }

        return {
            total: sops.length,
            byStatus,
            byCategory,
        };
    }

    private buildEmbeddingText(sop: SOP): string {
        const stepsText = sop.steps
            .map(s => `Step ${s.order}: ${s.action} - ${s.description}`)
            .join('\n');

        return `${sop.title}\n${sop.description}\nTrigger: ${sop.trigger}\nCategory: ${sop.category}\n${stepsText}`;
    }

    private sopToPayload(sop: SOP): Record<string, unknown> {
        return {
            id: sop.id,
            title: sop.title,
            description: sop.description,
            trigger: sop.trigger,
            category: sop.category,
            steps: JSON.stringify(sop.steps),
            source_tickets: sop.source_tickets,
            status: sop.status,
            tags: sop.tags,
            created_at: sop.created_at,
            updated_at: sop.updated_at,
            approved_by: sop.approved_by || null,
            approved_at: sop.approved_at || null,
            deprecated_by: sop.deprecated_by || null,
            deprecated_at: sop.deprecated_at || null,
            version: sop.version,
            confidence_score: sop.confidence_score || null,
        };
    }

    private payloadToSOP(payload: Record<string, unknown>): SOP | null {
        if (!payload || payload.type !== 'sop') return null;

        let steps: SOPStep[] = [];
        try {
            if (typeof payload.steps === 'string') {
                steps = JSON.parse(payload.steps);
            } else if (Array.isArray(payload.steps)) {
                steps = payload.steps as SOPStep[];
            }
        } catch {
            steps = [];
        }

        return {
            id: String(payload.id),
            title: String(payload.title || ''),
            description: String(payload.description || ''),
            trigger: String(payload.trigger || ''),
            category: String(payload.category || 'general'),
            steps,
            source_tickets: (payload.source_tickets as number[]) || [],
            status: (payload.status as SOPStatus) || 'draft',
            tags: (payload.tags as string[]) || [],
            created_at: String(payload.created_at || new Date().toISOString()),
            updated_at: String(payload.updated_at || new Date().toISOString()),
            approved_by: payload.approved_by ? String(payload.approved_by) : undefined,
            approved_at: payload.approved_at ? String(payload.approved_at) : undefined,
            deprecated_by: payload.deprecated_by ? String(payload.deprecated_by) : undefined,
            deprecated_at: payload.deprecated_at ? String(payload.deprecated_at) : undefined,
            version: Number(payload.version) || 1,
            confidence_score: payload.confidence_score ? Number(payload.confidence_score) : undefined,
        };
    }

    private async scrollPoints(
        collection: string,
        options: {
            filter?: Record<string, unknown>;
            limit?: number;
            with_payload?: boolean;
        }
    ): Promise<Array<{ id: string | number; payload: Record<string, unknown> }>> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const qdrantAny = this.qdrant as any;

        try {
            const response = await qdrantAny.request(`/collections/${collection}/points/scroll`, {
                method: 'POST',
                body: JSON.stringify({
                    filter: options.filter,
                    limit: options.limit || 50,
                    with_payload: options.with_payload ?? true,
                }),
            }) as {
                result: {
                    points: Array<{ id: string | number; payload?: Record<string, unknown> }>;
                };
            };

            return response.result.points.map((p: { id: string | number; payload?: Record<string, unknown> }) => ({
                id: p.id,
                payload: p.payload || {},
            }));
        } catch (error) {
            console.error('Scroll failed:', error);
            return [];
        }
    }
}

export default SOPService;
