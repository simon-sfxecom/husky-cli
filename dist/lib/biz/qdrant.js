/**
 * Qdrant Vector Database Client
 * Ported from TigerV0 with Husky Biz CLI integration
 */
import { getConfig } from '../../commands/config.js';
// ============================================================================
// Qdrant Service (REST API based)
// ============================================================================
export class QdrantClient {
    url;
    apiKey;
    constructor(config) {
        this.url = config.url.replace(/\/+$/, '');
        this.apiKey = config.apiKey;
    }
    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig() {
        const config = getConfig();
        const env = process.env.HUSKY_ENV || 'PROD';
        const qdrantConfig = {
            url: process.env[`${env}_QDRANT_URL`] || process.env.QDRANT_URL || config.qdrantUrl || 'http://localhost:6333',
            apiKey: process.env[`${env}_QDRANT_API_KEY`] || process.env.QDRANT_API_KEY || config.qdrantApiKey,
        };
        if (!qdrantConfig.url || qdrantConfig.url === 'http://localhost:6333') {
            if (!process.env.QDRANT_URL && !process.env[`${env}_QDRANT_URL`]) {
                throw new Error('Missing Qdrant URL. Configure with:\n' +
                    '  husky config set qdrant-url <url>\n' +
                    '  husky config set qdrant-api-key <key>\n' +
                    'Or set env vars: PROD_QDRANT_URL, PROD_QDRANT_API_KEY');
            }
        }
        return new QdrantClient(qdrantConfig);
    }
    async request(path, options = {}) {
        const url = `${this.url}${path}`;
        const headers = {
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
    async listCollections() {
        const response = await this.request('/collections');
        return response.result.collections.map(c => c.name);
    }
    async getCollection(name) {
        const response = await this.request(`/collections/${name}`);
        return {
            name,
            vectorsCount: response.result.vectors_count,
            pointsCount: response.result.points_count,
        };
    }
    async createCollection(name, vectorSize) {
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
    async deleteCollection(name) {
        await this.request(`/collections/${name}`, { method: 'DELETE' });
    }
    // =========================================================================
    // Points
    // =========================================================================
    async search(collectionName, vector, limit = 10, options) {
        // Build request body - support named vectors
        const body = {
            limit,
            filter: options?.filter,
            score_threshold: options?.scoreThreshold,
            offset: options?.offset,
            with_payload: true,
        };
        // If named vector, use object format
        if (options?.vectorName) {
            body.vector = { name: options.vectorName, vector };
        }
        else {
            body.vector = vector;
        }
        const response = await this.request(`/collections/${collectionName}/points/search`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        return response.result.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload,
        }));
    }
    async upsert(collectionName, points) {
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
    async upsertOne(collectionName, id, vector, payload) {
        await this.upsert(collectionName, [{ id, vector, payload }]);
    }
    async getPoint(collectionName, id) {
        try {
            const response = await this.request(`/collections/${collectionName}/points`, {
                method: 'POST',
                body: JSON.stringify({
                    ids: [id],
                    with_payload: true,
                    with_vector: true,
                }),
            });
            if (response.result.length === 0)
                return null;
            const p = response.result[0];
            return { id: p.id, vector: p.vector, payload: p.payload };
        }
        catch {
            return null;
        }
    }
    async deletePoints(collectionName, ids) {
        await this.request(`/collections/${collectionName}/points/delete?wait=true`, {
            method: 'POST',
            body: JSON.stringify({ points: ids }),
        });
    }
    async count(collectionName) {
        const info = await this.getCollection(collectionName);
        return info.pointsCount;
    }
}
export default QdrantClient;
