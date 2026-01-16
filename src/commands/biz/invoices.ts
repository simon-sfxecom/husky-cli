/**
 * Husky Biz Invoices Command
 *
 * Unified invoice extraction service
 * - List and manage invoice sources
 * - Extract invoices from all configured sources
 * - Auto-upload to Gotess for transaction matching
 */

import { Command } from "commander";
import { getConfig } from "../config.js";
import {
  getExtractor,
  getAvailableExtractorIds,
  hasCredentialsConfigured,
  getDefaultInvoiceDir,
} from "../../lib/biz/invoice-extractor-registry.js";
import {
  InvoiceSourceData,
  ExtractionJobData,
  ExtractedInvoiceFile,
} from "../../lib/biz/invoice-extractor-types.js";
import { GotessClient } from "../../lib/biz/gotess.js";
import { GCSUploadClient } from "../../lib/biz/gcs-upload.js";
import * as path from "path";
import * as fs from "fs";

export const invoicesCommand = new Command("invoices")
  .description("Unified invoice extraction service");

// Helper: Get API URL and key
function getApiConfig() {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("✗ API URL not configured. Run: husky config set api-url <url>");
    process.exit(1);
  }
  return { apiUrl: config.apiUrl, apiKey: config.apiKey };
}

// Helper: Fetch from API
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const { apiUrl, apiKey } = getApiConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response.json();
}

// ============================================================================
// husky biz invoices sources
// ============================================================================

invoicesCommand
  .command("sources")
  .description("List all invoice sources")
  .option("--json", "Output as JSON")
  .option("--seed", "Seed default sources if none exist")
  .action(async (options) => {
    try {
      if (options.seed) {
        console.log("Seeding default invoice sources...");
        const result = await fetchApi<{ seeded: number }>("/api/invoice-sources", {
          method: "POST",
          body: JSON.stringify({ action: "seed" }),
        });
        console.log(`✓ Seeded ${result.seeded} invoice sources`);
        if (result.seeded === 0) {
          console.log("  (Sources already exist, no action taken)");
        }
        return;
      }

      const sources = await fetchApi<InvoiceSourceData[]>("/api/invoice-sources");

      if (options.json) {
        console.log(JSON.stringify(sources, null, 2));
        return;
      }

      if (sources.length === 0) {
        console.log("\n  No invoice sources configured.");
        console.log("  Run: husky biz invoices sources --seed\n");
        return;
      }

      console.log(`\n  📄 Invoice Sources (${sources.length})\n`);

      // Header
      console.log(
        `  ${"Name".padEnd(20)} │ ` +
        `${"Type".padEnd(12)} │ ` +
        `${"Status".padEnd(18)} │ ` +
        `${"Last Extracted".padEnd(20)} │ ` +
        `${"Total"}`
      );
      console.log("  " + "─".repeat(90));

      // Sources
      for (const source of sources) {
        const statusIcon = {
          active: "✓",
          needs_credentials: "🔑",
          disabled: "⏸",
          error: "⚠",
        }[source.status];

        const lastExtracted = source.lastExtractedAt
          ? new Date(source.lastExtractedAt).toLocaleDateString()
          : "Never";

        // Check local credentials
        const hasLocalCreds = hasCredentialsConfigured(source.extractorId);
        const credStatus = hasLocalCreds ? "✓ creds" : "✗ creds";

        console.log(
          `  ${source.name.padEnd(20)} │ ` +
          `${source.type.padEnd(12)} │ ` +
          `${statusIcon} ${source.status.padEnd(15)} │ ` +
          `${lastExtracted.padEnd(20)} │ ` +
          `${source.totalExtracted} (${credStatus})`
        );
      }
      console.log("");
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// ============================================================================
// husky biz invoices status
// ============================================================================

invoicesCommand
  .command("status")
  .description("Show extraction status for all sources")
  .action(async () => {
    try {
      const sources = await fetchApi<InvoiceSourceData[]>("/api/invoice-sources");
      const jobs = await fetchApi<ExtractionJobData[]>("/api/extraction-jobs?limit=10");

      console.log("\n  📊 Invoice Extraction Status\n");

      // Summary
      const activeCount = sources.filter((s) => s.status === "active").length;
      const needsCredsCount = sources.filter((s) => s.status === "needs_credentials").length;

      console.log(`  Active sources:      ${activeCount}/${sources.length}`);
      console.log(`  Need credentials:    ${needsCredsCount}`);
      console.log("");

      // Check local credentials status
      console.log("  Local Credentials Status:");
      for (const source of sources) {
        const hasLocalCreds = hasCredentialsConfigured(source.extractorId);
        const icon = hasLocalCreds ? "✓" : "✗";
        console.log(`    ${icon} ${source.name} (${source.extractorId})`);
      }
      console.log("");

      // Recent jobs
      if (jobs.length > 0) {
        console.log("  Recent Extraction Jobs:");
        for (const job of jobs.slice(0, 5)) {
          const statusIcon = {
            pending: "⏳",
            running: "🔄",
            completed: "✓",
            failed: "✗",
          }[job.status];
          const date = new Date(job.startedAt).toLocaleDateString();
          console.log(
            `    ${statusIcon} ${job.sourceName} - ${job.status} (${date}) - ${job.invoicesExtracted} extracted`
          );
        }
      } else {
        console.log("  No extraction jobs yet.");
      }
      console.log("");
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// ============================================================================
// husky biz invoices extract
// ============================================================================

invoicesCommand
  .command("extract [source]")
  .description("Extract invoices from source(s)")
  .option("--all", "Extract from all active sources")
  .option("--limit <n>", "Limit number of orders to check", parseInt)
  .option("-o, --output <dir>", "Output directory for invoices")
  .option("--gcs", "Upload extracted invoices to GCS bucket")
  .option("--gcs-bucket <bucket>", "GCS bucket name (default: husky-invoices)")
  .option("--upload", "Auto-upload to Gotess after extraction")
  .option("--json", "Output as JSON")
  .action(async (source, options) => {
    try {
      const outputDir = options.output || getDefaultInvoiceDir();

      if (options.all) {
        // Extract from all active sources
        const sources = await fetchApi<InvoiceSourceData[]>("/api/invoice-sources");
        const activeSources = sources.filter(
          (s) => s.status === "active" || hasCredentialsConfigured(s.extractorId)
        );

        if (activeSources.length === 0) {
          console.log("\n  No active sources to extract from.");
          console.log("  Configure credentials first with:");
          console.log("    husky config set <extractor>-username <user>");
          console.log("    husky config set <extractor>-password <pass>\n");
          return;
        }

        console.log(`\n  Extracting invoices from ${activeSources.length} sources...\n`);

        for (const sourceData of activeSources) {
          console.log(`  📦 ${sourceData.name}`);
          await extractFromSource(sourceData.extractorId, {
            limit: options.limit,
            outputDir,
            upload: options.upload,
            gcs: options.gcs,
            gcsBucket: options.gcsBucket,
          });
          console.log("");
        }
      } else if (source) {
        // Extract from specific source
        await extractFromSource(source, {
          limit: options.limit,
          outputDir,
          upload: options.upload,
          json: options.json,
          gcs: options.gcs,
          gcsBucket: options.gcsBucket,
        });
      } else {
        // Show available extractors
        console.log("\n  Usage: husky biz invoices extract <source>");
        console.log("         husky biz invoices extract --all\n");
        console.log("  Available extractors:");
        for (const id of getAvailableExtractorIds()) {
          const hasCreds = hasCredentialsConfigured(id);
          const icon = hasCreds ? "✓" : "✗";
          console.log(`    ${icon} ${id}`);
        }
        console.log("");
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

async function extractFromSource(
  extractorId: string,
  options: {
    limit?: number;
    outputDir: string;
    upload?: boolean;
    json?: boolean;
    gcs?: boolean;
    gcsBucket?: string;
  }
) {
  const extractor = getExtractor(extractorId);
  if (!extractor) {
    console.error(`  ✗ Unknown extractor: ${extractorId}`);
    return;
  }

  if (!hasCredentialsConfigured(extractorId)) {
    console.error(`  ✗ Credentials not configured for ${extractorId}`);
    console.error(`    Run: husky config set ${extractorId}-username <user>`);
    console.error(`        husky config set ${extractorId}-password <pass>`);
    return;
  }

  try {
    await extractor.init({});

    const result = await extractor.extractAll({
      limit: options.limit,
      outputDir: options.outputDir,
      onProgress: (msg) => {
        if (!options.json) {
          console.log(`    ${msg}`);
        }
      },
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`    ✓ Extracted ${result.invoicesExtracted}/${result.ordersFound} invoices`);
      if (result.invoicesFailed > 0) {
        console.log(`    ⚠ ${result.invoicesFailed} failed`);
      }
      if (result.invoices.length > 0) {
        console.log(`    📁 Saved to: ${options.outputDir}`);
      }
    }

    // Track GCS upload results for Gotess
    let gcsResults: Array<{ invoice: ExtractedInvoiceFile; gcsUri?: string }> = [];

    // Upload to GCS if requested
    if (options.gcs && result.invoices.length > 0) {
      gcsResults = await uploadToGCS(result.invoices, extractorId, options.gcsBucket, options.json);
    }

    // Auto-upload to Gotess if requested
    if (options.upload && result.invoices.length > 0) {
      // Use GCS results if available, otherwise use local invoices
      const invoicesWithGcs = gcsResults.length > 0
        ? gcsResults
        : result.invoices.map(inv => ({ invoice: inv }));
      await uploadToGotess(invoicesWithGcs, extractorId, options.json);
    }
  } catch (error) {
    console.error(`  ✗ Extraction failed: ${(error as Error).message}`);
  } finally {
    await extractor.close();
  }
}

async function uploadToGCS(
  invoices: ExtractedInvoiceFile[],
  source: string,
  bucketName?: string,
  json?: boolean
): Promise<Array<{ invoice: ExtractedInvoiceFile; gcsUri?: string }>> {
  if (!json) {
    console.log("    ☁️ Uploading to GCS...");
  }

  const results: Array<{ invoice: ExtractedInvoiceFile; gcsUri?: string }> = [];

  try {
    const gcs = new GCSUploadClient(bucketName);

    // Check bucket access
    const accessCheck = await gcs.checkAccess();
    if (!accessCheck.accessible) {
      console.error(`    ✗ GCS access error: ${accessCheck.error}`);
      console.error(`    Make sure bucket "${gcs.getBucketName()}" exists and you have access`);
      return invoices.map(inv => ({ invoice: inv }));
    }

    let successCount = 0;
    let failCount = 0;

    for (const invoice of invoices) {
      const result = await gcs.uploadInvoice(invoice.localPath, {
        source,
        orderNumber: invoice.orderNumber,
        invoiceDate: invoice.invoiceDate,
      });

      if (result.success) {
        successCount++;
        results.push({ invoice, gcsUri: result.gcsUri });
        if (!json) {
          console.log(`    ✓ ${invoice.filename} → ${result.gcsUri}`);
        }
      } else {
        failCount++;
        results.push({ invoice });
        if (!json) {
          console.log(`    ✗ ${invoice.filename}: ${result.error}`);
        }
      }
    }

    if (!json) {
      console.log(`    ☁️ Uploaded ${successCount}/${invoices.length} to GCS`);
      if (failCount > 0) {
        console.log(`    ⚠ ${failCount} failed to upload`);
      }
    }
  } catch (error) {
    console.error(`    ✗ GCS upload failed: ${(error as Error).message}`);
    return invoices.map(inv => ({ invoice: inv }));
  }

  return results;
}

async function uploadToGotess(
  invoicesWithGcs: Array<{ invoice: ExtractedInvoiceFile; gcsUri?: string }>,
  source: string,
  json?: boolean
): Promise<void> {
  if (!json) {
    console.log("    📤 Uploading to Gotess...");
  }

  try {
    const config = getConfig();
    if (!config.gotessToken || !config.gotessBookId) {
      console.error("    ✗ Gotess not configured");
      console.error("    Configure with: husky biz gotess login");
      return;
    }

    const gotess = new GotessClient(config.gotessToken, config.gotessBookId);

    let successCount = 0;
    let failCount = 0;

    for (const { invoice, gcsUri } of invoicesWithGcs) {
      try {
        const result = await gotess.createInvoice({
          invoiceDate: invoice.invoiceDate,
          amount: invoice.amount,
          senderName: source,
          filename: invoice.filename,
          gcsUri: gcsUri,
        });

        successCount++;
        if (!json) {
          console.log(`    ✓ ${invoice.filename} → Gotess ID: ${result.id}`);
        }
      } catch (error) {
        failCount++;
        if (!json) {
          console.log(`    ✗ ${invoice.filename}: ${(error as Error).message}`);
        }
      }
    }

    if (!json) {
      console.log(`    📤 Created ${successCount}/${invoicesWithGcs.length} Gotess records`);
      if (failCount > 0) {
        console.log(`    ⚠ ${failCount} failed`);
      }
    }
  } catch (error) {
    console.error(`    ✗ Gotess upload failed: ${(error as Error).message}`);
  }
}

// ============================================================================
// husky biz invoices pending
// ============================================================================

invoicesCommand
  .command("pending")
  .description("Show pending invoices to extract")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const sources = await fetchApi<InvoiceSourceData[]>("/api/invoice-sources");
      const pending = sources.filter((s) => s.pendingInvoices > 0);

      if (options.json) {
        console.log(JSON.stringify(pending, null, 2));
        return;
      }

      if (pending.length === 0) {
        console.log("\n  No pending invoices to extract.\n");
        return;
      }

      console.log(`\n  📋 Pending Invoices\n`);

      let total = 0;
      for (const source of pending) {
        console.log(`  ${source.name}: ${source.pendingInvoices} pending`);
        total += source.pendingInvoices;
      }
      console.log(`  ─────────────────────`);
      console.log(`  Total: ${total} pending`);
      console.log("");
    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// ============================================================================
// husky biz invoices test
// ============================================================================

invoicesCommand
  .command("test <source>")
  .description("Test credentials for a source")
  .action(async (source) => {
    const extractor = getExtractor(source);
    if (!extractor) {
      console.error(`✗ Unknown extractor: ${source}`);
      console.log("\nAvailable extractors:");
      for (const id of getAvailableExtractorIds()) {
        console.log(`  - ${id}`);
      }
      process.exit(1);
    }

    if (!hasCredentialsConfigured(source)) {
      console.error(`✗ Credentials not configured for ${source}`);
      console.log(`\nConfigure with:`);
      console.log(`  husky config set ${source}-username <user>`);
      console.log(`  husky config set ${source}-password <pass>`);
      process.exit(1);
    }

    try {
      console.log(`Testing credentials for ${extractor.name}...`);
      await extractor.init({});
      const result = await extractor.testCredentials();

      if (result.success) {
        console.log(`✓ Successfully authenticated with ${extractor.name}`);
      } else {
        console.error(`✗ Authentication failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`✗ Test failed: ${(error as Error).message}`);
      process.exit(1);
    } finally {
      await extractor.close();
    }
  });

// ============================================================================
// husky biz invoices reconcile
// ============================================================================

// Vendor name patterns to extractor mapping
const VENDOR_SOURCE_MAPPING: Record<string, string[]> = {
  wattiz: ["wattiz", "watti", "watt"],
  skuterzone: ["skuterzone", "skuter", "skuterzon"],
  emove: ["emove", "e-move", "emove distribution"],
};

function findSourceForVendor(vendorName: string): string | null {
  const normalized = vendorName.toLowerCase();
  for (const [source, patterns] of Object.entries(VENDOR_SOURCE_MAPPING)) {
    if (patterns.some((p) => normalized.includes(p))) {
      return source;
    }
  }
  return null;
}

invoicesCommand
  .command("reconcile")
  .description("Auto-reconcile missing invoices from Gotess")
  .option("--dry-run", "Show what would be done without executing")
  .option("--limit <n>", "Limit transactions to check", parseInt)
  .option("--gcs", "Upload to GCS bucket")
  .option("--gcs-bucket <bucket>", "GCS bucket name")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const config = getConfig();
      if (!config.gotessToken || !config.gotessBookId) {
        console.error("✗ Gotess not configured");
        console.error("  Configure with: husky biz gotess login");
        process.exit(1);
      }

      const gotess = new GotessClient(config.gotessToken, config.gotessBookId);

      // Step 1: Get transactions missing invoices
      console.log("\n  🔍 Checking Gotess for missing invoices...\n");
      const missing = await gotess.getMissingInvoices();

      if (missing.length === 0) {
        console.log("  ✓ No missing invoices found!\n");
        return;
      }

      console.log(`  Found ${missing.length} transactions missing invoices\n`);

      // Step 2: Group by potential source
      const bySource: Record<string, typeof missing> = {};
      const unmapped: typeof missing = [];

      for (const tx of missing) {
        const source = findSourceForVendor(tx.counterpart_name || "");
        if (source) {
          if (!bySource[source]) bySource[source] = [];
          bySource[source].push(tx);
        } else {
          unmapped.push(tx);
        }
      }

      // Show breakdown
      console.log("  📊 Breakdown by source:\n");
      for (const [source, txs] of Object.entries(bySource)) {
        const hasCreds = hasCredentialsConfigured(source);
        const credIcon = hasCreds ? "✓" : "✗";
        console.log(`    ${credIcon} ${source}: ${txs.length} transactions`);
        for (const tx of txs.slice(0, 3)) {
          console.log(`       - ${tx.counterpart_name}: €${Math.abs(tx.amount).toFixed(2)} (${tx.value_date})`);
        }
        if (txs.length > 3) {
          console.log(`       ... and ${txs.length - 3} more`);
        }
      }

      if (unmapped.length > 0) {
        console.log(`\n    ? Unknown sources: ${unmapped.length} transactions`);
        for (const tx of unmapped.slice(0, 3)) {
          console.log(`       - ${tx.counterpart_name || "Unknown"}: €${Math.abs(tx.amount).toFixed(2)}`);
        }
      }

      if (options.dryRun) {
        console.log("\n  [Dry run - no actions taken]\n");
        return;
      }

      // Step 3: Extract from each mapped source
      console.log("\n  🚀 Starting extraction...\n");
      const outputDir = getDefaultInvoiceDir();
      let totalExtracted = 0;
      let totalMatched = 0;

      for (const [source, txs] of Object.entries(bySource)) {
        if (!hasCredentialsConfigured(source)) {
          console.log(`  ⏭ Skipping ${source} (no credentials configured)`);
          continue;
        }

        console.log(`\n  📦 Extracting from ${source}...`);

        const extractor = getExtractor(source);
        if (!extractor) continue;

        try {
          await extractor.init({});
          const result = await extractor.extractAll({
            limit: options.limit || 20,
            outputDir,
            onProgress: (msg) => console.log(`    ${msg}`),
          });

          console.log(`    ✓ Extracted ${result.invoicesExtracted} invoices`);
          totalExtracted += result.invoicesExtracted;

          // Upload to GCS if requested
          let gcsResults: Array<{ invoice: ExtractedInvoiceFile; gcsUri?: string }> = [];
          if (options.gcs && result.invoices.length > 0) {
            gcsResults = await uploadToGCS(result.invoices, source, options.gcsBucket, options.json);
          }

          // Upload to Gotess
          if (result.invoices.length > 0) {
            const invoicesWithGcs = gcsResults.length > 0
              ? gcsResults
              : result.invoices.map(inv => ({ invoice: inv }));
            await uploadToGotess(invoicesWithGcs, source, options.json);
          }

          await extractor.close();
        } catch (error) {
          console.error(`    ✗ Error: ${(error as Error).message}`);
        }
      }

      // Step 4: Run auto-matching
      console.log("\n  🔗 Running auto-match...\n");

      try {
        const matchResult = await gotess.autoMatch();
        totalMatched = matchResult.matched.length;

        if (matchResult.matched.length > 0) {
          console.log(`    Found ${matchResult.matched.length} potential matches:`);
          for (const { transaction, invoice } of matchResult.matched.slice(0, 5)) {
            console.log(`      - ${transaction.counterpart_name}: €${Math.abs(transaction.amount).toFixed(2)} → ${invoice.filename || invoice.sender_name}`);
          }

          // Actually link the matches
          console.log("\n    Linking invoices to transactions...");
          let linked = 0;
          for (const { transaction, invoice } of matchResult.matched) {
            try {
              await gotess.linkInvoice(transaction.id, invoice.id);
              linked++;
            } catch (error) {
              console.log(`      ✗ Failed to link ${transaction.id}: ${(error as Error).message}`);
            }
          }
          console.log(`    ✓ Linked ${linked}/${matchResult.matched.length} invoices`);
        }

        if (matchResult.unmatched.length > 0) {
          console.log(`\n    Still missing invoices: ${matchResult.unmatched.length}`);
        }
      } catch (error) {
        console.error(`    ✗ Auto-match failed: ${(error as Error).message}`);
      }

      // Summary
      console.log("\n  ═══════════════════════════════════════");
      console.log(`  📊 Reconciliation Summary`);
      console.log(`     Transactions checked: ${missing.length}`);
      console.log(`     Invoices extracted:   ${totalExtracted}`);
      console.log(`     Invoices matched:     ${totalMatched}`);
      console.log(`     Still missing:        ${missing.length - totalMatched}`);
      console.log("  ═══════════════════════════════════════\n");

    } catch (error) {
      console.error("Error:", (error as Error).message);
      process.exit(1);
    }
  });

// ============================================================================
// husky biz invoices schedule
// ============================================================================

invoicesCommand
  .command("schedule")
  .description("Show/configure scheduled reconciliation")
  .option("--enable", "Enable monthly reconciliation")
  .option("--disable", "Disable scheduled reconciliation")
  .option("--cron <expression>", "Custom cron expression")
  .action(async (options) => {
    console.log("\n  📅 Invoice Reconciliation Schedule\n");

    if (options.enable || options.disable || options.cron) {
      console.log("  Schedule configuration is managed via:");
      console.log("  - Cloud Scheduler in GCP Console");
      console.log("  - Or crontab on the accounting VM");
      console.log("");
      console.log("  Recommended cron: 0 6 1 * *  (1st of month at 6 AM)");
      console.log("");
      console.log("  Command to run:");
      console.log("    husky biz invoices reconcile --gcs");
      console.log("");
    } else {
      console.log("  To set up automated reconciliation:");
      console.log("");
      console.log("  1. On a VM (crontab -e):");
      console.log("     0 6 1 * * /usr/local/bin/husky biz invoices reconcile --gcs >> /var/log/husky-reconcile.log 2>&1");
      console.log("");
      console.log("  2. Via Cloud Scheduler:");
      console.log("     gcloud scheduler jobs create http husky-invoice-reconcile \\");
      console.log("       --schedule=\"0 6 1 * *\" \\");
      console.log("       --uri=\"https://your-api/api/invoices/reconcile\" \\");
      console.log("       --http-method=POST");
      console.log("");
    }
  });

export default invoicesCommand;
