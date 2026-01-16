/**
 * GCS Upload Client
 *
 * Uploads extracted invoice PDFs to Google Cloud Storage
 *
 * Structure:
 * gs://husky-invoices/
 * └── partners/
 *     └── suppliers/
 *         └── {sourceId}/                    # Firestore InvoiceSource doc ID
 *             └── {extractedInvoiceId}.pdf   # Firestore ExtractedInvoice doc ID
 */

import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import * as path from "path";
import { getConfig } from "../../commands/config.js";

// Default bucket for invoice PDFs
const DEFAULT_BUCKET = "husky-invoices";

// Base path structure
const PARTNERS_SUPPLIERS_PATH = "partners/suppliers";

interface UploadResult {
  success: boolean;
  gcsUri?: string;
  gcsPath?: string;  // Path within bucket (for storing in Firestore)
  publicUrl?: string;
  error?: string;
}

interface UploadOptions {
  bucket?: string;
  prefix?: string;
  makePublic?: boolean;
  metadata?: Record<string, string>;
}

/**
 * GCS Upload Client for invoice PDFs
 */
export class GCSUploadClient {
  private storage: Storage;
  private bucketName: string;

  constructor(bucketName?: string) {
    const config = getConfig();
    this.bucketName = bucketName || config.gcsBucket || process.env.GCS_INVOICE_BUCKET || DEFAULT_BUCKET;

    // Initialize storage client
    // Uses Application Default Credentials (ADC) in Cloud Run
    // Or GOOGLE_APPLICATION_CREDENTIALS env var locally
    this.storage = new Storage();
  }

  /**
   * Upload a single file to GCS
   */
  async uploadFile(
    localPath: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    try {
      if (!fs.existsSync(localPath)) {
        return { success: false, error: `File not found: ${localPath}` };
      }

      const bucket = this.storage.bucket(options.bucket || this.bucketName);
      const filename = path.basename(localPath);
      const destination = options.prefix
        ? `${options.prefix}/${filename}`
        : filename;

      const uploadOptions: {
        destination: string;
        metadata?: { metadata: Record<string, string> };
      } = {
        destination,
      };

      if (options.metadata) {
        uploadOptions.metadata = { metadata: options.metadata };
      }

      await bucket.upload(localPath, uploadOptions);

      const gcsUri = `gs://${this.bucketName}/${destination}`;
      let publicUrl: string | undefined;

      if (options.makePublic) {
        const file = bucket.file(destination);
        await file.makePublic();
        publicUrl = `https://storage.googleapis.com/${this.bucketName}/${destination}`;
      }

      return { success: true, gcsUri, gcsPath: destination, publicUrl };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Upload multiple files to GCS
   */
  async uploadFiles(
    localPaths: string[],
    options: UploadOptions = {}
  ): Promise<{ results: UploadResult[]; successCount: number; failCount: number }> {
    const results: UploadResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const localPath of localPaths) {
      const result = await this.uploadFile(localPath, options);
      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    return { results, successCount, failCount };
  }

  /**
   * Upload invoice using Firestore IDs for path structure
   * Path: partners/suppliers/{sourceId}/{invoiceId}.pdf
   */
  async uploadInvoiceById(
    localPath: string,
    options: {
      sourceId: string;           // Firestore InvoiceSource doc ID
      extractedInvoiceId: string; // Firestore ExtractedInvoice doc ID
      metadata?: Record<string, string>;
    }
  ): Promise<UploadResult> {
    const prefix = `${PARTNERS_SUPPLIERS_PATH}/${options.sourceId}`;
    const filename = `${options.extractedInvoiceId}.pdf`;

    return this.uploadFile(localPath, {
      prefix,
      metadata: {
        sourceId: options.sourceId,
        extractedInvoiceId: options.extractedInvoiceId,
        uploadedAt: new Date().toISOString(),
        ...options.metadata,
      },
    });
  }

  /**
   * Upload invoice with source name (legacy/fallback)
   * Creates a temp ID if Firestore IDs not available
   */
  async uploadInvoice(
    localPath: string,
    options: {
      source: string;      // e.g., "wattiz", "skuterzone"
      orderNumber: string;
      invoiceDate?: string; // YYYY-MM-DD
      sourceId?: string;    // Optional Firestore ID
      extractedInvoiceId?: string; // Optional Firestore ID
    }
  ): Promise<UploadResult> {
    // If we have Firestore IDs, use the ID-based path
    if (options.sourceId && options.extractedInvoiceId) {
      return this.uploadInvoiceById(localPath, {
        sourceId: options.sourceId,
        extractedInvoiceId: options.extractedInvoiceId,
        metadata: {
          sourceName: options.source,
          orderNumber: options.orderNumber,
          invoiceDate: options.invoiceDate || "",
        },
      });
    }

    // Fallback: use source name + order number as identifier
    const tempId = `${options.source}-${options.orderNumber}-${Date.now()}`;
    const prefix = `${PARTNERS_SUPPLIERS_PATH}/${options.source}`;

    return this.uploadFile(localPath, {
      prefix,
      metadata: {
        sourceName: options.source,
        orderNumber: options.orderNumber,
        invoiceDate: options.invoiceDate || "",
        uploadedAt: new Date().toISOString(),
        tempId,
      },
    });
  }

  /**
   * List files in bucket with prefix
   */
  async listFiles(prefix?: string): Promise<string[]> {
    const bucket = this.storage.bucket(this.bucketName);
    const [files] = await bucket.getFiles({ prefix });
    return files.map((f) => f.name);
  }

  /**
   * Check if bucket exists and is accessible
   */
  async checkAccess(): Promise<{ accessible: boolean; error?: string }> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [exists] = await bucket.exists();
      if (!exists) {
        return { accessible: false, error: `Bucket ${this.bucketName} does not exist` };
      }
      // Try to list files to verify permissions
      await bucket.getFiles({ maxResults: 1 });
      return { accessible: true };
    } catch (error) {
      return { accessible: false, error: (error as Error).message };
    }
  }

  /**
   * Get signed URL for temporary access to a file
   */
  async getSignedUrl(
    gcsPath: string,
    expiresInMinutes: number = 60
  ): Promise<string | null> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(gcsPath);

      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + expiresInMinutes * 60 * 1000,
      });

      return url;
    } catch (error) {
      console.error("Error generating signed URL:", error);
      return null;
    }
  }

  getBucketName(): string {
    return this.bucketName;
  }
}

/**
 * Create GCS upload client from config
 */
export function createGCSClient(bucketName?: string): GCSUploadClient {
  return new GCSUploadClient(bucketName);
}

export default GCSUploadClient;
