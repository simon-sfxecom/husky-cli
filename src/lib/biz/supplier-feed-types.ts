/**
 * Supplier Feed Types
 * 
 * Unified product schema for supplier catalog data (Wattiz, Skuterzone, Emove)
 * Stored in Qdrant for semantic search to help agents find matching products
 */

// ============================================================================
// Core Types
// ============================================================================

export const SUPPLIER_IDS = ['wattiz', 'skuterzone', 'emove'] as const;
export type SupplierId = typeof SUPPLIER_IDS[number];

export const COLLECTION_NAME = 'supplier_products';
export const VECTOR_SIZE = 768; // text-embedding-004 output size

/**
 * Unified product schema across all suppliers
 */
export interface SupplierProduct {
    /** Unique ID: "{supplier}-{productId}" e.g. "wattiz-12345" */
    id: string;
    
    /** Source supplier */
    supplier: SupplierId;
    
    /** Product name (used for embedding) */
    name: string;
    
    /** Supplier SKU (may differ from our internal SKU) */
    sku?: string;
    
    /** EAN/barcode (13 digits) */
    ean?: string;
    
    /** Price with currency (e.g. "42.50 €") */
    price?: string;
    
    /** Numeric price for comparison */
    priceNumeric?: number;
    
    /** Product detail page URL */
    url: string;
    
    /** Product image URL */
    imageUrl?: string;
    
    /** Stock status text (e.g. "In Stock", "Out of Stock") */
    stockStatus?: string;
    
    /** Product category from supplier */
    category?: string;
    
    /** Last sync timestamp (ISO 8601) */
    lastSynced: string;
}

/**
 * Search result with similarity score
 */
export interface SupplierProductSearchResult extends SupplierProduct {
    score: number;
}

/**
 * Sync statistics
 */
export interface SyncStats {
    supplier: SupplierId;
    productsFound: number;
    productsUpserted: number;
    errors: number;
    durationMs: number;
}

/**
 * Supplier sync options
 */
export interface SyncOptions {
    /** Which suppliers to sync (default: all) */
    suppliers?: SupplierId[];
    
    /** Search query to fetch products (supplier-specific) */
    query?: string;
    
    /** Max products per supplier */
    limit?: number;
    
    /** Verbose logging */
    verbose?: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
    /** Filter by supplier */
    supplier?: SupplierId;
    
    /** Minimum similarity score (0-1) */
    minScore?: number;
    
    /** Max results */
    limit?: number;
    
    /** Only in-stock products */
    inStockOnly?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse price string to numeric value
 */
export function parsePrice(priceStr?: string): number | undefined {
    if (!priceStr) return undefined;
    
    const euroFormatNormalized = priceStr
        .replace(/[€$£\s]/g, '')
        .replace(/,/g, '.')
        .trim();
    
    const num = parseFloat(euroFormatNormalized);
    return isNaN(num) ? undefined : num;
}

/**
 * Generate composite ID
 */
export function makeProductId(supplier: SupplierId, productId: string): string {
    return `${supplier}-${productId}`;
}

/**
 * Extract supplier from composite ID
 */
export function parseProductId(compositeId: string): { supplier: SupplierId; productId: string } | null {
    const match = compositeId.match(/^(wattiz|skuterzone|emove)-(.+)$/);
    if (!match) return null;
    return {
        supplier: match[1] as SupplierId,
        productId: match[2],
    };
}
