/**
 * Billbee API Client
 * Extended for v0.9 with full products support
 */
import { BillbeeConfig, BillbeePaginatedResponse, BillbeeResponse, Order, OrdersQueryParams, Product, ProductsQueryParams, ProductUpdate } from './billbee-types.js';
export declare class BillbeeClient {
    private config;
    constructor(config: BillbeeConfig);
    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig(): BillbeeClient;
    /**
     * Make authenticated request (with rate limit awareness: 2 req/sec max)
     */
    private request;
    listOrders(params?: OrdersQueryParams): Promise<BillbeePaginatedResponse<Order>>;
    getOrder(id: number | string): Promise<BillbeeResponse<Order>>;
    updateOrder(id: number | string, data: Partial<Order>): Promise<BillbeeResponse<Order>>;
    addOrderTags(orderId: number, tags: string[]): Promise<void>;
    removeOrderTags(orderId: number, tags: string[]): Promise<void>;
    listProducts(params?: ProductsQueryParams): Promise<BillbeePaginatedResponse<Product>>;
    getProduct(id: number | string): Promise<BillbeeResponse<Product>>;
    getProductBySku(sku: string): Promise<Product | null>;
    updateProduct(id: number | string, data: ProductUpdate): Promise<BillbeeResponse<Product>>;
    updateProductBySku(sku: string, data: ProductUpdate): Promise<BillbeeResponse<Product>>;
    /**
     * Search customers by email (scans orders for matching buyers)
     */
    findCustomerByEmail(email: string): Promise<{
        buyer: Order['Buyer'];
        address: Order['InvoiceAddress'];
        orders: Order[];
    } | null>;
}
export type { Address } from './billbee-types.js';
export default BillbeeClient;
