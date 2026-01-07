import { Command } from "commander";
const API_URL = process.env.HUSKY_API_URL || "https://huskyv0-dashboard-474966775596.europe-west1.run.app";
const API_KEY = process.env.HUSKY_API_KEY || "";
async function fetchApi(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            ...options.headers,
        },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
}
function formatPersona(personaType) {
    const icons = {
        "support-agent": "🎧",
        "research-agent": "🔬",
        "accounting-agent": "📊",
        "marketing-agent": "📢",
        "developer-agent": "💻",
        "devops-agent": "🔧",
    };
    return `${icons[personaType] || "👤"} ${personaType}`;
}
function formatPermissionLevel(level) {
    const colors = {
        "read-only": "\x1b[90m", // gray
        "developer": "\x1b[34m", // blue
        "admin": "\x1b[31m", // red
    };
    const reset = "\x1b[0m";
    return `${colors[level] || ""}${level}${reset}`;
}
export const serviceAccountCommand = new Command("sa")
    .description("Manage Agent Service Accounts")
    .addHelpText("after", `
Examples:
  husky sa list                List all service account bindings
  husky sa get developer-agent Show binding for developer persona
  husky sa sync               Sync bindings from GCP config
  husky sa verify             Verify current VM's service account
`);
// List all bindings
serviceAccountCommand
    .command("list")
    .description("List all service account bindings")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    try {
        const data = await fetchApi("/api/service-account-bindings");
        const bindings = (data.bindings || []);
        if (options.json) {
            console.log(JSON.stringify(bindings, null, 2));
            return;
        }
        if (bindings.length === 0) {
            console.log("No service account bindings found.");
            console.log("Run 'husky sa sync' to create bindings from GCP config.");
            return;
        }
        console.log("\n📋 Service Account Bindings\n");
        console.log("━".repeat(80));
        for (const binding of bindings) {
            console.log(`${formatPersona(binding.personaType)}`);
            console.log(`  Email: ${binding.serviceAccountEmail}`);
            console.log(`  Permission: ${formatPermissionLevel(binding.permissionLevel)}`);
            console.log(`  Roles: ${binding.iamRoles.join(", ") || "none"}`);
            if (binding.lastSyncedAt) {
                console.log(`  Last Synced: ${new Date(binding.lastSyncedAt).toLocaleString()}`);
            }
            console.log("━".repeat(80));
        }
        console.log(`\nTotal: ${bindings.length} bindings`);
    }
    catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Get specific binding
serviceAccountCommand
    .command("get <persona>")
    .description("Get service account binding for a persona")
    .option("--json", "Output as JSON")
    .action(async (persona, options) => {
    try {
        // First list all and filter by persona
        const data = await fetchApi("/api/service-account-bindings");
        const bindings = (data.bindings || []);
        const binding = bindings.find((b) => b.personaType === persona);
        if (!binding) {
            console.log(`No binding found for persona: ${persona}`);
            console.log("\nAvailable personas:");
            bindings.forEach((b) => console.log(`  - ${b.personaType}`));
            return;
        }
        if (options.json) {
            console.log(JSON.stringify(binding, null, 2));
            return;
        }
        console.log(`\n${formatPersona(binding.personaType)}\n`);
        console.log(`Email:       ${binding.serviceAccountEmail}`);
        console.log(`Permission:  ${formatPermissionLevel(binding.permissionLevel)}`);
        console.log(`Project:     ${binding.projectId}`);
        console.log(`Roles:`);
        binding.iamRoles.forEach((role) => console.log(`  - ${role}`));
        if (binding.lastSyncedAt) {
            console.log(`Last Synced: ${new Date(binding.lastSyncedAt).toLocaleString()}`);
        }
        console.log(`Created:     ${new Date(binding.createdAt).toLocaleString()}`);
    }
    catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Sync from GCP
serviceAccountCommand
    .command("sync")
    .description("Sync service account bindings from GCP config")
    .action(async () => {
    try {
        console.log("🔄 Syncing service account bindings...\n");
        const data = await fetchApi("/api/service-account-bindings/sync", {
            method: "POST",
        });
        console.log(`✅ Synced ${data.synced} bindings\n`);
        for (const result of (data.results || [])) {
            const icon = result.status === "synced" ? "✓" : "✗";
            console.log(`  ${icon} ${result.personaType}: ${result.email || result.status}`);
        }
        console.log("\nRun 'husky sa list' to see all bindings.");
    }
    catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Verify current VM's SA (for use on VMs)
serviceAccountCommand
    .command("verify")
    .description("Verify current VM's service account (run on VM)")
    .action(async () => {
    try {
        // Check if running on GCP by querying metadata service
        const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email";
        console.log("🔍 Checking GCP metadata service...\n");
        const response = await fetch(metadataUrl, {
            headers: { "Metadata-Flavor": "Google" },
        }).catch(() => null);
        if (!response || !response.ok) {
            console.log("❌ Not running on a GCP VM (metadata service unavailable)");
            console.log("\nThis command is designed to run on GCP Compute Engine VMs.");
            return;
        }
        const saEmail = await response.text();
        console.log(`✅ Running as service account: ${saEmail}`);
        // Try to match to a persona
        const personaMatch = saEmail.match(/husky-(\w+)@/);
        if (personaMatch) {
            const persona = personaMatch[1] + "-agent";
            console.log(`   Persona: ${formatPersona(persona)}`);
        }
        // Report to Husky if we have a task ID
        const taskId = process.env.HUSKY_TASK_ID;
        if (taskId) {
            console.log(`\n📤 Reporting to Husky (task: ${taskId})...`);
            // The VM startup script handles this, but we can also report here
        }
    }
    catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
