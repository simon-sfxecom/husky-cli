import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';
import { EmbeddingService } from './embeddings.js';
import { getConfig } from '../../commands/config.js';

const BRAIN_COLLECTION = 'agent_brains';

export interface Memory {
    id: string;
    agent: string;
    content: string;
    tags: string[];
    embedding?: number[];
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, unknown>;
}

export interface RecallResult {
    memory: Memory;
    score: number;
}

export class AgentBrain {
    private db: Firestore;
    private embeddings: EmbeddingService;
    private agentId: string;
    private collectionPath: string;

    constructor(agentId: string, projectId?: string) {
        this.agentId = agentId;
        
        const config = getConfig();
        const gcpProject = projectId || config.gcpProjectId || process.env.GOOGLE_CLOUD_PROJECT || 'tigerv0';
        
        if (getApps().length === 0) {
            initializeApp({ projectId: gcpProject });
        }
        
        this.db = getFirestore();
        this.embeddings = new EmbeddingService({ 
            projectId: gcpProject,
            location: config.gcpLocation || 'europe-west1'
        });
        this.collectionPath = `${BRAIN_COLLECTION}/${agentId}/memories`;
    }

    async remember(content: string, tags: string[] = [], metadata?: Record<string, unknown>): Promise<string> {
        const embedding = await this.embeddings.embed(content);
        
        const memory = {
            agent: this.agentId,
            content,
            tags,
            embedding,
            metadata: metadata || {},
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };
        
        const ref = await this.db.collection(this.collectionPath).add(memory);
        return ref.id;
    }

    async recall(query: string, limit: number = 5, minScore: number = 0.5): Promise<RecallResult[]> {
        const queryEmbedding = await this.embeddings.embed(query);
        
        const snapshot = await this.db.collection(this.collectionPath).get();
        
        const results: RecallResult[] = [];
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (!data.embedding) continue;
            
            const score = this.cosineSimilarity(queryEmbedding, data.embedding);
            
            if (score >= minScore) {
                results.push({
                    memory: {
                        id: doc.id,
                        agent: data.agent,
                        content: data.content,
                        tags: data.tags || [],
                        createdAt: data.createdAt?.toDate() || new Date(),
                        updatedAt: data.updatedAt?.toDate() || new Date(),
                        metadata: data.metadata,
                    },
                    score,
                });
            }
        }
        
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    async recallByTags(tags: string[], limit: number = 10): Promise<Memory[]> {
        const snapshot = await this.db
            .collection(this.collectionPath)
            .where('tags', 'array-contains-any', tags)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            agent: doc.data().agent,
            content: doc.data().content,
            tags: doc.data().tags || [],
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
            metadata: doc.data().metadata,
        }));
    }

    async forget(memoryId: string): Promise<void> {
        await this.db.collection(this.collectionPath).doc(memoryId).delete();
    }

    async listMemories(limit: number = 20): Promise<Memory[]> {
        const snapshot = await this.db
            .collection(this.collectionPath)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            agent: doc.data().agent,
            content: doc.data().content,
            tags: doc.data().tags || [],
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
            metadata: doc.data().metadata,
        }));
    }

    async stats(): Promise<{ count: number; tags: Record<string, number> }> {
        const snapshot = await this.db.collection(this.collectionPath).get();
        
        const tagCounts: Record<string, number> = {};
        
        for (const doc of snapshot.docs) {
            const tags = doc.data().tags || [];
            for (const tag of tags) {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
        }
        
        return {
            count: snapshot.size,
            tags: tagCounts,
        };
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        return magnitude === 0 ? 0 : dotProduct / magnitude;
    }
}

export default AgentBrain;
