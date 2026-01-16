import { QdrantClient } from './qdrant.js';
import { EmbeddingService } from './embeddings.js';
import { ResolvedTicketsService, ResolvedTicket, ResolutionStep } from './resolved-tickets.js';
import { SOPService, CreateSOPInput, SOPStep } from './sop.js';

// ============================================================================
// Types
// ============================================================================

export interface PatternCluster {
    id: string;
    representative: ResolvedTicket;
    members: ResolvedTicket[];
    similarity: number;
    problem_category: string;
    common_steps: ResolutionStep[];
    suggested_sop?: SuggestedSOP;
}

export interface SuggestedSOP {
    title: string;
    description: string;
    trigger: string;
    category: string;
    steps: SOPStep[];
    confidence_score: number;
    source_tickets: number[];
}

export interface PatternAnalysis {
    total_tickets: number;
    clusters: PatternCluster[];
    unmatched_tickets: ResolvedTicket[];
    suggestions: SuggestedSOP[];
}

// ============================================================================
// Pattern Detection Service
// ============================================================================

export class PatternDetectionService {
    private qdrant: QdrantClient;
    private embeddings: EmbeddingService;
    private resolvedTickets: ResolvedTicketsService;
    private sopService: SOPService;

    constructor() {
        this.qdrant = QdrantClient.fromConfig();
        this.embeddings = EmbeddingService.fromConfig();
        this.resolvedTickets = new ResolvedTicketsService();
        this.sopService = new SOPService();
    }

    async detectPatterns(options: {
        minClusterSize?: number;
        similarityThreshold?: number;
        category?: string;
        limit?: number;
    } = {}): Promise<PatternAnalysis> {
        const minClusterSize = options.minClusterSize || 3;
        const similarityThreshold = options.similarityThreshold || 0.75;
        const limit = options.limit || 500;

        const tickets = await this.resolvedTickets.list({
            category: options.category,
            outcome: 'positive',
            limit,
        });

        if (tickets.length < minClusterSize) {
            return {
                total_tickets: tickets.length,
                clusters: [],
                unmatched_tickets: tickets,
                suggestions: [],
            };
        }

        const clusters = await this.clusterTickets(tickets, similarityThreshold, minClusterSize);
        
        const matchedTicketIds = new Set<string>();
        for (const cluster of clusters) {
            matchedTicketIds.add(cluster.representative.id);
            for (const member of cluster.members) {
                matchedTicketIds.add(member.id);
            }
        }

        const unmatched = tickets.filter(t => !matchedTicketIds.has(t.id));

        const suggestions: SuggestedSOP[] = [];
        for (const cluster of clusters) {
            const suggestion = this.generateSOPSuggestion(cluster);
            cluster.suggested_sop = suggestion;
            suggestions.push(suggestion);
        }

        return {
            total_tickets: tickets.length,
            clusters,
            unmatched_tickets: unmatched,
            suggestions,
        };
    }

    async createSOPFromCluster(clusterId: string, analysis: PatternAnalysis): Promise<string | null> {
        const cluster = analysis.clusters.find(c => c.id === clusterId);
        if (!cluster || !cluster.suggested_sop) {
            return null;
        }

        const sop = await this.sopService.create({
            title: cluster.suggested_sop.title,
            description: cluster.suggested_sop.description,
            trigger: cluster.suggested_sop.trigger,
            category: cluster.suggested_sop.category,
            steps: cluster.suggested_sop.steps,
            source_tickets: cluster.suggested_sop.source_tickets,
            tags: ['auto-generated', 'pattern-detected'],
            confidence_score: cluster.suggested_sop.confidence_score,
        });

        return sop.id;
    }

    async findSimilarTickets(ticketId: string, limit: number = 5): Promise<{ ticket: ResolvedTicket; similarity: number }[]> {
        const ticket = await this.resolvedTickets.get(ticketId);
        if (!ticket) return [];

        const results = await this.resolvedTickets.findSimilarProblems(ticket.problem, {
            limit: limit + 1,
            minScore: 0.5,
        });

        return results
            .filter(r => r.ticket.id !== ticketId)
            .slice(0, limit)
            .map(r => ({
                ticket: r.ticket,
                similarity: r.score,
            }));
    }

    private async clusterTickets(
        tickets: ResolvedTicket[],
        threshold: number,
        minSize: number
    ): Promise<PatternCluster[]> {
        const clusters: PatternCluster[] = [];
        const assigned = new Set<string>();

        const sortedTickets = [...tickets].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        for (const ticket of sortedTickets) {
            if (assigned.has(ticket.id)) continue;

            const similar = await this.resolvedTickets.findSimilarProblems(ticket.problem, {
                limit: 20,
                minScore: threshold,
                onlyPositive: true,
            });

            const clusterMembers = similar
                .filter(r => !assigned.has(r.ticket.id) && r.ticket.id !== ticket.id)
                .map(r => r.ticket);

            if (clusterMembers.length + 1 >= minSize) {
                assigned.add(ticket.id);
                for (const member of clusterMembers) {
                    assigned.add(member.id);
                }

                const allMembers = [ticket, ...clusterMembers];
                const avgSimilarity = similar.length > 0 
                    ? similar.reduce((sum, r) => sum + r.score, 0) / similar.length 
                    : 1;

                clusters.push({
                    id: `cluster_${ticket.ticket_id}_${clusters.length}`,
                    representative: ticket,
                    members: clusterMembers,
                    similarity: avgSimilarity,
                    problem_category: ticket.problem_category,
                    common_steps: this.findCommonSteps(allMembers),
                });
            }
        }

        return clusters.sort((a, b) => 
            (b.members.length + 1) - (a.members.length + 1)
        );
    }

    private findCommonSteps(tickets: ResolvedTicket[]): ResolutionStep[] {
        if (tickets.length === 0) return [];

        const stepCounts = new Map<string, { step: ResolutionStep; count: number }>();

        for (const ticket of tickets) {
            for (const step of ticket.resolution.steps) {
                const key = step.action.toLowerCase().trim();
                const existing = stepCounts.get(key);
                if (existing) {
                    existing.count++;
                } else {
                    stepCounts.set(key, { step, count: 1 });
                }
            }
        }

        const threshold = Math.ceil(tickets.length * 0.5);
        const commonSteps = Array.from(stepCounts.values())
            .filter(({ count }) => count >= threshold)
            .sort((a, b) => {
                const orderDiff = (a.step.order || 0) - (b.step.order || 0);
                if (orderDiff !== 0) return orderDiff;
                return b.count - a.count;
            })
            .map(({ step }, index) => ({
                ...step,
                order: index + 1,
            }));

        return commonSteps;
    }

    private generateSOPSuggestion(cluster: PatternCluster): SuggestedSOP {
        const allTickets = [cluster.representative, ...cluster.members];
        const ticketCount = allTickets.length;

        const title = `Handle: ${cluster.representative.problem.slice(0, 50)}`;
        
        const description = [
            `Auto-generated from ${ticketCount} similar resolved tickets.`,
            `Common problem pattern in category: ${cluster.problem_category}.`,
            `Average resolution similarity: ${(cluster.similarity * 100).toFixed(0)}%.`,
        ].join(' ');

        const trigger = cluster.representative.problem;

        const steps: SOPStep[] = cluster.common_steps.map((step, index) => ({
            order: index + 1,
            action: step.action,
            description: step.description,
            tool: step.tool_used,
            required: true,
        }));

        if (steps.length === 0) {
            const repSteps = cluster.representative.resolution.steps;
            for (const step of repSteps) {
                steps.push({
                    order: step.order,
                    action: step.action,
                    description: step.description,
                    tool: step.tool_used,
                    required: true,
                });
            }
        }

        const confidenceFactors = [
            ticketCount >= 5 ? 0.3 : ticketCount >= 3 ? 0.2 : 0.1,
            cluster.similarity * 0.3,
            steps.length >= 3 ? 0.2 : 0.1,
            cluster.common_steps.length > 0 ? 0.2 : 0,
        ];
        const confidence_score = Math.min(1, confidenceFactors.reduce((a, b) => a + b, 0));

        return {
            title,
            description,
            trigger,
            category: cluster.problem_category,
            steps,
            confidence_score,
            source_tickets: allTickets.map(t => t.ticket_id),
        };
    }
}

export default PatternDetectionService;
