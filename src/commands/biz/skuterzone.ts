/**
 * Husky Biz Skuterzone Command
 *
 * Manages skuterzonepro.com (B2B e-mobility parts supplier) via web scraping
 * WooCommerce platform integration
 * - Parts search and catalog browsing
 * - Order history and details
 * - Invoice download
 */

import { Command } from "commander";
import { SkuterzonePlaywrightClient } from "../../lib/biz/skuterzone-playwright.js";
import { getConfig, saveConfig } from "../config.js";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";

export const skuterzoneCommand = new Command("skuterzone")
    .description("Manage skuterzonepro.com (e-mobility parts supplier - WooCommerce)");

// ============================================================================
// husky biz skuterzone login
// ============================================================================

skuterzoneCommand
    .command("login")
    .description("Setup Skuterzone credentials")
    .requiredOption("-u, --username <username>", "Login username or email")
    .requiredOption("-p, --password <password>", "Login password")
    .option("--base-url <url>", "Base URL", "https://skuterzonepro.com")
    .action(async (options) => {
        try {
            // Save to config
            const config = getConfig();
            config.skuterzoneUsername = options.username;
            config.skuterzonePassword = options.password;
            if (options.baseUrl) {
                config.skuterzoneBaseUrl = options.baseUrl;
            }
            saveConfig(config);

            console.log("Testing authentication...");

            // Test login
            const client = SkuterzonePlaywrightClient.fromConfig();
            try {
                const result = await client.login();

                if (result.success) {
                    console.log("✓ Successfully authenticated with skuterzonepro.com");
                    console.log("\nYou can now use:");
                    console.log("  husky biz skuterzone orders list");
                    console.log("  husky biz skuterzone orders get <id>");
                    console.log("  husky biz skuterzone invoice <order-id>");
                    console.log("  husky biz skuterzone products <query>");
                } else {
                    console.error("✗ Login failed:", result.error);
                    process.exit(1);
                }
            } finally {
                await client.close();
            }
        } catch (error) {
            console.error("✗ Login failed:", (error as Error).message);
            process.exit(1);
        }
    });

// ============================================================================
// husky biz skuterzone orders
// ============================================================================

const ordersSubcommand = new Command("orders")
    .description("View supplier orders");

ordersSubcommand
    .command("list")
    .description("List all orders from Skuterzone")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        const client = SkuterzonePlaywrightClient.fromConfig();
        try {
            const orders = await client.listOrders();

            if (options.json) {
                console.log(JSON.stringify(orders, null, 2));
                return;
            }

            if (orders.length === 0) {
                console.log("\n  No orders found.\n");
                return;
            }

            console.log(`\n  📦 Skuterzone Orders (${orders.length} found)\n`);

            // Header
            console.log(
                `  ${"Order #".padEnd(15)} │ ` +
                `${"Date".padEnd(20)} │ ` +
                `${"Status".padEnd(15)} │ ` +
                `${"Total".padEnd(12)}`
            );
            console.log("  " + "─".repeat(75));

            // Orders
            for (const order of orders) {
                console.log(
                    `  ${order.orderNumber.padEnd(15)} │ ` +
                    `${order.date.padEnd(20)} │ ` +
                    `${order.status.padEnd(15)} │ ` +
                    `${order.total}`
                );
            }
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        } finally {
            await client.close();
        }
    });

ordersSubcommand
    .command("get <id>")
    .description("Get order details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        const client = SkuterzonePlaywrightClient.fromConfig();
        try {
            const order = await client.getOrder(id);

            if (options.json) {
                console.log(JSON.stringify(order, null, 2));
                return;
            }

            console.log(`\n  Order ${order.orderNumber}`);
            console.log("  " + "─".repeat(60));
            console.log(`  Status:   ${order.status}`);
            console.log(`  Date:     ${order.date}`);
            console.log(`  Total:    ${order.total}`);

            if (order.trackingNumber) {
                console.log(`  Tracking: ${order.trackingNumber}`);
            }

            if (order.paymentMethod) {
                console.log(`  Payment:  ${order.paymentMethod}`);
            }

            if (order.customer && order.customer.name) {
                console.log(`\n  Shipping To:`);
                console.log(`    ${order.customer.name}`);
                if (order.customer.company) {
                    console.log(`    ${order.customer.company}`);
                }
                if (order.customer.address) {
                    console.log(`    ${order.customer.address}`);
                }
                if (order.customer.postcode && order.customer.city) {
                    console.log(`    ${order.customer.postcode} ${order.customer.city}`);
                }
                if (order.customer.email) {
                    console.log(`    ${order.customer.email}`);
                }
            }

            if (order.items.length > 0) {
                console.log(`\n  Items:`);
                for (const item of order.items) {
                    const sku = item.sku ? `[${item.sku}]`.padEnd(18) : "".padEnd(18);
                    const name = item.name.slice(0, 35).padEnd(35);
                    console.log(
                        `    ${item.quantity}x ${sku} ${name} (${item.total})`
                    );
                }
            }

            if (order.subtotal || order.shipping || order.tax) {
                console.log(`\n  Totals:`);
                if (order.subtotal) console.log(`    Subtotal:  ${order.subtotal}`);
                if (order.shipping) console.log(`    Shipping:  ${order.shipping}`);
                if (order.tax) console.log(`    Tax:       ${order.tax}`);
                console.log(`    Total:     ${order.total}`);
            }

            if (order.invoiceUrl) {
                console.log(`\n  📄 Invoice available`);
                console.log(`     Download with: husky biz skuterzone invoice ${order.id}`);
            }

            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        } finally {
            await client.close();
        }
    });

skuterzoneCommand.addCommand(ordersSubcommand);

// ============================================================================
// husky biz skuterzone invoice
// ============================================================================

skuterzoneCommand
    .command("invoice <order-id>")
    .description("Download invoice PDF for order")
    .option("-o, --output <path>", "Save path (default: ~/Downloads/skuterzone-invoice-{id}.pdf)")
    .action(async (orderId, options) => {
        const client = SkuterzonePlaywrightClient.fromConfig();
        try {
            const savePath = options.output ||
                path.join(homedir(), 'Downloads', `skuterzone-invoice-${orderId}.pdf`);

            console.log(`Downloading invoice for order #${orderId}...`);
            const success = await client.downloadInvoice(orderId, savePath);

            if (success) {
                console.log(`✓ Invoice saved to: ${savePath}`);
            } else {
                console.error("✗ Invoice not available for this order");
                process.exit(1);
            }
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        } finally {
            await client.close();
        }
    });

// ============================================================================
// husky biz skuterzone products
// ============================================================================

skuterzoneCommand
    .command("products <query>")
    .description("Search for parts in catalog")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        const client = SkuterzonePlaywrightClient.fromConfig();
        try {
            const products = await client.searchProducts(query);

            if (options.json) {
                console.log(JSON.stringify(products, null, 2));
                return;
            }

            if (products.length === 0) {
                console.log(`\n  No products found for: "${query}"\n`);
                return;
            }

            console.log(`\n  🔍 Search results for: "${query}" (${products.length} found)\n`);

            for (const product of products) {
                const sku = product.sku ? `[${product.sku}]` : '';
                const price = product.price || 'Price hidden (login required)';
                const stock = product.stockStatus || '';

                console.log(`  ${product.name}`);
                console.log(`    ${sku} ${price}${stock ? ' - ' + stock : ''}`);
                console.log(`    ${product.url}`);
                console.log("");
            }
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        } finally {
            await client.close();
        }
    });

export default skuterzoneCommand;
