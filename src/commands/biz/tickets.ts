/**
 * Husky Biz Tickets Command
 * 
 * Manages support tickets via Zendesk API
 */

import { Command } from "commander";
import { ZendeskClient } from "../../lib/biz/index.js";
import * as fs from "fs";
import * as path from "path";

export const ticketsCommand = new Command("tickets")
    .description("Manage support tickets (Zendesk)");

// husky biz tickets list
ticketsCommand
    .command("list")
    .description("List tickets")
    .option("-s, --status <status>", "Filter by status (new, open, pending, solved, closed)")
    .option("-l, --limit <num>", "Number of tickets", "25")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const tickets = await client.listTickets({
                per_page: parseInt(options.limit, 10),
                status: options.status,
            });

            if (options.json) {
                console.log(JSON.stringify(tickets, null, 2));
                return;
            }

            console.log(`\n  🎫 Tickets (${tickets.length})\n`);

            if (tickets.length === 0) {
                console.log("  No tickets found.");
                return;
            }

            for (const ticket of tickets) {
                const statusIcon = getStatusIcon(ticket.status);
                const date = new Date(ticket.updated_at).toLocaleDateString("de-DE");
                console.log(`  ${statusIcon} #${String(ticket.id).padEnd(8)} │ ${ticket.status.padEnd(8)} │ ${date} │ ${ticket.subject.slice(0, 45)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets get <id>
ticketsCommand
    .command("get <id>")
    .description("Get ticket with conversation history")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const ticketId = parseInt(id, 10);
            const [ticket, comments] = await Promise.all([
                client.getTicket(ticketId),
                client.getTicketComments(ticketId),
            ]);

            if (options.json) {
                console.log(JSON.stringify({ ticket, comments }, null, 2));
                return;
            }

            console.log(`\n  Ticket #${ticket.id}: ${ticket.subject}`);
            console.log("  " + "─".repeat(60));
            console.log(`  Status:   ${ticket.status}`);
            console.log(`  Priority: ${ticket.priority || "normal"}`);
            console.log(`  Created:  ${new Date(ticket.created_at).toLocaleString("de-DE")}`);
            console.log(`  Updated:  ${new Date(ticket.updated_at).toLocaleString("de-DE")}`);

            if (ticket.tags && ticket.tags.length > 0) {
                console.log(`  Tags:     ${ticket.tags.join(", ")}`);
            }

            console.log(`\n  Conversation (${comments.length} messages):`);
            console.log("  " + "─".repeat(60));

            for (const comment of comments) {
                const date = new Date(comment.created_at).toLocaleString("de-DE");
                const visibility = comment.public ? "Public" : "Internal";
                console.log(`\n  [${date}] (${visibility})`);
                console.log(`  ${comment.body.slice(0, 500)}${comment.body.length > 500 ? "..." : ""}`);

                if (comment.attachments && comment.attachments.length > 0) {
                    console.log(`  📎 ${comment.attachments.length} attachment(s)`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets reply <id> -m <message>
ticketsCommand
    .command("reply <id>")
    .description("Reply to a ticket (public)")
    .requiredOption("-m, --message <text>", "Reply message")
    .action(async (id, options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const ticket = await client.addComment(parseInt(id, 10), options.message, true);
            console.log(`✓ Public reply added to ticket #${ticket.id}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets note <id> -m <message>
ticketsCommand
    .command("note <id>")
    .description("Add internal note to ticket")
    .requiredOption("-m, --message <text>", "Note content")
    .action(async (id, options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const ticket = await client.addInternalNote(parseInt(id, 10), options.message);
            console.log(`✓ Internal note added to ticket #${ticket.id}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets update <id>
ticketsCommand
    .command("update <id>")
    .description("Update ticket properties")
    .option("--status <status>", "New status (open, pending, solved)")
    .option("--priority <priority>", "New priority (low, normal, high, urgent)")
    .action(async (id, options) => {
        try {
            const client = ZendeskClient.fromConfig();

            const updates: { status?: string; priority?: string } = {};
            if (options.status) updates.status = options.status;
            if (options.priority) updates.priority = options.priority;

            if (Object.keys(updates).length === 0) {
                console.error("Error: Provide --status or --priority");
                process.exit(1);
            }

            const ticket = await client.updateTicket(parseInt(id, 10), updates);
            console.log(`✓ Updated ticket #${ticket.id}`);
            console.log(`  Status: ${ticket.status}, Priority: ${ticket.priority || "normal"}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets close <id>
ticketsCommand
    .command("close <id>")
    .description("Close/solve a ticket")
    .action(async (id) => {
        try {
            const client = ZendeskClient.fromConfig();
            const ticket = await client.closeTicket(parseInt(id, 10));
            console.log(`✓ Ticket #${ticket.id} marked as solved`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets attachments <id>
ticketsCommand
    .command("attachments <id>")
    .description("List attachments for a ticket")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const attachments = await client.getTicketAttachments(parseInt(id, 10));

            if (options.json) {
                console.log(JSON.stringify(attachments, null, 2));
                return;
            }

            console.log(`\n  📎 Attachments for ticket #${id} (${attachments.length})\n`);

            if (attachments.length === 0) {
                console.log("  No attachments found.");
                return;
            }

            for (const att of attachments) {
                const size = (att.size / 1024).toFixed(1);
                console.log(`  ${att.id} │ ${att.file_name} │ ${size} KB │ ${att.content_type}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets download <id> <filename>
ticketsCommand
    .command("download <ticketId> <filename>")
    .description("Download an attachment")
    .option("-o, --output <path>", "Output path")
    .action(async (ticketId, filename, options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const attachments = await client.getTicketAttachments(parseInt(ticketId, 10));

            const attachment = attachments.find(a => a.file_name === filename || a.id === parseInt(filename, 10));
            if (!attachment) {
                console.error(`Attachment "${filename}" not found in ticket #${ticketId}`);
                process.exit(1);
            }

            const data = await client.downloadAttachment(attachment.content_url);
            const outputPath = options.output || path.join(process.cwd(), attachment.file_name);

            fs.writeFileSync(outputPath, Buffer.from(data));
            console.log(`✓ Downloaded: ${outputPath}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// Helper
function getStatusIcon(status: string): string {
    switch (status) {
        case "new": return "🆕";
        case "open": return "📬";
        case "pending": return "⏳";
        case "hold": return "⏸️";
        case "solved": return "✅";
        case "closed": return "🔒";
        default: return "○";
    }
}

// husky biz tickets create
ticketsCommand
    .command("create")
    .description("Create a new ticket")
    .requiredOption("-s, --subject <text>", "Ticket subject")
    .requiredOption("-m, --message <text>", "Initial message/description")
    .option("-e, --email <email>", "Requester email")
    .option("-p, --priority <priority>", "Priority (low, normal, high, urgent)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ZendeskClient.fromConfig();

            const ticketData: {
                subject: string;
                comment: { body: string };
                requester?: { email: string };
                priority?: string;
            } = {
                subject: options.subject,
                comment: { body: options.message },
            };

            if (options.email) {
                ticketData.requester = { email: options.email };
            }
            if (options.priority) {
                ticketData.priority = options.priority;
            }

            const ticket = await client.createTicket(ticketData);

            if (options.json) {
                console.log(JSON.stringify(ticket, null, 2));
                return;
            }

            console.log(`✓ Ticket created: #${ticket.id}`);
            console.log(`  Subject: ${ticket.subject}`);
            console.log(`  Status: ${ticket.status}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets search <query>
ticketsCommand
    .command("search <query>")
    .description("Search tickets (Zendesk search syntax)")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const tickets = await client.searchTickets(query);

            if (options.json) {
                console.log(JSON.stringify(tickets, null, 2));
                return;
            }

            console.log(`\n  🔍 Search: "${query}" (${tickets.length} results)\n`);

            if (tickets.length === 0) {
                console.log("  No tickets found.");
                return;
            }

            for (const ticket of tickets) {
                const statusIcon = getStatusIcon(String(ticket.status));
                console.log(`  ${statusIcon} #${String(ticket.id).padEnd(8)} │ ${String(ticket.status).padEnd(8)} │ ${ticket.subject.slice(0, 45)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets delete <id>
ticketsCommand
    .command("delete <id>")
    .description("Delete a ticket (soft delete)")
    .action(async (id) => {
        try {
            const client = ZendeskClient.fromConfig();
            await client.deleteTicket(parseInt(id, 10));
            console.log(`✓ Ticket #${id} deleted`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets assign <id> <userId>
ticketsCommand
    .command("assign <id> <userId>")
    .description("Assign ticket to a user")
    .action(async (id, userId) => {
        try {
            const client = ZendeskClient.fromConfig();
            const ticket = await client.assignTicket(parseInt(id, 10), parseInt(userId, 10));
            console.log(`✓ Ticket #${ticket.id} assigned to user #${userId}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets tags <id> add/remove <tag>
const tagsCommand = ticketsCommand
    .command("tags <id>")
    .description("Manage ticket tags");

tagsCommand
    .command("add <tag>")
    .description("Add a tag to ticket")
    .action(async (tag, options, command) => {
        try {
            const client = ZendeskClient.fromConfig();
            const ticketId = parseInt(command.parent.args[0], 10);
            const ticket = await client.addTags(ticketId, [tag]);
            console.log(`✓ Tag "${tag}" added to ticket #${ticket.id}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

tagsCommand
    .command("remove <tag>")
    .description("Remove a tag from ticket")
    .action(async (tag, options, command) => {
        try {
            const client = ZendeskClient.fromConfig();
            const ticketId = parseInt(command.parent.args[0], 10);
            const ticket = await client.removeTags(ticketId, [tag]);
            console.log(`✓ Tag "${tag}" removed from ticket #${ticket.id}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets macros
const macrosCommand = ticketsCommand
    .command("macros")
    .description("Manage Zendesk macros (templates)");

macrosCommand
    .command("list")
    .description("List available macros")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const macros = await client.listMacros({ active: true });

            if (options.json) {
                console.log(JSON.stringify(macros, null, 2));
                return;
            }

            console.log(`\n  📋 Macros (${macros.length})\n`);

            if (macros.length === 0) {
                console.log("  No macros found.");
                return;
            }

            for (const macro of macros) {
                console.log(`  #${String(macro.id).padEnd(8)} │ ${macro.title.slice(0, 50)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

macrosCommand
    .command("get <id>")
    .description("Get macro details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const client = ZendeskClient.fromConfig();
            const macro = await client.getMacro(parseInt(id, 10));

            if (options.json) {
                console.log(JSON.stringify(macro, null, 2));
                return;
            }

            console.log(`\n  Macro #${macro.id}: ${macro.title}`);
            console.log("  " + "─".repeat(50));
            console.log(`  Active: ${macro.active ? "Yes" : "No"}`);
            if (macro.description) {
                console.log(`  Description: ${macro.description}`);
            }
            console.log(`\n  Actions:`);
            for (const action of macro.actions) {
                console.log(`    ${action.field}: ${typeof action.value === 'string' ? action.value.slice(0, 60) : JSON.stringify(action.value)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

macrosCommand
    .command("apply <ticketId> <macroId>")
    .description("Apply a macro to a ticket")
    .action(async (ticketId, macroId) => {
        try {
            const client = ZendeskClient.fromConfig();
            const ticket = await client.applyMacro(parseInt(ticketId, 10), parseInt(macroId, 10));
            console.log(`✓ Macro #${macroId} applied to ticket #${ticket.id}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// ============================================================================
// PREBUILD SEMANTIC SEARCH COMMANDS
// ============================================================================

import { EmbeddingService, QdrantClient } from "../../lib/biz/index.js";

const TICKET_COLLECTION = "zendesk_tickets_01";
const LEARNED_COLLECTION = "tickets_learned";

// husky biz tickets similar <id>
ticketsCommand
    .command("similar <id>")
    .description("[PREBUILD] Find tickets similar to given ticket")
    .option("-l, --limit <num>", "Number of results", "5")
    .option("-c, --collection <name>", "Qdrant collection", TICKET_COLLECTION)
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const zendesk = ZendeskClient.fromConfig();
            const embeddings = EmbeddingService.fromConfig();
            const qdrant = QdrantClient.fromConfig();

            // 1. Fetch ticket from Zendesk
            console.log(`  Fetching ticket #${id}...`);
            const ticket = await zendesk.getTicket(parseInt(id, 10));

            // 2. Create embedding from subject + description
            const text = `${ticket.subject}\n${ticket.description || ''}`;
            console.log(`  Generating embedding...`);
            const vector = await embeddings.embed(text);

            // 3. Search Qdrant
            console.log(`  Searching ${options.collection}...`);
            const results = await qdrant.search(
                options.collection,
                vector,
                parseInt(options.limit, 10) + 1 // +1 to exclude self
            );

            // Filter out the same ticket
            const filteredResults = results.filter(r => {
                const payload = r.payload as { ticket_id?: number; id?: number } | undefined;
                return payload?.ticket_id !== ticket.id && payload?.id !== ticket.id;
            }).slice(0, parseInt(options.limit, 10));

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    source_ticket: { id: ticket.id, subject: ticket.subject },
                    similar: filteredResults.map(r => ({
                        id: (r.payload as Record<string, unknown>)?.ticket_id || r.id,
                        score: r.score,
                        subject: (r.payload as Record<string, unknown>)?.subject,
                        status: (r.payload as Record<string, unknown>)?.status,
                    })),
                }, null, 2));
                return;
            }

            console.log(`\n  🔍 Tickets similar to #${ticket.id}: "${ticket.subject}"\n`);

            if (filteredResults.length === 0) {
                console.log("  No similar tickets found.");
                return;
            }

            for (const result of filteredResults) {
                const payload = result.payload as Record<string, unknown>;
                const ticketId = payload?.ticket_id || payload?.id || result.id;
                const subject = payload?.subject || '(no subject)';
                const status = payload?.status || '';
                console.log(`  [${(result.score * 100).toFixed(1)}%] #${ticketId} │ ${status} │ ${String(subject).slice(0, 45)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets find-similar "<query>"
ticketsCommand
    .command("find-similar <query>")
    .description("[PREBUILD] Semantic search tickets by text query")
    .option("-l, --limit <num>", "Number of results", "5")
    .option("-c, --collection <name>", "Qdrant collection", TICKET_COLLECTION)
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const embeddings = EmbeddingService.fromConfig();
            const qdrant = QdrantClient.fromConfig();

            // 1. Create embedding from query
            console.log(`  Generating embedding for query...`);
            const vector = await embeddings.embed(query);

            // 2. Search Qdrant
            console.log(`  Searching ${options.collection}...`);
            const results = await qdrant.search(
                options.collection,
                vector,
                parseInt(options.limit, 10)
            );

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    query,
                    results: results.map(r => ({
                        id: (r.payload as Record<string, unknown>)?.ticket_id || r.id,
                        score: r.score,
                        subject: (r.payload as Record<string, unknown>)?.subject,
                        status: (r.payload as Record<string, unknown>)?.status,
                    })),
                }, null, 2));
                return;
            }

            console.log(`\n  🔍 Semantic search: "${query}"\n`);

            if (results.length === 0) {
                console.log("  No matching tickets found.");
                return;
            }

            for (const result of results) {
                const payload = result.payload as Record<string, unknown>;
                const ticketId = payload?.ticket_id || payload?.id || result.id;
                const subject = payload?.subject || '(no subject)';
                const status = payload?.status || '';
                console.log(`  [${(result.score * 100).toFixed(1)}%] #${ticketId} │ ${status} │ ${String(subject).slice(0, 45)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// husky biz tickets knowledge "<query>"
ticketsCommand
    .command("knowledge <query>")
    .description("[PREBUILD] Search resolved tickets for solutions")
    .option("-l, --limit <num>", "Number of results", "3")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const embeddings = EmbeddingService.fromConfig();
            const qdrant = QdrantClient.fromConfig();

            // 1. Create embedding from query
            console.log(`  Generating embedding...`);
            const vector = await embeddings.embed(query);

            // 2. Search learned tickets collection
            console.log(`  Searching ${LEARNED_COLLECTION}...`);
            const results = await qdrant.search(
                LEARNED_COLLECTION,
                vector,
                parseInt(options.limit, 10)
            );

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    query,
                    knowledge: results.map(r => ({
                        id: (r.payload as Record<string, unknown>)?.ticket_id || r.id,
                        score: r.score,
                        subject: (r.payload as Record<string, unknown>)?.subject,
                        resolution: (r.payload as Record<string, unknown>)?.resolution || (r.payload as Record<string, unknown>)?.solution,
                    })),
                }, null, 2));
                return;
            }

            console.log(`\n  📚 Knowledge search: "${query}"\n`);

            if (results.length === 0) {
                console.log("  No relevant knowledge found.");
                return;
            }

            for (const result of results) {
                const payload = result.payload as Record<string, unknown>;
                const ticketId = payload?.ticket_id || payload?.id || result.id;
                const subject = payload?.subject || '(no subject)';
                const resolution = payload?.resolution || payload?.solution || '';
                console.log(`  [${(result.score * 100).toFixed(1)}%] #${ticketId}`);
                console.log(`    Subject: ${String(subject).slice(0, 60)}`);
                if (resolution) {
                    console.log(`    Resolution: ${String(resolution).slice(0, 100)}...`);
                }
                console.log("");
            }

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

export default ticketsCommand;
