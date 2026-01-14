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
  .option("--dm <user>", "Send as direct message to user")
  .option("--space <name>", "Target Google Chat space (e.g., spaces/ABC123)")
  .action(async (message: string, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      let endpoint = `${config.apiUrl}/api/chat/supervisor`;
      let payload: any = {
        content: message,
        ...(options.taskId && { taskId: options.taskId }),
      };

      // If --space is provided, use Google Chat API instead
      if (options.space) {
        endpoint = `${config.apiUrl}/api/google-chat/send`;
        payload = {
          text: message,
          spaceName: options.space,
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      console.log(options.space ? "✅ Message sent to Google Chat." : "Message sent.");
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
  .command("send-file <filePath>")
  .description("Send a file attachment to Google Chat (images auto-compressed)")
  .option("--space <name>", "Target space (e.g., spaces/ABC123)")
  .option("--thread <name>", "Reply in thread")
  .option("--text <message>", "Optional message text to accompany the file")
  .option("--no-compress", "Skip image compression")
  .action(async (filePath: string, options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    const fs = await import("fs");
    const path = await import("path");

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const fileName = path.basename(filePath);

    // Determine MIME type from extension
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeTypes: Record<string, string> = {
      // Images
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      // Documents
      pdf: "application/pdf",
      txt: "text/plain",
      md: "text/markdown",
      // Data
      json: "application/json",
      xml: "application/xml",
      csv: "text/csv",
      yaml: "application/x-yaml",
      yml: "application/x-yaml",
      // Code
      js: "text/javascript",
      ts: "text/typescript",
      py: "text/x-python",
      html: "text/html",
      css: "text/css",
      sh: "text/x-sh",
      sql: "text/x-sql",
    };
    const mimeType = mimeTypes[ext] || "application/octet-stream";

    // Read file
    let fileBuffer = fs.readFileSync(filePath);
    const originalSize = fileBuffer.length;

    console.log(`📤 Preparing ${fileName} (${(originalSize / 1024).toFixed(1)} KB, ${mimeType})...`);

    // Compress images automatically (unless --no-compress flag is set)
    const isImage = mimeType.startsWith("image/") && !mimeType.includes("svg");
    if (isImage && options.compress !== false) {
      try {
        const sharp = await import("sharp");
        console.log(`🔄 Compressing image...`);

        const compressed = await sharp.default(fileBuffer)
          .resize(1920, 1920, {
            fit: "inside",
            withoutEnlargement: true
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        fileBuffer = Buffer.from(compressed);

        const compressedSize = fileBuffer.length;
        const savedPercent = ((1 - compressedSize / originalSize) * 100).toFixed(0);

        console.log(`✓ Compressed: ${(originalSize / 1024).toFixed(1)} KB → ${(compressedSize / 1024).toFixed(1)} KB (saved ${savedPercent}%)`);
      } catch (error) {
        console.warn(`⚠️  Compression failed, uploading original: ${(error as Error).message}`);
      }
    }

    const fileBase64 = fileBuffer.toString("base64");
    console.log(`📤 Uploading ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)...`);

    try {
      const res = await fetch(`${huskyApiUrl}/api/google-chat/send-file`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          fileBase64,
          fileName,
          mimeType,
          text: options.text,
          spaceName: options.space,
          threadName: options.thread,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error: ${res.status} - ${error}`);
      }

      const data = await res.json() as { success: boolean; messageName?: string; fileName?: string };
      console.log(`✅ File sent to Google Chat: ${data.fileName}`);
    } catch (error) {
      console.error("Error sending file:", error);
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
        messageName?: string;
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

        // Add reaction to original message if messageName is available
        if (msg.messageName) {
          try {
            await fetch(`${huskyApiUrl}/api/google-chat/messages/${encodeURIComponent(msg.messageName)}/react`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
              },
              body: JSON.stringify({ emoji: "✅" }),
            });
          } catch {
            // Reaction is optional - don't fail if it doesn't work
          }
        }
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
// AGENT QUESTION COMMANDS (prevents supervisor loop)
// ============================================

// Agent persona/role icons for Google Chat messages
const AGENT_PERSONA_ICONS: Record<string, string> = {
  support: "🎧",
  worker: "👷",
  supervisor: "🎯",
  reviewer: "🔍",
  research: "🔬",
  accounting: "📊",
  marketing: "📢",
  developer: "💻",
  devops: "🔧",
  default: "🤖",
};

chatCommand
  .command("ask <question>")
  .description("Ask a question to human via Google Chat (registers conversation for reply routing)")
  .requiredOption("--space <id>", "Google Chat space ID (e.g., spaces/ABC123)")
  .option("--agent-id <id>", "Agent ID (default: from env or hostname)")
  .option("--vm-name <name>", "VM name (default: from env or hostname)")
  .option("--session <name>", "Tmux session for reply routing", "main")
  .option("--role <role>", "Agent role/persona (support, worker, supervisor, etc.)")
  .option("--context <text>", "Additional context for the question")
  .option("--task-id <id>", "Related task ID")
  .option("--json", "Output as JSON")
  .action(async (question: string, options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    // Get agent/VM identity
    const agentId = options.agentId || process.env.HUSKY_AGENT_ID || process.env.HUSKY_WORKER_ID || `agent-${process.pid}`;
    const vmName = options.vmName || process.env.HUSKY_VM_NAME || process.env.HOSTNAME || "unknown-vm";
    const tmuxSession = options.session;
    const agentRole = options.role || process.env.HUSKY_AGENT_TYPE || process.env.HUSKY_AGENT_ROLE || "worker";
    const taskId = options.taskId || process.env.HUSKY_TASK_ID;

    // Build formatted message with metadata
    const icon = AGENT_PERSONA_ICONS[agentRole] || AGENT_PERSONA_ICONS.default;
    let formattedMessage = `${icon} *Agent Question*\n\n`;
    formattedMessage += `*From:* ${agentId} (${agentRole})\n`;
    formattedMessage += `*VM:* ${vmName} / session: ${tmuxSession}\n`;
    if (taskId) {
      formattedMessage += `*Task:* ${taskId}\n`;
    }
    formattedMessage += `\n---\n\n${question}`;
    if (options.context) {
      formattedMessage += `\n\n*Context:* ${options.context}`;
    }

    try {
      // 1. Send message to Google Chat
      const sendRes = await fetch(`${huskyApiUrl}/api/google-chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          text: formattedMessage,
          spaceName: options.space,
          // Don't specify threadName - let Google Chat create a new thread
        }),
      });

      if (!sendRes.ok) {
        const error = await sendRes.text();
        throw new Error(`Failed to send message: ${sendRes.status} - ${error}`);
      }

      const sendData = await sendRes.json() as { threadName?: string; name?: string };
      const threadName = sendData.threadName || sendData.name;

      if (!threadName) {
        console.error("Warning: Could not get thread name from response. Reply routing may not work.");
      }

      // 2. Register conversation for reply routing (with full metadata)
      const convRes = await fetch(`${huskyApiUrl}/api/agent-conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          agentId,
          vmName,
          tmuxSession,
          spaceId: options.space,
          threadName,
          question,
          status: "active",
          // Additional metadata for routing and context
          agentRole,
          taskId: taskId || null,
          context: options.context || null,
        }),
      });

      let conversationId: string | undefined;
      if (convRes.ok) {
        const convData = await convRes.json() as { id: string };
        conversationId = convData.id;
      } else {
        console.error("Warning: Failed to register conversation. Reply may go to supervisor instead.");
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          agentId,
          agentRole,
          vmName,
          tmuxSession,
          threadName,
          conversationId,
          space: options.space,
          question,
          taskId: taskId || null,
        }, null, 2));
      } else {
        console.log("✅ Question sent to Google Chat");
        console.log(`   Agent: ${agentId} (${agentRole})`);
        console.log(`   VM: ${vmName} / session: ${tmuxSession}`);
        if (taskId) {
          console.log(`   Task: ${taskId}`);
        }
        console.log(`   Thread: ${threadName || "(unknown)"}`);
        if (conversationId) {
          console.log(`   Conversation ID: ${conversationId}`);
        }
        console.log("\n   When human replies, it will be routed to your tmux session.");
        console.log(`   To resolve conversation: husky chat resolve ${conversationId || threadName}`);
      }
    } catch (error) {
      console.error("Error asking question:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("resolve <conversationId>")
  .description("Mark a conversation as resolved (stops routing replies to agent)")
  .action(async (conversationId: string) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${huskyApiUrl}/api/agent-conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({ status: "resolved" }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error("Conversation not found.");
          process.exit(1);
        }
        throw new Error(`API error: ${res.status}`);
      }

      console.log("✅ Conversation marked as resolved.");
      console.log("   Future replies in this thread will go to supervisor.");
    } catch (error) {
      console.error("Error resolving conversation:", error);
      process.exit(1);
    }
  });

chatCommand
  .command("conversations")
  .description("List active agent conversations")
  .option("--all", "Show all conversations (including resolved)")
  .option("--agent <id>", "Filter by agent ID")
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
      if (!options.all) params.set("status", "active");
      if (options.agent) params.set("agentId", options.agent);

      const res = await fetch(`${huskyApiUrl}/api/agent-conversations?${params}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json() as { conversations: Array<{
        id: string;
        agentId: string;
        vmName: string;
        question: string;
        status: string;
        createdAt: string;
      }> };

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      if (!data.conversations || data.conversations.length === 0) {
        console.log("No active conversations.");
        return;
      }

      console.log("\n  Agent Conversations");
      console.log("  " + "─".repeat(60));

      for (const conv of data.conversations) {
        const time = new Date(conv.createdAt).toLocaleString();
        const statusIcon = conv.status === "active" ? "🟢" : "⚪";
        console.log(`  ${statusIcon} [${conv.id.slice(0, 8)}] ${conv.agentId} @ ${conv.vmName}`);
        console.log(`     Q: "${conv.question.slice(0, 50)}${conv.question.length > 50 ? "..." : ""}"`);
        console.log(`     Created: ${time}`);
        console.log("");
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
      process.exit(1);
    }
  });

// ============================================
// GOOGLE CHAT SPACES
// ============================================

chatCommand
  .command("spaces")
  .description("List available Google Chat spaces")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    const huskyApiUrl = getHuskyApiUrl();
    if (!huskyApiUrl) {
      console.error("Error: API URL not configured. Set husky-api-url or api-url.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${huskyApiUrl}/api/google-chat/spaces`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json() as {
        spaces: Array<{
          name: string;
          displayName: string;
          type: string;
          singleUserBotDm: boolean;
        }>;
        defaultSpace?: string;
      };

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      if (!data.spaces || data.spaces.length === 0) {
        console.log("No Google Chat spaces found.");
        console.log("Make sure the Husky bot is added to at least one space.");
        return;
      }

      console.log("\n  Google Chat Spaces");
      console.log("  " + "─".repeat(60));

      for (const space of data.spaces) {
        const isDefault = space.name === data.defaultSpace ? " (default)" : "";
        const typeIcon = space.type === "SPACE" ? "🏠" : space.type === "GROUP_CHAT" ? "👥" : "💬";
        console.log(`  ${typeIcon} ${space.displayName || "(unnamed)"}${isDefault}`);
        console.log(`     ID: ${space.name}`);
        console.log("");
      }

      console.log("  Use --space <ID> with chat commands, e.g.:");
      console.log(`  husky chat ask --space "${data.spaces[0]?.name}" "Your question"`);
      console.log("");
    } catch (error) {
      console.error("Error fetching spaces:", error);
      process.exit(1);
    }
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
