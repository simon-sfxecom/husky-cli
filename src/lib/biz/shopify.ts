import { getConfig } from "../../commands/config.js";
export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
}

export interface Order {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  fulfillmentStatus: string | null;
  financialStatus: string;
  totalPrice: string;
  currency: string;
  customer: Customer;
  lineItems: LineItem[];
  fulfillments: Fulfillment[];
  shippingAddress?: Address;
  billingAddress?: Address;
  tags: string[];
  note: string | null;
}

export interface Customer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  ordersCount: number;
  totalSpent: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  acceptsMarketing: boolean;
  defaultAddress?: Address;
}

export interface Product {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  tags: string[];
  variants: ProductVariant[];
  images: ProductImage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  weight: number | null;
  weightUnit: string;
  barcode: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

export interface LineItem {
  id: string;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
  variantId: string | null;
  productId: string | null;
}

export interface Fulfillment {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

export interface Address {
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

export interface OrderQueryParams {
  status?: 'any' | 'open' | 'closed' | 'cancelled';
  fulfillmentStatus?: 'any' | 'shipped' | 'partial' | 'unshipped' | 'unfulfilled';
  financialStatus?: 'any' | 'authorized' | 'pending' | 'paid' | 'partially_paid' | 'refunded' | 'voided' | 'partially_refunded';
  createdAtMin?: Date;
  createdAtMax?: Date;
  updatedAtMin?: Date;
  updatedAtMax?: Date;
  limit?: number;
  sinceId?: string;
  ids?: string[];
}

export interface CustomerQueryParams {
  email?: string;
  phone?: string;
  createdAtMin?: Date;
  createdAtMax?: Date;
  updatedAtMin?: Date;
  updatedAtMax?: Date;
  limit?: number;
  sinceId?: string;
  ids?: string[];
  tags?: string[];
}

export interface ProductQueryParams {
  status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  vendor?: string;
  productType?: string;
  createdAtMin?: Date;
  createdAtMax?: Date;
  updatedAtMin?: Date;
  updatedAtMax?: Date;
  limit?: number;
  sinceId?: string;
  ids?: string[];
  handle?: string;
}

export interface ProductUpdate {
  title?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  tags?: string[];
}

export interface ShopMetrics {
  ordersToday: number;
  revenueToday: number;
  averageOrderValue: number;
  newCustomersToday: number;
  returningCustomersToday: number;
  topProducts: Array<{ productId: string; title: string; quantity: number; revenue: number }>;
  currencyCode: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

const DEFAULT_API_VERSION = '2024-10';

export class ShopifyClient {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string;
  private baseUrl: string;

  constructor(config: ShopifyConfig) {
    this.shopDomain = config.shopDomain.replace(/\.myshopify\.com$/, '');
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion || DEFAULT_API_VERSION;
    this.baseUrl = `https://${this.shopDomain}.myshopify.com/admin/api/${this.apiVersion}`;
  }

  static fromConfig(): ShopifyClient {
    const config = getConfig();
    
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || config.shopifyDomain;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || config.shopifyToken;
    
    if (!shopDomain) {
      throw new Error(
        "Shopify shop domain not configured. Set SHOPIFY_SHOP_DOMAIN env var or run: husky config set shopifyDomain <your-shop.myshopify.com>"
      );
    }
    
    if (!accessToken) {
      throw new Error(
        "Shopify access token not configured. Set SHOPIFY_ACCESS_TOKEN env var or run: husky config set shopifyToken <your-token>"
      );
    }
    
    return new ShopifyClient({
      shopDomain,
      accessToken,
    });
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  // ============================================================================
  // ORDERS
  // ============================================================================

  async getOrders(params: OrderQueryParams = {}): Promise<Order[]> {
    const queryParams = new URLSearchParams();
    
    if (params.status) queryParams.set('status', params.status);
    if (params.fulfillmentStatus) queryParams.set('fulfillment_status', params.fulfillmentStatus);
    if (params.financialStatus) queryParams.set('financial_status', params.financialStatus);
    if (params.createdAtMin) queryParams.set('created_at_min', params.createdAtMin.toISOString());
    if (params.createdAtMax) queryParams.set('created_at_max', params.createdAtMax.toISOString());
    if (params.updatedAtMin) queryParams.set('updated_at_min', params.updatedAtMin.toISOString());
    if (params.updatedAtMax) queryParams.set('updated_at_max', params.updatedAtMax.toISOString());
    if (params.limit) queryParams.set('limit', String(params.limit));
    if (params.sinceId) queryParams.set('since_id', params.sinceId);
    if (params.ids) queryParams.set('ids', params.ids.join(','));

    const queryString = queryParams.toString();
    const endpoint = `/orders.json${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.request<{ orders: ShopifyOrderResponse[] }>(endpoint);
    return response.orders.map(this.mapOrder);
  }

  async getOrder(id: string): Promise<Order> {
    const response = await this.request<{ order: ShopifyOrderResponse }>(`/orders/${id}.json`);
    return this.mapOrder(response.order);
  }

  async searchOrders(query: string, limit: number = 50): Promise<Order[]> {
    const orders = await this.getOrders({ status: 'any', limit: 250 });
    const queryLower = query.toLowerCase();
    
    return orders.filter(order => 
      order.name.toLowerCase().includes(queryLower) ||
      order.email.toLowerCase().includes(queryLower) ||
      order.id.includes(query) ||
      order.customer?.email?.toLowerCase().includes(queryLower) ||
      order.customer?.firstName?.toLowerCase().includes(queryLower) ||
      order.customer?.lastName?.toLowerCase().includes(queryLower)
    ).slice(0, limit);
  }

  // ============================================================================
  // CUSTOMERS
  // ============================================================================

  async getCustomers(params: CustomerQueryParams = {}): Promise<Customer[]> {
    const queryParams = new URLSearchParams();
    
    if (params.email) queryParams.set('email', params.email);
    if (params.phone) queryParams.set('phone', params.phone);
    if (params.createdAtMin) queryParams.set('created_at_min', params.createdAtMin.toISOString());
    if (params.createdAtMax) queryParams.set('created_at_max', params.createdAtMax.toISOString());
    if (params.updatedAtMin) queryParams.set('updated_at_min', params.updatedAtMin.toISOString());
    if (params.updatedAtMax) queryParams.set('updated_at_max', params.updatedAtMax.toISOString());
    if (params.limit) queryParams.set('limit', String(params.limit));
    if (params.sinceId) queryParams.set('since_id', params.sinceId);
    if (params.ids) queryParams.set('ids', params.ids.join(','));
    if (params.tags) queryParams.set('tags', params.tags.join(','));

    const queryString = queryParams.toString();
    const endpoint = `/customers.json${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.request<{ customers: ShopifyCustomerResponse[] }>(endpoint);
    return response.customers.map(this.mapCustomer);
  }

  async getCustomer(id: string): Promise<Customer> {
    const response = await this.request<{ customer: ShopifyCustomerResponse }>(`/customers/${id}.json`);
    return this.mapCustomer(response.customer);
  }

  async getCustomerOrderCount(customerId: string): Promise<number> {
    const response = await this.request<{ count: number }>(`/customers/${customerId}/orders/count.json`);
    return response.count;
  }

  async getCustomerOrders(customerId: string, limit: number = 50): Promise<Order[]> {
    const response = await this.request<{ orders: ShopifyOrderResponse[] }>(
      `/customers/${customerId}/orders.json?limit=${limit}`
    );
    return response.orders.map(this.mapOrder);
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    if (query.includes('@')) {
      return this.getCustomers({ email: query });
    }
    
    const customers = await this.getCustomers({ limit: 250 });
    const queryLower = query.toLowerCase();
    
    return customers.filter(c =>
      c.email.toLowerCase().includes(queryLower) ||
      c.firstName?.toLowerCase().includes(queryLower) ||
      c.lastName?.toLowerCase().includes(queryLower) ||
      c.phone?.includes(query)
    );
  }

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  async getProducts(params: ProductQueryParams = {}): Promise<Product[]> {
    const queryParams = new URLSearchParams();
    
    if (params.status) queryParams.set('status', params.status.toLowerCase());
    if (params.vendor) queryParams.set('vendor', params.vendor);
    if (params.productType) queryParams.set('product_type', params.productType);
    if (params.createdAtMin) queryParams.set('created_at_min', params.createdAtMin.toISOString());
    if (params.createdAtMax) queryParams.set('created_at_max', params.createdAtMax.toISOString());
    if (params.updatedAtMin) queryParams.set('updated_at_min', params.updatedAtMin.toISOString());
    if (params.updatedAtMax) queryParams.set('updated_at_max', params.updatedAtMax.toISOString());
    if (params.limit) queryParams.set('limit', String(params.limit));
    if (params.sinceId) queryParams.set('since_id', params.sinceId);
    if (params.ids) queryParams.set('ids', params.ids.join(','));
    if (params.handle) queryParams.set('handle', params.handle);

    const queryString = queryParams.toString();
    const endpoint = `/products.json${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.request<{ products: ShopifyProductResponse[] }>(endpoint);
    return response.products.map(this.mapProduct);
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.request<{ product: ShopifyProductResponse }>(`/products/${id}.json`);
    return this.mapProduct(response.product);
  }

  async updateProduct(id: string, updates: ProductUpdate): Promise<Product> {
    const response = await this.request<{ product: ShopifyProductResponse }>(`/products/${id}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        product: {
          id,
          title: updates.title,
          body_html: updates.descriptionHtml,
          vendor: updates.vendor,
          product_type: updates.productType,
          status: updates.status?.toLowerCase(),
          tags: updates.tags?.join(', '),
        },
      }),
    });
    return this.mapProduct(response.product);
  }

  async searchProducts(query: string): Promise<Product[]> {
    const products = await this.getProducts({ limit: 250 });
    const queryLower = query.toLowerCase();
    
    return products.filter(p =>
      p.title.toLowerCase().includes(queryLower) ||
      p.handle.toLowerCase().includes(queryLower) ||
      p.vendor.toLowerCase().includes(queryLower) ||
      p.variants.some(v => v.sku?.toLowerCase().includes(queryLower))
    );
  }

  async getLowStockProducts(threshold: number = 5): Promise<Product[]> {
    const products = await this.getProducts({ status: 'ACTIVE', limit: 250 });
    
    return products.filter(p =>
      p.variants.some(v => v.inventoryQuantity <= threshold)
    );
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  async getShopMetrics(dateRange: DateRange): Promise<ShopMetrics> {
    const orders = await this.getOrders({
      status: 'any',
      createdAtMin: dateRange.start,
      createdAtMax: dateRange.end,
      limit: 250,
    });

    const paidOrders = orders.filter(o => o.financialStatus === 'paid' || o.financialStatus === 'partially_paid');
    
    const revenueToday = paidOrders.reduce((sum, order) => sum + parseFloat(order.totalPrice), 0);
    const averageOrderValue = paidOrders.length > 0 ? revenueToday / paidOrders.length : 0;

    const customerIds = new Set<string>();
    let newCustomersToday = 0;
    let returningCustomersToday = 0;

    for (const order of orders) {
      if (!customerIds.has(order.customer.id)) {
        customerIds.add(order.customer.id);
        if (order.customer.ordersCount <= 1) {
          newCustomersToday++;
        } else {
          returningCustomersToday++;
        }
      }
    }

    const productSales: Record<string, { productId: string; title: string; quantity: number; revenue: number }> = {};
    for (const order of paidOrders) {
      for (const item of order.lineItems) {
        const key = item.productId || item.title;
        if (!productSales[key]) {
          productSales[key] = {
            productId: item.productId || '',
            title: item.title,
            quantity: 0,
            revenue: 0,
          };
        }
        productSales[key].quantity += item.quantity;
        productSales[key].revenue += parseFloat(item.price) * item.quantity;
      }
    }

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      ordersToday: orders.length,
      revenueToday,
      averageOrderValue,
      newCustomersToday,
      returningCustomersToday,
      topProducts,
      currencyCode: orders[0]?.currency || 'EUR',
    };
  }

  async getDailyMetrics(): Promise<ShopMetrics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.getShopMetrics({ start: today, end: tomorrow });
  }

  async getWeeklyMetrics(): Promise<ShopMetrics> {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    
    return this.getShopMetrics({ start: weekAgo, end: today });
  }

  // ============================================================================
  // CONNECTION TEST
  // ============================================================================

  async testConnection(): Promise<{ success: boolean; shopName?: string; error?: string }> {
    try {
      const response = await this.request<{ shop: { name: string; email: string; domain: string } }>('/shop.json');
      return {
        success: true,
        shopName: response.shop.name,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ============================================================================
  // MAPPERS
  // ============================================================================

  private mapOrder(order: ShopifyOrderResponse): Order {
    return {
      id: String(order.id),
      name: order.name,
      email: order.email || '',
      createdAt: new Date(order.created_at),
      updatedAt: new Date(order.updated_at),
      fulfillmentStatus: order.fulfillment_status,
      financialStatus: order.financial_status,
      totalPrice: order.total_price,
      currency: order.currency,
      customer: {
        id: String(order.customer?.id || ''),
        email: order.customer?.email || order.email || '',
        firstName: order.customer?.first_name || null,
        lastName: order.customer?.last_name || null,
        phone: order.customer?.phone || null,
        ordersCount: order.customer?.orders_count || 0,
        totalSpent: order.customer?.total_spent || '0',
        createdAt: order.customer?.created_at ? new Date(order.customer.created_at) : new Date(),
        updatedAt: order.customer?.updated_at ? new Date(order.customer.updated_at) : new Date(),
        tags: order.customer?.tags ? order.customer.tags.split(', ') : [],
        acceptsMarketing: order.customer?.accepts_marketing || false,
      },
      lineItems: (order.line_items || []).map(item => ({
        id: String(item.id),
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
        variantId: item.variant_id ? String(item.variant_id) : null,
        productId: item.product_id ? String(item.product_id) : null,
      })),
      fulfillments: (order.fulfillments || []).map(f => ({
        id: String(f.id),
        status: f.status,
        createdAt: new Date(f.created_at),
        updatedAt: new Date(f.updated_at),
        trackingCompany: f.tracking_company,
        trackingNumber: f.tracking_number,
        trackingUrl: f.tracking_url,
      })),
      shippingAddress: order.shipping_address ? {
        address1: order.shipping_address.address1,
        address2: order.shipping_address.address2,
        city: order.shipping_address.city,
        province: order.shipping_address.province,
        country: order.shipping_address.country,
        zip: order.shipping_address.zip,
        phone: order.shipping_address.phone,
        firstName: order.shipping_address.first_name,
        lastName: order.shipping_address.last_name,
        company: order.shipping_address.company,
      } : undefined,
      billingAddress: order.billing_address ? {
        address1: order.billing_address.address1,
        address2: order.billing_address.address2,
        city: order.billing_address.city,
        province: order.billing_address.province,
        country: order.billing_address.country,
        zip: order.billing_address.zip,
        phone: order.billing_address.phone,
        firstName: order.billing_address.first_name,
        lastName: order.billing_address.last_name,
        company: order.billing_address.company,
      } : undefined,
      tags: order.tags ? order.tags.split(', ') : [],
      note: order.note,
    };
  }

  private mapCustomer(customer: ShopifyCustomerResponse): Customer {
    return {
      id: String(customer.id),
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone,
      ordersCount: customer.orders_count,
      totalSpent: customer.total_spent,
      createdAt: new Date(customer.created_at),
      updatedAt: new Date(customer.updated_at),
      tags: customer.tags ? customer.tags.split(', ') : [],
      acceptsMarketing: customer.accepts_marketing,
      defaultAddress: customer.default_address ? {
        address1: customer.default_address.address1,
        address2: customer.default_address.address2,
        city: customer.default_address.city,
        province: customer.default_address.province,
        country: customer.default_address.country,
        zip: customer.default_address.zip,
        phone: customer.default_address.phone,
        firstName: customer.default_address.first_name,
        lastName: customer.default_address.last_name,
        company: customer.default_address.company,
      } : undefined,
    };
  }

  private mapProduct(product: ShopifyProductResponse): Product {
    return {
      id: String(product.id),
      title: product.title,
      handle: product.handle,
      descriptionHtml: product.body_html || '',
      vendor: product.vendor,
      productType: product.product_type,
      status: product.status.toUpperCase() as 'ACTIVE' | 'ARCHIVED' | 'DRAFT',
      tags: product.tags ? product.tags.split(', ') : [],
      variants: (product.variants || []).map(v => ({
        id: String(v.id),
        title: v.title,
        sku: v.sku,
        price: v.price,
        compareAtPrice: v.compare_at_price,
        inventoryQuantity: v.inventory_quantity,
        weight: v.weight,
        weightUnit: v.weight_unit,
        barcode: v.barcode,
      })),
      images: (product.images || []).map(img => ({
        id: String(img.id),
        url: img.src,
        altText: img.alt,
        width: img.width,
        height: img.height,
      })),
      createdAt: new Date(product.created_at),
      updatedAt: new Date(product.updated_at),
    };
  }
}

// ============================================================================
// INTERNAL TYPES (Shopify API Response)
// ============================================================================

interface ShopifyOrderResponse {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  fulfillment_status: string | null;
  financial_status: string;
  total_price: string;
  currency: string;
  tags: string;
  note: string | null;
  customer?: {
    id: number;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    orders_count: number;
    total_spent: string;
    created_at: string;
    updated_at: string;
    tags: string;
    accepts_marketing: boolean;
  };
  line_items: Array<{
    id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string | null;
    variant_id: number | null;
    product_id: number | null;
  }>;
  fulfillments: Array<{
    id: number;
    status: string;
    created_at: string;
    updated_at: string;
    tracking_company: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
  }>;
  shipping_address?: ShopifyAddressResponse;
  billing_address?: ShopifyAddressResponse;
}

interface ShopifyAddressResponse {
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface ShopifyCustomerResponse {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  created_at: string;
  updated_at: string;
  tags: string;
  accepts_marketing: boolean;
  default_address?: ShopifyAddressResponse;
}

interface ShopifyProductResponse {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  status: string;
  tags: string;
  created_at: string;
  updated_at: string;
  variants: Array<{
    id: number;
    title: string;
    sku: string | null;
    price: string;
    compare_at_price: string | null;
    inventory_quantity: number;
    weight: number | null;
    weight_unit: string;
    barcode: string | null;
  }>;
  images: Array<{
    id: number;
    src: string;
    alt: string | null;
    width: number;
    height: number;
  }>;
}

export default ShopifyClient;
