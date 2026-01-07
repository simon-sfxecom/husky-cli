/**
 * Husky Biz SeaTable Command
 * 
 * Manages SeaTable Base data for Supply Chain workflows
 */

import { Command } from "commander";
import { SeaTableClient, SeaTableRow, RowData } from "../../lib/biz/index.js";

export const seatableCommand = new Command("seatable")
    .description("Manage SeaTable data (Supply Chain)");

// husky biz seatable tables
seatableCommand
    .command("tables")
    .description("List all tables in the Base")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = SeaTableClient.fromConfig();
            const metadata = await client.getMetadata();

            if (options.json) {
                console.log(JSON.stringify(metadata.tables, null, 2));
                return;
            }

            console.log(`\n  📊 SeaTable Base Tables (${metadata.tables.length})\n`);

            for (const table of metadata.tables) {
                console.log(`  📋 ${table.name}`);
                console.log(`     ID: ${table._id} | Columns: ${table.columns.length}`);
            }

            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable columns <table>
seatableCommand
    .command("columns <table>")
    .description("Show columns for a table")
    .option("--json", "Output as JSON")
    .action(async (tableName, options) => {
        try {
            const client = SeaTableClient.fromConfig();
            const metadata = await client.getMetadata();
            const table = metadata.tables.find(t => t.name === tableName);

            if (!table) {
                console.error(`Table "${tableName}" not found.`);
                console.log("Available tables:", metadata.tables.map(t => t.name).join(", "));
                process.exit(1);
            }

            if (options.json) {
                console.log(JSON.stringify(table.columns, null, 2));
                return;
            }

            console.log(`\n  📋 Columns in "${tableName}"\n`);

            for (const col of table.columns) {
                const typeStr = String(col.type).padEnd(15);
                console.log(`  ${col.name.padEnd(25)} │ ${typeStr} │ ${col.key}`);
            }

            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable list <table>
seatableCommand
    .command("list <table>")
    .description("List rows from a table")
    .option("-l, --limit <num>", "Number of rows", "20")
    .option("--start <num>", "Start offset", "0")
    .option("--order-by <col>", "Order by column")
    .option("--desc", "Descending order")
    .option("-v, --view <name>", "View name")
    .option("--json", "Output as JSON")
    .action(async (tableName, options) => {
        try {
            const client = SeaTableClient.fromConfig();

            const rows = await client.listRows({
                table_name: tableName,
                limit: parseInt(options.limit, 10),
                start: parseInt(options.start, 10),
                order_by: options.orderBy,
                direction: options.desc ? 'desc' : undefined,
                view_name: options.view,
            });

            if (options.json) {
                console.log(JSON.stringify(rows, null, 2));
                return;
            }

            console.log(`\n  📋 ${tableName} (${rows.length} rows)\n`);

            if (rows.length === 0) {
                console.log("  No rows found.");
                return;
            }

            // Display first few columns of each row
            for (const row of rows) {
                const displayCols = Object.entries(row)
                    .filter(([k]) => !k.startsWith('_'))
                    .slice(0, 4)
                    .map(([k, v]) => `${k}: ${formatValue(v)}`)
                    .join(' │ ');
                console.log(`  [${row._id.slice(0, 8)}] ${displayCols}`);
            }

            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable get <table> <rowId>
seatableCommand
    .command("get <table> <rowId>")
    .description("Get a single row by ID")
    .option("--json", "Output as JSON")
    .action(async (tableName, rowId, options) => {
        try {
            const client = SeaTableClient.fromConfig();
            const row = await client.getRow(tableName, rowId);

            if (!row) {
                console.error(`Row "${rowId}" not found in table "${tableName}".`);
                process.exit(1);
            }

            if (options.json) {
                console.log(JSON.stringify(row, null, 2));
                return;
            }

            console.log(`\n  📋 Row ${rowId}\n`);
            for (const [key, value] of Object.entries(row)) {
                if (!key.startsWith('_')) {
                    console.log(`  ${key.padEnd(20)}: ${formatValue(value)}`);
                }
            }
            console.log(`\n  Created: ${row._ctime || 'N/A'}`);
            console.log(`  Modified: ${row._mtime || 'N/A'}\n`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable search <table> <query>
seatableCommand
    .command("search <table> <query>")
    .description("Full-text search in a table")
    .option("--json", "Output as JSON")
    .action(async (tableName, query, options) => {
        try {
            const client = SeaTableClient.fromConfig();
            const rows = await client.searchRows(tableName, query);

            if (options.json) {
                console.log(JSON.stringify(rows, null, 2));
                return;
            }

            console.log(`\n  🔍 Search "${query}" in ${tableName} (${rows.length} results)\n`);

            if (rows.length === 0) {
                console.log("  No matching rows found.");
                return;
            }

            for (const row of rows) {
                const displayCols = Object.entries(row)
                    .filter(([k]) => !k.startsWith('_'))
                    .slice(0, 4)
                    .map(([k, v]) => `${k}: ${formatValue(v)}`)
                    .join(' │ ');
                console.log(`  [${row._id.slice(0, 8)}] ${displayCols}`);
            }

            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable create <table>
seatableCommand
    .command("create <table>")
    .description("Create a new row")
    .requiredOption("-d, --data <json>", "Row data as JSON")
    .option("--json", "Output created row as JSON")
    .action(async (tableName, options) => {
        try {
            const client = SeaTableClient.fromConfig();

            let data: Record<string, unknown>;
            try {
                data = JSON.parse(options.data);
            } catch {
                console.error("Error: Invalid JSON data");
                console.log('Example: --data \'{"Name":"Test","Status":"Active"}\'');
                process.exit(1);
            }

            const row = await client.appendRow(tableName, data as RowData);

            if (options.json) {
                console.log(JSON.stringify(row, null, 2));
                return;
            }

            console.log(`✓ Created row in ${tableName}`);
            console.log(`  ID: ${row._id}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable update <table> <rowId>
seatableCommand
    .command("update <table> <rowId>")
    .description("Update a row")
    .requiredOption("-d, --data <json>", "Update data as JSON")
    .action(async (tableName, rowId, options) => {
        try {
            const client = SeaTableClient.fromConfig();

            let data: Record<string, unknown>;
            try {
                data = JSON.parse(options.data);
            } catch {
                console.error("Error: Invalid JSON data");
                console.log('Example: --data \'{"Status":"Completed"}\'');
                process.exit(1);
            }

            await client.updateRow(tableName, rowId, data as RowData);
            console.log(`✓ Updated row ${rowId} in ${tableName}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable delete <table> <rowId>
seatableCommand
    .command("delete <table> <rowId>")
    .description("Delete a row")
    .option("-f, --force", "Skip confirmation")
    .action(async (tableName, rowId, options) => {
        try {
            const client = SeaTableClient.fromConfig();

            if (!options.force) {
                console.log(`⚠️  About to delete row ${rowId} from ${tableName}`);
                console.log("   Use --force to skip this confirmation");
                process.exit(0);
            }

            await client.deleteRow(tableName, rowId);
            console.log(`✓ Deleted row ${rowId} from ${tableName}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// Helper: format value for display
function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value.slice(0, 40) + (value.length > 40 ? '...' : '');
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '✓' : '✗';
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return '[object]';
    return String(value);
}

// ============================================================================
// PREBUILD COMMANDS (Agent-Focused)
// ============================================================================

import { EmbeddingService, QdrantClient } from "../../lib/biz/index.js";

const PRODUCTS_COLLECTION = "supplychain_nocodb_products";

// husky biz seatable find-product "<query>"
seatableCommand
    .command("find-product <query>")
    .description("[PREBUILD] Semantic search for products")
    .option("-l, --limit <num>", "Number of results", "5")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const embeddings = EmbeddingService.fromConfig();
            const qdrant = QdrantClient.fromConfig();

            // 1. Create embedding from query
            console.log(`  Generating embedding for "${query}"...`);
            const vector = await embeddings.embed(query);

            // 2. Search Qdrant products collection (uses named vector 'product_name')
            console.log(`  Searching ${PRODUCTS_COLLECTION}...`);
            const results = await qdrant.search(
                PRODUCTS_COLLECTION,
                vector,
                parseInt(options.limit, 10),
                { vectorName: 'product_name' }
            );

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    query,
                    products: results.map(r => ({
                        id: r.id,
                        score: r.score,
                        ...r.payload,
                    })),
                }, null, 2));
                return;
            }

            console.log(`\n  🔍 Product search: "${query}"\n`);

            if (results.length === 0) {
                console.log("  No products found.");
                return;
            }

            for (const result of results) {
                const payload = result.payload as Record<string, unknown>;
                const sku = payload?.sku || payload?.SKU || '';
                const name = payload?.name || payload?.Name || payload?.title || '';
                console.log(`  [${(result.score * 100).toFixed(1)}%] ${sku} │ ${String(name).slice(0, 50)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable find-supplier "<query>"
seatableCommand
    .command("find-supplier <query>")
    .description("[PREBUILD] Text search for suppliers")
    .option("-l, --limit <num>", "Number of results", "10")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const client = SeaTableClient.fromConfig();

            // List all suppliers and filter client-side
            console.log(`  Searching Suppliers for "${query}"...`);
            const allRows = await client.listRows({ table_name: "Suppliers", limit: 100 });
            const lowerQuery = query.toLowerCase();
            const filtered = allRows.filter(row => {
                const name = String(row.Name || row['0000'] || '').toLowerCase();
                const tag = String(row.TAG || '').toLowerCase();
                return name.includes(lowerQuery) || tag.includes(lowerQuery);
            });
            const limitedRows = filtered.slice(0, parseInt(options.limit, 10));

            if (options.json) {
                console.log(JSON.stringify({ success: true, query, suppliers: limitedRows }, null, 2));
                return;
            }

            console.log(`\n  🔍 Supplier search: "${query}" (${limitedRows.length} results)\n`);

            if (limitedRows.length === 0) {
                console.log("  No suppliers found.");
                return;
            }

            for (const row of limitedRows) {
                const name = row.Name || row['0000'] || '';
                const tag = row.TAG || '';
                const country = row.Country || '';
                console.log(`  [${row._id.slice(0, 8)}] ${name} │ ${tag} │ ${country}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable order-status <orderNo>
seatableCommand
    .command("order-status <orderNo>")
    .description("[PREBUILD] Get order with all positions")
    .option("--json", "Output as JSON")
    .action(async (orderNo, options) => {
        try {
            const client = SeaTableClient.fromConfig();

            // 1. Find order in Orders table
            console.log(`  Looking up order ${orderNo}...`);
            const orders = await client.searchRows("Orders", orderNo);

            if (orders.length === 0) {
                console.error(`Order "${orderNo}" not found.`);
                process.exit(1);
            }

            const order = orders[0];

            // 2. Get order positions
            console.log(`  Fetching order positions...`);
            let positions: SeaTableRow[] = [];
            try {
                positions = await client.searchRows("Order Positions", orderNo);
            } catch {
                // Table might not exist or be empty
            }

            if (options.json) {
                console.log(JSON.stringify({ success: true, order, positions }, null, 2));
                return;
            }

            console.log(`\n  📦 Order: ${orderNo}`);
            console.log("  " + "─".repeat(50));

            // Display order fields
            for (const [key, value] of Object.entries(order)) {
                if (!key.startsWith('_')) {
                    console.log(`  ${key}: ${formatValue(value)}`);
                }
            }

            if (positions.length > 0) {
                console.log(`\n  📋 Positions (${positions.length}):`);
                console.log("  " + "─".repeat(50));

                for (const pos of positions) {
                    const sku = pos.SKU || pos.sku || '';
                    const name = pos.ProductName || pos.name || '';
                    const qty = pos.Qty || pos.qty || '';
                    console.log(`    ${sku} │ ${qty}x │ ${String(name).slice(0, 35)}`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz seatable stock-check <sku>
seatableCommand
    .command("stock-check <sku>")
    .description("[PREBUILD] Check stock across suppliers")
    .option("--json", "Output as JSON")
    .action(async (sku, options) => {
        try {
            const client = SeaTableClient.fromConfig();

            // Search Supplier_Sources for this SKU
            console.log(`  Checking suppliers for SKU "${sku}"...`);
            const sources = await client.searchRows("Supplier_Sources", sku);

            if (options.json) {
                console.log(JSON.stringify({ success: true, sku, sources }, null, 2));
                return;
            }

            console.log(`\n  📦 Stock check: ${sku}\n`);

            if (sources.length === 0) {
                console.log("  No supplier sources found for this SKU.");
                return;
            }

            for (const source of sources) {
                const supplier = source.Supplier || source.supplier_name || '';
                const price = source.Price || source.price || '-';
                const stock = source.Stock || source.stock || source.available || '-';
                const leadTime = source.LeadTime || source['Delivery Time'] || '-';
                console.log(`  ${String(supplier).padEnd(20)} │ ${String(price).padEnd(8)} │ Stock: ${stock} │ Lead: ${leadTime}d`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

export default seatableCommand;
