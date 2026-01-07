/**
 * Billbee API Client
 * Extended for v0.9 with full products support
 */

import {
    BillbeeConfig,
    BillbeePaginatedResponse,
    BillbeeResponse,
    Order,
    OrdersQueryParams,
    Product,
    ProductsQueryParams,
    ProductUpdate,
} from './billbee-types.js';
import { getConfig } from '../../commands/config.js';

export class BillbeeClient {
    private config: BillbeeConfig;

    constructor(config: BillbeeConfig) {
        this.config = config;
    }

    /**
     * Create client from Husky config
     * Priority: PROD_* env vars > env vars > local config
     */
    static fromConfig(): BillbeeClient {
        const config = getConfig();
        const env = process.env.HUSKY_ENV || 'PROD';

        const billbeeConfig: BillbeeConfig = {
            API_KEY: process.env[`${env}_BILLBEE_API_KEY`] || process.env.BILLBEE_API_KEY || config.billbeeApiKey || '',
            USERNAME: process.env[`${env}_BILLBEE_USERNAME`] || process.env.BILLBEE_USERNAME || config.billbeeUsername || '',
            PASSWORD: process.env[`${env}_BILLBEE_PASSWORD`] || process.env.BILLBEE_PASSWORD || config.billbeePassword || '',
            BASE_URL: process.env[`${env}_BILLBEE_BASE_URL`] || process.env.BILLBEE_BASE_URL || config.billbeeBaseUrl || 'https://app.billbee.io/api/v1',
        };

        if (!billbeeConfig.API_KEY || !billbeeConfig.USERNAME || !billbeeConfig.PASSWORD) {
            throw new Error(
                'Missing Billbee credentials. Configure with:\n' +
                '  husky config set billbee-api-key <key>\n' +
                '  husky config set billbee-username <email>\n' +
                '  husky config set billbee-password <password>\n' +
                'Or set env vars: PROD_BILLBEE_API_KEY, PROD_BILLBEE_USERNAME, PROD_BILLBEE_PASSWORD'
            );
        }

        return new BillbeeClient(billbeeConfig);
    }

    /**
     * Make authenticated request (with rate limit awareness: 2 req/sec max)
     */
    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.config.BASE_URL}${endpoint}`;
        const auth = Buffer.from(`${this.config.USERNAME}:${this.config.PASSWORD}`).toString('base64');

        const response = await fetch(url, {
            ...options,
            headers: {
                'X-Billbee-Api-Key': this.config.API_KEY,
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Billbee API Error ${response.status}: ${error}`);
        }

        return response.json();
    }

    // =========================================================================
    // ORDERS
    // =========================================================================

    async listOrders(params?: OrdersQueryParams): Promise<BillbeePaginatedResponse<Order>> {
        const query = new URLSearchParams();
        if (params?.page) query.set('page', String(params.page));
        if (params?.pageSize) query.set('pageSize', String(params.pageSize));
        if (params?.minOrderDate) query.set('minOrderDate', params.minOrderDate);
        if (params?.maxOrderDate) query.set('maxOrderDate', params.maxOrderDate);
        if (params?.includePositions !== undefined) {
            query.set('includePositions', String(params.includePositions));
        }
        if (params?.orderStateId && params.orderStateId.length > 0) {
            params.orderStateId.forEach(id => query.append('orderStateId', String(id)));
        }
        if (params?.tag && params.tag.length > 0) {
            params.tag.forEach(t => query.append('tag', t));
        }

        const endpoint = `/orders${query.toString() ? `?${query}` : ''}`;
        return this.request<BillbeePaginatedResponse<Order>>(endpoint);
    }

    async getOrder(id: number | string): Promise<BillbeeResponse<Order>> {
        return this.request<BillbeeResponse<Order>>(`/orders/${id}`);
    }

    async updateOrder(id: number | string, data: Partial<Order>): Promise<BillbeeResponse<Order>> {
        return this.request<BillbeeResponse<Order>>(`/orders/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async addOrderTags(orderId: number, tags: string[]): Promise<void> {
        await this.request(`/orders/${orderId}/tags`, {
            method: 'POST',
            body: JSON.stringify({ Tags: tags }),
        });
    }

    async removeOrderTags(orderId: number, tags: string[]): Promise<void> {
        await this.request(`/orders/${orderId}/tags`, {
            method: 'DELETE',
            body: JSON.stringify({ Tags: tags }),
        });
    }

    // =========================================================================
    // PRODUCTS
    // =========================================================================

    async listProducts(params?: ProductsQueryParams): Promise<BillbeePaginatedResponse<Product>> {
        const query = new URLSearchParams();
        if (params?.page) query.set('page', String(params.page));
        if (params?.pageSize) query.set('pageSize', String(params.pageSize));
        if (params?.minCreatedAt) query.set('minCreatedAt', params.minCreatedAt);
        if (params?.type !== undefined) query.set('type', String(params.type));

        const endpoint = `/products${query.toString() ? `?${query}` : ''}`;
        return this.request<BillbeePaginatedResponse<Product>>(endpoint);
    }

    async getProduct(id: number | string): Promise<BillbeeResponse<Product>> {
        return this.request<BillbeeResponse<Product>>(`/products/${id}`);
    }

    async getProductBySku(sku: string): Promise<Product | null> {
        try {
            const response = await this.request<BillbeeResponse<Product>>(
                `/products/query?LookupBy=sku&LookupTerm=${encodeURIComponent(sku)}`
            );
            return response.Data;
        } catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
                return null;
            }
            throw error;
        }
    }

    async updateProduct(id: number | string, data: ProductUpdate): Promise<BillbeeResponse<Product>> {
        return this.request<BillbeeResponse<Product>>(`/products/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async updateProductBySku(sku: string, data: ProductUpdate): Promise<BillbeeResponse<Product>> {
        const product = await this.getProductBySku(sku);
        if (!product || !product.Id) {
            throw new Error(`Product with SKU "${sku}" not found`);
        }
        return this.updateProduct(product.Id, data);
    }

    // =========================================================================
    // CUSTOMERS (from Orders)
    // =========================================================================

    /**
     * Search customers by email (scans orders for matching buyers)
     */
    async findCustomerByEmail(email: string): Promise<{ buyer: Order['Buyer']; address: Order['InvoiceAddress']; orders: Order[] } | null> {
        const response = await this.listOrders({
            pageSize: 100,
            includePositions: false,
        });

        const matchingOrders = response.Data.filter(order =>
            order.Buyer?.Email?.toLowerCase() === email.toLowerCase() ||
            order.InvoiceAddress?.Email?.toLowerCase() === email.toLowerCase()
        );

        if (matchingOrders.length === 0) {
            return null;
        }

        const latestOrder = matchingOrders[0];
        return {
            buyer: latestOrder.Buyer,
            address: latestOrder.InvoiceAddress || {},
            orders: matchingOrders,
        };
    }
}

// Type re-export for convenience
export type { Address } from './billbee-types.js';

export default BillbeeClient;
