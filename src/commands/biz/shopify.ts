import { Command } from "commander";
import { ShopifyClient } from "../../lib/biz/shopify.js";

export const shopifyCommand = new Command("shopify")
    .description("Shopify store operations (orders, customers, products, analytics)");

// =============================================================================
// ORDERS
// =============================================================================

const ordersCommand = new Command("orders")
    .description("Manage Shopify orders");

ordersCommand
    .command("list")
    .description("List recent orders")
    .option("-l, --limit <num>", "Number of orders", "20")
    .option("-s, --status <status>", "Filter by status (any, open, closed, cancelled)")
    .option("-f, --fulfillment <status>", "Filter by fulfillment (any, shipped, unshipped, partial)")
    .option("-p, --payment <status>", "Filter by payment (any, paid, pending, refunded)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ShopifyClient.fromConfig();
            
            const orders = await client.getOrders({
                limit: parseInt(options.limit, 10),
                status: options.status || 'any',
                fulfillmentStatus: options.fulfillment,
                financialStatus: options.payment,
            });

            if (options.json) {
                console.log(JSON.stringify(orders, null, 2));
                return;
            }

            console.log(`\n  🛒 Shopify Orders (${orders.length})\n`);

            if (orders.length === 0) {
                console.log("  No orders found.");
                return;
            }

            for (const order of orders) {
                const date = order.createdAt.toLocaleDateString("de-DE");
                const fulfillment = order.fulfillmentStatus || "unfulfilled";
                const payment = order.financialStatus;
                const customer = order.customer?.email || "Guest";
                console.log(`  ${order.name.padEnd(12)} │ ${fulfillment.padEnd(12)} │ ${payment.padEnd(10)} │ ${date} │ ${customer.slice(0, 25).padEnd(25)} │ €${order.totalPrice}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

ordersCommand
    .command("get <id>")
    .description("Get order details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const order = await client.getOrder(id);

            if (options.json) {
                console.log(JSON.stringify(order, null, 2));
                return;
            }

            console.log(`\n  Order ${order.name}`);
            console.log("  " + "─".repeat(50));
            console.log(`  ID:          ${order.id}`);
            console.log(`  Status:      ${order.financialStatus} / ${order.fulfillmentStatus || 'unfulfilled'}`);
            console.log(`  Created:     ${order.createdAt.toLocaleString("de-DE")}`);
            console.log(`  Total:       €${order.totalPrice} ${order.currency}`);

            if (order.customer) {
                console.log(`\n  Customer:`);
                console.log(`    ${order.customer.firstName || ''} ${order.customer.lastName || ''}`);
                console.log(`    ${order.customer.email}`);
                console.log(`    Orders: ${order.customer.ordersCount} | Spent: €${order.customer.totalSpent}`);
            }

            if (order.shippingAddress) {
                const addr = order.shippingAddress;
                console.log(`\n  Shipping:`);
                console.log(`    ${addr.firstName || ''} ${addr.lastName || ''}`);
                if (addr.company) console.log(`    ${addr.company}`);
                console.log(`    ${addr.address1 || ''} ${addr.address2 || ''}`);
                console.log(`    ${addr.zip || ''} ${addr.city || ''}, ${addr.country || ''}`);
            }

            if (order.lineItems.length > 0) {
                console.log(`\n  Items:`);
                for (const item of order.lineItems) {
                    const sku = item.sku || "-";
                    console.log(`    ${item.quantity}x ${sku.padEnd(15)} ${item.title.slice(0, 35)} (€${item.price})`);
                }
            }

            if (order.fulfillments.length > 0) {
                console.log(`\n  Fulfillments:`);
                for (const f of order.fulfillments) {
                    console.log(`    ${f.status} - ${f.trackingCompany || 'No carrier'} ${f.trackingNumber || ''}`);
                    if (f.trackingUrl) console.log(`    ${f.trackingUrl}`);
                }
            }

            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

ordersCommand
    .command("search <query>")
    .description("Search orders by name, email, or ID")
    .option("-l, --limit <num>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const orders = await client.searchOrders(query, parseInt(options.limit, 10));

            if (options.json) {
                console.log(JSON.stringify(orders, null, 2));
                return;
            }

            console.log(`\n  🔍 Search: "${query}" (${orders.length} results)\n`);

            if (orders.length === 0) {
                console.log("  No orders found.");
                return;
            }

            for (const order of orders) {
                const date = order.createdAt.toLocaleDateString("de-DE");
                const customer = order.customer?.email || "Guest";
                console.log(`  ${order.name.padEnd(12)} │ ${date} │ ${customer.slice(0, 30).padEnd(30)} │ €${order.totalPrice}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// =============================================================================
// CUSTOMERS
// =============================================================================

const customersCommand = new Command("customers")
    .description("Manage Shopify customers");

customersCommand
    .command("list")
    .description("List customers")
    .option("-l, --limit <num>", "Number of customers", "20")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const customers = await client.getCustomers({ limit: parseInt(options.limit, 10) });

            if (options.json) {
                console.log(JSON.stringify(customers, null, 2));
                return;
            }

            console.log(`\n  👤 Shopify Customers (${customers.length})\n`);

            if (customers.length === 0) {
                console.log("  No customers found.");
                return;
            }

            for (const c of customers) {
                const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || "Unknown";
                console.log(`  ${c.id.padEnd(15)} │ ${name.slice(0, 20).padEnd(20)} │ ${c.email.slice(0, 30).padEnd(30)} │ ${c.ordersCount} orders │ €${c.totalSpent}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

customersCommand
    .command("get <id>")
    .description("Get customer details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const customer = await client.getCustomer(id);

            if (options.json) {
                console.log(JSON.stringify(customer, null, 2));
                return;
            }

            console.log(`\n  👤 Customer: ${customer.email}`);
            console.log("  " + "─".repeat(50));
            console.log(`  ID:         ${customer.id}`);
            console.log(`  Name:       ${customer.firstName || ''} ${customer.lastName || ''}`);
            console.log(`  Phone:      ${customer.phone || '-'}`);
            console.log(`  Orders:     ${customer.ordersCount}`);
            console.log(`  Total:      €${customer.totalSpent}`);
            console.log(`  Marketing:  ${customer.acceptsMarketing ? 'Yes' : 'No'}`);
            console.log(`  Tags:       ${customer.tags.join(', ') || '-'}`);
            console.log(`  Created:    ${customer.createdAt.toLocaleDateString("de-DE")}`);

            if (customer.defaultAddress) {
                const addr = customer.defaultAddress;
                console.log(`\n  Address:`);
                console.log(`    ${addr.address1 || ''} ${addr.address2 || ''}`);
                console.log(`    ${addr.zip || ''} ${addr.city || ''}, ${addr.country || ''}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

customersCommand
    .command("360 <email>")
    .alias("full")
    .description("Full customer view with order history")
    .option("--json", "Output as JSON")
    .action(async (email, options) => {
        try {
            const client = ShopifyClient.fromConfig();
            
            console.log(`  Fetching customer data for ${email}...`);
            
            const customers = await client.searchCustomers(email);
            
            if (customers.length === 0) {
                console.log(`\n  No customer found with email: ${email}\n`);
                return;
            }

            const customer = customers[0];
            const orders = await client.getCustomerOrders(customer.id, 10);

            const result = {
                customer,
                orders,
                summary: {
                    totalOrders: customer.ordersCount,
                    totalSpent: customer.totalSpent,
                    averageOrderValue: customer.ordersCount > 0 
                        ? (parseFloat(customer.totalSpent) / customer.ordersCount).toFixed(2) 
                        : '0',
                    memberSince: customer.createdAt,
                }
            };

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            console.log(`\n  👤 Customer 360: ${customer.email}`);
            console.log("  " + "═".repeat(60));
            console.log(`\n  Profile:`);
            console.log(`    Name:       ${customer.firstName || ''} ${customer.lastName || ''}`);
            console.log(`    Phone:      ${customer.phone || '-'}`);
            console.log(`    Tags:       ${customer.tags.join(', ') || '-'}`);
            
            console.log(`\n  📊 Summary:`);
            console.log(`    Total Orders:  ${customer.ordersCount}`);
            console.log(`    Total Spent:   €${customer.totalSpent}`);
            console.log(`    Avg Order:     €${result.summary.averageOrderValue}`);
            console.log(`    Member Since:  ${customer.createdAt.toLocaleDateString("de-DE")}`);

            if (orders.length > 0) {
                console.log(`\n  📦 Recent Orders:`);
                for (const order of orders) {
                    const date = order.createdAt.toLocaleDateString("de-DE");
                    const status = `${order.financialStatus}/${order.fulfillmentStatus || 'unfulfilled'}`;
                    console.log(`    ${order.name.padEnd(12)} │ ${date} │ ${status.padEnd(20)} │ €${order.totalPrice}`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

customersCommand
    .command("search <query>")
    .description("Search customers by email, name, or phone")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const customers = await client.searchCustomers(query);

            if (options.json) {
                console.log(JSON.stringify(customers, null, 2));
                return;
            }

            console.log(`\n  🔍 Search: "${query}" (${customers.length} results)\n`);

            if (customers.length === 0) {
                console.log("  No customers found.");
                return;
            }

            for (const c of customers) {
                const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || "Unknown";
                console.log(`  ${c.id.padEnd(15)} │ ${name.slice(0, 20).padEnd(20)} │ ${c.email.slice(0, 30).padEnd(30)} │ ${c.ordersCount} orders`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// =============================================================================
// PRODUCTS
// =============================================================================

const productsCommand = new Command("products")
    .description("Manage Shopify products");

productsCommand
    .command("list")
    .description("List products")
    .option("-l, --limit <num>", "Number of products", "20")
    .option("-s, --status <status>", "Filter by status (ACTIVE, ARCHIVED, DRAFT)")
    .option("--low-stock [threshold]", "Show only low stock products")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ShopifyClient.fromConfig();
            
            let products;
            if (options.lowStock !== undefined) {
                const threshold = typeof options.lowStock === 'string' ? parseInt(options.lowStock, 10) : 5;
                products = await client.getLowStockProducts(threshold);
            } else {
                products = await client.getProducts({
                    limit: parseInt(options.limit, 10),
                    status: options.status,
                });
            }

            if (options.json) {
                console.log(JSON.stringify(products, null, 2));
                return;
            }

            const title = options.lowStock !== undefined 
                ? `⚠️  Low Stock Products (${products.length})`
                : `📦 Shopify Products (${products.length})`;

            console.log(`\n  ${title}\n`);

            if (products.length === 0) {
                console.log("  No products found.");
                return;
            }

            for (const p of products) {
                const sku = p.variants[0]?.sku || "-";
                const stock = p.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
                const price = p.variants[0]?.price || "0";
                console.log(`  ${p.id.padEnd(15)} │ ${sku.padEnd(15)} │ ${p.title.slice(0, 35).padEnd(35)} │ ${String(stock).padEnd(5)} │ €${price}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

productsCommand
    .command("get <id>")
    .description("Get product details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const product = await client.getProduct(id);

            if (options.json) {
                console.log(JSON.stringify(product, null, 2));
                return;
            }

            console.log(`\n  📦 ${product.title}`);
            console.log("  " + "─".repeat(50));
            console.log(`  ID:       ${product.id}`);
            console.log(`  Handle:   ${product.handle}`);
            console.log(`  Status:   ${product.status}`);
            console.log(`  Vendor:   ${product.vendor}`);
            console.log(`  Type:     ${product.productType}`);
            console.log(`  Tags:     ${product.tags.join(', ') || '-'}`);

            if (product.variants.length > 0) {
                console.log(`\n  Variants:`);
                for (const v of product.variants) {
                    const sku = v.sku || "-";
                    console.log(`    ${v.title.padEnd(20)} │ ${sku.padEnd(15)} │ €${v.price.padEnd(8)} │ Stock: ${v.inventoryQuantity}`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

productsCommand
    .command("search <query>")
    .description("Search products by title, handle, or SKU")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const products = await client.searchProducts(query);

            if (options.json) {
                console.log(JSON.stringify(products, null, 2));
                return;
            }

            console.log(`\n  🔍 Search: "${query}" (${products.length} results)\n`);

            if (products.length === 0) {
                console.log("  No products found.");
                return;
            }

            for (const p of products) {
                const sku = p.variants[0]?.sku || "-";
                const price = p.variants[0]?.price || "0";
                console.log(`  ${p.id.padEnd(15)} │ ${sku.padEnd(15)} │ ${p.title.slice(0, 40).padEnd(40)} │ €${price}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

productsCommand
    .command("update <id>")
    .description("Update product")
    .option("--title <title>", "New title")
    .option("--status <status>", "New status (ACTIVE, ARCHIVED, DRAFT)")
    .option("--vendor <vendor>", "New vendor")
    .option("--type <type>", "New product type")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = ShopifyClient.fromConfig();
            
            const updates: Record<string, string> = {};
            if (options.title) updates.title = options.title;
            if (options.status) updates.status = options.status;
            if (options.vendor) updates.vendor = options.vendor;
            if (options.type) updates.productType = options.type;

            if (Object.keys(updates).length === 0) {
                console.error("Error: Provide at least one update option (--title, --status, --vendor, --type)");
                process.exit(1);
            }

            const product = await client.updateProduct(id, updates);

            if (options.json) {
                console.log(JSON.stringify(product, null, 2));
                return;
            }

            console.log(`\n  ✓ Product ${product.id} updated`);
            console.log(`    Title:  ${product.title}`);
            console.log(`    Status: ${product.status}\n`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// =============================================================================
// ANALYTICS
// =============================================================================

const analyticsCommand = new Command("analytics")
    .description("Shopify store analytics");

analyticsCommand
    .command("daily")
    .alias("today")
    .description("Today's metrics")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const metrics = await client.getDailyMetrics();

            if (options.json) {
                console.log(JSON.stringify(metrics, null, 2));
                return;
            }

            console.log(`\n  📊 Daily Report (Today)`);
            console.log("  " + "═".repeat(50));
            console.log(`\n  Revenue:        €${metrics.revenueToday.toFixed(2)} ${metrics.currencyCode}`);
            console.log(`  Orders:         ${metrics.ordersToday}`);
            console.log(`  Avg Order:      €${metrics.averageOrderValue.toFixed(2)}`);
            console.log(`  New Customers:  ${metrics.newCustomersToday}`);
            console.log(`  Returning:      ${metrics.returningCustomersToday}`);

            if (metrics.topProducts.length > 0) {
                console.log(`\n  🏆 Top Products:`);
                for (const p of metrics.topProducts.slice(0, 5)) {
                    console.log(`    ${p.quantity}x ${p.title.slice(0, 40).padEnd(40)} €${p.revenue.toFixed(2)}`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

analyticsCommand
    .command("weekly")
    .alias("week")
    .description("Last 7 days metrics")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const metrics = await client.getWeeklyMetrics();

            if (options.json) {
                console.log(JSON.stringify(metrics, null, 2));
                return;
            }

            console.log(`\n  📊 Weekly Report (Last 7 Days)`);
            console.log("  " + "═".repeat(50));
            console.log(`\n  Revenue:        €${metrics.revenueToday.toFixed(2)} ${metrics.currencyCode}`);
            console.log(`  Orders:         ${metrics.ordersToday}`);
            console.log(`  Avg Order:      €${metrics.averageOrderValue.toFixed(2)}`);
            console.log(`  New Customers:  ${metrics.newCustomersToday}`);
            console.log(`  Returning:      ${metrics.returningCustomersToday}`);

            if (metrics.topProducts.length > 0) {
                console.log(`\n  🏆 Top Products:`);
                for (const p of metrics.topProducts.slice(0, 10)) {
                    console.log(`    ${String(p.quantity).padEnd(4)} ${p.title.slice(0, 40).padEnd(40)} €${p.revenue.toFixed(2)}`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

analyticsCommand
    .command("custom")
    .description("Custom date range metrics")
    .requiredOption("--from <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--to <date>", "End date (YYYY-MM-DD)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ShopifyClient.fromConfig();
            
            const start = new Date(options.from);
            const end = new Date(options.to);
            end.setHours(23, 59, 59, 999);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                console.error("Error: Invalid date format. Use YYYY-MM-DD");
                process.exit(1);
            }

            const metrics = await client.getShopMetrics({ start, end });

            if (options.json) {
                console.log(JSON.stringify(metrics, null, 2));
                return;
            }

            console.log(`\n  📊 Report (${options.from} - ${options.to})`);
            console.log("  " + "═".repeat(50));
            console.log(`\n  Revenue:        €${metrics.revenueToday.toFixed(2)} ${metrics.currencyCode}`);
            console.log(`  Orders:         ${metrics.ordersToday}`);
            console.log(`  Avg Order:      €${metrics.averageOrderValue.toFixed(2)}`);
            console.log(`  New Customers:  ${metrics.newCustomersToday}`);
            console.log(`  Returning:      ${metrics.returningCustomersToday}`);

            if (metrics.topProducts.length > 0) {
                console.log(`\n  🏆 Top Products:`);
                for (const p of metrics.topProducts) {
                    console.log(`    ${String(p.quantity).padEnd(4)} ${p.title.slice(0, 40).padEnd(40)} €${p.revenue.toFixed(2)}`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// =============================================================================
// AUTH / CONNECTION TEST
// =============================================================================

shopifyCommand
    .command("test")
    .alias("auth")
    .description("Test Shopify connection")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ShopifyClient.fromConfig();
            const result = await client.testConnection();

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            if (result.success) {
                console.log(`\n  ✓ Connected to Shopify`);
                console.log(`    Shop: ${result.shopName}\n`);
            } else {
                console.log(`\n  ✗ Connection failed`);
                console.log(`    Error: ${result.error}\n`);
                process.exit(1);
            }

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// =============================================================================
// REGISTER SUBCOMMANDS
// =============================================================================

shopifyCommand.addCommand(ordersCommand);
shopifyCommand.addCommand(customersCommand);
shopifyCommand.addCommand(productsCommand);
shopifyCommand.addCommand(analyticsCommand);

export default shopifyCommand;
