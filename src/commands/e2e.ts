/**
 * E2E Testing commands for E2E Agent
 *
 * Commands for browser automation and E2E testing:
 * - husky e2e run <task-id> - Run E2E tests for a task
 * - husky e2e record <url> - Record a browser session with Playwright
 * - husky e2e upload <file> - Upload recording to GCS bucket husky-files-tigerv0
 * - husky e2e screenshot <url> - Take a screenshot of a URL
 */

import { Command } from "commander";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { requireAnyPermission } from "../lib/permissions.js";
import { getConfig } from "./config.js";

export const e2eCommand = new Command("e2e")
  .description("E2E testing and browser automation (E2E Agent)");

// GCS bucket for E2E artifacts
const GCS_BUCKET = "husky-files-tigerv0";

// Helper: Ensure API is configured
function ensureConfig() {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error(
      "Error: API URL not configured. Run: husky config set api-url <url>",
    );
    process.exit(1);
  }
  return config;
}

// Helper: Run a command and return result
function runCommand(cmd: string, args: string[], options?: { timeout?: number; cwd?: string }): {
  stdout: string;
  stderr: string;
  success: boolean;
} {
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: options?.timeout || 300000, // 5 min default
    cwd: options?.cwd,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    success: result.status === 0,
  };
}

// Helper: Generate timestamp for filenames
function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// Helper: Upload file to GCS
function uploadToGCS(localPath: string, gcsPath: string): { success: boolean; url: string } {
  const fullGcsPath = `gs://${GCS_BUCKET}/${gcsPath}`;
  const result = runCommand("gcloud", [
    "storage", "cp", localPath, fullGcsPath,
  ]);

  if (result.success) {
    return {
      success: true,
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`,
    };
  }

  console.error("GCS upload failed:", result.stderr);
  return { success: false, url: "" };
}

// Helper: Fetch secret from GCP Secret Manager
async function fetchSecret(secretName: string): Promise<string> {
  const result = runCommand("gcloud", [
    "secrets", "versions", "access", "latest",
    "--secret", secretName,
  ]);
  if (!result.success) {
    throw new Error(`Failed to fetch secret ${secretName}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

// Helper: Sleep function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// husky e2e run <task-id>
e2eCommand
  .command("run <taskId>")
  .description("Run E2E tests for a task")
  .option("--headless", "Run in headless mode (default: true)", true)
  .option("--headed", "Run in headed mode with visible browser")
  .option("--browser <browser>", "Browser to use (chromium, firefox, webkit)", "chromium")
  .option("--timeout <ms>", "Test timeout in milliseconds", "60000")
  .option("--output <dir>", "Output directory for results")
  .option("--retries <count>", "Number of retries for failed tests", "0")
  .option("--secret <names...>", "Secrets to fetch from GCP Secret Manager")
  .option("--env <values...>", "Environment variables (KEY=value)")
  .option("--json", "Output as JSON")
  .action(async (taskId, options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    const config = ensureConfig();
    const timestamp = generateTimestamp();
    const outputDir = options.output || `/tmp/e2e-${taskId}-${timestamp}`;
    const maxRetries = parseInt(options.retries, 10);

    // Inject secrets from GCP Secret Manager
    if (options.secret && options.secret.length > 0) {
      console.log(`\n  Loading secrets from GCP...`);
      for (const secretName of options.secret) {
        try {
          const value = await fetchSecret(secretName);
          process.env[secretName] = value;
          console.log(`  ✓ ${secretName} loaded`);
        } catch (error) {
          console.error(`  ✗ Failed to load ${secretName}:`, (error as Error).message);
          process.exit(1);
        }
      }
    }

    // Inject environment variables
    if (options.env && options.env.length > 0) {
      console.log(`\n  Setting environment variables...`);
      for (const envPair of options.env) {
        const [key, ...valueParts] = envPair.split("=");
        const value = valueParts.join("=");
        process.env[key] = value;
        console.log(`  ✓ ${key} set`);
      }
    }

    console.log(`\n  E2E Tests for Task: ${taskId}\n`);
    console.log(`  Output directory: ${outputDir}`);
    console.log(`  Browser: ${options.browser}`);
    console.log(`  Headless: ${!options.headed}`);
    if (maxRetries > 0) {
      console.log(`  Retries: ${maxRetries}`);
    }
    console.log("");

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Fetch task details from API
    let taskUrl: string | undefined;
    let taskName: string | undefined;
    try {
      const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (res.ok) {
        const task = await res.json();
        taskName = task.title || task.name;
        // Check if task has a preview URL or target URL
        taskUrl = task.previewUrl || task.targetUrl || task.metadata?.url;
        console.log(`  Task: ${taskName}`);
        if (taskUrl) {
          console.log(`  URL: ${taskUrl}`);
        }
      }
    } catch {
      console.warn("  Warning: Could not fetch task details");
    }

    // Look for test files in current directory or task worktree
    const testPatterns = [
      "e2e/**/*.spec.ts",
      "e2e/**/*.test.ts",
      "tests/e2e/**/*.spec.ts",
      "tests/e2e/**/*.test.ts",
      "*.e2e.ts",
    ];

    console.log("\n  Running Playwright tests...\n");

    const playwrightArgs = [
      "test",
      "--reporter=list",
      `--output=${outputDir}`,
      `--timeout=${options.timeout}`,
    ];

    if (!options.headed) {
      playwrightArgs.push("--headed=false");
    } else {
      playwrightArgs.push("--headed");
    }

    if (options.browser) {
      playwrightArgs.push(`--project=${options.browser}`);
    }

    // Run tests with retry logic
    let result = { stdout: "", stderr: "", success: false };
    let attempts = 0;

    while (attempts <= maxRetries) {
      attempts++;
      if (attempts > 1) {
        console.log(`\n  Retry ${attempts - 1}/${maxRetries}...\n`);
        await sleep(5000); // Wait 5 seconds before retry
      }

      result = runCommand("npx", ["playwright", ...playwrightArgs], {
        timeout: parseInt(options.timeout, 10) * 2, // Allow 2x timeout for test suite
      });

      if (result.success) {
        break;
      }

      // Capture failure screenshot on last attempt
      if (attempts > maxRetries) {
        console.log("  Capturing failure screenshot...");
        const failScreenshot = path.join(outputDir, `failure-${timestamp}.png`);
        // Note: Playwright already captures screenshots on failure with --screenshot=on
      }
    }

    const testResult = {
      taskId,
      taskName,
      taskUrl,
      success: result.success,
      timestamp,
      outputDir,
      browser: options.browser,
      stdout: result.stdout,
      stderr: result.stderr,
    };

    // Save results to file
    const resultsPath = path.join(outputDir, "results.json");
    fs.writeFileSync(resultsPath, JSON.stringify(testResult, null, 2));

    // Upload results to GCS
    const gcsPath = `e2e/${taskId}/${timestamp}/results.json`;
    const uploadResult = uploadToGCS(resultsPath, gcsPath);

    if (options.json) {
      console.log(JSON.stringify({
        ...testResult,
        gcsUrl: uploadResult.url,
      }, null, 2));
    } else {
      console.log(result.stdout);
      if (result.stderr) {
        console.error(result.stderr);
      }

      console.log("\n  " + "═".repeat(50));
      console.log(`  Result: ${result.success ? "PASSED" : "FAILED"}`);
      console.log(`  Output: ${outputDir}`);
      if (uploadResult.success) {
        console.log(`  GCS: ${uploadResult.url}`);
      }
      console.log("");
    }

    if (!result.success) {
      process.exit(1);
    }
  });

// husky e2e record <url>
e2eCommand
  .command("record <url>")
  .description("Record a browser session with Playwright codegen")
  .option("-o, --output <file>", "Output file for recorded script")
  .option("--browser <browser>", "Browser to use (chromium, firefox, webkit)", "chromium")
  .option("--device <device>", "Emulate device (e.g., 'iPhone 13', 'Pixel 5')")
  .option("--viewport <size>", "Viewport size (e.g., '1280x720')")
  .option("--video", "Record video of the session")
  .option("--json", "Output as JSON")
  .action(async (url, options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    const timestamp = generateTimestamp();
    const outputFile = options.output || `/tmp/e2e-recording-${timestamp}.ts`;
    const videoDir = `/tmp/e2e-video-${timestamp}`;

    console.log(`\n  Recording Browser Session\n`);
    console.log(`  URL: ${url}`);
    console.log(`  Browser: ${options.browser}`);
    console.log(`  Output: ${outputFile}`);
    if (options.device) {
      console.log(`  Device: ${options.device}`);
    }
    if (options.viewport) {
      console.log(`  Viewport: ${options.viewport}`);
    }
    console.log("");

    const codegenArgs = [
      "playwright", "codegen",
      url,
      `-o`, outputFile,
      `-b`, options.browser,
    ];

    if (options.device) {
      codegenArgs.push("--device", options.device);
    }

    if (options.viewport) {
      const [width, height] = options.viewport.split("x").map(Number);
      codegenArgs.push("--viewport-size", `${width},${height}`);
    }

    if (options.video) {
      if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
      }
      codegenArgs.push("--save-storage", path.join(videoDir, "storage.json"));
    }

    console.log("  Starting Playwright Codegen...");
    console.log("  Interact with the browser, then close it to save the recording.\n");

    // Run codegen interactively
    const codegen = spawnSync("npx", codegenArgs, {
      stdio: "inherit",
      encoding: "utf-8",
    });

    if (codegen.status === 0 && fs.existsSync(outputFile)) {
      console.log(`\n  Recording saved to: ${outputFile}`);

      // Upload to GCS
      const gcsPath = `e2e/recordings/${timestamp}/${path.basename(outputFile)}`;
      const uploadResult = uploadToGCS(outputFile, gcsPath);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          url,
          outputFile,
          gcsUrl: uploadResult.url,
          timestamp,
        }, null, 2));
      } else {
        if (uploadResult.success) {
          console.log(`  Uploaded to: ${uploadResult.url}`);
        }
        console.log("\n  To run this recording:");
        console.log(`    npx playwright test ${outputFile}`);
        console.log("");
      }
    } else {
      console.error("\n  Recording failed or was cancelled.");
      process.exit(1);
    }
  });

// husky e2e upload <file>
e2eCommand
  .command("upload <file>")
  .description("Upload a file to the E2E GCS bucket")
  .option("--task <taskId>", "Associate with a task ID")
  .option("--type <type>", "File type (screenshot, video, recording, report)", "file")
  .option("--json", "Output as JSON")
  .action(async (file, options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    if (!fs.existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      process.exit(1);
    }

    const timestamp = generateTimestamp();
    const filename = path.basename(file);
    const taskPrefix = options.task ? `${options.task}/` : "";
    const gcsPath = `e2e/${taskPrefix}${options.type}s/${timestamp}-${filename}`;

    console.log(`\n  Uploading to GCS\n`);
    console.log(`  File: ${file}`);
    console.log(`  Type: ${options.type}`);
    if (options.task) {
      console.log(`  Task: ${options.task}`);
    }
    console.log("");

    const uploadResult = uploadToGCS(file, gcsPath);

    if (options.json) {
      console.log(JSON.stringify({
        success: uploadResult.success,
        file,
        gcsPath,
        url: uploadResult.url,
        timestamp,
      }, null, 2));
    } else {
      if (uploadResult.success) {
        console.log(`  Uploaded successfully!`);
        console.log(`  URL: ${uploadResult.url}`);
      } else {
        console.error(`  Upload failed.`);
        process.exit(1);
      }
    }
    console.log("");
  });

// husky e2e screenshot <url>
e2eCommand
  .command("screenshot <url>")
  .description("Take a screenshot of a URL")
  .option("-o, --output <file>", "Output file path")
  .option("--full-page", "Capture full page (not just viewport)")
  .option("--viewport <size>", "Viewport size (e.g., '1920x1080')", "1920x1080")
  .option("--device <device>", "Emulate device (e.g., 'iPhone 13', 'Pixel 5')")
  .option("--wait <ms>", "Wait time before screenshot in ms", "2000")
  .option("--selector <selector>", "Wait for selector before screenshot")
  .option("--task <taskId>", "Associate with a task ID")
  .option("--upload", "Upload screenshot to GCS")
  .option("--json", "Output as JSON")
  .action(async (url, options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    const timestamp = generateTimestamp();
    const defaultFilename = `screenshot-${timestamp}.png`;
    const outputFile = options.output || `/tmp/${defaultFilename}`;

    console.log(`\n  Taking Screenshot\n`);
    console.log(`  URL: ${url}`);
    console.log(`  Viewport: ${options.viewport}`);
    console.log(`  Full page: ${options.fullPage || false}`);
    if (options.device) {
      console.log(`  Device: ${options.device}`);
    }
    console.log(`  Output: ${outputFile}`);
    console.log("");

    // Build Playwright script
    const [width, height] = options.viewport.split("x").map(Number);
    const deviceConfig = options.device ? `devices[${JSON.stringify(options.device)}]` : "null";

    // Use JSON.stringify to safely encode user-provided values and prevent injection
    const safeUrl = JSON.stringify(url);
    const safeOutputFile = JSON.stringify(outputFile);
    const safeSelector = options.selector ? JSON.stringify(options.selector) : null;

    const script = `
const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const deviceConfig = ${deviceConfig};
  const contextOptions = deviceConfig ? { ...deviceConfig } : {
    viewport: { width: ${width}, height: ${height} }
  };
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  await page.goto(${safeUrl}, { waitUntil: 'networkidle' });

  ${safeSelector ? `await page.waitForSelector(${safeSelector});` : ""}
  await page.waitForTimeout(${options.wait});

  await page.screenshot({
    path: ${safeOutputFile},
    fullPage: ${options.fullPage || false}
  });

  await browser.close();
  console.log('Screenshot saved to: ' + ${safeOutputFile});
})();
`;

    // Write and execute script
    const scriptPath = `/tmp/screenshot-script-${timestamp}.js`;
    fs.writeFileSync(scriptPath, script);

    console.log("  Capturing screenshot...\n");

    const result = runCommand("node", [scriptPath], { timeout: 60000 });

    // Clean up script
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Ignore cleanup errors - temp script file may already be deleted
    }

    if (!result.success || !fs.existsSync(outputFile)) {
      console.error("  Screenshot failed:");
      console.error(result.stderr || result.stdout);
      process.exit(1);
    }

    const fileStats = fs.statSync(outputFile);
    let gcsUrl = "";

    // Upload if requested
    if (options.upload) {
      const taskPrefix = options.task ? `${options.task}/` : "";
      const gcsPath = `e2e/${taskPrefix}screenshots/${defaultFilename}`;
      const uploadResult = uploadToGCS(outputFile, gcsPath);
      gcsUrl = uploadResult.url;
    }

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        url,
        outputFile,
        fileSize: fileStats.size,
        viewport: options.viewport,
        fullPage: options.fullPage || false,
        gcsUrl: gcsUrl || undefined,
        timestamp,
      }, null, 2));
    } else {
      console.log(`  Screenshot captured successfully!`);
      console.log(`  File: ${outputFile}`);
      console.log(`  Size: ${(fileStats.size / 1024).toFixed(1)} KB`);
      if (gcsUrl) {
        console.log(`  GCS: ${gcsUrl}`);
      }
      console.log("");
    }
  });

// husky e2e list
e2eCommand
  .command("list")
  .description("List E2E artifacts in GCS bucket")
  .option("--task <taskId>", "Filter by task ID")
  .option("--type <type>", "Filter by type (screenshots, videos, recordings, reports)")
  .option("--limit <n>", "Limit number of results", "20")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    let gcsPath = `gs://${GCS_BUCKET}/e2e/`;
    if (options.task) {
      gcsPath += `${options.task}/`;
    }
    if (options.type) {
      gcsPath += `${options.type}/`;
    }

    console.log(`\n  E2E Artifacts\n`);
    console.log(`  Bucket: ${GCS_BUCKET}`);
    if (options.task) {
      console.log(`  Task: ${options.task}`);
    }
    if (options.type) {
      console.log(`  Type: ${options.type}`);
    }
    console.log("");

    const result = runCommand("gcloud", [
      "storage", "ls", "-l", gcsPath,
    ]);

    if (!result.success) {
      if (result.stderr.includes("CommandException") || result.stderr.includes("not found")) {
        console.log("  No artifacts found.");
      } else {
        console.error("Error listing artifacts:", result.stderr);
      }
      return;
    }

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const artifacts = lines
      .slice(0, parseInt(options.limit, 10))
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          return {
            size: parts[0],
            date: parts[1],
            path: parts[2],
          };
        }
        return null;
      })
      .filter(Boolean);

    if (options.json) {
      console.log(JSON.stringify({ artifacts }, null, 2));
    } else {
      console.log("  " + "-".repeat(70));
      console.log(`  ${"SIZE".padEnd(12)} ${"DATE".padEnd(20)} PATH`);
      console.log("  " + "-".repeat(70));

      for (const artifact of artifacts) {
        if (artifact) {
          const displayPath = artifact.path.replace(`gs://${GCS_BUCKET}/`, "");
          console.log(`  ${artifact.size.padEnd(12)} ${artifact.date.padEnd(20)} ${displayPath}`);
        }
      }
      console.log("");
    }
  });

// husky e2e clean
e2eCommand
  .command("clean")
  .description("Clean up local E2E artifacts")
  .option("--all", "Remove all E2E artifacts from /tmp")
  .option("--older-than <days>", "Remove artifacts older than N days", "7")
  .option("--dry-run", "Show what would be deleted without deleting")
  .action(async (options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    console.log(`\n  Cleaning E2E Artifacts\n`);

    const tmpDir = "/tmp";
    const e2ePatterns = ["e2e-", "screenshot-", "recording-"];
    const maxAge = parseInt(options.olderThan, 10) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let cleaned = 0;
    let totalSize = 0;

    try {
      const files = fs.readdirSync(tmpDir);

      for (const file of files) {
        const isE2E = e2ePatterns.some((p) => file.startsWith(p));
        if (!isE2E) continue;

        const filePath = path.join(tmpDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();

        if (options.all || age > maxAge) {
          if (options.dryRun) {
            console.log(`  Would delete: ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
          } else {
            if (stats.isDirectory()) {
              fs.rmSync(filePath, { recursive: true });
            } else {
              fs.unlinkSync(filePath);
            }
            console.log(`  Deleted: ${file}`);
          }
          cleaned++;
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error("Error cleaning artifacts:", error);
      process.exit(1);
    }

    console.log("");
    console.log(`  ${options.dryRun ? "Would clean" : "Cleaned"}: ${cleaned} items (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log("");
  });

// husky e2e inbox - List E2E inbox messages
e2eCommand
  .command("inbox")
  .description("List E2E inbox messages from API")
  .option("--status <status>", "Filter by status (pending, running, completed, failed)")
  .option("--task <taskId>", "Filter by task ID")
  .option("--limit <n>", "Limit number of results", "50")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    const config = ensureConfig();

    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.task) params.set("taskId", options.task);
    if (options.limit) params.set("limit", options.limit);

    const url = `${config.apiUrl}/api/e2e/inbox?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        console.error(`Error: ${res.status} ${res.statusText}`);
        process.exit(1);
      }

      const inbox = await res.json();

      if (options.json) {
        console.log(JSON.stringify(inbox, null, 2));
        return;
      }

      console.log(`\n  E2E Inbox (${inbox.length} items)\n`);

      if (inbox.length === 0) {
        console.log("  No E2E inbox messages found.");
        console.log("");
        return;
      }

      console.log("  " + "-".repeat(80));
      console.log(`  ${"STATUS".padEnd(12)} ${"TASK ID".padEnd(24)} TITLE`);
      console.log("  " + "-".repeat(80));

      for (const item of inbox) {
        const statusIcons: Record<string, string> = {
          pending: "⏳",
          running: "🔄",
          completed: "✅",
          failed: "❌",
        };
        const statusIcon = statusIcons[item.status as string] || "❓";

        console.log(
          `  ${statusIcon} ${(item.status as string).padEnd(10)} ${(item.taskId as string).padEnd(24)} ${(item.taskTitle as string)?.slice(0, 40) || "N/A"}`
        );
      }

      console.log("");
    } catch (error) {
      console.error("Error fetching E2E inbox:", (error as Error).message);
      process.exit(1);
    }
  });

// husky e2e watch - Watch E2E inbox for new test requests
e2eCommand
  .command("watch")
  .description("Watch E2E inbox for new test requests")
  .option("--interval <seconds>", "Poll interval in seconds", "30")
  .option("--once", "Process inbox once and exit")
  .action(async (options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    const config = ensureConfig();
    const interval = parseInt(options.interval, 10) * 1000;

    console.log(`\n  E2E Inbox Watcher\n`);
    console.log(`  API: ${config.apiUrl}`);
    console.log(`  Poll interval: ${options.interval}s`);
    console.log("");

    const processInbox = async () => {
      try {
        // Fetch E2E inbox from API
        const res = await fetch(`${config.apiUrl}/api/e2e/inbox`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (!res.ok) {
          console.error(`  Error fetching inbox: ${res.status}`);
          return;
        }

        const inbox = await res.json();
        const pending = inbox.filter((item: { status: string }) => item.status === "pending");

        if (pending.length === 0) {
          console.log(`  [${new Date().toISOString()}] No pending E2E requests`);
          return;
        }

        console.log(`  [${new Date().toISOString()}] Found ${pending.length} pending E2E request(s)`);

        for (const item of pending) {
          console.log(`\n  Processing: ${item.taskId} - ${item.taskTitle}`);

          // Update status to running
          await fetch(`${config.apiUrl}/api/e2e/inbox/${item.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ status: "running" }),
          });

          // Run E2E tests for this task
          const timestamp = generateTimestamp();
          const outputDir = `/tmp/e2e-${item.taskId}-${timestamp}`;

          console.log(`  Running tests in ${outputDir}...`);

          const playwrightArgs = [
            "test",
            "--reporter=list",
            `--output=${outputDir}`,
            "--timeout=60000",
          ];

          const result = runCommand("npx", ["playwright", ...playwrightArgs], {
            timeout: 300000, // 5 min
          });

          // Upload results
          const resultsPath = path.join(outputDir, "results.json");
          const testResult = {
            taskId: item.taskId,
            success: result.success,
            timestamp,
            stdout: result.stdout,
            stderr: result.stderr,
          };

          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          fs.writeFileSync(resultsPath, JSON.stringify(testResult, null, 2));

          const gcsPath = `e2e/${item.taskId}/${timestamp}/results.json`;
          const uploadResult = uploadToGCS(resultsPath, gcsPath);

          // Update inbox status
          await fetch(`${config.apiUrl}/api/e2e/inbox/${item.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
              status: result.success ? "completed" : "failed",
              completedAt: new Date().toISOString(),
              result: {
                passed: result.success,
                gcsUrl: uploadResult.url,
              },
            }),
          });

          // Update task status via API
          const taskEndpoint = result.success
            ? `${config.apiUrl}/api/tasks/${item.taskId}/e2e/pass`
            : `${config.apiUrl}/api/tasks/${item.taskId}/e2e/fail`;

          await fetch(taskEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
              notes: result.success ? "E2E tests passed" : "E2E tests failed",
              testResults: testResult,
              screenshots: uploadResult.url ? [uploadResult.url] : [],
            }),
          });

          console.log(`  ${result.success ? "✓" : "✗"} Task ${item.taskId}: ${result.success ? "PASSED" : "FAILED"}`);
        }
      } catch (error) {
        console.error(`  Error processing inbox:`, (error as Error).message);
      }
    };

    // Process once or continuously
    if (options.once) {
      await processInbox();
    } else {
      console.log("  Watching for E2E requests... (Ctrl+C to stop)\n");
      while (true) {
        await processInbox();
        await sleep(interval);
      }
    }
  });

// husky e2e done <inboxId> - Complete an E2E test request
e2eCommand
  .command("done <inboxId>")
  .description("Complete an E2E test request from inbox")
  .option("--passed", "Mark test as passed")
  .option("--failed", "Mark test as failed")
  .option("--notes <notes>", "Add notes about the test result")
  .option("--screenshots <urls...>", "Screenshot URLs to attach")
  .option("--video <url>", "Video URL to attach")
  .option("--json", "Output as JSON")
  .action(async (inboxId, options) => {
    requireAnyPermission(["task:e2e_pass", "deploy:sandbox", "deploy:*"]);

    const config = ensureConfig();

    // Determine status
    let passed: boolean | undefined;
    if (options.passed) {
      passed = true;
    } else if (options.failed) {
      passed = false;
    }

    if (passed === undefined) {
      console.error("Error: Must specify --passed or --failed");
      process.exit(1);
    }

    const status = passed ? "completed" : "failed";

    console.log(`\n  Completing E2E Test Request\n`);
    console.log(`  Inbox ID: ${inboxId}`);
    console.log(`  Result: ${passed ? "PASSED" : "FAILED"}`);
    if (options.notes) {
      console.log(`  Notes: ${options.notes}`);
    }
    console.log("");

    try {
      // First, get the inbox item to find the taskId
      const getRes = await fetch(`${config.apiUrl}/api/e2e/inbox/${inboxId}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!getRes.ok) {
        console.error(`Error: Inbox item not found (${getRes.status})`);
        process.exit(1);
      }

      const inboxItem = await getRes.json();
      const taskId = inboxItem.taskId;

      // Build result object
      const result = {
        passed,
        notes: options.notes,
        screenshots: options.screenshots || [],
        video: options.video,
        completedAt: new Date().toISOString(),
      };

      // Update inbox status
      const updateRes = await fetch(`${config.apiUrl}/api/e2e/inbox/${inboxId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          status,
          result,
        }),
      });

      if (!updateRes.ok) {
        console.error(`Error updating inbox: ${updateRes.status}`);
        process.exit(1);
      }

      // Update task status
      const taskEndpoint = passed
        ? `${config.apiUrl}/api/tasks/${taskId}/e2e/pass`
        : `${config.apiUrl}/api/tasks/${taskId}/e2e/fail`;

      const taskRes = await fetch(taskEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          notes: options.notes || (passed ? "E2E tests passed" : "E2E tests failed"),
          screenshots: options.screenshots || [],
          video: options.video,
        }),
      });

      if (!taskRes.ok) {
        console.warn(`Warning: Could not update task status: ${taskRes.status}`);
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          inboxId,
          taskId,
          status,
          result,
        }, null, 2));
      } else {
        console.log(`  ${passed ? "✓" : "✗"} E2E test request completed`);
        console.log(`  Task ${taskId} status updated to: ${passed ? "pr_ready" : "e2e_testing"}`);
        console.log("");
      }
    } catch (error) {
      console.error("Error completing E2E request:", (error as Error).message);
      process.exit(1);
    }
  });
