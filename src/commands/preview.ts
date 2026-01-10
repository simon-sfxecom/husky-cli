import { Command } from "commander";
import { getConfig } from "./config.js";

const PREVIEW_DEPLOY_TRIGGER_ID = "80b3ba55-ae74-41cd-b7d0-a477ecc357b1";
const PREVIEW_CLEANUP_TRIGGER_ID = "965c3e86-677f-4063-b391-43019f621ea2";
const GCP_PROJECT = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "tigerv0";

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Response> {
  const config = getConfig();
  const url = `${config.apiUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey || "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

async function triggerCloudBuild(
  triggerId: string,
  substitutions: Record<string, string>
): Promise<{ success: boolean; buildId?: string; error?: string }> {
  const { execSync } = await import("child_process");
  
  const subsArgs = Object.entries(substitutions)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  
  try {
    const cmd = `gcloud builds triggers run ${triggerId} --project=${GCP_PROJECT} --branch=main --substitutions=${subsArgs} --format="value(metadata.build.id)" 2>&1`;
    const output = execSync(cmd, { encoding: "utf-8" }).trim();
    const buildId = output.split("\n").pop() || "";
    return { success: true, buildId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export const previewCommand = new Command("preview")
  .description("Manage PR preview deployments");

previewCommand
  .command("list")
  .description("List active preview deployments")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const response = await apiRequest("GET", "/api/previews");
      if (!response.ok) {
        console.error(`Error: ${response.status} ${response.statusText}`);
        process.exit(1);
      }
      
      const previews = await response.json();
      
      if (options.json) {
        console.log(JSON.stringify(previews, null, 2));
        return;
      }
      
      if (!previews.length) {
        console.log("No active previews");
        return;
      }
      
      console.log("\nActive Previews:\n");
      for (const p of previews) {
        console.log(`  PR #${p.prNumber}${p.prTitle ? `: ${p.prTitle}` : ""}`);
        console.log(`    Status: ${p.status}`);
        console.log(`    Dashboard: ${p.dashboardUrl}`);
        console.log(`    Terminal: ${p.terminalUrl}`);
        console.log(`    Commit: ${p.commitSha.slice(0, 7)}`);
        console.log("");
      }
    } catch (error) {
      console.error("Failed to fetch previews:", error);
      process.exit(1);
    }
  });

previewCommand
  .command("deploy <pr-number>")
  .description("Deploy a preview for a PR")
  .option("--branch <branch>", "Branch to deploy (default: from PR)")
  .action(async (prNumber, options) => {
    const prNum = parseInt(prNumber, 10);
    if (isNaN(prNum) || prNum <= 0) {
      console.error("Error: PR number must be a positive integer");
      process.exit(1);
    }
    
    console.log(`Triggering preview deployment for PR #${prNum}...`);
    
    const result = await triggerCloudBuild(PREVIEW_DEPLOY_TRIGGER_ID, {
      _PR_NUMBER: String(prNum),
    });
    
    if (result.success) {
      console.log(`Build started: ${result.buildId}`);
      console.log(`\nMonitor at: https://console.cloud.google.com/cloud-build/builds/${result.buildId}?project=${GCP_PROJECT}`);
      console.log("\nPreview URLs will be available once build completes (~5-10 min)");
    } else {
      console.error(`Failed to trigger build: ${result.error}`);
      process.exit(1);
    }
  });

previewCommand
  .command("cleanup [pr-number]")
  .description("Cleanup preview deployments (specific PR or all merged)")
  .action(async (prNumber) => {
    const substitutions: Record<string, string> = {};
    
    if (prNumber) {
      const prNum = parseInt(prNumber, 10);
      if (isNaN(prNum) || prNum <= 0) {
        console.error("Error: PR number must be a positive integer");
        process.exit(1);
      }
      substitutions._PR_NUMBER = String(prNum);
      console.log(`Cleaning up preview for PR #${prNum}...`);
    } else {
      console.log("Cleaning up all merged/closed PR previews...");
    }
    
    const result = await triggerCloudBuild(PREVIEW_CLEANUP_TRIGGER_ID, substitutions);
    
    if (result.success) {
      console.log(`Cleanup started: ${result.buildId}`);
      console.log(`\nMonitor at: https://console.cloud.google.com/cloud-build/builds/${result.buildId}?project=${GCP_PROJECT}`);
    } else {
      console.error(`Failed to trigger cleanup: ${result.error}`);
      process.exit(1);
    }
  });

previewCommand
  .command("status <pr-number>")
  .description("Get status of a specific preview")
  .option("--json", "Output as JSON")
  .action(async (prNumber, options) => {
    const prNum = parseInt(prNumber, 10);
    if (isNaN(prNum) || prNum <= 0) {
      console.error("Error: PR number must be a positive integer");
      process.exit(1);
    }
    
    try {
      const response = await apiRequest("GET", `/api/previews/${prNum}`);
      
      if (response.status === 404) {
        console.log(`No preview found for PR #${prNum}`);
        process.exit(0);
      }
      
      if (!response.ok) {
        console.error(`Error: ${response.status} ${response.statusText}`);
        process.exit(1);
      }
      
      const preview = await response.json();
      
      if (options.json) {
        console.log(JSON.stringify(preview, null, 2));
        return;
      }
      
      console.log(`\nPreview for PR #${preview.prNumber}`);
      if (preview.prTitle) console.log(`  Title: ${preview.prTitle}`);
      console.log(`  Status: ${preview.status}`);
      console.log(`  Dashboard: ${preview.dashboardUrl}`);
      console.log(`  Terminal: ${preview.terminalUrl}`);
      console.log(`  Commit: ${preview.commitSha}`);
      console.log(`  Created: ${new Date(preview.createdAt).toLocaleString()}`);
    } catch (error) {
      console.error("Failed to fetch preview:", error);
      process.exit(1);
    }
  });
