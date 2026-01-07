/**
 * Vertex AI Embedding Service
 * Ported from TigerV0 for Husky Biz CLI
 *
 * Uses Google Application Default Credentials (ADC)
 * Run: gcloud auth application-default login
 */
export declare const EMBEDDING_MODELS: {
    readonly TEXT_EMBEDDING_004: "text-embedding-004";
    readonly TEXT_MULTILINGUAL_002: "text-multilingual-embedding-002";
};
export interface EmbeddingConfig {
    projectId: string;
    location?: string;
    model?: string;
}
export interface EmbeddingResult {
    values: number[];
    text: string;
}
export declare class EmbeddingService {
    private projectId;
    private location;
    private model;
    private accessToken;
    private tokenExpiry;
    constructor(config: EmbeddingConfig);
    /**
     * Create service from Husky config
     */
    static fromConfig(): EmbeddingService;
    /**
     * Get access token using gcloud CLI
     */
    private getAccessToken;
    /**
     * Generate embedding for a single text
     */
    embed(text: string): Promise<number[]>;
    /**
     * Generate embeddings for multiple texts (batch)
     */
    embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}
export default EmbeddingService;
