/**
 * Biz Library Exports
 */

export { BillbeeClient } from './billbee.js';
export { ZendeskClient } from './zendesk.js';
export { ZendeskProxyClient, getZendeskProxyClient, tryZendeskProxy } from './zendesk-proxy.js';
export { SeaTableClient } from './seatable.js';
export { QdrantClient } from './qdrant.js';
export { EmbeddingService, EMBEDDING_MODELS } from './embeddings.js';
// export { NocoDBClient } from './nocodb/index.js'; // Not in this branch
export type { Point, SearchResult as QdrantSearchResult, SearchOptions, CollectionInfo, QdrantConfig } from './qdrant.js';
export type { EmbeddingConfig, EmbeddingResult } from './embeddings.js';
export * from './billbee-types.js';
export * from './zendesk-types.js';
export * from './seatable-types.js';
export { GotessClient } from './gotess.js';
export { ShopifyClient } from './shopify.js';
export type {
  Order as ShopifyOrder,
  Customer as ShopifyCustomer,
  Product as ShopifyProduct,
  ShopMetrics,
} from './shopify.js';
export { SupplierFeedService } from './supplier-feed.js';
export type {
  SupplierId,
  SupplierProduct,
  SupplierProductSearchResult,
  SyncStats,
} from './supplier-feed.js';
export * from './supplier-feed-types.js';
