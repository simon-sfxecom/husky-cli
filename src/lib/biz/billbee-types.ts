/**
 * Billbee API Types
 * Full coverage from TigerV0 integrations
 */

// ============================================================================
// Configuration
// ============================================================================

export interface BillbeeConfig {
    API_KEY: string;
    USERNAME: string;
    PASSWORD: string;
    BASE_URL: string;
}

// ============================================================================
// Pagination
// ============================================================================

export interface Paging {
    Page: number;
    TotalPages: number;
    TotalRows: number;
    PageSize: number;
}

export interface BillbeePaginatedResponse<T> {
    Paging: Paging;
    Data: T[];
}

export interface BillbeeResponse<T> {
    Data: T;
}

// ============================================================================
// Address
// ============================================================================

export interface Address {
    BillbeeId?: number;
    FirstName?: string;
    LastName?: string;
    Company?: string;
    NameAddition?: string;
    Street?: string;
    HouseNumber?: string;
    Zip?: string;
    City?: string;
    State?: string;
    CountryISO2?: string;
    Country?: string;
    Email?: string;
    Phone?: string;
}

// ============================================================================
// Order Item
// ============================================================================

export interface OrderItem {
    BillbeeId?: number;
    TransactionId?: string;
    Product?: {
        Id?: string;
        Title?: string;
        Weight?: number;
        SKU?: string;
        EAN?: string;
    };
    Quantity: number;
    TotalPrice: number;
    TaxAmount?: number;
    TaxIndex?: number;
    Discount?: number;
    Attributes?: Array<{
        Id?: string;
        Name?: string;
        Value?: string;
    }>;
}

// ============================================================================
// Payment
// ============================================================================

export interface Payment {
    BillbeeId?: number;
    TransactionId?: string;
    PayDate?: string;
    PaymentType?: number;
    SourceTechnology?: string;
    SourceText?: string;
    PayValue?: number;
    Purpose?: string;
    Name?: string;
}

// ============================================================================
// Order
// ============================================================================

export interface Order {
    BillbeeId?: number;
    Id: number | null;
    BillBeeOrderId?: number;
    OrderNumber: string | null;
    State?: number;
    VatMode?: number;
    CreatedAt?: string;
    ShippedAt?: string;
    ConfirmedAt?: string;
    PayedAt?: string;
    SellerComment?: string;
    Comments?: Array<{
        Id?: number;
        FromCustomer?: boolean;
        Text?: string;
        Name?: string;
        Created?: string;
    }>;
    InvoiceNumber?: string;
    InvoiceCreatedAt?: string;
    InvoiceDate?: string;
    Currency?: string;
    UpdatedAt?: string;
    TaxRate1?: number;
    TaxRate2?: number;
    TotalCost?: number;
    ShippingCost?: number;
    OrderItems?: OrderItem[];
    Seller?: {
        Platform?: string;
        BillbeeShopName?: string;
        BillbeeShopId?: number;
    };
    Buyer?: {
        BillbeeId?: number;
        Email?: string;
    };
    InvoiceAddress?: Address;
    ShippingAddress?: Address;
    Payments?: Payment[];
    Tags?: string[];
}

export interface OrdersQueryParams {
    page?: number;
    pageSize?: number;
    minOrderDate?: string;
    maxOrderDate?: string;
    shopId?: number[];
    orderStateId?: number[];
    tag?: string[];
    minPayDate?: string;
    maxPayDate?: string;
    includePositions?: boolean;
}

// ============================================================================
// Stock
// ============================================================================

export interface Stock {
    Name: string;
    StockId: number;
    StockCurrent: number;
    StockWarning?: number;
    StockCode?: string;
    UnfulfilledAmount?: number;
    StockDesired?: number;
}

// ============================================================================
// Product Image
// ============================================================================

export interface ProductImage {
    Url: string;
    Id?: number;
    IsDefaultImage?: boolean;
    Position?: number;
}

// ============================================================================
// Product Source
// ============================================================================

export interface ProductSource {
    Id?: number;
    Source?: string;
    SourceId?: string;
    ApiAccountName?: string;
    ApiAccountId?: number;
    ExportFactor?: number;
    StockSyncInactive?: boolean;
    StockSyncMin?: number;
    StockSyncMax?: number;
    UnitsPerItem?: number;
}

// ============================================================================
// Product
// ============================================================================

export interface Product {
    Id?: number;
    Title?: string;
    InvoiceText?: string;
    ShortDescription?: string;
    Description?: string;
    SKU?: string;
    EAN?: string;
    TaricNumber?: string;
    CountryOfOrigin?: string;
    Price?: number;
    CostPrice?: number;
    VAT?: string;
    VATIndex?: number;
    Weight?: number;
    WeightNet?: number;
    LowStock?: boolean;
    StockCurrent?: number;
    StockDesired?: number;
    StockWarning?: number;
    Stocks?: Stock[];
    Images?: ProductImage[];
    Manufacturer?: string;
    Type?: number;
    Category1?: string;
    Category2?: string;
    Category3?: string;
    Unit?: number;
    UnitsPerItem?: number;
    SoldAmountLast30Days?: number;
    Sources?: ProductSource[];
    IsDigital?: boolean;
    IsCustomizable?: boolean;
    DeliveryTime?: number;
    Recipient?: number;
    Occasion?: number;
    Condition?: number;
    WidthCm?: number;
    LengthCm?: number;
    HeightCm?: number;
    BillOfMaterial?: Array<{
        ProductId?: number;
        Amount?: number;
        ArticleId?: number;
        SKU?: string;
    }>;
}

export interface ProductsQueryParams {
    page?: number;
    pageSize?: number;
    minCreatedAt?: string;
    type?: number;
    includeCategories?: boolean;
}

export interface ProductUpdate {
    Title?: string;
    InvoiceText?: string;
    ShortDescription?: string;
    Description?: string;
    SKU?: string;
    EAN?: string;
    TaricNumber?: string;
    CountryOfOrigin?: string;
    Price?: number;
    CostPrice?: number;
    VAT?: string;
    VATIndex?: number;
    Weight?: number;
    WeightNet?: number;
    Manufacturer?: string;
    Type?: number;
    Category1?: string;
    Category2?: string;
    Category3?: string;
    Unit?: number;
    UnitsPerItem?: number;
    Images?: ProductImage[];
    IsDigital?: boolean;
    IsCustomizable?: boolean;
    DeliveryTime?: number;
    WidthCm?: number;
    LengthCm?: number;
    HeightCm?: number;
    LowStock?: boolean;
    StockDesired?: number;
    StockWarning?: number;
}

// ============================================================================
// Order States
// ============================================================================

export const OrderState = {
    Ordered: 1,
    Confirmed: 2,
    Paid: 3,
    Shipped: 4,
    ReclamationOrReturn: 5,
    Deleted: 6,
    Completed: 7,
    Cancelled: 8,
    Archived: 9,
    NotUsed: 10,
    Demanded: 11,
    PackingStarted: 12,
    Ready: 13,
    Clarification: 14,
    Warning: 15,
} as const;

export type OrderStateId = (typeof OrderState)[keyof typeof OrderState];

export const OrderStateLabels: Record<number, string> = {
    1: 'ordered',
    2: 'confirmed',
    3: 'paid',
    4: 'shipped',
    5: 'return',
    6: 'deleted',
    7: 'completed',
    8: 'cancelled',
    9: 'archived',
    10: 'not_used',
    11: 'demanded',
    12: 'packing',
    13: 'ready',
    14: 'clarification',
    15: 'warning',
};
