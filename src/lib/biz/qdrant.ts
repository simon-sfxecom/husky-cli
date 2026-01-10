/**
 * Qdrant Vector Database Client
 * Ported from TigerV0 with Husky Biz CLI integration
 */

import { getConfig } from '../../commands/config.js';

// ============================================================================
// Types
// ============================================================================

export interface QdrantConfig {
    url: string;
    apiKey?: string;
}

export interface Point {
    id: string | number;
    vector: number[];
    payload?: Record<string, unknown>;
}

export interface SearchResult {
    id: string | number;
    score: number;
    payload?: Record<string, unknown>;
}

export interface SearchOptions {
    limit?: number;
    filter?: Record<string, unknown>;
    scoreThreshold?: number;
    offset?: number;
}

export interface CollectionInfo {
    name: string;
    vectorsCount: number;
    pointsCount: number;
}

// ============================================================================
// Qdrant Service (REST API based)
// ============================================================================

export class QdrantClient {
    private url: string;
    private apiKey?: string;

    constructor(config: QdrantConfig) {
        this.url = config.url.replace(/\/+$/, '');
        this.apiKey = config.apiKey;
    }

    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig(): QdrantClient {
        const config = getConfig();
        const env = process.env.HUSKY_ENV || 'PROD';

        const qdrantConfig: QdrantConfig = {
            url: process.env[`${env}_QDRANT_URL`] || process.env.QDRANT_URL || config.qdrantUrl || 'http://localhost:6333',
            apiKey: process.env[`${env}_QDRANT_API_KEY`] || process.env.QDRANT_API_KEY || config.qdrantApiKey,
        };

        if (!qdrantConfig.url || qdrantConfig.url === 'http://localhost:6333') {
            if (!process.env.QDRANT_URL && !process.env[`${env}_QDRANT_URL`]) {
                throw new Error(
                    'Missing Qdrant URL. Configure with:\n' +
                    '  husky config set qdrant-url <url>\n' +
                    '  husky config set qdrant-api-key <key>\n' +
                    'Or set env vars: PROD_QDRANT_URL, PROD_QDRANT_API_KEY'
                );
            }
        }

        return new QdrantClient(qdrantConfig);
    }

    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.url}${path}`;

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['api-key'] = this.apiKey;
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                ...headers,
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Qdrant API Error ${response.status}: ${error}`);
        }

        return response.json();
    }

    // =========================================================================
    // Collections
    // =========================================================================

    async listCollections(): Promise<string[]> {
        const response = await this.request<{ result: { collections: Array<{ name: string }> } }>('/collections');
        return response.result.collections.map(c => c.name);
    }

    async getCollection(name: string): Promise<CollectionInfo> {
        const response = await this.request<{ result: { vectors_count: number; points_count: number } }>(`/collections/${name}`);
        return {
            name,
            vectorsCount: response.result.vectors_count,
            pointsCount: response.result.points_count,
        };
    }

    async createCollection(name: string, vectorSize: number): Promise<void> {
        await this.request(`/collections/${name}`, {
            method: 'PUT',
            body: JSON.stringify({
                vectors: {
                    size: vectorSize,
                    distance: 'Cosine',
                },
            }),
        });
    }

    async deleteCollection(name: string): Promise<void> {
        await this.request(`/collections/${name}`, { method: 'DELETE' });
    }

    // =========================================================================
    // Points
    // =========================================================================

    async search(
        collectionName: string,
        vector: number[],
        limit: number = 10,
        options?: Omit<SearchOptions, 'limit'> & { vectorName?: string }
    ): Promise<SearchResult[]> {
        // Build request body - support named vectors
        const body: Record<string, unknown> = {
            limit,
            filter: options?.filter,
            score_threshold: options?.scoreThreshold,
            offset: options?.offset,
            with_payload: true,
        };

        // If named vector, use object format
        if (options?.vectorName) {
            body.vector = { name: options.vectorName, vector };
        } else {
            body.vector = vector;
        }

        const response = await this.request<{ result: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> }>(
            `/collections/${collectionName}/points/search`,
            {
                method: 'POST',
                body: JSON.stringify(body),
            }
        );

        return response.result.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload,
        }));
    }

    async upsert(collectionName: string, points: Point[]): Promise<void> {
        await this.request(`/collections/${collectionName}/points?wait=true`, {
            method: 'PUT',
            body: JSON.stringify({
                points: points.map(p => ({
                    id: p.id,
                    vector: p.vector,
                    payload: p.payload || {},
                })),
            }),
        });
    }

    async upsertOne(
        collectionName: string,
        id: string | number,
        vector: number[],
        payload?: Record<string, unknown>
    ): Promise<void> {
        await this.upsert(collectionName, [{ id, vector, payload }]);
    }

    async getPoint(collectionName: string, id: string | number): Promise<Point | null> {
        try {
            const response = await this.request<{ result: Array<{ id: string | number; vector: number[]; payload?: Record<string, unknown> }> }>(
                `/collections/${collectionName}/points`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        ids: [id],
                        with_payload: true,
                        with_vector: true,
                    }),
                }
            );

            if (response.result.length === 0) return null;
            const p = response.result[0];
            return { id: p.id, vector: p.vector, payload: p.payload };
        } catch {
            return null;
        }
    }

    async deletePoints(collectionName: string, ids: (string | number)[]): Promise<void> {
        await this.request(`/collections/${collectionName}/points/delete?wait=true`, {
            method: 'POST',
            body: JSON.stringify({ points: ids }),
        });
    }

    async count(collectionName: string): Promise<number> {
        const info = await this.getCollection(collectionName);
        return info.pointsCount;
    }

    async scroll(
        collectionName: string,
        options: {
            filter?: Record<string, unknown>;
            limit?: number;
            with_payload?: boolean;
        } = {}
    ): Promise<Array<{ id: string | number; payload: Record<string, unknown> }>> {
        const response = await this.request<{
            result: {
                points: Array<{ id: string | number; payload?: Record<string, unknown> }>;
            };
        }>(`/collections/${collectionName}/points/scroll`, {
            method: 'POST',
            body: JSON.stringify({
                filter: options.filter,
                limit: options.limit || 50,
                with_payload: options.with_payload ?? true,
            }),
        });

        return response.result.points.map(p => ({
            id: p.id,
            payload: p.payload || {},
        }));
    }
}

export default QdrantClient;
