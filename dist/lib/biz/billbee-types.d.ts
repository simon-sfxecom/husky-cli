/**
 * Billbee API Types
 * Full coverage from TigerV0 integrations
 */
export interface BillbeeConfig {
    API_KEY: string;
    USERNAME: string;
    PASSWORD: string;
    BASE_URL: string;
}
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
export interface Stock {
    Name: string;
    StockId: number;
    StockCurrent: number;
    StockWarning?: number;
    StockCode?: string;
    UnfulfilledAmount?: number;
    StockDesired?: number;
}
export interface ProductImage {
    Url: string;
    Id?: number;
    IsDefaultImage?: boolean;
    Position?: number;
}
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
export declare const OrderState: {
    readonly Ordered: 1;
    readonly Confirmed: 2;
    readonly Paid: 3;
    readonly Shipped: 4;
    readonly ReclamationOrReturn: 5;
    readonly Deleted: 6;
    readonly Completed: 7;
    readonly Cancelled: 8;
    readonly Archived: 9;
    readonly NotUsed: 10;
    readonly Demanded: 11;
    readonly PackingStarted: 12;
    readonly Ready: 13;
    readonly Clarification: 14;
    readonly Warning: 15;
};
export type OrderStateId = (typeof OrderState)[keyof typeof OrderState];
export declare const OrderStateLabels: Record<number, string>;
