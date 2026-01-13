/**
 * Interactive Mode: Chat Module
 *
 * Provides menu-based Google Chat integration and messaging.
 */

import { select, input, confirm } from "@inquirer/prompts";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate, formatDate } from "./utils.js";

interface InboxMessage {
  id: string;
  text: string;
  senderName: string;
  senderEmail?: string;
  spaceName: string;
  threadName: string;
  read: boolean;
  injected?: boolean;
  createdAt: string;
}

interface Conversation {
  id: string;
  agentId: string;
  vmName: string;
  threadName: string;
  question: string;
  status: string;
  createdAt: string;
  lastMessageAt: string;
}

interface Space {
  name: string;
  displayName: string;
  type: string;
}

export async function chatMenu(): Promise<void> {
  const config = ensureConfig();

  console.log("\n  CHAT");
  console.log("  " + "-".repeat(50));
  console.log("  Google Chat integration and messaging");
  console.log("");

  const menuItems: MenuItem[] = [
    { name: "📥 Inbox", value: "inbox" },
    { name: "⏳ Pending Messages", value: "pending" },
    { name: "💬 Send Message", value: "send" },
    { name: "↩️  Reply to Message", value: "reply" },
    { name: "👁️  Watch for Messages", value: "watch" },
    { name: "🗨️  Conversations", value: "conversations" },
    { name: "🏠 Spaces", value: "spaces" },
    { name: "❓ Ask Question (with wait)", value: "ask" },
    { name: "✅ Request Review", value: "review" },
    { name: "← Back", value: "back" },
  ];

  const choice = await select({
    message: "Chat Action:",
    choices: menuItems,
  });

  switch (choice) {
    case "inbox":
      await showInbox(config);
      break;
    case "pending":
      await showPending(config);
      break;
    case "send":
      await sendMessage(config);
      break;
    case "reply":
      await replyToMessage(config);
      break;
    case "watch":
      await watchMessages(config);
      break;
    case "conversations":
      await showConversations(config);
      break;
    case "spaces":
      await showSpaces(config);
      break;
    case "ask":
      await askQuestion(config);
      break;
    case "review":
      await requestReview(config);
      break;
    case "back":
      return;
  }
}

async function showInbox(config: ValidConfig): Promise<void> {
  try {
    const unreadOnly = await confirm({
      message: "Show only unread messages?",
      default: false,
    });

    const url = `${config.apiUrl}/api/supervisor/inbox${unreadOnly ? "?unread=true" : ""}`;
    const res = await fetch(url, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const messages: InboxMessage[] = await res.json();

    console.log("\n  INBOX");
    console.log("  " + "-".repeat(70));

    if (messages.length === 0) {
      console.log("  No messages found.");
    } else {
      console.log(`  ${"ID".padEnd(12)} ${"FROM".padEnd(20)} ${"STATUS".padEnd(10)} ${"TEXT"}`);
      console.log("  " + "-".repeat(70));

      for (const msg of messages.slice(0, 20)) {
        const status = msg.read ? "read" : "unread";
        console.log(
          `  ${msg.id.substring(0, 10).padEnd(12)} ${truncate(msg.senderName, 18).padEnd(20)} ${status.padEnd(10)} ${truncate(msg.text, 30)}`
        );
      }

      if (messages.length > 20) {
        console.log(`\n  ... and ${messages.length - 20} more messages`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching inbox:", error);
    await pressEnterToContinue();
  }
}

async function showPending(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/supervisor/pending`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const messages: InboxMessage[] = await res.json();

    console.log("\n  PENDING MESSAGES");
    console.log("  " + "-".repeat(70));

    if (messages.length === 0) {
      console.log("  No pending messages.");
    } else {
      for (const msg of messages) {
        console.log(`  ID: ${msg.id}`);
        console.log(`  From: ${msg.senderName}`);
        console.log(`  Time: ${formatDate(msg.createdAt)}`);
        console.log(`  Text: ${truncate(msg.text, 60)}`);
        console.log("  " + "-".repeat(40));
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching pending:", error);
    await pressEnterToContinue();
  }
}

async function sendMessage(config: ValidConfig): Promise<void> {
  try {
    const message = await input({
      message: "Message to send:",
      validate: (v) => (v.length > 0 ? true : "Message is required"),
    });

    const res = await fetch(`${config.apiUrl}/api/chat/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log("\n  Message sent successfully!\n");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error sending message:", error);
    await pressEnterToContinue();
  }
}

async function replyToMessage(config: ValidConfig): Promise<void> {
  try {
    const messageId = await input({
      message: "Message ID to reply to:",
      validate: (v) => (v.length > 0 ? true : "Message ID is required"),
    });

    const response = await input({
      message: "Your reply:",
      validate: (v) => (v.length > 0 ? true : "Reply is required"),
    });

    const res = await fetch(`${config.apiUrl}/api/chat/reply-to/${messageId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({ response }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log("\n  Reply sent successfully!\n");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error replying:", error);
    await pressEnterToContinue();
  }
}

async function watchMessages(config: ValidConfig): Promise<void> {
  console.log("\n  WATCH MODE");
  console.log("  " + "-".repeat(50));
  console.log("  Watching for new messages...");
  console.log("");

  let lastCheck = new Date().toISOString();

  const checkMessages = async () => {
    try {
      const res = await fetch(`${config.apiUrl}/api/supervisor/inbox?since=${encodeURIComponent(lastCheck)}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (res.ok) {
        const messages: InboxMessage[] = await res.json();
        for (const msg of messages) {
          console.log(`  [${new Date().toLocaleTimeString()}] From: ${msg.senderName}`);
          console.log(`  ${msg.text.substring(0, 80)}`);
          console.log("");
        }
      }

      lastCheck = new Date().toISOString();
    } catch {
      // Ignore errors during watch
    }
  };

  // Check every 5 seconds
  const interval = setInterval(checkMessages, 5000);

  // Wait for user to press Enter
  await input({
    message: "Press Enter to stop watching...",
  });

  clearInterval(interval);
  console.log("\n  Stopped watching.\n");
}

async function showConversations(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/agent-conversations`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const conversations: Conversation[] = await res.json();

    console.log("\n  CONVERSATIONS");
    console.log("  " + "-".repeat(70));

    if (conversations.length === 0) {
      console.log("  No active conversations.");
    } else {
      console.log(`  ${"AGENT".padEnd(20)} ${"STATUS".padEnd(12)} ${"QUESTION"}`);
      console.log("  " + "-".repeat(70));

      for (const conv of conversations) {
        console.log(
          `  ${truncate(conv.agentId, 18).padEnd(20)} ${conv.status.padEnd(12)} ${truncate(conv.question, 35)}`
        );
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching conversations:", error);
    await pressEnterToContinue();
  }
}

async function showSpaces(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/chat/spaces`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const spaces: Space[] = await res.json();

    console.log("\n  GOOGLE CHAT SPACES");
    console.log("  " + "-".repeat(70));

    if (spaces.length === 0) {
      console.log("  No spaces found.");
    } else {
      console.log(`  ${"NAME".padEnd(30)} ${"TYPE".padEnd(15)} ${"DISPLAY NAME"}`);
      console.log("  " + "-".repeat(70));

      for (const space of spaces) {
        console.log(
          `  ${truncate(space.name, 28).padEnd(30)} ${space.type.padEnd(15)} ${truncate(space.displayName, 25)}`
        );
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching spaces:", error);
    await pressEnterToContinue();
  }
}

async function askQuestion(config: ValidConfig): Promise<void> {
  try {
    const question = await input({
      message: "Question to ask:",
      validate: (v) => (v.length > 0 ? true : "Question is required"),
    });

    const waitForAnswer = await confirm({
      message: "Wait for answer?",
      default: true,
    });

    console.log("\n  Sending question...");

    const res = await fetch(`${config.apiUrl}/api/chat/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({ question, wait: waitForAnswer }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();
      if (data.answer) {
        console.log("\n  ANSWER:");
        console.log("  " + "-".repeat(50));
        console.log(`  ${data.answer}`);
      } else if (data.reviewId) {
        console.log(`\n  Question sent. Review ID: ${data.reviewId}`);
        console.log("  Use 'husky chat review-status <id>' to check status.");
      }
      console.log("");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error asking question:", error);
    await pressEnterToContinue();
  }
}

async function requestReview(config: ValidConfig): Promise<void> {
  try {
    const question = await input({
      message: "What needs review?",
      validate: (v) => (v.length > 0 ? true : "Description is required"),
    });

    console.log("\n  Requesting review...");

    const res = await fetch(`${config.apiUrl}/api/chat/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({ question }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();
      console.log(`\n  Review requested successfully!`);
      if (data.reviewId) {
        console.log(`  Review ID: ${data.reviewId}`);
      }
      console.log("");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error requesting review:", error);
    await pressEnterToContinue();
  }
}
