/**
 * Vertex AI Embedding Service
 * Ported from TigerV0 for Husky Biz CLI
 *
 * Uses Google Application Default Credentials (ADC)
 * Run: gcloud auth application-default login
 */
import { getConfig } from '../../commands/config.js';
export const EMBEDDING_MODELS = {
    TEXT_EMBEDDING_004: 'text-embedding-004',
    TEXT_MULTILINGUAL_002: 'text-multilingual-embedding-002',
};
export class EmbeddingService {
    projectId;
    location;
    model;
    accessToken = null;
    tokenExpiry = null;
    constructor(config) {
        this.projectId = config.projectId;
        this.location = config.location || 'europe-west1';
        this.model = config.model || EMBEDDING_MODELS.TEXT_EMBEDDING_004;
    }
    /**
     * Create service from Husky config
     */
    static fromConfig() {
        const config = getConfig();
        const embeddingConfig = {
            projectId: config.gcpProjectId || process.env.GOOGLE_PROJECT_ID || process.env.GCP_PROJECT_ID || '',
            location: config.gcpLocation || process.env.GOOGLE_LOCATION || 'europe-west1',
            model: process.env.EMBEDDING_MODEL || EMBEDDING_MODELS.TEXT_EMBEDDING_004,
        };
        if (!embeddingConfig.projectId) {
            throw new Error('Missing GCP Project ID. Configure with:\n' +
                '  husky config set gcp-project-id <project-id>\n\n' +
                'Also ensure ADC is set up: gcloud auth application-default login');
        }
        return new EmbeddingService(embeddingConfig);
    }
    /**
     * Get access token using gcloud CLI
     */
    async getAccessToken() {
        const now = Date.now();
        if (this.accessToken && this.tokenExpiry && now < this.tokenExpiry) {
            return this.accessToken;
        }
        // Use gcloud CLI to get access token
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        try {
            const { stdout } = await execAsync('gcloud auth print-access-token');
            this.accessToken = stdout.trim();
            // Token valid for ~1 hour, refresh after 50 minutes
            this.tokenExpiry = now + (50 * 60 * 1000);
            return this.accessToken;
        }
        catch (error) {
            throw new Error('Failed to get GCP access token. Ensure gcloud is installed and run:\n' +
                '  gcloud auth application-default login');
        }
    }
    /**
     * Generate embedding for a single text
     */
    async embed(text) {
        const token = await this.getAccessToken();
        const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:predict`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instances: [{ content: text }],
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Embedding API Error ${response.status}: ${error}`);
        }
        const data = await response.json();
        return data.predictions[0].embeddings.values;
    }
    /**
     * Generate embeddings for multiple texts (batch)
     */
    async embedBatch(texts) {
        const token = await this.getAccessToken();
        const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:predict`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instances: texts.map((text) => ({ content: text })),
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Embedding API Error ${response.status}: ${error}`);
        }
        const data = await response.json();
        return texts.map((text, i) => ({
            text,
            values: data.predictions[i].embeddings.values,
        }));
    }
}
export default EmbeddingService;
