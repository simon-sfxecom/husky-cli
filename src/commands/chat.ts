import { Command } from "commander";
import { getConfig } from "./config.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Helper to get the Husky API URL (for Google Chat integration)
function getHuskyApiUrl(): string | null {
  const config = getConfig();
  return config.apiUrl || null;
}

export const chatCommand = new Command("chat")
  .description("Communicate with the dashboard chat");

chatCommand
  .command("pending")
  .description("Get pending messages from user")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/chat/pending`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const messages = data.messages || [];

      if (options.json) {
        console.log(JSON.stringify(messages, null, 2));
        return;
      }

      if (messages.length === 0) {
        console.log("No pending messages.");
        return;
      }

      console.log("\n  Pending Messages");
      console.log("  " + "─".repeat(60));

      for (const msg of messages) {
        const time = new Date(msg.createdAt).toLocaleTimeString();
        console.log(`  [${time}] ${msg.content.slice(0, 60)}${msg.content.length > 60 ? "..." : ""}`);
        if (msg.taskId) {
          console.log(`           Task: ${msg.taskId}`);
        }
      }
      console.log("");
    } catch (error) {
      console.error("Error fetching messages:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("list")
  .description("List recent chat messages")
  .option("--limit <n>", "Number of messages", "20")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/chat?limit=${options.limit}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const messages = data.messages || [];

      if (options.json) {
        console.log(JSON.stringify(messages, null, 2));
        return;
      }

      if (messages.length === 0) {
        console.log("No messages.");
        return;
      }

      console.log("\n  Chat History");
      console.log("  " + "─".repeat(60));

      for (const msg of messages) {
        const time = new Date(msg.createdAt).toLocaleTimeString();
        const role = msg.role === "user" ? "USER" : msg.role === "supervisor" ? "SUPV" : "SYS";
        const icon = msg.role === "user" ? "👤" : msg.role === "supervisor" ? "🤖" : "⚙️";
        console.log(`  ${icon} [${time}] ${role}: ${msg.content.slice(0, 50)}${msg.content.length > 50 ? "..." : ""}`);
      }
      console.log("");
    } catch (error) {
      console.error("Error fetching messages:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("send <message>")
  .description("Send a message as supervisor")
  .option("--task-id <id>", "Link to a specific task")
  .action(async (message: string, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/chat/supervisor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          content: message,
          taskId: options.taskId,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      console.log("Message sent.");
    } catch (error) {
      console.error("Error sending message:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("reply <messageId> <response>")
  .description("Reply to a specific user message")
  .option("--task-id <id>", "Link to a specific task")
  .action(async (messageId: string, response: string, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/chat/${messageId}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          content: response,
          taskId: options.taskId,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      await fetch(`${config.apiUrl}/api/chat`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({ messageIds: [messageId] }),
      });

      console.log("Reply sent and message marked as read.");
    } catch (error) {
      console.error("Error replying:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("review <question>")
  .description("Request human review via Google Chat")
  .option("--task-id <id>", "Link to a specific task")
  .option("--context <text>", "Additional context for the reviewer")
  .option("--priority <level>", "Priority: low, normal, urgent", "normal")
  .option("--wait", "Wait for human response (polling)")
  .option("--timeout <seconds>", "Timeout for waiting (default: 300)", "300")
  .option("--json", "Output as JSON")
  .action(async (question: string, options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    const workerId = process.env.HUSKY_WORKER_ID || `agent-${process.pid}`;

    try {
      const res = await fetch(`${huskyApiUrl}/api/google-chat/request-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          agentId: workerId,
          taskId: options.taskId,
          question,
          context: options.context,
          priority: options.priority,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error: ${res.status} - ${error}`);
      }

      const data = await res.json() as { id: string; status: string; message: string };

      if (!options.wait) {
        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`Review requested (ID: ${data.id})`);
          console.log(`Status: ${data.status}`);
          console.log(`\nTo check status: husky chat review-status ${data.id}`);
          console.log(`To wait for response: husky chat review-wait ${data.id}`);
        }
        return;
      }

      console.log(`Review requested (ID: ${data.id}). Waiting for human response...`);

      const timeoutMs = parseInt(options.timeout, 10) * 1000;
      const startTime = Date.now();
      const pollInterval = 5000;

      while (Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        const pollRes = await fetch(`${huskyApiUrl}/api/google-chat/review/${data.id}/poll`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (!pollRes.ok) continue;

        const pollData = await pollRes.json() as { status: string; response?: string; respondedBy?: string };

        if (pollData.status === "answered" && pollData.response) {
          if (options.json) {
            console.log(JSON.stringify(pollData, null, 2));
          } else {
            console.log(`\nHuman response received from ${pollData.respondedBy || "unknown"}:`);
            console.log(`\n${pollData.response}`);
          }
          return;
        }

        process.stdout.write(".");
      }

      console.error("\nTimeout waiting for human response.");
      process.exit(1);
    } catch (error) {
      console.error("Error requesting review:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("review-status <reviewId>")
  .description("Check status of a human review request")
  .option("--json", "Output as JSON")
  .action(async (reviewId: string, options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${huskyApiUrl}/api/google-chat/review/${reviewId}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error("Review not found.");
          process.exit(1);
        }
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json() as {
        id: string;
        status: string;
        question: string;
        response?: string;
        respondedBy?: string;
        createdAt: string;
        respondedAt?: string;
      };

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log(`\nReview: ${data.id}`);
      console.log(`Status: ${data.status}`);
      console.log(`Question: ${data.question}`);
      if (data.response) {
        console.log(`\nResponse from ${data.respondedBy || "unknown"}:`);
        console.log(data.response);
      }
    } catch (error) {
      console.error("Error checking review status:", error);
      process.exit(1);
    }
  });

// ============================================
// SUPERVISOR INBOX COMMANDS (Google Chat <-> Supervisor)
// ============================================

chatCommand
  .command("inbox")
  .description("Get messages from Google Chat (supervisor inbox)")
  .option("--unread", "Only show unread messages")
  .option("--limit <n>", "Number of messages", "10")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    try {
      const params = new URLSearchParams();
      if (options.unread) params.set("unread", "true");
      if (options.limit) params.set("limit", options.limit);

      const res = await fetch(`${huskyApiUrl}/api/google-chat/inbox?${params}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json() as { messages: Array<{
        id: string;
        text: string;
        senderName: string;
        senderEmail: string;
        createdAt: string;
        read: boolean;
      }> };

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      if (!data.messages || data.messages.length === 0) {
        console.log(options.unread ? "📭 No unread messages." : "📭 No messages in inbox.");
        return;
      }

      console.log("\n  📬 Supervisor Inbox");
      console.log("  " + "─".repeat(60));

      for (const msg of data.messages) {
        const time = new Date(msg.createdAt).toLocaleString();
        const readIcon = msg.read ? "✓" : "●";
        console.log(`  ${readIcon} [${msg.id.slice(0, 8)}] ${msg.senderName} (${time})`);
        console.log(`    "${msg.text}"`);
        console.log("");
      }
    } catch (error) {
      console.error("Error fetching inbox:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("reply-chat <message>")
  .description("Send a message to Google Chat (supervisor -> human)")
  .option("--space <name>", "Target space (e.g., spaces/ABC123)")
  .option("--thread <name>", "Reply in thread (e.g., spaces/ABC123/threads/XYZ)")
  .action(async (message: string, options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${huskyApiUrl}/api/google-chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          text: message,
          spaceName: options.space,
          threadName: options.thread,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error: ${res.status} - ${error}`);
      }

      console.log("✅ Message sent to Google Chat.");
    } catch (error) {
      console.error("Error sending message:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("reply-to <messageId> <response>")
  .description("Reply to a specific inbox message in its thread (supports both GitHub and Google Chat)")
  .action(async (messageId: string, response: string) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    try {
      // Fetch inbox to find the message
      const inboxRes = await fetch(`${huskyApiUrl}/api/google-chat/inbox?limit=50`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!inboxRes.ok) {
        throw new Error(`Failed to fetch inbox: ${inboxRes.status}`);
      }

      const data = await inboxRes.json() as { messages: Array<{
        id: string;
        spaceName: string;
        threadName: string;
      }> };

      // Require exact match or at least 8 characters for prefix matching to avoid misdirected replies
      const msg = data.messages.find(m =>
        m.id === messageId || (messageId.length >= 8 && m.id.startsWith(messageId))
      );
      if (!msg) {
        console.error(`Message ${messageId} not found in inbox.`);
        if (messageId.length < 8) {
          console.error("Hint: Provide at least 8 characters of the message ID for prefix matching.");
        }
        process.exit(1);
      }

      // Check if it's a GitHub message
      const isGitHub = msg.spaceName?.startsWith("github:");

      if (isGitHub) {
        // Use GitHub reply endpoint
        const sendRes = await fetch(`${huskyApiUrl}/api/github/inbox/${msg.id}/reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
          },
          body: JSON.stringify({ text: response }),
        });

        if (!sendRes.ok) {
          const error = await sendRes.text();
          throw new Error(`API error: ${sendRes.status} - ${error}`);
        }

        console.log("✅ Reply posted to GitHub issue.");
      } else {
        // Use Google Chat reply
        const sendRes = await fetch(`${huskyApiUrl}/api/google-chat/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
          },
          body: JSON.stringify({
            text: response,
            spaceName: msg.spaceName,
            threadName: msg.threadName,
          }),
        });

        if (!sendRes.ok) {
          const error = await sendRes.text();
          throw new Error(`API error: ${sendRes.status} - ${error}`);
        }

        // Mark as read
        await fetch(`${huskyApiUrl}/api/google-chat/inbox/${msg.id}/read`, {
          method: "POST",
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        console.log("✅ Reply sent to Google Chat and message marked as read.");
      }
    } catch (error) {
      console.error("Error replying:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("mark-read <messageId>")
  .description("Mark a message as read")
  .action(async (messageId: string) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${huskyApiUrl}/api/google-chat/inbox/${messageId}/read`, {
        method: "POST",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      console.log("✅ Message marked as read.");
    } catch (error) {
      console.error("Error marking message as read:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("watch")
  .description("Watch for new messages (blocking, for supervisor agent)")
  .option("--poll-interval <seconds>", "Poll interval in seconds", "10")
  .action(async (options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    console.log("👀 Watching for new messages... (Ctrl+C to stop)");
    const pollInterval = parseInt(options.pollInterval, 10) * 1000;
    let lastSeenId = "";

    const poll = async () => {
      try {
        const res = await fetch(`${huskyApiUrl}/api/google-chat/inbox?unread=true&limit=5`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (!res.ok) return;

        const data = await res.json() as { messages: Array<{
          id: string;
          text: string;
          senderName: string;
          createdAt: string;
        }> };

        for (const msg of data.messages || []) {
          if (msg.id !== lastSeenId) {
            lastSeenId = msg.id;
            const time = new Date(msg.createdAt).toLocaleTimeString();
            console.log(`\n📨 [${time}] ${msg.senderName}: ${msg.text}`);
          }
        }
      } catch {}
    };

    await poll();
    setInterval(poll, pollInterval);

    process.on("SIGINT", () => {
      console.log("\n👋 Stopped watching.");
      process.exit(0);
    });

    await new Promise(() => {});
  });

chatCommand
  .command("watch-inject")
  .description("Watch for messages and inject them into a tmux session")
  .option("--poll-interval <seconds>", "Poll interval in seconds", "2")
  .option("--tmux-session <name>", "Target tmux session name", "supervisor")
  .option("--tmux-window <name>", "Target tmux window name or index (default: 0)", "0")
  .option("--hint", "Show reply hint after messages (default: true)", true)
  .option("--no-hint", "Hide reply hint")
  .action(async (options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    const tmuxSession = options.tmuxSession;
    const tmuxWindow = options.tmuxWindow;
    const tmuxTarget = `${tmuxSession}:${tmuxWindow}`;
    const pollInterval = parseInt(options.pollInterval, 10) * 1000;
    const processedIds = new Set<string>();

    console.log(`📡 Watching for messages (Google Chat & GitHub)...`);
    console.log(`   Target: ${tmuxTarget}`);
    console.log(`   Poll interval: ${options.pollInterval}s`);
    console.log(`   Press Ctrl+C to stop\n`);

    const injectToTmux = async (text: string, senderName: string, spaceName?: string): Promise<boolean> => {
      // Detect platform from spaceName
      const isGitHub = spaceName?.startsWith("github:");
      const platform = isGitHub ? "GitHub" : "Google Chat";

      let formattedMessage = `[${platform}] ${senderName}: ${text}`;

      if (options.hint) {
        if (isGitHub) {
          // Extract repo info from spaceName (format: github:owner/repo)
          const repoInfo = spaceName?.replace("github:", "") || "";
          formattedMessage += `\n💡 Reply on GitHub: ${repoInfo}`;
        } else {
          formattedMessage += `\n💡 Tip: Use \`husky chat reply-chat "your response"\` to reply`;
        }
      }

      const escapedMessage = formattedMessage
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\$/g, "\\$")
        .replace(/`/g, "\\`")
        .replace(/'/g, "'\\''");

      try {
        await execAsync(`tmux send-keys -t "${tmuxTarget}" "${escapedMessage}" Enter`, { timeout: 5000 });
        return true;
      } catch (error) {
        const err = error as Error;
        console.error(`   ❌ Failed to inject: ${err.message}`);
        return false;
      }
    };

    const markAsRead = async (messageId: string) => {
      try {
        await fetch(`${huskyApiUrl}/api/google-chat/inbox/${messageId}/read`, {
          method: "POST",
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
      } catch {}
    };

    const poll = async () => {
      try {
        const res = await fetch(`${huskyApiUrl}/api/google-chat/inbox?unread=true&limit=10`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (!res.ok) return;

        const data = await res.json() as { messages: Array<{
          id: string;
          text: string;
          senderName: string;
          spaceName?: string;
          createdAt: string;
        }> };

        const messages = (data.messages || []).reverse();

        for (const msg of messages) {
          if (processedIds.has(msg.id)) continue;

          processedIds.add(msg.id);
          const time = new Date(msg.createdAt).toLocaleTimeString();
          const platform = msg.spaceName?.startsWith("github:") ? "GitHub" : "Google Chat";
          console.log(`📨 [${time}] Injecting ${platform} message from ${msg.senderName}`);

          const success = await injectToTmux(msg.text, msg.senderName, msg.spaceName);
          if (success) {
            await markAsRead(msg.id);
            console.log(`   ✓ Injected and marked as read`);
          }
        }
      } catch (error) {
        const err = error as Error;
        console.error(`Poll error: ${err.message}`);
      }
    };

    await poll();
    setInterval(poll, pollInterval);

    process.on("SIGINT", () => {
      console.log("\n👋 Stopped watching.");
      process.exit(0);
    });

    await new Promise(() => {});
  });

// ============================================
// REVIEW COMMANDS (kept for backwards compatibility)
// ============================================

chatCommand
  .command("review-wait <reviewId>")
  .description("Wait for a human review response")
  .option("--timeout <seconds>", "Timeout in seconds (default: 300)", "300")
  .option("--json", "Output as JSON")
  .action(async (reviewId: string, options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    console.log(`Waiting for response to review ${reviewId}...`);

    const timeoutMs = parseInt(options.timeout, 10) * 1000;
    const startTime = Date.now();
    const pollInterval = 5000;

    try {
      while (Date.now() - startTime < timeoutMs) {
        const res = await fetch(`${huskyApiUrl}/api/google-chat/review/${reviewId}/poll`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (res.ok) {
          const data = await res.json() as { status: string; response?: string; respondedBy?: string };

          if (data.status === "answered" && data.response) {
            if (options.json) {
              console.log(JSON.stringify(data, null, 2));
            } else {
              console.log(`\nHuman response received from ${data.respondedBy || "unknown"}:`);
              console.log(`\n${data.response}`);
            }
            return;
          }
        }

        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      console.error("\nTimeout waiting for human response.");
      process.exit(1);
    } catch (error) {
      console.error("Error waiting for review:", error);
      process.exit(1);
    }
  });
