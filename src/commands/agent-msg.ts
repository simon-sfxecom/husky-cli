import { Command } from "commander";
import { getConfig } from "./config.js";

async function apiCall(path: string, options: RequestInit = {}) {
  const config = getConfig();
  if (!config.apiUrl || !config.apiKey) {
    console.error("Error: API URL and key required. Run: husky config test");
    process.exit(1);
  }

  const res = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }

  return res.json();
}

export const agentMsgCommand = new Command("agent-msg")
  .description("Agent-to-agent messaging (worker <-> supervisor)");

agentMsgCommand
  .command("send")
  .description("Send message to supervisor or another agent")
  .requiredOption("--type <type>", "Message type: approval_request, status_update, error_report, completion, query")
  .requiredOption("--title <title>", "Message title")
  .option("--description <desc>", "Message description")
  .option("--target <id>", "Target agent ID (default: supervisor)")
  .option("--expires <minutes>", "Expiration in minutes", "60")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const config = getConfig();
      const sessionId = config.workerId || "unknown";

      const payload: Record<string, unknown> = {
        sessionId,
        type: options.type,
        payload: {
          title: options.title,
          description: options.description,
        },
        expiresInMinutes: parseInt(options.expires, 10),
      };

      if (options.target) {
        payload.targetId = options.target;
      }

      const result = await apiCall("/api/agent-messages", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`✅ Message sent (ID: ${result.id})`);
        console.log(`   Type: ${result.type}`);
        console.log(`   Title: ${result.payload.title}`);
        if (result.targetId) console.log(`   Target: ${result.targetId}`);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

agentMsgCommand
  .command("list")
  .description("List messages")
  .option("--status <status>", "Filter by status: pending, responded, expired")
  .option("--target <id>", "Filter by target agent ID")
  .option("--limit <n>", "Number of messages", "20")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const params = new URLSearchParams();
      if (options.status) params.set("status", options.status);
      if (options.target) params.set("targetId", options.target);
      if (options.limit) params.set("limit", options.limit);

      const messages = await apiCall(`/api/agent-messages?${params}`);

      if (options.json) {
        console.log(JSON.stringify(messages, null, 2));
        return;
      }

      if (!messages || messages.length === 0) {
        console.log("No messages found.");
        return;
      }

      console.log("\n  Agent Messages");
      console.log("  " + "─".repeat(70));

      for (const msg of messages) {
        const status = msg.status === "pending" ? "⏳" : msg.status === "responded" ? "✅" : "⌛";
        console.log(`  ${status} [${msg.type}] ${msg.payload.title}`);
        console.log(`     ID: ${msg.id} | From: ${msg.sessionId}`);
        if (msg.response) {
          console.log(`     Response: ${msg.response.approved ? "Approved" : "Rejected"} - ${msg.response.message || ""}`);
        }
        console.log();
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

agentMsgCommand
  .command("pending")
  .description("List pending messages (for supervisor)")
  .option("--target <id>", "Filter by target agent ID")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const params = new URLSearchParams();
      if (options.target) params.set("targetId", options.target);

      const messages = await apiCall(`/api/agent-messages/pending?${params}`);

      if (options.json) {
        console.log(JSON.stringify(messages, null, 2));
        return;
      }

      if (!messages || messages.length === 0) {
        console.log("No pending messages.");
        return;
      }

      console.log(`\n  📬 ${messages.length} Pending Message(s)`);
      console.log("  " + "─".repeat(70));

      for (const msg of messages) {
        console.log(`  ⏳ [${msg.type}] ${msg.payload.title}`);
        console.log(`     ID: ${msg.id} | From: ${msg.sessionId}`);
        if (msg.payload.description) {
          console.log(`     ${msg.payload.description.slice(0, 100)}...`);
        }
        console.log();
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

agentMsgCommand
  .command("respond <messageId>")
  .description("Respond to a pending message")
  .requiredOption("--approve", "Approve the request")
  .requiredOption("--reject", "Reject the request")
  .option("--message <msg>", "Response message")
  .action(async (messageId, options) => {
    try {
      if (options.approve && options.reject) {
        console.error("Error: Cannot both approve and reject");
        process.exit(1);
      }

      const approved = !!options.approve;
      const config = getConfig();

      const result = await apiCall(`/api/agent-messages/${messageId}/respond`, {
        method: "POST",
        body: JSON.stringify({
          approved,
          message: options.message,
          respondedBy: config.workerId || "supervisor",
        }),
      });

      console.log(`✅ Message ${approved ? "approved" : "rejected"}`);
      if (options.message) console.log(`   Response: ${options.message}`);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

agentMsgCommand
  .command("get <messageId>")
  .description("Get message details")
  .option("--json", "Output as JSON")
  .action(async (messageId, options) => {
    try {
      const msg = await apiCall(`/api/agent-messages/${messageId}`);

      if (options.json) {
        console.log(JSON.stringify(msg, null, 2));
        return;
      }

      console.log("\n  Message Details");
      console.log("  " + "─".repeat(50));
      console.log(`  ID:      ${msg.id}`);
      console.log(`  Type:    ${msg.type}`);
      console.log(`  Status:  ${msg.status}`);
      console.log(`  From:    ${msg.sessionId}`);
      if (msg.targetId) console.log(`  Target:  ${msg.targetId}`);
      console.log(`  Title:   ${msg.payload.title}`);
      if (msg.payload.description) {
        console.log(`  Desc:    ${msg.payload.description}`);
      }
      if (msg.response) {
        console.log(`  Response: ${msg.response.approved ? "✅ Approved" : "❌ Rejected"}`);
        if (msg.response.message) console.log(`  Message:  ${msg.response.message}`);
        console.log(`  By:       ${msg.response.respondedBy}`);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

agentMsgCommand
  .command("wait <messageId>")
  .description("Wait for a response to a message (blocking)")
  .option("--timeout <seconds>", "Timeout in seconds", "300")
  .option("--json", "Output as JSON")
  .action(async (messageId, options) => {
    const timeout = parseInt(options.timeout, 10) * 1000;
    const start = Date.now();
    const pollInterval = 2000;

    process.stdout.write("Waiting for response");

    while (Date.now() - start < timeout) {
      try {
        const msg = await apiCall(`/api/agent-messages/${messageId}`);

        if (msg.status === "responded") {
          console.log("\n");
          if (options.json) {
            console.log(JSON.stringify(msg, null, 2));
          } else {
            console.log(`✅ Response received: ${msg.response.approved ? "Approved" : "Rejected"}`);
            if (msg.response.message) console.log(`   Message: ${msg.response.message}`);
          }
          process.exit(msg.response.approved ? 0 : 1);
        }

        if (msg.status === "expired") {
          console.log("\n⌛ Message expired without response");
          process.exit(2);
        }

        process.stdout.write(".");
        await new Promise((r) => setTimeout(r, pollInterval));
      } catch (error) {
        console.error("\nError:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }

    console.log("\n⏱️ Timeout waiting for response");
    process.exit(2);
  });
