/**
 * Supplier Feed Service
 * 
 * Manages supplier product catalog in Qdrant for semantic search.
 * Helps agents find matching products across Wattiz, Skuterzone, Emove.
 */

import { QdrantClient } from './qdrant.js';
import { EmbeddingService } from './embeddings.js';
import { WattizPlaywrightClient } from './wattiz-playwright.js';
import { SkuterzonePlaywrightClient } from './skuterzone-playwright.js';
import { EmovePlaywrightClient } from './emove-playwright.js';
import type { WattizProduct } from './wattiz-types.js';
import type { SkuterzoneProduct } from './skuterzone-types.js';
import type { EmoveProduct } from './emove-types.js';
import {
    COLLECTION_NAME,
    VECTOR_SIZE,
    SUPPLIER_IDS,
    type SupplierId,
    type SupplierProduct,
    type SupplierProductSearchResult,
    type SyncStats,
    type SyncOptions,
    type SearchOptions,
    parsePrice,
    makeProductId,
} from './supplier-feed-types.js';

export class SupplierFeedService {
    private qdrant: QdrantClient;
    private embeddings: EmbeddingService;
    private collectionReady = false;

    constructor() {
        this.qdrant = QdrantClient.fromConfig();
        this.embeddings = EmbeddingService.fromConfig();
    }

    async ensureCollection(): Promise<void> {
        if (this.collectionReady) return;

        try {
            await this.qdrant.getCollection(COLLECTION_NAME);
            this.collectionReady = true;
        } catch {
            await this.qdrant.createCollection(COLLECTION_NAME, VECTOR_SIZE);
            this.collectionReady = true;
        }
    }

    async syncSupplier(supplier: SupplierId, query: string, options?: { limit?: number; verbose?: boolean }): Promise<SyncStats> {
        const start = Date.now();
        const stats: SyncStats = {
            supplier,
            productsFound: 0,
            productsUpserted: 0,
            errors: 0,
            durationMs: 0,
        };

        await this.ensureCollection();

        try {
            const products = await this.fetchProducts(supplier, query);
            stats.productsFound = products.length;

            if (options?.verbose) {
                console.log(`  Found ${products.length} products from ${supplier}`);
            }

            const limit = options?.limit || 100;
            const toProcess = products.slice(0, limit);

            for (const product of toProcess) {
                try {
                    const embedding = await this.embeddings.embed(this.buildEmbeddingText(product));
                    
                    await this.qdrant.upsertOne(COLLECTION_NAME, product.id, embedding, {
                        supplier: product.supplier,
                        name: product.name,
                        sku: product.sku || null,
                        ean: product.ean || null,
                        price: product.price || null,
                        priceNumeric: product.priceNumeric || null,
                        url: product.url,
                        imageUrl: product.imageUrl || null,
                        stockStatus: product.stockStatus || null,
                        category: product.category || null,
                        lastSynced: product.lastSynced,
                    });

                    stats.productsUpserted++;

                    if (options?.verbose && stats.productsUpserted % 10 === 0) {
                        console.log(`    Upserted ${stats.productsUpserted}/${toProcess.length}`);
                    }
                } catch (err) {
                    stats.errors++;
                    if (options?.verbose) {
                        console.error(`    Error upserting ${product.id}: ${(err as Error).message}`);
                    }
                }
            }
        } catch (err) {
            stats.errors++;
            if (options?.verbose) {
                console.error(`  Sync error for ${supplier}: ${(err as Error).message}`);
            }
        }

        stats.durationMs = Date.now() - start;
        return stats;
    }

    async syncAll(options?: SyncOptions): Promise<SyncStats[]> {
        const suppliers = options?.suppliers || [...SUPPLIER_IDS];
        const results: SyncStats[] = [];

        for (const supplier of suppliers) {
            if (options?.verbose) {
                console.log(`\nSyncing ${supplier}...`);
            }

            const stats = await this.syncSupplier(supplier, options?.query || '*', {
                limit: options?.limit,
                verbose: options?.verbose,
            });

            results.push(stats);
        }

        return results;
    }

    async search(query: string, options?: SearchOptions): Promise<SupplierProductSearchResult[]> {
        await this.ensureCollection();

        const embedding = await this.embeddings.embed(query);
        
        const filter: Record<string, unknown> = {};
        if (options?.supplier) {
            filter.must = [{ key: 'supplier', match: { value: options.supplier } }];
        }
        if (options?.inStockOnly) {
            filter.must = filter.must || [];
            (filter.must as Array<unknown>).push({
                key: 'stockStatus',
                match: { any: ['In Stock', 'En stock', 'Disponible', 'Available'] },
            });
        }

        const results = await this.qdrant.search(
            COLLECTION_NAME,
            embedding,
            options?.limit || 10,
            {
                filter: Object.keys(filter).length > 0 ? filter : undefined,
                scoreThreshold: options?.minScore || 0.5,
            }
        );

        return results.map(r => ({
            id: String(r.id),
            supplier: r.payload?.supplier as SupplierId,
            name: r.payload?.name as string,
            sku: r.payload?.sku as string | undefined,
            ean: r.payload?.ean as string | undefined,
            price: r.payload?.price as string | undefined,
            priceNumeric: r.payload?.priceNumeric as number | undefined,
            url: r.payload?.url as string,
            imageUrl: r.payload?.imageUrl as string | undefined,
            stockStatus: r.payload?.stockStatus as string | undefined,
            category: r.payload?.category as string | undefined,
            lastSynced: r.payload?.lastSynced as string,
            score: r.score,
        }));
    }

    async count(supplier?: SupplierId): Promise<number> {
        await this.ensureCollection();

        if (!supplier) {
            return this.qdrant.count(COLLECTION_NAME);
        }

        const results = await this.qdrant.scroll(COLLECTION_NAME, {
            filter: { must: [{ key: 'supplier', match: { value: supplier } }] },
            limit: 10000,
            with_payload: false,
        });

        return results.length;
    }

    async getStats(): Promise<{ total: number; bySupplier: Record<SupplierId, number> }> {
        const total = await this.count();
        const bySupplier: Record<SupplierId, number> = {
            wattiz: 0,
            skuterzone: 0,
            emove: 0,
        };

        for (const supplier of SUPPLIER_IDS) {
            bySupplier[supplier] = await this.count(supplier);
        }

        return { total, bySupplier };
    }

    private async fetchProducts(supplier: SupplierId, query: string): Promise<SupplierProduct[]> {
        const now = new Date().toISOString();

        switch (supplier) {
            case 'wattiz': {
                const client = WattizPlaywrightClient.fromConfig();
                const products = await client.searchProducts(query);
                await client.close();
                return products.map((p: WattizProduct) => this.normalizeWattiz(p, now));
            }
            case 'skuterzone': {
                const client = SkuterzonePlaywrightClient.fromConfig();
                const products = await client.searchProducts(query);
                await client.close();
                return products.map((p: SkuterzoneProduct) => this.normalizeSkuterzone(p, now));
            }
            case 'emove': {
                const client = EmovePlaywrightClient.fromConfig();
                const products = await client.searchProducts(query);
                await client.close();
                return products.map((p: EmoveProduct) => this.normalizeEmove(p, now));
            }
            default:
                return [];
        }
    }

    private normalizeWattiz(p: WattizProduct, timestamp: string): SupplierProduct {
        return {
            id: makeProductId('wattiz', p.id),
            supplier: 'wattiz',
            name: p.name,
            sku: p.sku,
            ean: p.ean,
            price: p.price,
            priceNumeric: parsePrice(p.price),
            url: p.url,
            imageUrl: p.imageUrl,
            stockStatus: p.stockStatus,
            category: p.category,
            lastSynced: timestamp,
        };
    }

    private normalizeSkuterzone(p: SkuterzoneProduct, timestamp: string): SupplierProduct {
        return {
            id: makeProductId('skuterzone', p.id),
            supplier: 'skuterzone',
            name: p.name,
            sku: p.sku,
            price: p.price,
            priceNumeric: parsePrice(p.price),
            url: p.url,
            imageUrl: p.imageUrl,
            stockStatus: p.stockStatus,
            category: p.category,
            lastSynced: timestamp,
        };
    }

    private normalizeEmove(p: EmoveProduct, timestamp: string): SupplierProduct {
        return {
            id: makeProductId('emove', p.id),
            supplier: 'emove',
            name: p.name,
            sku: p.sku,
            price: p.price,
            priceNumeric: parsePrice(p.price),
            url: p.url,
            imageUrl: p.imageUrl,
            stockStatus: p.stockStatus,
            category: p.category,
            lastSynced: timestamp,
        };
    }

    private buildEmbeddingText(product: SupplierProduct): string {
        const parts = [product.name];
        if (product.sku) parts.push(`SKU: ${product.sku}`);
        if (product.ean) parts.push(`EAN: ${product.ean}`);
        if (product.category) parts.push(`Category: ${product.category}`);
        return parts.join(' | ');
    }
}

export { COLLECTION_NAME, SUPPLIER_IDS };
export type { SupplierId, SupplierProduct, SupplierProductSearchResult, SyncStats };
