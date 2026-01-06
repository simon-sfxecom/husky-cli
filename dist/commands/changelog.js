import { Command } from "commander";
import { getConfig } from "./config.js";
import { execSync } from "child_process";
export const changelogCommand = new Command("changelog")
    .description("Generate and manage changelogs");
// Helper: Ensure API is configured
function ensureConfig() {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    return config;
}
// Helper: Get commits from git
function getGitCommits(since, until) {
    try {
        // Build git log command
        let range = "";
        if (since && until) {
            range = `${since}..${until}`;
        }
        else if (since) {
            range = `${since}..HEAD`;
        }
        else if (until) {
            range = until;
        }
        else {
            range = "HEAD~50..HEAD"; // Default: last 50 commits
        }
        // Format: hash|shortHash|subject|body|author|date
        const format = "%H|%h|%s|%b|%an|%aI";
        const output = execSync(`git log ${range} --format="${format}" --no-merges`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
        if (!output.trim()) {
            return [];
        }
        const commits = [];
        // Split by double newlines between commits, but handle body newlines
        const lines = output.trim().split("\n");
        let currentCommit = [];
        for (const line of lines) {
            // Check if this line starts a new commit (40 char hash followed by |)
            if (/^[a-f0-9]{40}\|/.test(line)) {
                if (currentCommit.length > 0) {
                    parseCommitLine(currentCommit.join("\n"), commits);
                }
                currentCommit = [line];
            }
            else {
                currentCommit.push(line);
            }
        }
        // Don't forget the last commit
        if (currentCommit.length > 0) {
            parseCommitLine(currentCommit.join("\n"), commits);
        }
        return commits;
    }
    catch (error) {
        console.error("Error getting git commits:", error);
        return [];
    }
}
function parseCommitLine(line, commits) {
    const parts = line.split("|");
    if (parts.length >= 6) {
        const hash = parts[0];
        const shortHash = parts[1];
        const message = parts[2];
        const body = parts[3];
        const author = parts[4];
        const date = parts[5];
        // Extract PR number from message if present (e.g., "(#123)")
        const prMatch = message.match(/\(#(\d+)\)/);
        const prNumber = prMatch ? prMatch[1] : undefined;
        commits.push({
            hash,
            shortHash,
            message,
            body,
            author,
            date,
            prNumber,
        });
    }
}
// husky changelog generate [--since <ref>] [--until <ref>] [--version <version>] [--project <id>]
changelogCommand
    .command("generate")
    .description("Generate a changelog from git commits")
    .option("--since <ref>", "Git ref to start from (tag, commit, or branch)")
    .option("--until <ref>", "Git ref to end at (default: HEAD)")
    .option("-v, --version <version>", "Version for this changelog (required)")
    .option("-p, --project <id>", "Project ID (required)")
    .option("--dry-run", "Show what would be generated without saving")
    .action(async (options) => {
    const config = ensureConfig();
    if (!options.version) {
        console.error("Error: --version is required");
        process.exit(1);
    }
    if (!options.project) {
        console.error("Error: --project is required");
        process.exit(1);
    }
    console.log("Collecting git commits...");
    const commits = getGitCommits(options.since, options.until);
    if (commits.length === 0) {
        console.error("No commits found in the specified range");
        process.exit(1);
    }
    console.log(`Found ${commits.length} commits`);
    if (options.dryRun) {
        console.log("\nCommits to analyze:");
        for (const commit of commits.slice(0, 10)) {
            console.log(`  ${commit.shortHash}: ${commit.message}`);
        }
        if (commits.length > 10) {
            console.log(`  ... and ${commits.length - 10} more`);
        }
        return;
    }
    console.log("Generating changelog with AI...");
    try {
        const res = await fetch(`${config.apiUrl}/api/changelogs/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                projectId: options.project,
                version: options.version,
                since: options.since,
                until: options.until,
                commits,
            }),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: "Unknown error" }));
            throw new Error(error.error || `API error: ${res.status}`);
        }
        const data = await res.json();
        const changelog = data.changelog;
        console.log(`\n[OK] Changelog ${changelog.version} generated!`);
        console.log(`  ID: ${changelog.id}`);
        console.log(`  Entries: ${changelog.entries.length}`);
        console.log(`  Status: ${changelog.status}`);
        if (changelog.entries.length > 0) {
            console.log("\n  Entries:");
            for (const entry of changelog.entries) {
                const typeIcon = getTypeIcon(entry.type);
                console.log(`    ${typeIcon} [${entry.type}] ${entry.title}`);
            }
        }
        if (!data.aiGenerated) {
            console.log("\n  Note: AI not configured, used basic parsing");
        }
    }
    catch (error) {
        console.error("Error generating changelog:", error);
        process.exit(1);
    }
});
// husky changelog list [--project <id>]
changelogCommand
    .command("list")
    .description("List changelogs")
    .option("-p, --project <id>", "Filter by project ID")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    try {
        const url = new URL("/api/changelogs", config.apiUrl);
        if (options.project) {
            url.searchParams.set("projectId", options.project);
        }
        const res = await fetch(url.toString(), {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const changelogs = await res.json();
        if (options.json) {
            console.log(JSON.stringify(changelogs, null, 2));
            return;
        }
        if (changelogs.length === 0) {
            console.log("No changelogs found");
            return;
        }
        console.log("\n  Changelogs");
        console.log("  " + "-".repeat(60));
        for (const changelog of changelogs) {
            const statusIcon = changelog.status === "published" ? "[OK]" : "[DRAFT]";
            const date = new Date(changelog.releaseDate).toLocaleDateString();
            console.log(`  ${statusIcon} ${changelog.version.padEnd(15)} ${date.padEnd(12)} ${changelog.entries.length} entries`);
        }
        console.log("");
    }
    catch (error) {
        console.error("Error fetching changelogs:", error);
        process.exit(1);
    }
});
// husky changelog show <id>
changelogCommand
    .command("show <id>")
    .description("Show changelog details")
    .option("--json", "Output as JSON")
    .option("--markdown", "Output as Markdown")
    .action(async (id, options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/changelogs/${id}`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error("Changelog not found");
            }
            else {
                console.error(`API error: ${res.status}`);
            }
            process.exit(1);
        }
        const changelog = await res.json();
        if (options.json) {
            console.log(JSON.stringify(changelog, null, 2));
            return;
        }
        if (options.markdown) {
            console.log(formatAsMarkdown(changelog));
            return;
        }
        // Default: formatted output
        console.log(`\n  Changelog: ${changelog.version}`);
        console.log("  " + "-".repeat(50));
        console.log(`  ID:      ${changelog.id}`);
        console.log(`  Status:  ${changelog.status}`);
        console.log(`  Date:    ${new Date(changelog.releaseDate).toLocaleDateString()}`);
        console.log(`  Entries: ${changelog.entries.length}`);
        if (changelog.entries.length > 0) {
            // Group entries by type
            const byType = {};
            for (const entry of changelog.entries) {
                if (!byType[entry.type]) {
                    byType[entry.type] = [];
                }
                byType[entry.type].push(entry);
            }
            console.log("\n  Changes:");
            const typeOrder = ["breaking", "feature", "fix", "docs", "chore"];
            for (const type of typeOrder) {
                const entries = byType[type];
                if (entries && entries.length > 0) {
                    const icon = getTypeIcon(type);
                    console.log(`\n  ${icon} ${getTypeLabel(type)}`);
                    for (const entry of entries) {
                        const prStr = entry.prNumber ? ` (#${entry.prNumber})` : "";
                        const hashStr = entry.commitHash ? ` [${entry.commitHash}]` : "";
                        console.log(`    - ${entry.title}${prStr}${hashStr}`);
                        if (entry.description) {
                            console.log(`      ${entry.description}`);
                        }
                    }
                }
            }
        }
        console.log("");
    }
    catch (error) {
        console.error("Error fetching changelog:", error);
        process.exit(1);
    }
});
// husky changelog publish <id>
changelogCommand
    .command("publish <id>")
    .description("Publish a changelog (change status to published)")
    .action(async (id) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/changelogs/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                status: "published",
                releaseDate: new Date().toISOString(),
            }),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error("Changelog not found");
            }
            else {
                console.error(`API error: ${res.status}`);
            }
            process.exit(1);
        }
        const changelog = await res.json();
        console.log(`[OK] Changelog ${changelog.version} published!`);
    }
    catch (error) {
        console.error("Error publishing changelog:", error);
        process.exit(1);
    }
});
// husky changelog delete <id>
changelogCommand
    .command("delete <id>")
    .description("Delete a changelog")
    .option("-y, --yes", "Skip confirmation")
    .action(async (id, options) => {
    const config = ensureConfig();
    if (!options.yes) {
        console.log("Are you sure you want to delete this changelog? Use --yes to confirm.");
        process.exit(0);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/changelogs/${id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error("Changelog not found");
            }
            else {
                console.error(`API error: ${res.status}`);
            }
            process.exit(1);
        }
        console.log("[OK] Changelog deleted");
    }
    catch (error) {
        console.error("Error deleting changelog:", error);
        process.exit(1);
    }
});
// Helper functions
function getTypeIcon(type) {
    const icons = {
        feature: "[NEW]",
        fix: "[FIX]",
        breaking: "[!!!]",
        docs: "[DOC]",
        chore: "[CHG]",
    };
    return icons[type] || "[?]";
}
function getTypeLabel(type) {
    const labels = {
        feature: "New Features",
        fix: "Bug Fixes",
        breaking: "Breaking Changes",
        docs: "Documentation",
        chore: "Maintenance",
    };
    return labels[type] || type;
}
function formatAsMarkdown(changelog) {
    let md = `# ${changelog.version}\n\n`;
    md += `*Released: ${new Date(changelog.releaseDate).toLocaleDateString()}*\n\n`;
    // Group entries by type
    const byType = {};
    for (const entry of changelog.entries) {
        if (!byType[entry.type]) {
            byType[entry.type] = [];
        }
        byType[entry.type].push(entry);
    }
    const typeOrder = ["breaking", "feature", "fix", "docs", "chore"];
    const typeEmoji = {
        breaking: "Breaking Changes",
        feature: "New Features",
        fix: "Bug Fixes",
        docs: "Documentation",
        chore: "Maintenance",
    };
    for (const type of typeOrder) {
        const entries = byType[type];
        if (entries && entries.length > 0) {
            md += `## ${typeEmoji[type] || type}\n\n`;
            for (const entry of entries) {
                const prStr = entry.prNumber ? ` (#${entry.prNumber})` : "";
                md += `- ${entry.title}${prStr}\n`;
                if (entry.description) {
                    md += `  ${entry.description}\n`;
                }
            }
            md += "\n";
        }
    }
    return md;
}
