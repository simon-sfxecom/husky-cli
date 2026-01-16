import { Command } from "commander";
import { SupplierFeedService, SUPPLIER_IDS, type SupplierId } from "../../lib/biz/supplier-feed.js";
import { COLLECTION_NAME } from "../../lib/biz/supplier-feed-types.js";

export const supplierFeedCommand = new Command("supplier-feed")
    .description("Supplier product catalog for semantic search (Wattiz, Skuterzone, Emove)");

supplierFeedCommand
    .command("init")
    .description("Create/verify Qdrant collection for supplier products")
    .option("--json", "JSON output")
    .action(async (options) => {
        try {
            const service = new SupplierFeedService();
            await service.ensureCollection();
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, collection: COLLECTION_NAME }));
            } else {
                console.log(`✓ Collection "${COLLECTION_NAME}" ready`);
            }
        } catch (err) {
            if (options.json) {
                console.log(JSON.stringify({ success: false, error: (err as Error).message }));
            } else {
                console.error(`✗ ${(err as Error).message}`);
            }
            process.exit(1);
        }
    });

supplierFeedCommand
    .command("sync")
    .description("Sync products from supplier catalogs into Qdrant")
    .option("-s, --supplier <id>", "Specific supplier (wattiz|skuterzone|emove)")
    .option("-q, --query <query>", "Search query for products", "*")
    .option("-l, --limit <num>", "Max products per supplier", "50")
    .option("-v, --verbose", "Verbose output")
    .option("--json", "JSON output")
    .action(async (options) => {
        try {
            const service = new SupplierFeedService();
            
            const suppliers = options.supplier 
                ? [options.supplier as SupplierId]
                : [...SUPPLIER_IDS];
            
            if (!options.json && !options.verbose) {
                console.log(`\n  Syncing supplier products...`);
                console.log(`  Suppliers: ${suppliers.join(', ')}`);
                console.log(`  Query: "${options.query}"`);
                console.log(`  Limit: ${options.limit} per supplier\n`);
            }
            
            const results = await service.syncAll({
                suppliers,
                query: options.query,
                limit: parseInt(options.limit, 10),
                verbose: options.verbose,
            });
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, results }));
            } else {
                console.log("\n  Results:");
                for (const r of results) {
                    console.log(`    ${r.supplier}: ${r.productsUpserted}/${r.productsFound} products (${r.durationMs}ms)`);
                    if (r.errors > 0) {
                        console.log(`      ⚠ ${r.errors} error(s)`);
                    }
                }
                
                const total = results.reduce((sum, r) => sum + r.productsUpserted, 0);
                console.log(`\n  ✓ Total: ${total} products synced to "${COLLECTION_NAME}"\n`);
            }
        } catch (err) {
            if (options.json) {
                console.log(JSON.stringify({ success: false, error: (err as Error).message }));
            } else {
                console.error(`✗ ${(err as Error).message}`);
            }
            process.exit(1);
        }
    });

supplierFeedCommand
    .command("search <query>")
    .description("Semantic search for products across supplier catalogs")
    .option("-s, --supplier <id>", "Filter by supplier")
    .option("-l, --limit <num>", "Max results", "10")
    .option("--min-score <score>", "Min similarity score (0-1)", "0.5")
    .option("--in-stock", "Only in-stock products")
    .option("--json", "JSON output")
    .action(async (query, options) => {
        try {
            const service = new SupplierFeedService();
            
            const results = await service.search(query, {
                supplier: options.supplier as SupplierId | undefined,
                limit: parseInt(options.limit, 10),
                minScore: parseFloat(options.minScore),
                inStockOnly: options.inStock,
            });
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, query, results }));
            } else {
                console.log(`\n  🔍 Search: "${query}"`);
                if (options.supplier) console.log(`  Filter: ${options.supplier}`);
                console.log(`  Found: ${results.length} result(s)\n`);
                
                if (results.length === 0) {
                    console.log("  No matching products found.\n");
                } else {
                    for (const r of results) {
                        console.log(`  [${r.supplier}] ${r.name}`);
                        console.log(`    Score: ${(r.score * 100).toFixed(1)}%`);
                        if (r.sku) console.log(`    SKU: ${r.sku}`);
                        if (r.price) console.log(`    Price: ${r.price}`);
                        if (r.stockStatus) console.log(`    Stock: ${r.stockStatus}`);
                        console.log(`    URL: ${r.url}`);
                        console.log();
                    }
                }
            }
        } catch (err) {
            if (options.json) {
                console.log(JSON.stringify({ success: false, error: (err as Error).message }));
            } else {
                console.error(`✗ ${(err as Error).message}`);
            }
            process.exit(1);
        }
    });

supplierFeedCommand
    .command("stats")
    .description("Show collection statistics")
    .option("--json", "JSON output")
    .action(async (options) => {
        try {
            const service = new SupplierFeedService();
            const stats = await service.getStats();
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, collection: COLLECTION_NAME, ...stats }));
            } else {
                console.log(`\n  📊 Supplier Feed Statistics`);
                console.log(`  Collection: ${COLLECTION_NAME}`);
                console.log(`  Total products: ${stats.total}\n`);
                console.log(`  By supplier:`);
                for (const [supplier, count] of Object.entries(stats.bySupplier)) {
                    console.log(`    ${supplier}: ${count}`);
                }
                console.log();
            }
        } catch (err) {
            if (options.json) {
                console.log(JSON.stringify({ success: false, error: (err as Error).message }));
            } else {
                console.error(`✗ ${(err as Error).message}`);
            }
            process.exit(1);
        }
    });

export default supplierFeedCommand;
