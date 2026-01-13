/**
 * Wattiz Types
 *
 * TypeScript interfaces for wattiz.fr (B2B e-mobility parts supplier - PrestaShop)
 */

// Configuration
export interface WattizConfig {
    username: string;
    password: string;
    baseUrl: string; // https://www.wattiz.fr
    language: 'gb' | 'fr' | 'de' | 'es'; // Language prefix
}

// Scraped Order Data
export interface WattizOrder {
    id: string;                // Order ID
    orderNumber: string;       // Display number (e.g., "WATTIZFR202501001")
    date: string;              // Order date
    status: string;            // Order status
    total: string;             // Total amount with currency
    itemCount: number;         // Number of line items
    invoiceUrl?: string;       // PDF download link (if available)
}

// Scraped Order Details
export interface WattizOrderDetails extends WattizOrder {
    customer: {
        name: string;
        company?: string;
        address: string;
        city: string;
        postcode: string;
        email: string;
        phone?: string;
    };
    items: WattizLineItem[];
    subtotal: string;
    shipping: string;
    tax: string;
    paymentMethod: string;
    shippingMethod?: string;
    trackingNumber?: string;
}

export interface WattizLineItem {
    sku: string;
    name: string;
    quantity: number;
    price: string;
    total: string;
}

// Scraped Product Data
export interface WattizProduct {
    id: string;
    name: string;
    sku?: string;
    ean?: string;              // EAN13 barcode
    price?: string;            // May be hidden for non-logged-in users (B2B)
    url: string;               // Product detail page URL
    imageUrl?: string;
    stockStatus?: string;      // "In Stock", "Out of Stock", etc.
    category?: string;
}

// Authentication Result
export interface WattizLoginResult {
    success: boolean;
    cookies: string;         // Serialized cookie header
    error?: string;
}
