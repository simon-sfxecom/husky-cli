/**
 * Skuterzone Pro Types
 *
 * Type definitions for skuterzonepro.com integration
 * WooCommerce-based B2B parts supplier
 */

export interface SkuterzoneConfig {
    username: string;
    password: string;
    baseUrl: string;
}

export interface LoginResult {
    success: boolean;
    cookies: string;
    error?: string;
}

export interface SkuterzoneOrder {
    id: string;
    orderNumber: string;
    date: string;
    status: string;
    total: string;
    itemCount: number;
}

export interface SkuterzoneOrderDetails extends SkuterzoneOrder {
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
    items: SkuterzoneLineItem[];
    subtotal: string;
    shipping: string;
    tax: string;
    paymentMethod: string;
    shippingMethod?: string;
}

export interface SkuterzoneLineItem {
    sku: string;
    name: string;
    quantity: number;
    price: string;
    total: string;
}

export interface SkuterzoneProduct {
    id: string;
    name: string;
    sku?: string;
    price?: string;
    url: string;
    imageUrl?: string;
    stockStatus?: string;
    category?: string;
}
