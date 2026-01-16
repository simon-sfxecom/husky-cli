/**
 * Invoice Extractor Registry
 *
 * Registers available extractors and provides factory methods
 */

import * as path from "path";
import * as fs from "fs";
import { homedir } from "os";
import {
  InvoiceExtractor,
  ExtractorCredentials,
  ExtractedOrder,
  ExtractedInvoiceFile,
  ExtractionResult,
  LoginResult,
} from "./invoice-extractor-types.js";
import { WattizPlaywrightClient } from "./wattiz-playwright.js";
import { SkuterzonePlaywrightClient } from "./skuterzone-playwright.js";
import { EmovePlaywrightClient } from "./emove-playwright.js";
import { getConfig } from "../../commands/config.js";

/**
 * Wattiz Extractor Adapter
 */
class WattizExtractor implements InvoiceExtractor {
  readonly extractorId = "wattiz";
  readonly name = "Wattiz";
  private client?: WattizPlaywrightClient;

  async init(credentials: ExtractorCredentials): Promise<void> {
    if (credentials.username && credentials.password) {
      // Use provided credentials
      this.client = new WattizPlaywrightClient({
        username: credentials.username,
        password: credentials.password,
        baseUrl: credentials.baseUrl || "https://www.wattiz.fr",
        language: "gb",
      });
    } else {
      // Use config
      this.client = WattizPlaywrightClient.fromConfig();
    }
  }

  async testCredentials(): Promise<LoginResult> {
    if (!this.client) throw new Error("Extractor not initialized");
    const result = await this.client.login();
    return { success: result.success, error: result.error };
  }

  async listOrders(options?: { limit?: number }): Promise<ExtractedOrder[]> {
    if (!this.client) throw new Error("Extractor not initialized");
    await this.client.login();
    const orders = await this.client.listOrders();
    const limited = options?.limit ? orders.slice(0, options.limit) : orders;

    // Get invoice availability for each order
    const result: ExtractedOrder[] = [];
    for (const order of limited) {
      const details = await this.client.getOrder(order.id);
      result.push({
        id: order.id,
        orderNumber: order.orderNumber,
        date: order.date,
        status: order.status,
        total: order.total,
        hasInvoice: !!details.invoiceUrl,
        invoiceUrl: details.invoiceUrl,
      });
    }
    return result;
  }

  async downloadInvoice(orderId: string, savePath: string): Promise<ExtractedInvoiceFile | null> {
    if (!this.client) throw new Error("Extractor not initialized");
    const success = await this.client.downloadInvoice(orderId, savePath);
    if (!success) return null;

    const order = await this.client.getOrder(orderId);
    return {
      orderId,
      orderNumber: order.orderNumber,
      filename: path.basename(savePath),
      localPath: savePath,
      invoiceDate: order.date,
      currency: "EUR",
      vendorName: "Wattiz",
    };
  }

  async extractAll(options: {
    limit?: number;
    outputDir: string;
    onProgress?: (message: string) => void;
  }): Promise<ExtractionResult> {
    if (!this.client) throw new Error("Extractor not initialized");

    const result: ExtractionResult = {
      success: false,
      ordersFound: 0,
      invoicesExtracted: 0,
      invoicesFailed: 0,
      invoices: [],
      errors: [],
    };

    try {
      options.onProgress?.("Logging in to Wattiz...");
      await this.client.login();

      options.onProgress?.("Fetching orders...");
      const orders = await this.listOrders({ limit: options.limit });
      result.ordersFound = orders.length;

      const ordersWithInvoice = orders.filter((o) => o.hasInvoice);
      options.onProgress?.(
        `Found ${ordersWithInvoice.length}/${orders.length} orders with invoices`
      );

      // Ensure output directory exists
      if (!fs.existsSync(options.outputDir)) {
        fs.mkdirSync(options.outputDir, { recursive: true });
      }

      for (const order of ordersWithInvoice) {
        const filename = `wattiz-${order.orderNumber}-invoice.pdf`;
        const savePath = path.join(options.outputDir, filename);

        options.onProgress?.(`Downloading invoice for order ${order.orderNumber}...`);

        try {
          const invoice = await this.downloadInvoice(order.id, savePath);
          if (invoice) {
            result.invoices.push(invoice);
            result.invoicesExtracted++;
          } else {
            result.invoicesFailed++;
            result.errors.push(`Failed to download invoice for order ${order.orderNumber}`);
          }
        } catch (error) {
          result.invoicesFailed++;
          result.errors.push(
            `Error downloading invoice for order ${order.orderNumber}: ${(error as Error).message}`
          );
        }
      }

      result.success = result.invoicesFailed === 0;
    } catch (error) {
      result.errors.push(`Extraction failed: ${(error as Error).message}`);
    }

    return result;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}

/**
 * Skuterzone Extractor Adapter
 */
class SkuterzoneExtractor implements InvoiceExtractor {
  readonly extractorId = "skuterzone";
  readonly name = "Skuterzone Pro";
  private client?: SkuterzonePlaywrightClient;

  async init(credentials: ExtractorCredentials): Promise<void> {
    if (credentials.username && credentials.password) {
      this.client = new SkuterzonePlaywrightClient({
        username: credentials.username,
        password: credentials.password,
        baseUrl: credentials.baseUrl || "https://skuterzonepro.com",
      });
    } else {
      this.client = SkuterzonePlaywrightClient.fromConfig();
    }
  }

  async testCredentials(): Promise<LoginResult> {
    if (!this.client) throw new Error("Extractor not initialized");
    const result = await this.client.login();
    return { success: result.success, error: result.error };
  }

  async listOrders(options?: { limit?: number }): Promise<ExtractedOrder[]> {
    if (!this.client) throw new Error("Extractor not initialized");
    await this.client.login();
    const orders = await this.client.listOrders();
    const limited = options?.limit ? orders.slice(0, options.limit) : orders;

    const result: ExtractedOrder[] = [];
    for (const order of limited) {
      const details = await this.client.getOrder(order.id);
      result.push({
        id: order.id,
        orderNumber: order.orderNumber,
        date: order.date,
        status: order.status,
        total: order.total,
        hasInvoice: !!details.invoiceUrl,
        invoiceUrl: details.invoiceUrl,
      });
    }
    return result;
  }

  async downloadInvoice(orderId: string, savePath: string): Promise<ExtractedInvoiceFile | null> {
    if (!this.client) throw new Error("Extractor not initialized");
    const success = await this.client.downloadInvoice(orderId, savePath);
    if (!success) return null;

    const order = await this.client.getOrder(orderId);
    return {
      orderId,
      orderNumber: order.orderNumber,
      filename: path.basename(savePath),
      localPath: savePath,
      invoiceDate: order.date,
      currency: "EUR",
      vendorName: "Skuterzone Pro",
    };
  }

  async extractAll(options: {
    limit?: number;
    outputDir: string;
    onProgress?: (message: string) => void;
  }): Promise<ExtractionResult> {
    if (!this.client) throw new Error("Extractor not initialized");

    const result: ExtractionResult = {
      success: false,
      ordersFound: 0,
      invoicesExtracted: 0,
      invoicesFailed: 0,
      invoices: [],
      errors: [],
    };

    try {
      options.onProgress?.("Logging in to Skuterzone Pro...");
      await this.client.login();

      options.onProgress?.("Fetching orders...");
      const orders = await this.listOrders({ limit: options.limit });
      result.ordersFound = orders.length;

      const ordersWithInvoice = orders.filter((o) => o.hasInvoice);
      options.onProgress?.(
        `Found ${ordersWithInvoice.length}/${orders.length} orders with invoices`
      );

      if (!fs.existsSync(options.outputDir)) {
        fs.mkdirSync(options.outputDir, { recursive: true });
      }

      for (const order of ordersWithInvoice) {
        const filename = `skuterzone-${order.orderNumber}-invoice.pdf`;
        const savePath = path.join(options.outputDir, filename);

        options.onProgress?.(`Downloading invoice for order ${order.orderNumber}...`);

        try {
          const invoice = await this.downloadInvoice(order.id, savePath);
          if (invoice) {
            result.invoices.push(invoice);
            result.invoicesExtracted++;
          } else {
            result.invoicesFailed++;
            result.errors.push(`Failed to download invoice for order ${order.orderNumber}`);
          }
        } catch (error) {
          result.invoicesFailed++;
          result.errors.push(
            `Error downloading invoice for order ${order.orderNumber}: ${(error as Error).message}`
          );
        }
      }

      result.success = result.invoicesFailed === 0;
    } catch (error) {
      result.errors.push(`Extraction failed: ${(error as Error).message}`);
    }

    return result;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}

/**
 * Emove Extractor Adapter
 */
class EmoveExtractor implements InvoiceExtractor {
  readonly extractorId = "emove";
  readonly name = "Emove Distribution";
  private client?: EmovePlaywrightClient;

  async init(credentials: ExtractorCredentials): Promise<void> {
    if (credentials.username && credentials.password) {
      this.client = new EmovePlaywrightClient({
        username: credentials.username,
        password: credentials.password,
        baseUrl: credentials.baseUrl || "https://www.emove-distribution.com",
      });
    } else {
      this.client = EmovePlaywrightClient.fromConfig();
    }
  }

  async testCredentials(): Promise<LoginResult> {
    if (!this.client) throw new Error("Extractor not initialized");
    const result = await this.client.login();
    return { success: result.success, error: result.error };
  }

  async listOrders(options?: { limit?: number }): Promise<ExtractedOrder[]> {
    if (!this.client) throw new Error("Extractor not initialized");
    await this.client.login();
    const orders = await this.client.listOrders();
    const limited = options?.limit ? orders.slice(0, options.limit) : orders;

    const result: ExtractedOrder[] = [];
    for (const order of limited) {
      const details = await this.client.getOrder(order.id);
      result.push({
        id: order.id,
        orderNumber: order.orderNumber,
        date: order.date,
        status: order.status,
        total: order.total,
        hasInvoice: !!details.invoiceUrl,
        invoiceUrl: details.invoiceUrl,
      });
    }
    return result;
  }

  async downloadInvoice(orderId: string, savePath: string): Promise<ExtractedInvoiceFile | null> {
    if (!this.client) throw new Error("Extractor not initialized");
    const success = await this.client.downloadInvoice(orderId, savePath);
    if (!success) return null;

    const order = await this.client.getOrder(orderId);
    return {
      orderId,
      orderNumber: order.orderNumber,
      filename: path.basename(savePath),
      localPath: savePath,
      invoiceDate: order.date,
      currency: "EUR",
      vendorName: "Emove Distribution",
    };
  }

  async extractAll(options: {
    limit?: number;
    outputDir: string;
    onProgress?: (message: string) => void;
  }): Promise<ExtractionResult> {
    if (!this.client) throw new Error("Extractor not initialized");

    const result: ExtractionResult = {
      success: false,
      ordersFound: 0,
      invoicesExtracted: 0,
      invoicesFailed: 0,
      invoices: [],
      errors: [],
    };

    try {
      options.onProgress?.("Logging in to Emove Distribution...");
      await this.client.login();

      options.onProgress?.("Fetching orders...");
      const orders = await this.listOrders({ limit: options.limit });
      result.ordersFound = orders.length;

      const ordersWithInvoice = orders.filter((o) => o.hasInvoice);
      options.onProgress?.(
        `Found ${ordersWithInvoice.length}/${orders.length} orders with invoices`
      );

      if (!fs.existsSync(options.outputDir)) {
        fs.mkdirSync(options.outputDir, { recursive: true });
      }

      for (const order of ordersWithInvoice) {
        const filename = `emove-${order.orderNumber}-invoice.pdf`;
        const savePath = path.join(options.outputDir, filename);

        options.onProgress?.(`Downloading invoice for order ${order.orderNumber}...`);

        try {
          const invoice = await this.downloadInvoice(order.id, savePath);
          if (invoice) {
            result.invoices.push(invoice);
            result.invoicesExtracted++;
          } else {
            result.invoicesFailed++;
            result.errors.push(`Failed to download invoice for order ${order.orderNumber}`);
          }
        } catch (error) {
          result.invoicesFailed++;
          result.errors.push(
            `Error downloading invoice for order ${order.orderNumber}: ${(error as Error).message}`
          );
        }
      }

      result.success = result.invoicesFailed === 0;
    } catch (error) {
      result.errors.push(`Extraction failed: ${(error as Error).message}`);
    }

    return result;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}

/**
 * Registry of available extractors
 */
const EXTRACTORS: Record<string, new () => InvoiceExtractor> = {
  wattiz: WattizExtractor,
  skuterzone: SkuterzoneExtractor,
  emove: EmoveExtractor,
};

/**
 * Get an extractor by ID
 */
export function getExtractor(extractorId: string): InvoiceExtractor | null {
  const ExtractorClass = EXTRACTORS[extractorId];
  if (!ExtractorClass) return null;
  return new ExtractorClass();
}

/**
 * Get all available extractor IDs
 */
export function getAvailableExtractorIds(): string[] {
  return Object.keys(EXTRACTORS);
}

/**
 * Check if credentials are configured for an extractor
 */
export function hasCredentialsConfigured(extractorId: string): boolean {
  const config = getConfig();

  switch (extractorId) {
    case "wattiz":
      return !!(config.wattizUsername && config.wattizPassword);
    case "skuterzone":
      return !!(config.skuterzoneUsername && config.skuterzonePassword);
    case "emove":
      return !!(config.emoveUsername && config.emovePassword);
    default:
      return false;
  }
}

/**
 * Get default output directory for invoices
 */
export function getDefaultInvoiceDir(): string {
  return path.join(homedir(), "Downloads", "invoices");
}
