/**
 * Interactive Mode: Tools Module
 *
 * Provides menu-based access to various utility tools.
 */

import { select, input } from "@inquirer/prompts";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue } from "./utils.js";
import { spawnSync } from "child_process";

/**
 * Safe command execution using spawnSync
 */
function runCommand(cmd: string, args: string[], timeout = 60000): { success: boolean; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    timeout,
  });

  return {
    success: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export async function toolsMenu(): Promise<void> {
  console.log("\n  TOOLS");
  console.log("  " + "-".repeat(50));
  console.log("  Utility tools and helpers");
  console.log("");

  const menuItems: MenuItem[] = [
    { name: "🎬 YouTube Summary", value: "youtube" },
    { name: "🎨 Generate Image", value: "image" },
    { name: "📊 Mermaid Validator", value: "mermaid" },
    { name: "🧪 E2E Testing", value: "e2e" },
    { name: "📨 Agent Message", value: "agent-msg" },
    { name: "← Back", value: "back" },
  ];

  const choice = await select({
    message: "Tool:",
    choices: menuItems,
  });

  switch (choice) {
    case "youtube":
      await youtubeSummary();
      break;
    case "image":
      await generateImage();
      break;
    case "mermaid":
      await mermaidValidator();
      break;
    case "e2e":
      await e2eTesting();
      break;
    case "agent-msg":
      await agentMessage();
      break;
    case "back":
      return;
  }
}

async function youtubeSummary(): Promise<void> {
  try {
    const url = await input({
      message: "YouTube URL:",
      validate: (v) => {
        if (!v) return "URL is required";
        if (!v.includes("youtube.com") && !v.includes("youtu.be")) {
          return "Must be a YouTube URL";
        }
        return true;
      },
    });

    console.log("\n  Fetching video and generating summary...\n");
    console.log("  This may take a minute...\n");

    const result = runCommand("husky", ["youtube", url], 120000);

    if (!result.success) {
      console.error("\n  Error generating summary:", result.stderr);
    } else {
      console.log("  SUMMARY");
      console.log("  " + "-".repeat(60));
      console.log(result.stdout);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error:", error);
    await pressEnterToContinue();
  }
}

async function generateImage(): Promise<void> {
  try {
    const prompt = await input({
      message: "Image prompt:",
      validate: (v) => (v.length > 0 ? true : "Prompt is required"),
    });

    const aspectRatio = await select({
      message: "Aspect ratio:",
      choices: [
        { name: "1:1 (Square)", value: "1:1" },
        { name: "16:9 (Landscape)", value: "16:9" },
        { name: "9:16 (Portrait)", value: "9:16" },
        { name: "4:3 (Standard)", value: "4:3" },
      ],
    });

    console.log("\n  Generating image...\n");
    console.log("  This may take a moment...\n");

    const result = runCommand("husky", ["image", prompt, "--aspect-ratio", aspectRatio], 60000);

    if (!result.success) {
      console.error("\n  Error generating image:", result.stderr);
    } else {
      console.log("  IMAGE GENERATED");
      console.log("  " + "-".repeat(50));
      console.log(result.stdout);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error:", error);
    await pressEnterToContinue();
  }
}

async function mermaidValidator(): Promise<void> {
  try {
    console.log("\n  MERMAID VALIDATOR");
    console.log("  " + "-".repeat(50));
    console.log("  Enter your Mermaid diagram (end with empty line):\n");

    const lines: string[] = [];
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    await new Promise<void>((resolve) => {
      const askLine = () => {
        rl.question("  > ", (line) => {
          if (line === "") {
            rl.close();
            resolve();
          } else {
            lines.push(line);
            askLine();
          }
        });
      };
      askLine();
    });

    if (lines.length === 0) {
      console.log("\n  No diagram entered.\n");
      await pressEnterToContinue();
      return;
    }

    const diagram = lines.join("\n");
    console.log("\n  Validating diagram...\n");

    const result = spawnSync("husky", ["mermaid", "validate"], {
      input: diagram,
      encoding: "utf-8",
      timeout: 10000,
    });

    if (result.status === 0) {
      console.log("  ✅ Diagram is valid!\n");
    } else {
      console.log("  ❌ Diagram has errors:\n");
      console.log(result.stderr || result.stdout);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error:", error);
    await pressEnterToContinue();
  }
}

async function e2eTesting(): Promise<void> {
  try {
    console.log("\n  E2E TESTING");
    console.log("  " + "-".repeat(50));

    const action = await select({
      message: "E2E Action:",
      choices: [
        { name: "Run tests", value: "run" },
        { name: "Show test results", value: "results" },
        { name: "Open browser", value: "browser" },
      ],
    });

    switch (action) {
      case "run": {
        const testPath = await input({
          message: "Test file/pattern (optional):",
          default: "",
        });

        console.log("\n  Running E2E tests...\n");

        const args = ["e2e", "run"];
        if (testPath) {
          args.push(testPath);
        }

        const result = runCommand("husky", args, 300000);

        if (!result.success) {
          console.error("\n  Error running tests:", result.stderr);
        } else {
          console.log(result.stdout);
        }
        break;
      }
      case "results": {
        const result = runCommand("husky", ["e2e", "results"]);

        console.log("\n  TEST RESULTS");
        console.log("  " + "-".repeat(50));

        if (!result.success) {
          console.error("\n  Error fetching results:", result.stderr);
        } else {
          console.log(result.stdout);
        }
        break;
      }
      case "browser": {
        const url = await input({
          message: "URL to open:",
          validate: (v) => (v.length > 0 ? true : "URL is required"),
        });

        console.log(`\n  Opening browser to ${url}...\n`);

        const result = runCommand("husky", ["e2e", "browser", url], 30000);

        if (!result.success) {
          console.error("\n  Error opening browser:", result.stderr);
        } else {
          console.log("  Browser opened.\n");
        }
        break;
      }
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error:", error);
    await pressEnterToContinue();
  }
}

async function agentMessage(): Promise<void> {
  const config = ensureConfig();

  try {
    console.log("\n  AGENT MESSAGING");
    console.log("  " + "-".repeat(50));

    const action = await select({
      message: "Action:",
      choices: [
        { name: "Send message to supervisor", value: "send" },
        { name: "Request approval", value: "approval" },
        { name: "Report status", value: "status" },
      ],
    });

    switch (action) {
      case "send": {
        const message = await input({
          message: "Message:",
          validate: (v) => (v.length > 0 ? true : "Message is required"),
        });

        console.log("\n  Sending message...\n");

        try {
          const res = await fetch(`${config.apiUrl}/api/agent-messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
              type: "query",
              targetId: "supervisor",
              payload: {
                title: "Message from interactive CLI",
                description: message,
              },
            }),
          });

          if (!res.ok) {
            const error = await res.text();
            console.error(`\n  Error: ${error}\n`);
          } else {
            console.log("  Message sent successfully!\n");
          }
        } catch (error) {
          console.error("\n  Error sending:", (error as Error).message);
        }
        break;
      }
      case "approval": {
        const title = await input({
          message: "What needs approval?",
          validate: (v) => (v.length > 0 ? true : "Title is required"),
        });

        const description = await input({
          message: "Details (optional):",
          default: "",
        });

        console.log("\n  Requesting approval...\n");

        try {
          const res = await fetch(`${config.apiUrl}/api/agent-messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
              type: "approval_request",
              targetId: "supervisor",
              payload: { title, description },
            }),
          });

          if (!res.ok) {
            const error = await res.text();
            console.error(`\n  Error: ${error}\n`);
          } else {
            const data = await res.json();
            console.log("  Approval request sent!");
            if (data.id) {
              console.log(`  Message ID: ${data.id}`);
            }
            console.log("");
          }
        } catch (error) {
          console.error("\n  Error requesting approval:", (error as Error).message);
        }
        break;
      }
      case "status": {
        const status = await input({
          message: "Status message:",
          validate: (v) => (v.length > 0 ? true : "Status is required"),
        });

        console.log("\n  Reporting status...\n");

        try {
          const res = await fetch(`${config.apiUrl}/api/agent-messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
              type: "status_update",
              targetId: "supervisor",
              payload: {
                title: "Status Update",
                description: status,
              },
            }),
          });

          if (!res.ok) {
            const error = await res.text();
            console.error(`\n  Error: ${error}\n`);
          } else {
            console.log("  Status reported!\n");
          }
        } catch (error) {
          console.error("\n  Error reporting status:", (error as Error).message);
        }
        break;
      }
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error:", error);
    await pressEnterToContinue();
  }
}
