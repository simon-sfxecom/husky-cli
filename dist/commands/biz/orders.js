/**
 * Husky Biz Orders Command
 *
 * Manages orders via Billbee API
 */
import { Command } from "commander";
import { BillbeeClient, OrderStateLabels } from "../../lib/biz/index.js";
export const ordersCommand = new Command("orders")
    .description("Manage orders (Billbee)");
// husky biz orders list
ordersCommand
    .command("list")
    .description("List orders")
    .option("-s, --status <status>", "Filter by status (ordered, paid, shipped, completed, etc.)")
    .option("-l, --limit <num>", "Number of orders to show", "20")
    .option("-p, --page <num>", "Page number", "1")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    try {
        const client = BillbeeClient.fromConfig();
        // Map status string to state ID
        let orderStateId;
        if (options.status) {
            const statusLower = options.status.toLowerCase();
            const stateEntry = Object.entries(OrderStateLabels).find(([, label]) => label === statusLower);
            if (stateEntry) {
                orderStateId = [parseInt(stateEntry[0], 10)];
            }
            else {
                console.error(`Unknown status: ${options.status}`);
                console.error("Available: ordered, paid, shipped, completed, cancelled, return, packing, ready");
                process.exit(1);
            }
        }
        const response = await client.listOrders({
            page: parseInt(options.page, 10),
            pageSize: parseInt(options.limit, 10),
            orderStateId,
            includePositions: true,
        });
        if (options.json) {
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        console.log(`\n  📦 Orders (${response.Paging.TotalRows} total)\n`);
        if (response.Data.length === 0) {
            console.log("  No orders found.");
            return;
        }
        for (const order of response.Data) {
            const stateLabel = OrderStateLabels[order.State || 0] || "unknown";
            const date = order.CreatedAt ? new Date(order.CreatedAt).toLocaleDateString("de-DE") : "?";
            const customer = order.InvoiceAddress?.LastName || order.Buyer?.Email || "Unknown";
            const total = order.TotalCost?.toFixed(2) || "0.00";
            console.log(`  #${order.OrderNumber?.padEnd(12)} │ ${stateLabel.padEnd(10)} │ ${date} │ ${customer.slice(0, 20).padEnd(20)} │ €${total}`);
        }
        console.log(`\n  Page ${response.Paging.Page} of ${response.Paging.TotalPages}\n`);
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz orders get <id>
ordersCommand
    .command("get <id>")
    .description("Get order details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    try {
        const client = BillbeeClient.fromConfig();
        const response = await client.getOrder(id);
        const order = response.Data;
        if (options.json) {
            console.log(JSON.stringify(order, null, 2));
            return;
        }
        const stateLabel = OrderStateLabels[order.State || 0] || "unknown";
        console.log(`\n  Order #${order.OrderNumber}`);
        console.log("  " + "─".repeat(50));
        console.log(`  Billbee ID:  ${order.BillbeeId || order.Id}`);
        console.log(`  Status:      ${stateLabel}`);
        console.log(`  Created:     ${order.CreatedAt ? new Date(order.CreatedAt).toLocaleString("de-DE") : "?"}`);
        console.log(`  Total:       €${order.TotalCost?.toFixed(2) || "0.00"}`);
        console.log(`  Shipping:    €${order.ShippingCost?.toFixed(2) || "0.00"}`);
        if (order.InvoiceNumber) {
            console.log(`  Invoice:     ${order.InvoiceNumber}`);
        }
        // Customer
        const addr = order.InvoiceAddress;
        if (addr) {
            console.log(`\n  Customer:`);
            console.log(`    ${addr.FirstName || ""} ${addr.LastName || ""}`);
            if (addr.Company)
                console.log(`    ${addr.Company}`);
            console.log(`    ${addr.Street || ""} ${addr.HouseNumber || ""}`);
            console.log(`    ${addr.Zip || ""} ${addr.City || ""}`);
            if (addr.Email)
                console.log(`    ${addr.Email}`);
        }
        // Items
        if (order.OrderItems && order.OrderItems.length > 0) {
            console.log(`\n  Items:`);
            for (const item of order.OrderItems) {
                const sku = item.Product?.SKU || "-";
                const title = item.Product?.Title?.slice(0, 35) || "Unknown";
                console.log(`    ${item.Quantity}x ${sku.padEnd(15)} ${title} (€${item.TotalPrice.toFixed(2)})`);
            }
        }
        console.log("");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz orders invoice <id>
ordersCommand
    .command("invoice <id>")
    .description("Get invoice info for order")
    .action(async (id) => {
    try {
        const client = BillbeeClient.fromConfig();
        const response = await client.getOrder(id);
        const order = response.Data;
        if (order.InvoiceNumber) {
            console.log(`\n  Invoice: ${order.InvoiceNumber}`);
            if (order.InvoiceDate) {
                console.log(`  Date:    ${new Date(order.InvoiceDate).toLocaleDateString("de-DE")}`);
            }
            console.log(`  Total:   €${order.TotalCost?.toFixed(2) || "0.00"}`);
        }
        else {
            console.log("\n  No invoice generated for this order.");
        }
        console.log("");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz orders update <id>
ordersCommand
    .command("update <id>")
    .description("Update order properties")
    .option("--state <state>", "New state (paid, shipped, completed, etc.)")
    .option("--comment <text>", "Add seller comment")
    .action(async (id, options) => {
    try {
        const client = BillbeeClient.fromConfig();
        const updates = {};
        if (options.state) {
            const stateEntry = Object.entries(OrderStateLabels).find(([, label]) => label === options.state.toLowerCase());
            if (stateEntry) {
                updates.State = parseInt(stateEntry[0], 10);
            }
            else {
                console.error(`Unknown state: ${options.state}`);
                process.exit(1);
            }
        }
        if (options.comment) {
            updates.SellerComment = options.comment;
        }
        if (Object.keys(updates).length === 0) {
            console.error("Error: Provide --state or --comment");
            process.exit(1);
        }
        const response = await client.updateOrder(id, updates);
        console.log(`✓ Order #${response.Data.OrderNumber} updated`);
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz orders add-tag <id> <tag>
ordersCommand
    .command("add-tag <id> <tag>")
    .description("Add a tag to an order")
    .action(async (id, tag) => {
    try {
        const client = BillbeeClient.fromConfig();
        await client.addOrderTags(parseInt(id, 10), [tag]);
        console.log(`✓ Tag "${tag}" added to order #${id}`);
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz orders remove-tag <id> <tag>
ordersCommand
    .command("remove-tag <id> <tag>")
    .description("Remove a tag from an order")
    .action(async (id, tag) => {
    try {
        const client = BillbeeClient.fromConfig();
        await client.removeOrderTags(parseInt(id, 10), [tag]);
        console.log(`✓ Tag "${tag}" removed from order #${id}`);
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz orders note <id>
ordersCommand
    .command("note <id>")
    .description("Add seller comment/note to order")
    .requiredOption("-m, --message <text>", "Note content")
    .action(async (id, options) => {
    try {
        const client = BillbeeClient.fromConfig();
        await client.updateOrder(id, {
            SellerComment: options.message,
        });
        console.log(`✓ Note added to order #${id}`);
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
export default ordersCommand;
