/**
 * Husky Biz Customers Command
 *
 * Access customer profiles via Billbee (from order data)
 */
import { Command } from "commander";
import { BillbeeClient } from "../../lib/biz/index.js";
export const customersCommand = new Command("customers")
    .description("Access customer profiles (Billbee)");
// husky biz customers search <email>
customersCommand
    .command("search <email>")
    .description("Search customers by email")
    .option("--json", "Output as JSON")
    .action(async (email, options) => {
    try {
        const client = BillbeeClient.fromConfig();
        const result = await client.findCustomerByEmail(email);
        if (!result) {
            console.log(`\n  No customer found with email: ${email}\n`);
            process.exit(0);
        }
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        console.log(`\n  👤 Customer: ${email}`);
        console.log("  " + "─".repeat(40));
        const addr = result.address;
        if (addr) {
            console.log(`  Name:    ${addr.FirstName || ""} ${addr.LastName || ""}`);
            if (addr.Company)
                console.log(`  Company: ${addr.Company}`);
            console.log(`  Address: ${addr.Street || ""} ${addr.HouseNumber || ""}`);
            console.log(`           ${addr.Zip || ""} ${addr.City || ""}`);
            if (addr.Phone)
                console.log(`  Phone:   ${addr.Phone}`);
        }
        console.log(`\n  Orders: ${result.orders.length}`);
        console.log("");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz customers history <email>
customersCommand
    .command("history <email>")
    .description("Get order history for customer by email")
    .option("-l, --limit <num>", "Max orders to show", "10")
    .option("--json", "Output as JSON")
    .action(async (email, options) => {
    try {
        const client = BillbeeClient.fromConfig();
        const result = await client.findCustomerByEmail(email);
        if (!result) {
            console.log(`\n  No customer found with email: ${email}\n`);
            process.exit(0);
        }
        const orders = result.orders.slice(0, parseInt(options.limit, 10));
        if (options.json) {
            console.log(JSON.stringify(orders, null, 2));
            return;
        }
        const addr = result.address;
        const name = addr ? `${addr.FirstName || ""} ${addr.LastName || ""}`.trim() : email;
        console.log(`\n  📋 Order History for ${name} (${email})`);
        console.log("  " + "─".repeat(60));
        console.log(`\n  ${result.orders.length} total orders\n`);
        if (orders.length === 0) {
            console.log("  No orders found.");
            return;
        }
        for (const order of orders) {
            const date = order.CreatedAt ? new Date(order.CreatedAt).toLocaleDateString("de-DE") : "?";
            const total = order.TotalCost?.toFixed(2) || "0.00";
            console.log(`  #${(order.OrderNumber || "?").padEnd(12)} │ ${date} │ €${total}`);
        }
        console.log("");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// ============================================================================
// PREBUILD COMMANDS
// ============================================================================
import { ZendeskClient } from "../../lib/biz/index.js";
// husky biz customers 360 <email>
customersCommand
    .command("360 <email>")
    .alias("full")
    .description("[PREBUILD] Full customer view (Billbee orders + Zendesk tickets)")
    .option("--json", "Output as JSON")
    .action(async (email, options) => {
    try {
        const billbee = BillbeeClient.fromConfig();
        const zendesk = ZendeskClient.fromConfig();
        // Parallel fetch from both systems
        console.log(`  Fetching customer data for ${email}...`);
        const [customerResult, tickets] = await Promise.all([
            billbee.findCustomerByEmail(email).catch(() => null),
            zendesk.searchTickets(`requester:${email}`).catch(() => []),
        ]);
        const result = {
            email,
            billbee: customerResult ? {
                name: customerResult.address
                    ? `${customerResult.address.FirstName || ''} ${customerResult.address.LastName || ''}`.trim()
                    : null,
                company: customerResult.address?.Company || null,
                phone: customerResult.address?.Phone || null,
                orders: customerResult.orders.slice(0, 5),
                totalOrders: customerResult.orders.length,
                totalSpent: customerResult.orders.reduce((sum, o) => sum + (o.TotalCost || 0), 0),
            } : null,
            zendesk: {
                tickets: tickets.slice(0, 5),
                totalTickets: tickets.length,
                openTickets: tickets.filter(t => ['new', 'open', 'pending'].includes(String(t.status))).length,
            },
        };
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        console.log(`\n  👤 Customer 360: ${email}`);
        console.log("  " + "═".repeat(60));
        // Billbee section
        if (result.billbee) {
            console.log(`\n  📦 ORDERS (Billbee)`);
            console.log("  " + "─".repeat(40));
            if (result.billbee.name)
                console.log(`  Name:    ${result.billbee.name}`);
            if (result.billbee.company)
                console.log(`  Company: ${result.billbee.company}`);
            if (result.billbee.phone)
                console.log(`  Phone:   ${result.billbee.phone}`);
            console.log(`  Total:   ${result.billbee.totalOrders} orders | €${result.billbee.totalSpent.toFixed(2)}`);
            if (result.billbee.orders.length > 0) {
                console.log(`\n  Recent orders:`);
                for (const order of result.billbee.orders) {
                    const date = order.CreatedAt ? new Date(order.CreatedAt).toLocaleDateString("de-DE") : "?";
                    console.log(`    #${(order.OrderNumber || "?").padEnd(12)} │ ${date} │ €${(order.TotalCost || 0).toFixed(2)}`);
                }
            }
        }
        else {
            console.log(`\n  📦 ORDERS: No Billbee data found`);
        }
        // Zendesk section
        console.log(`\n  🎫 TICKETS (Zendesk)`);
        console.log("  " + "─".repeat(40));
        console.log(`  Total:   ${result.zendesk.totalTickets} tickets | ${result.zendesk.openTickets} open`);
        if (result.zendesk.tickets.length > 0) {
            console.log(`\n  Recent tickets:`);
            for (const ticket of result.zendesk.tickets) {
                const statusIcon = getStatusIcon(String(ticket.status));
                console.log(`    ${statusIcon} #${String(ticket.id).padEnd(8)} │ ${String(ticket.status).padEnd(8)} │ ${String(ticket.subject).slice(0, 35)}`);
            }
        }
        console.log("");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
function getStatusIcon(status) {
    switch (status) {
        case "new": return "🆕";
        case "open": return "📬";
        case "pending": return "⏳";
        case "solved": return "✅";
        case "closed": return "🔒";
        default: return "○";
    }
}
export default customersCommand;
