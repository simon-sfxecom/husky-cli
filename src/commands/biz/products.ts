/**
 * Husky Biz Products Command
 * 
 * Manages products via Billbee API
 */

import { Command } from "commander";
import { BillbeeClient, Product } from "../../lib/biz/index.js";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";

export const productsCommand = new Command("products")
    .description("Manage products (Billbee)");

// husky biz products list
productsCommand
    .command("list")
    .description("List products")
    .option("-l, --limit <num>", "Number of products", "20")
    .option("-p, --page <num>", "Page number", "1")
    .option("--low-stock", "Show only low stock products")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = BillbeeClient.fromConfig();

            const response = await client.listProducts({
                page: parseInt(options.page, 10),
                pageSize: parseInt(options.limit, 10),
            });

            let products = response.Data;

            // Filter low stock if requested
            if (options.lowStock) {
                products = products.filter(p => p.LowStock === true);
            }

            if (options.json) {
                console.log(JSON.stringify(products, null, 2));
                return;
            }

            console.log(`\n  📦 Products (${response.Paging.TotalRows} total)\n`);

            if (products.length === 0) {
                console.log("  No products found.");
                return;
            }

            for (const product of products) {
                const sku = (product.SKU || "-").padEnd(15);
                const title = (product.Title || "Unknown").slice(0, 35).padEnd(35);
                const stock = String(product.StockCurrent ?? 0).padStart(5);
                const price = `€${(product.Price ?? 0).toFixed(2)}`;
                const lowStock = product.LowStock ? "⚠️" : "  ";
                console.log(`  ${lowStock} ${sku} │ ${title} │ Stock: ${stock} │ ${price}`);
            }

            console.log(`\n  Page ${response.Paging.Page} of ${response.Paging.TotalPages}\n`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz products get <id>
productsCommand
    .command("get <id>")
    .description("Get product details by ID")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = BillbeeClient.fromConfig();
            const response = await client.getProduct(id);
            const product = response.Data;

            if (options.json) {
                console.log(JSON.stringify(product, null, 2));
                return;
            }

            printProductDetails(product);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz products search <sku>
productsCommand
    .command("search <sku>")
    .description("Find product by SKU")
    .option("--json", "Output as JSON")
    .action(async (sku, options) => {
        try {
            const client = BillbeeClient.fromConfig();
            const product = await client.getProductBySku(sku);

            if (!product) {
                console.log(`\n  Product with SKU "${sku}" not found.\n`);
                process.exit(1);
            }

            if (options.json) {
                console.log(JSON.stringify(product, null, 2));
                return;
            }

            printProductDetails(product);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz products stock <id>
productsCommand
    .command("stock <id>")
    .description("Show stock info for product")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = BillbeeClient.fromConfig();
            const response = await client.getProduct(id);
            const product = response.Data;

            if (options.json) {
                console.log(JSON.stringify({
                    id: product.Id,
                    sku: product.SKU,
                    stockCurrent: product.StockCurrent,
                    stockDesired: product.StockDesired,
                    stockWarning: product.StockWarning,
                    lowStock: product.LowStock,
                    stocks: product.Stocks,
                }, null, 2));
                return;
            }

            console.log(`\n  📊 Stock for ${product.SKU || `#${product.Id}`}`);
            console.log("  " + "─".repeat(40));
            console.log(`  Current:  ${product.StockCurrent ?? 0}`);
            console.log(`  Desired:  ${product.StockDesired ?? 0}`);
            console.log(`  Warning:  ${product.StockWarning ?? 0}`);
            console.log(`  Low Stock: ${product.LowStock ? "⚠️ YES" : "✅ No"}`);

            if (product.Stocks && product.Stocks.length > 0) {
                console.log(`\n  Warehouses:`);
                for (const stock of product.Stocks) {
                    console.log(`    ${stock.Name}: ${stock.StockCurrent}`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz products set-stock <id> <qty> --reason
productsCommand
    .command("set-stock <id> <quantity>")
    .description("Update stock quantity (with audit reason)")
    .requiredOption("-r, --reason <text>", "Reason for stock change (required)")
    .action(async (id, quantity, options) => {
        try {
            const client = BillbeeClient.fromConfig();

            // Get current stock for logging
            const before = await client.getProduct(id);
            const oldStock = before.Data.StockCurrent ?? 0;

            // Update stock
            const response = await client.updateProduct(id, {
                StockDesired: parseInt(quantity, 10),
            });

            const product = response.Data;
            const newStock = parseInt(quantity, 10);

            // Log the change
            logStockChange({
                productId: String(id),
                sku: product.SKU || "",
                before: oldStock,
                after: newStock,
                reason: options.reason,
                timestamp: new Date().toISOString(),
            });

            console.log(`✓ Stock updated for ${product.SKU || id}: ${oldStock} → ${newStock}`);
            console.log(`  Reason: ${options.reason}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz products set-price <id> <price>
productsCommand
    .command("set-price <id> <price>")
    .description("Update product price")
    .action(async (id, price, options) => {
        try {
            const client = BillbeeClient.fromConfig();
            const response = await client.updateProduct(id, {
                Price: parseFloat(price),
            });

            const product = response.Data;
            console.log(`✓ Price updated for ${product.SKU || id}: €${parseFloat(price).toFixed(2)}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz products update <id>
productsCommand
    .command("update <id>")
    .description("Update product fields")
    .option("--title <text>", "Update title")
    .option("--price <num>", "Update price")
    .option("--ean <code>", "Update EAN")
    .option("--description <text>", "Update description")
    .action(async (id, options) => {
        try {
            const client = BillbeeClient.fromConfig();

            const updates: Record<string, unknown> = {};
            if (options.title) updates.Title = options.title;
            if (options.price) updates.Price = parseFloat(options.price);
            if (options.ean) updates.EAN = options.ean;
            if (options.description) updates.Description = options.description;

            if (Object.keys(updates).length === 0) {
                console.error("Error: Provide at least one field to update");
                console.log("  --title, --price, --ean, --description");
                process.exit(1);
            }

            const response = await client.updateProduct(id, updates);
            console.log(`✓ Product ${response.Data.SKU || id} updated`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// Helper: Print product details
function printProductDetails(product: Product) {
    console.log(`\n  Product #${product.Id}`);
    console.log("  " + "─".repeat(50));
    console.log(`  SKU:       ${product.SKU || "-"}`);
    console.log(`  EAN:       ${product.EAN || "-"}`);
    console.log(`  Title:     ${product.Title || "-"}`);
    console.log(`  Price:     €${(product.Price ?? 0).toFixed(2)}`);
    console.log(`  Cost:      €${(product.CostPrice ?? 0).toFixed(2)}`);
    console.log(`  Stock:     ${product.StockCurrent ?? 0}`);
    console.log(`  Low Stock: ${product.LowStock ? "⚠️ YES" : "No"}`);

    if (product.Category1) {
        console.log(`  Category:  ${[product.Category1, product.Category2, product.Category3].filter(Boolean).join(" > ")}`);
    }

    if (product.Weight) {
        console.log(`  Weight:    ${product.Weight}g`);
    }

    console.log("");
}

// Helper: Log stock change to file
interface StockChangeLog {
    productId: string;
    sku: string;
    before: number;
    after: number;
    reason: string;
    timestamp: string;
}

function logStockChange(change: StockChangeLog) {
    const logDir = path.join(homedir(), ".husky");
    const logFile = path.join(logDir, "stock-changes.log");

    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(logFile, JSON.stringify(change) + "\n");
}

export default productsCommand;
