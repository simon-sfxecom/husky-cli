import { QdrantClient } from './qdrant.js';
import { EmbeddingService } from './embeddings.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export const RESOLUTION_OUTCOMES = ['positive', 'negative', 'neutral', 'escalated'] as const;
export type ResolutionOutcome = typeof RESOLUTION_OUTCOMES[number];

export interface ResolutionStep {
    order: number;
    action: string;
    description: string;
    tool_used?: string;
    duration_seconds?: number;
    success?: boolean;
}

export interface ResolvedTicket {
    id: string;
    ticket_id: number;
    problem: string;
    problem_category: string;
    resolution: {
        outcome: ResolutionOutcome;
        summary: string;
        steps: ResolutionStep[];
        sop_reference?: string;
    };
    agent_id: string;
    files?: string[];
    tags: string[];
    created_at: string;
    customer_satisfaction?: number;
    metadata?: Record<string, unknown>;
}

export interface CreateResolvedTicketInput {
    ticket_id: number;
    problem: string;
    problem_category: string;
    outcome: ResolutionOutcome;
    summary: string;
    steps: ResolutionStep[];
    sop_reference?: string;
    agent_id: string;
    files?: string[];
    tags?: string[];
    customer_satisfaction?: number;
    metadata?: Record<string, unknown>;
}

export interface ResolvedTicketSearchResult {
    ticket: ResolvedTicket;
    score: number;
}

// ============================================================================
// Constants
// ============================================================================

const RESOLVED_COLLECTION = 'tickets_resolved';

// ============================================================================
// Resolved Tickets Service
// ============================================================================

export class ResolvedTicketsService {
    private qdrant: QdrantClient;
    private embeddings: EmbeddingService;

    constructor() {
        this.qdrant = QdrantClient.fromConfig();
        this.embeddings = EmbeddingService.fromConfig();
    }

    async log(input: CreateResolvedTicketInput): Promise<ResolvedTicket> {
        const id = `rt_${input.ticket_id}_${uuidv4().slice(0, 6)}`;
        const now = new Date().toISOString();

        const ticket: ResolvedTicket = {
            id,
            ticket_id: input.ticket_id,
            problem: input.problem,
            problem_category: input.problem_category,
            resolution: {
                outcome: input.outcome,
                summary: input.summary,
                steps: input.steps.map((s, i) => ({
                    ...s,
                    order: s.order || i + 1,
                })),
                sop_reference: input.sop_reference,
            },
            agent_id: input.agent_id,
            files: input.files || [],
            tags: input.tags || [],
            created_at: now,
            customer_satisfaction: input.customer_satisfaction,
            metadata: input.metadata,
        };

        const embeddingText = this.buildEmbeddingText(ticket);
        const vector = await this.embeddings.embed(embeddingText);

        await this.qdrant.upsertOne(RESOLVED_COLLECTION, id, vector, {
            type: 'resolved_ticket',
            ...this.ticketToPayload(ticket),
        });

        return ticket;
    }

    async get(id: string): Promise<ResolvedTicket | null> {
        const point = await this.qdrant.getPoint(RESOLVED_COLLECTION, id);
        if (!point || !point.payload) return null;

        const payload = point.payload as Record<string, unknown>;
        if (payload.type !== 'resolved_ticket') return null;

        return this.payloadToTicket(payload);
    }

    async getByTicketId(ticketId: number): Promise<ResolvedTicket | null> {
        const results = await this.qdrant.scroll(RESOLVED_COLLECTION, {
            filter: {
                must: [
                    { key: 'type', match: { value: 'resolved_ticket' } },
                    { key: 'ticket_id', match: { value: ticketId } },
                ],
            },
            limit: 1,
            with_payload: true,
        });

        if (results.length === 0) return null;
        return this.payloadToTicket(results[0].payload);
    }

    async search(query: string, options: {
        limit?: number;
        category?: string;
        outcome?: ResolutionOutcome;
        minScore?: number;
    } = {}): Promise<ResolvedTicketSearchResult[]> {
        const limit = options.limit || 5;
        const minScore = options.minScore || 0.5;

        const vector = await this.embeddings.embed(query);

        const mustConditions: Array<Record<string, unknown>> = [
            { key: 'type', match: { value: 'resolved_ticket' } }
        ];

        if (options.category) {
            mustConditions.push({ key: 'problem_category', match: { value: options.category } });
        }

        if (options.outcome) {
            mustConditions.push({ key: 'outcome', match: { value: options.outcome } });
        }

        const results = await this.qdrant.search(RESOLVED_COLLECTION, vector, limit, {
            filter: { must: mustConditions },
            scoreThreshold: minScore,
        });

        return results
            .map(r => {
                const ticket = this.payloadToTicket(r.payload as Record<string, unknown>);
                if (!ticket) return null;
                return { ticket, score: r.score };
            })
            .filter((r): r is ResolvedTicketSearchResult => r !== null);
    }

    async list(options: {
        category?: string;
        outcome?: ResolutionOutcome;
        agent_id?: string;
        limit?: number;
    } = {}): Promise<ResolvedTicket[]> {
        const limit = options.limit || 50;

        const mustConditions: Array<Record<string, unknown>> = [
            { key: 'type', match: { value: 'resolved_ticket' } }
        ];

        if (options.category) {
            mustConditions.push({ key: 'problem_category', match: { value: options.category } });
        }

        if (options.outcome) {
            mustConditions.push({ key: 'outcome', match: { value: options.outcome } });
        }

        if (options.agent_id) {
            mustConditions.push({ key: 'agent_id', match: { value: options.agent_id } });
        }

        const results = await this.qdrant.scroll(RESOLVED_COLLECTION, {
            filter: { must: mustConditions },
            limit,
            with_payload: true,
        });

        return results
            .map(r => this.payloadToTicket(r.payload))
            .filter((t): t is ResolvedTicket => t !== null);
    }

    async findSimilarProblems(problem: string, options: {
        limit?: number;
        minScore?: number;
        onlyPositive?: boolean;
    } = {}): Promise<ResolvedTicketSearchResult[]> {
        const searchOptions: Parameters<typeof this.search>[1] = {
            limit: options.limit || 5,
            minScore: options.minScore || 0.6,
        };

        if (options.onlyPositive) {
            searchOptions.outcome = 'positive';
        }

        return this.search(problem, searchOptions);
    }

    async getCategories(): Promise<{ category: string; count: number }[]> {
        const tickets = await this.list({ limit: 1000 });
        const categoryMap = new Map<string, number>();

        for (const t of tickets) {
            const count = categoryMap.get(t.problem_category) || 0;
            categoryMap.set(t.problem_category, count + 1);
        }

        return Array.from(categoryMap.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);
    }

    async stats(): Promise<{
        total: number;
        byOutcome: Record<ResolutionOutcome, number>;
        byCategory: Record<string, number>;
        avgSteps: number;
    }> {
        const tickets = await this.list({ limit: 1000 });

        const byOutcome: Record<ResolutionOutcome, number> = {
            positive: 0,
            negative: 0,
            neutral: 0,
            escalated: 0,
        };

        const byCategory: Record<string, number> = {};
        let totalSteps = 0;

        for (const t of tickets) {
            byOutcome[t.resolution.outcome]++;
            byCategory[t.problem_category] = (byCategory[t.problem_category] || 0) + 1;
            totalSteps += t.resolution.steps.length;
        }

        return {
            total: tickets.length,
            byOutcome,
            byCategory,
            avgSteps: tickets.length > 0 ? totalSteps / tickets.length : 0,
        };
    }

    async delete(id: string): Promise<void> {
        await this.qdrant.deletePoints(RESOLVED_COLLECTION, [id]);
    }

    private buildEmbeddingText(ticket: ResolvedTicket): string {
        const stepsText = ticket.resolution.steps
            .map(s => `${s.order}. ${s.action}: ${s.description}`)
            .join('\n');

        return [
            `Problem: ${ticket.problem}`,
            `Category: ${ticket.problem_category}`,
            `Resolution: ${ticket.resolution.summary}`,
            `Outcome: ${ticket.resolution.outcome}`,
            `Steps:\n${stepsText}`,
        ].join('\n');
    }

    private ticketToPayload(ticket: ResolvedTicket): Record<string, unknown> {
        return {
            id: ticket.id,
            ticket_id: ticket.ticket_id,
            problem: ticket.problem,
            problem_category: ticket.problem_category,
            outcome: ticket.resolution.outcome,
            summary: ticket.resolution.summary,
            steps: JSON.stringify(ticket.resolution.steps),
            sop_reference: ticket.resolution.sop_reference || null,
            agent_id: ticket.agent_id,
            files: ticket.files || [],
            tags: ticket.tags,
            created_at: ticket.created_at,
            customer_satisfaction: ticket.customer_satisfaction ?? null,
            metadata: ticket.metadata ? JSON.stringify(ticket.metadata) : null,
        };
    }

    private payloadToTicket(payload: Record<string, unknown>): ResolvedTicket | null {
        if (!payload || payload.type !== 'resolved_ticket') return null;

        let steps: ResolutionStep[] = [];
        try {
            if (typeof payload.steps === 'string') {
                steps = JSON.parse(payload.steps);
            } else if (Array.isArray(payload.steps)) {
                steps = payload.steps as ResolutionStep[];
            }
        } catch {
            steps = [];
        }

        let metadata: Record<string, unknown> | undefined;
        try {
            if (typeof payload.metadata === 'string') {
                metadata = JSON.parse(payload.metadata);
            } else if (payload.metadata && typeof payload.metadata === 'object') {
                metadata = payload.metadata as Record<string, unknown>;
            }
        } catch {
            metadata = undefined;
        }

        return {
            id: String(payload.id),
            ticket_id: Number(payload.ticket_id),
            problem: String(payload.problem || ''),
            problem_category: String(payload.problem_category || 'general'),
            resolution: {
                outcome: (payload.outcome as ResolutionOutcome) || 'neutral',
                summary: String(payload.summary || ''),
                steps,
                sop_reference: payload.sop_reference ? String(payload.sop_reference) : undefined,
            },
            agent_id: String(payload.agent_id || ''),
            files: (payload.files as string[]) || [],
            tags: (payload.tags as string[]) || [],
            created_at: String(payload.created_at || new Date().toISOString()),
            customer_satisfaction: payload.customer_satisfaction ? Number(payload.customer_satisfaction) : undefined,
            metadata,
        };
    }
}

export default ResolvedTicketsService;
