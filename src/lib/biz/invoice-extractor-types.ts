/**
 * Invoice Extractor Types
 *
 * Common interfaces for all invoice extractors
 */

export interface ExtractorCredentials {
  username?: string;
  password?: string;
  apiKey?: string;
  baseUrl?: string;
  [key: string]: string | undefined;
}

export interface ExtractedOrder {
  id: string;
  orderNumber: string;
  date: string;
  status: string;
  total: string;
  hasInvoice: boolean;
  invoiceUrl?: string;
}

export interface ExtractedInvoiceFile {
  orderId: string;
  orderNumber: string;
  filename: string;
  localPath: string;
  invoiceDate?: string;
  amount?: number;
  currency: string;
  vendorName: string;
}

export interface ExtractionResult {
  success: boolean;
  ordersFound: number;
  invoicesExtracted: number;
  invoicesFailed: number;
  invoices: ExtractedInvoiceFile[];
  errors: string[];
}

export interface LoginResult {
  success: boolean;
  error?: string;
}

/**
 * Base interface for all invoice extractors
 */
export interface InvoiceExtractor {
  readonly extractorId: string;
  readonly name: string;

  /**
   * Initialize the extractor with credentials
   */
  init(credentials: ExtractorCredentials): Promise<void>;

  /**
   * Test if credentials are valid
   */
  testCredentials(): Promise<LoginResult>;

  /**
   * Get list of orders with invoice availability
   */
  listOrders(options?: { limit?: number }): Promise<ExtractedOrder[]>;

  /**
   * Download invoice for a specific order
   */
  downloadInvoice(orderId: string, savePath: string): Promise<ExtractedInvoiceFile | null>;

  /**
   * Extract all available invoices
   */
  extractAll(options?: {
    limit?: number;
    outputDir: string;
    onProgress?: (message: string) => void;
  }): Promise<ExtractionResult>;

  /**
   * Cleanup resources (close browser, etc.)
   */
  close(): Promise<void>;
}

/**
 * Invoice Source from API
 */
export interface InvoiceSourceData {
  id: string;
  name: string;
  type: "supplier" | "marketplace" | "service" | "bank";
  platform: "prestashop" | "woocommerce" | "shopify" | "api" | "custom";
  status: "active" | "needs_credentials" | "disabled" | "error";
  baseUrl?: string;
  extractorId: string;
  credentialsConfigured: boolean;
  lastExtractedAt?: string;
  lastExtractionError?: string;
  pendingInvoices: number;
  totalExtracted: number;
  autoExtract: boolean;
  extractionFrequency?: "daily" | "weekly" | "manual";
  gotessAutoUpload: boolean;
  gotessSenderMapping?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Extraction Job from API
 */
export interface ExtractionJobData {
  id: string;
  sourceId: string;
  sourceName: string;
  status: "pending" | "running" | "completed" | "failed";
  invoicesFound: number;
  invoicesExtracted: number;
  invoicesUploaded: number;
  invoicesFailed: number;
  logs: Array<{
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
    invoiceId?: string;
  }>;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  triggeredBy: "manual" | "scheduled" | "agent";
  workerId?: string;
}
