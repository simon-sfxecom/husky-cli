/**
 * Emove Distribution Types
 *
 * Type definitions for emovedistribution.com integration
 * WooCommerce-based B2B parts supplier (Spanish locale)
 */

export interface EmoveConfig {
    username: string;
    password: string;
    baseUrl: string;
}

export interface EmoveLoginResult {
    success: boolean;
    cookies: string;
    error?: string;
}

export interface EmoveOrder {
    id: string;
    orderNumber: string;
    date: string;
    status: string;
    total: string;
    itemCount: number;
}

export interface EmoveOrderDetails extends EmoveOrder {
    invoiceUrl?: string;
    trackingNumber?: string;
    customer: {
        name: string;
        company?: string;
        address: string;
        city: string;
        postcode: string;
        email: string;
        phone?: string;
    };
    items: EmoveLineItem[];
    subtotal: string;
    shipping: string;
    tax: string;
    paymentMethod: string;
    shippingMethod?: string;
}

export interface EmoveLineItem {
    sku: string;
    name: string;
    quantity: number;
    price: string;
    total: string;
}

export interface EmoveProduct {
    id: string;
    name: string;
    sku?: string;
    price?: string;
    url: string;
    imageUrl?: string;
    stockStatus?: string;
    category?: string;
}
