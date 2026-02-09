import { Command } from "commander";
import { GotessClient } from "../../lib/biz/gotess.js";
import { getConfig, getAuthHeaders, setGotessConfig } from "../config.js";
import * as readline from "readline";

function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function pollSmsCode(
    apiUrl: string,
    afterTimestamp: number,
    authHeaders: Record<string, string>,
    maxRetries = 3
): Promise<string | null> {
    for (let retry = 0; retry < maxRetries; retry++) {
        if (retry > 0) {
            console.log(`\n  Retry ${retry}/${maxRetries - 1}...`);
        }
        
        await new Promise(r => setTimeout(r, 60000));
        
        try {
            const res = await fetch(`${apiUrl}/api/webhooks/sms/latest?after=${afterTimestamp}`, {
                headers: authHeaders,
            });
            const data = await res.json() as { code?: string | null };
            if (data.code) {
                return data.code;
            }
        } catch {
            // ignore fetch errors
        }
        process.stdout.write(".");
    }
    return null;
}

export const gotessCommand = new Command("gotess")
    .description("Manage accounting (Gotess/Tess)");

gotessCommand
    .command("login")
    .description("Login to Gotess with 2FA")
    .option("-e, --email <email>", "Email address")
    .option("-p, --password <password>", "Password")
    .action(async (options) => {
        try {
            const client = new GotessClient();

            const email = options.email || await prompt("Email: ");
            const password = options.password || await prompt("Password: ");

            console.log("\n  Logging in...");
            const loginResult = await client.login(email, password);

            if (loginResult.user.factors && loginResult.user.factors.length > 0) {
                const factor = loginResult.user.factors[0];
                console.log(`  2FA required (${factor.factor_type})`);
                
                const challenge = await client.startMfaChallenge(factor.id);
                const smsRequestTime = Date.now();
                console.log("  SMS sent! Waiting for code via webhook");
                
                const config = getConfig();
                const apiUrl = process.env.HUSKY_API_URL || config.apiUrl;
                if (!apiUrl) {
                    throw new Error("API URL not configured. Run: husky config set api-url <url>");
                }

                const authHeaders = getAuthHeaders();
                if (Object.keys(authHeaders).length === 0) {
                    throw new Error("Not authenticated. Run: husky auth login --agent <name>");
                }
                
                const code = await pollSmsCode(apiUrl, smsRequestTime, authHeaders);
                if (!code) {
                    console.error("\n  ✗ Timeout waiting for SMS code");
                    process.exit(1);
                }
                
                console.log(`\n  ✓ Code received: ${code}`);
                const verified = await client.verifyMfa(factor.id, challenge.id, code);
                
                setGotessConfig('gotessToken', verified.access_token);
                console.log("  ✓ Login successful (with 2FA)");
            } else {
                setGotessConfig('gotessToken', loginResult.access_token);
                console.log("\n  ✓ Login successful");
            }

            const books = await client.listBooks();
            if (books.length > 0) {
                console.log("\n  Available books:");
                books.forEach((b, i) => console.log(`    ${i + 1}. ${b.name} (${b.id})`));
                
                if (books.length === 1) {
                    setGotessConfig('gotessBookId', books[0].id);
                    console.log(`\n  ✓ Auto-selected: ${books[0].name}`);
                } else {
                    const choice = await prompt("\n  Select book (number): ");
                    const idx = parseInt(choice, 10) - 1;
                    if (idx >= 0 && idx < books.length) {
                        setGotessConfig('gotessBookId', books[idx].id);
                        console.log(`  ✓ Selected: ${books[idx].name}`);
                    }
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("missing")
    .description("List transactions with missing invoices")
    .option("-l, --limit <num>", "Limit results", "50")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = GotessClient.fromConfig();
            const transactions = await client.getMissingInvoices();

            if (options.json) {
                console.log(JSON.stringify(transactions, null, 2));
                return;
            }

            console.log(`\n  📋 Missing Invoices (${transactions.length})\n`);

            if (transactions.length === 0) {
                console.log("  No missing invoices!");
                return;
            }

            let total = 0;
            for (const tx of transactions.slice(0, parseInt(options.limit, 10))) {
                const date = tx.value_date?.slice(0, 10) || "?";
                const amount = tx.amount || 0;
                const name = (tx.counterpart_name || tx.purpose || "Unknown").slice(0, 35);
                total += Math.abs(amount);
                console.log(`  ${date} │ ${amount.toFixed(2).padStart(10)} EUR │ ${name}`);
            }

            console.log(`\n  Total: ${total.toFixed(2)} EUR\n`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("transactions")
    .description("List transactions")
    .option("-s, --status <status>", "Filter by status (invoice_missing, invoice_linked, proofless_auto)")
    .option("-l, --limit <num>", "Limit results", "30")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = GotessClient.fromConfig();
            const transactions = await client.listTransactions({
                status: options.status,
                limit: parseInt(options.limit, 10),
            });

            if (options.json) {
                console.log(JSON.stringify(transactions, null, 2));
                return;
            }

            console.log(`\n  📊 Transactions (${transactions.length})\n`);

            for (const tx of transactions) {
                const date = tx.value_date?.slice(0, 10) || "?";
                const amount = tx.amount || 0;
                const name = (tx.counterpart_name || "?").slice(0, 30);
                const status = tx.transaction_status || "-";
                const marker = tx.invoice_id ? "✓" : "✗";
                console.log(`  ${marker} ${date} │ ${amount.toFixed(2).padStart(10)} EUR │ ${name.padEnd(30)} │ ${status}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("invoices")
    .description("List invoices/receipts")
    .option("-s, --search <term>", "Search by sender or filename")
    .option("-l, --limit <num>", "Limit results", "30")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = GotessClient.fromConfig();
            const invoices = await client.listInvoices({
                search: options.search,
                limit: parseInt(options.limit, 10),
            });

            if (options.json) {
                console.log(JSON.stringify(invoices, null, 2));
                return;
            }

            console.log(`\n  🧾 Invoices (${invoices.length})\n`);

            for (const inv of invoices) {
                const date = inv.invoice_date?.slice(0, 10) || "?";
                const amount = inv.amount?.toFixed(2).padStart(10) || "?".padStart(10);
                const sender = (inv.sender_name || "?").slice(0, 25);
                const file = (inv.filename || "").slice(0, 40);
                console.log(`  ${date} │ ${amount} EUR │ ${sender.padEnd(25)} │ ${file}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("match")
    .description("Auto-match invoices to transactions")
    .option("--dry-run", "Show matches without applying")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = GotessClient.fromConfig();
            console.log("\n  🔍 Analyzing transactions and invoices...\n");

            const result = await client.autoMatch();

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            if (result.matched.length > 0) {
                console.log(`  ✓ Found ${result.matched.length} matches:\n`);
                for (const { transaction, invoice } of result.matched) {
                    const txName = (transaction.counterpart_name || "?").slice(0, 25);
                    const invName = (invoice.sender_name || invoice.filename || "?").slice(0, 25);
                    console.log(`    ${transaction.value_date?.slice(0, 10)} │ ${transaction.amount.toFixed(2)} EUR │ ${txName}`);
                    console.log(`      → ${invName}`);
                }
            }

            if (result.unmatched.length > 0) {
                console.log(`\n  ✗ ${result.unmatched.length} unmatched transactions`);
            }

            if (!options.dryRun && result.matched.length > 0) {
                const confirm = await prompt("\n  Apply matches? (y/n): ");
                if (confirm.toLowerCase() === 'y') {
                    for (const { transaction, invoice } of result.matched) {
                        await client.linkInvoice(transaction.id, invoice.id);
                    }
                    console.log(`\n  ✓ Linked ${result.matched.length} invoices`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("link <transactionId> <invoiceId>")
    .description("Manually link an invoice to a transaction")
    .action(async (transactionId, invoiceId) => {
        try {
            const client = GotessClient.fromConfig();
            await client.linkInvoice(transactionId, invoiceId);
            console.log(`\n  ✓ Linked invoice ${invoiceId} to transaction ${transactionId}\n`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("proofless <transactionId>")
    .description("Mark a transaction as proofless (no invoice needed)")
    .action(async (transactionId) => {
        try {
            const client = GotessClient.fromConfig();
            await client.markProofless(transactionId);
            console.log(`\n  ✓ Transaction ${transactionId} marked as proofless\n`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("accounts")
    .description("List connected bank accounts")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const client = GotessClient.fromConfig();
            const accounts = await client.listAccounts();

            if (options.json) {
                console.log(JSON.stringify(accounts, null, 2));
                return;
            }

            console.log(`\n  🏦 Bank Accounts (${accounts.length})\n`);

            for (const acc of accounts) {
                const name = acc.account_name || "Unknown";
                const iban = acc.iban || "-";
                const type = acc.account_type || "-";
                console.log(`  ${acc.finapi_account_id} │ ${name.padEnd(20)} │ ${iban} │ ${type}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("status")
    .description("Show current Gotess session status")
    .action(async () => {
        try {
            const config = getConfig();
            const token = config.gotessToken;
            const bookId = config.gotessBookId;

            console.log("\n  Gotess Status");
            console.log("  " + "─".repeat(40));
            console.log(`  Logged in:  ${token ? "Yes" : "No"}`);
            console.log(`  Book ID:    ${bookId || "Not set"}`);

            if (token) {
                const client = new GotessClient(token, bookId);
                try {
                    const books = await client.listBooks();
                    const book = books.find(b => b.id === bookId);
                    if (book) {
                        console.log(`  Book Name:  ${book.name}`);
                    }
                } catch {
                    console.log("  Session:    Expired (re-login required)");
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

gotessCommand
    .command("upload <file>")
    .description("Upload invoice PDF to Gotess")
    .option("-s, --sender <name>", "Sender/vendor name (required)")
    .option("-a, --amount <amount>", "Invoice amount", parseFloat)
    .option("-d, --date <date>", "Invoice date (YYYY-MM-DD)")
    .option("--link <transactionId>", "Auto-link to transaction after upload")
    .action(async (file, options) => {
        try {
            if (!options.sender) {
                console.error("✗ Sender name is required (-s, --sender)");
                process.exit(1);
            }

            const client = GotessClient.fromConfig();

            console.log(`\n  📤 Uploading ${file}...`);

            const invoice = await client.uploadInvoicePdf(file, {
                senderName: options.sender,
                amount: options.amount,
                invoiceDate: options.date,
            });

            console.log(`  ✓ Invoice created: ${invoice.id}`);
            console.log(`    Filename: ${invoice.filename}`);
            console.log(`    Sender:   ${invoice.sender_name}`);
            if (invoice.amount) {
                console.log(`    Amount:   ${invoice.amount.toFixed(2)} EUR`);
            }

            // Auto-link if transaction ID provided
            if (options.link) {
                console.log(`\n  🔗 Linking to transaction ${options.link}...`);
                await client.linkInvoice(options.link, invoice.id);
                console.log(`  ✓ Linked successfully`);
            }

            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

export default gotessCommand;
