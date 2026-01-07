/**
 * Business Operations Interactive Menu
 * Provides access to Billbee, Zendesk, SeaTable, and Qdrant
 */
import { select, input } from "@inquirer/prompts";
import { pressEnterToContinue } from "./utils.js";
import { ZendeskClient, BillbeeClient, SeaTableClient, QdrantClient, EmbeddingService } from "../../lib/biz/index.js";
// ============================================
// MAIN BUSINESS MENU
// ============================================
export async function businessMenu() {
    const menuItems = [
        { name: "🎫 Tickets (Zendesk)", value: "tickets" },
        { name: "👤 Customers (Billbee)", value: "customers" },
        { name: "📋 SeaTable (Supply Chain)", value: "seatable" },
        { name: "🔍 Qdrant (Vector DB)", value: "qdrant" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Business Operations:",
        choices: menuItems,
    });
    switch (choice) {
        case "tickets":
            await ticketsSubMenu();
            break;
        case "customers":
            await customersSubMenu();
            break;
        case "seatable":
            await seatableSubMenu();
            break;
        case "qdrant":
            await qdrantSubMenu();
            break;
        case "back":
            return;
    }
}
// ============================================
// TICKETS SUBMENU (Zendesk)
// ============================================
async function ticketsSubMenu() {
    const menuItems = [
        { name: "List recent tickets", value: "list" },
        { name: "Get ticket details", value: "get" },
        { name: "Search tickets", value: "search" },
        { name: "---", value: "sep1" },
        { name: "[PREBUILD] Find similar tickets", value: "similar" },
        { name: "[PREBUILD] Knowledge search", value: "knowledge" },
        { name: "Back", value: "back" },
    ];
    const choice = await select({
        message: "Tickets:",
        choices: menuItems.filter(m => !m.value.startsWith("sep")),
    });
    try {
        const zendesk = ZendeskClient.fromConfig();
        switch (choice) {
            case "list":
                console.log("\n  Fetching tickets...\n");
                const tickets = await zendesk.listTickets({ per_page: 10 });
                console.log(`  🎫 Recent Tickets (${tickets.length})\n`);
                for (const t of tickets) {
                    console.log(`  #${String(t.id).padEnd(8)} │ ${t.status.padEnd(8)} │ ${t.subject.slice(0, 40)}`);
                }
                break;
            case "get":
                const ticketId = await input({ message: "Ticket ID:" });
                const ticket = await zendesk.getTicket(parseInt(ticketId, 10));
                console.log(`\n  Ticket #${ticket.id}: ${ticket.subject}`);
                console.log(`  Status: ${ticket.status} | Priority: ${ticket.priority || "normal"}`);
                console.log(`  Created: ${new Date(ticket.created_at).toLocaleString("de-DE")}`);
                break;
            case "search":
                const query = await input({ message: "Search query:" });
                console.log("\n  Searching...\n");
                const results = await zendesk.searchTickets(query);
                console.log(`  Found ${results.length} tickets\n`);
                for (const t of results.slice(0, 10)) {
                    console.log(`  #${String(t.id).padEnd(8)} │ ${t.subject.slice(0, 45)}`);
                }
                break;
            case "similar":
                const embeddings = EmbeddingService.fromConfig();
                const qdrant = QdrantClient.fromConfig();
                const simQuery = await input({ message: "Describe the issue:" });
                console.log("\n  Generating embedding...");
                const vector = await embeddings.embed(simQuery);
                console.log("  Searching similar tickets...\n");
                const simResults = await qdrant.search("zendesk_tickets_01", vector, 5);
                for (const r of simResults) {
                    const p = r.payload;
                    console.log(`  [${(r.score * 100).toFixed(1)}%] ${p?.subject || r.id}`);
                }
                break;
            case "knowledge":
                const kEmbeddings = EmbeddingService.fromConfig();
                const kQdrant = QdrantClient.fromConfig();
                const kQuery = await input({ message: "Search resolved tickets:" });
                console.log("\n  Searching knowledge base...\n");
                const kVector = await kEmbeddings.embed(kQuery);
                const kResults = await kQdrant.search("tickets_learned", kVector, 3);
                for (const r of kResults) {
                    const p = r.payload;
                    console.log(`  [${(r.score * 100).toFixed(1)}%] ${p?.subject || r.id}`);
                    if (p?.resolution)
                        console.log(`    → ${String(p.resolution).slice(0, 60)}...`);
                }
                break;
            case "back":
                return;
        }
    }
    catch (error) {
        console.error("\n  Error:", error.message);
    }
    console.log("");
    await pressEnterToContinue();
}
// ============================================
// CUSTOMERS SUBMENU (Billbee)
// ============================================
async function customersSubMenu() {
    const menuItems = [
        { name: "Search by email", value: "search" },
        { name: "Order history", value: "history" },
        { name: "[PREBUILD] Customer 360", value: "360" },
        { name: "Back", value: "back" },
    ];
    const choice = await select({
        message: "Customers:",
        choices: menuItems,
    });
    try {
        switch (choice) {
            case "search":
            case "history":
                const billbee = BillbeeClient.fromConfig();
                const email = await input({ message: "Customer email:" });
                console.log("\n  Searching...\n");
                const result = await billbee.findCustomerByEmail(email);
                if (result) {
                    const addr = result.address;
                    console.log(`  👤 ${addr?.FirstName || ""} ${addr?.LastName || ""}`);
                    console.log(`  Orders: ${result.orders.length}`);
                    for (const o of result.orders.slice(0, 5)) {
                        console.log(`    #${o.OrderNumber} │ €${o.TotalCost?.toFixed(2) || "0"}`);
                    }
                }
                else {
                    console.log("  Customer not found.");
                }
                break;
            case "360":
                const b = BillbeeClient.fromConfig();
                const z = ZendeskClient.fromConfig();
                const e360 = await input({ message: "Customer email:" });
                console.log("\n  Fetching from Billbee + Zendesk...\n");
                const [customer, tickets] = await Promise.all([
                    b.findCustomerByEmail(e360).catch(() => null),
                    z.searchTickets(`requester:${e360}`).catch(() => []),
                ]);
                console.log(`  👤 Customer 360: ${e360}`);
                console.log("  " + "═".repeat(50));
                if (customer) {
                    console.log(`  📦 Orders: ${customer.orders.length}`);
                }
                else {
                    console.log("  📦 No Billbee data");
                }
                console.log(`  🎫 Tickets: ${tickets.length}`);
                break;
            case "back":
                return;
        }
    }
    catch (error) {
        console.error("\n  Error:", error.message);
    }
    console.log("");
    await pressEnterToContinue();
}
// ============================================
// SEATABLE SUBMENU
// ============================================
async function seatableSubMenu() {
    const menuItems = [
        { name: "List tables", value: "tables" },
        { name: "List rows", value: "rows" },
        { name: "---", value: "sep" },
        { name: "[PREBUILD] Find supplier", value: "supplier" },
        { name: "[PREBUILD] Stock check", value: "stock" },
        { name: "Back", value: "back" },
    ];
    const choice = await select({
        message: "SeaTable:",
        choices: menuItems.filter(m => !m.value.startsWith("sep")),
    });
    try {
        const client = SeaTableClient.fromConfig();
        switch (choice) {
            case "tables":
                console.log("\n  Fetching tables...\n");
                const meta = await client.getMetadata();
                for (const t of meta.tables) {
                    console.log(`  📋 ${t.name}`);
                }
                break;
            case "rows":
                const tableName = await input({ message: "Table name:" });
                console.log("\n  Fetching rows...\n");
                const rows = await client.listRows({ table_name: tableName, limit: 10 });
                console.log(`  Found ${rows.length} rows`);
                for (const r of rows) {
                    console.log(`  [${r._id.slice(0, 8)}] ${JSON.stringify(r).slice(0, 60)}...`);
                }
                break;
            case "supplier":
                const query = await input({ message: "Search suppliers:" });
                console.log("\n  Searching...\n");
                const allRows = await client.listRows({ table_name: "Suppliers", limit: 100 });
                const lq = query.toLowerCase();
                const filtered = allRows.filter(r => String(r.Name || "").toLowerCase().includes(lq) ||
                    String(r.TAG || "").toLowerCase().includes(lq));
                for (const r of filtered.slice(0, 10)) {
                    console.log(`  ${r.Name || r._id} │ ${r.TAG || ""}`);
                }
                break;
            case "stock":
                const sku = await input({ message: "SKU:" });
                console.log("\n  Checking stock...\n");
                const sources = await client.listRows({ table_name: "Supplier_Sources", limit: 100 });
                const matches = sources.filter(s => String(s.SKU || s.sku || "").includes(sku));
                for (const s of matches) {
                    console.log(`  ${s.Supplier || "?"} │ Stock: ${s.Stock || "?"} │ Price: ${s.Price || "?"}`);
                }
                break;
            case "back":
                return;
        }
    }
    catch (error) {
        console.error("\n  Error:", error.message);
    }
    console.log("");
    await pressEnterToContinue();
}
// ============================================
// QDRANT SUBMENU
// ============================================
async function qdrantSubMenu() {
    const menuItems = [
        { name: "List collections", value: "list" },
        { name: "Collection info", value: "info" },
        { name: "Back", value: "back" },
    ];
    const choice = await select({
        message: "Qdrant:",
        choices: menuItems,
    });
    try {
        const client = QdrantClient.fromConfig();
        switch (choice) {
            case "list":
                console.log("\n  Fetching collections...\n");
                const collections = await client.listCollections();
                for (const name of collections) {
                    const info = await client.getCollection(name).catch(() => null);
                    console.log(`  📁 ${name.padEnd(35)} │ ${info?.pointsCount || "?"} points`);
                }
                break;
            case "info":
                const collName = await input({ message: "Collection name:" });
                const info = await client.getCollection(collName);
                console.log(`\n  📁 ${info.name}`);
                console.log(`  Points: ${info.pointsCount}`);
                break;
            case "back":
                return;
        }
    }
    catch (error) {
        console.error("\n  Error:", error.message);
    }
    console.log("");
    await pressEnterToContinue();
}
export default businessMenu;
