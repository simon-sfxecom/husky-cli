/**
 * Qdrant Vector Database Client
 * Ported from TigerV0 with Husky Biz CLI integration
 */
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
export declare class QdrantClient {
    private url;
    private apiKey?;
    constructor(config: QdrantConfig);
    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig(): QdrantClient;
    private request;
    listCollections(): Promise<string[]>;
    getCollection(name: string): Promise<CollectionInfo>;
    createCollection(name: string, vectorSize: number): Promise<void>;
    deleteCollection(name: string): Promise<void>;
    search(collectionName: string, vector: number[], limit?: number, options?: Omit<SearchOptions, 'limit'> & {
        vectorName?: string;
    }): Promise<SearchResult[]>;
    upsert(collectionName: string, points: Point[]): Promise<void>;
    upsertOne(collectionName: string, id: string | number, vector: number[], payload?: Record<string, unknown>): Promise<void>;
    getPoint(collectionName: string, id: string | number): Promise<Point | null>;
    deletePoints(collectionName: string, ids: (string | number)[]): Promise<void>;
    count(collectionName: string): Promise<number>;
}
export default QdrantClient;
