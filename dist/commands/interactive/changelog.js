import { select, input, confirm } from "@inquirer/prompts";
import { execSync } from "child_process";
import { ensureConfig, pressEnterToContinue, truncate, formatDate } from "./utils.js";
const TYPE_LABELS = {
    feature: "New Features",
    fix: "Bug Fixes",
    breaking: "Breaking Changes",
    docs: "Documentation",
    chore: "Maintenance",
};
const TYPE_ICONS = {
    feature: "[NEW]",
    fix: "[FIX]",
    breaking: "[!!!]",
    docs: "[DOC]",
    chore: "[CHG]",
};
export async function changelogMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List changelogs", value: "list" },
        { name: "View changelog", value: "view" },
        { name: "Generate changelog", value: "generate" },
        { name: "Publish changelog", value: "publish" },
        { name: "Delete changelog", value: "delete" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Changelog:",
        choices: menuItems,
    });
    switch (choice) {
        case "list":
            await listChangelogs(config);
            break;
        case "view":
            await viewChangelog(config);
            break;
        case "generate":
            await generateChangelog(config);
            break;
        case "publish":
            await publishChangelog(config);
            break;
        case "delete":
            await deleteChangelog(config);
            break;
        case "back":
            return;
    }
}
async function fetchChangelogs(config, projectId) {
    const url = new URL("/api/changelogs", config.apiUrl);
    if (projectId) {
        url.searchParams.set("projectId", projectId);
    }
    const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok)
        throw new Error(`API returned ${res.status}`);
    return res.json();
}
async function fetchProjects(config) {
    const res = await fetch(`${config.apiUrl}/api/projects`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok)
        throw new Error(`API returned ${res.status}`);
    return res.json();
}
async function selectChangelog(config, message) {
    const changelogs = await fetchChangelogs(config);
    if (changelogs.length === 0) {
        console.log("\n  No changelogs found.\n");
        await pressEnterToContinue();
        return null;
    }
    const choices = changelogs.map((c) => ({
        name: `[${c.status}] ${c.version} (${c.entries.length} entries) - ${formatDate(c.releaseDate)}`,
        value: c.id,
    }));
    choices.push({ name: "Cancel", value: "__cancel__" });
    const changelogId = await select({ message, choices });
    if (changelogId === "__cancel__")
        return null;
    // Fetch full changelog
    const res = await fetch(`${config.apiUrl}/api/changelogs/${changelogId}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok)
        return null;
    return res.json();
}
async function listChangelogs(config) {
    try {
        const changelogs = await fetchChangelogs(config);
        console.log("\n  CHANGELOGS");
        console.log("  " + "-".repeat(70));
        if (changelogs.length === 0) {
            console.log("  No changelogs found.");
        }
        else {
            for (const cl of changelogs) {
                const statusIcon = cl.status === "published" ? "[OK]" : "[DRAFT]";
                console.log(`  ${statusIcon} ${cl.version.padEnd(15)} ${formatDate(cl.releaseDate).padEnd(12)} ${cl.entries.length} entries`);
                console.log(`      ID: ${cl.id}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching changelogs:", error);
        await pressEnterToContinue();
    }
}
async function viewChangelog(config) {
    try {
        const changelog = await selectChangelog(config, "Select changelog to view:");
        if (!changelog)
            return;
        console.log(`\n  Changelog: ${changelog.version}`);
        console.log("  " + "-".repeat(60));
        console.log(`  ID:      ${changelog.id}`);
        console.log(`  Status:  ${changelog.status}`);
        console.log(`  Date:    ${formatDate(changelog.releaseDate)}`);
        console.log(`  Entries: ${changelog.entries.length}`);
        if (changelog.entries.length > 0) {
            // Group by type
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
                    const icon = TYPE_ICONS[type] || "[?]";
                    const label = TYPE_LABELS[type] || type;
                    console.log(`\n  ${icon} ${label}`);
                    for (const entry of entries) {
                        const prStr = entry.prNumber ? ` (#${entry.prNumber})` : "";
                        console.log(`    - ${truncate(entry.title, 55)}${prStr}`);
                    }
                }
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error viewing changelog:", error);
        await pressEnterToContinue();
    }
}
async function generateChangelog(config) {
    try {
        // Select project
        const projects = await fetchProjects(config);
        if (projects.length === 0) {
            console.log("\n  No projects found. Create a project first.\n");
            await pressEnterToContinue();
            return;
        }
        const projectChoices = projects.map((p) => ({
            name: p.name,
            value: p.id,
        }));
        projectChoices.push({ name: "Cancel", value: "__cancel__" });
        const projectId = await select({ message: "Select project:", choices: projectChoices });
        if (projectId === "__cancel__")
            return;
        const version = await input({
            message: "Version (e.g., 1.0.0):",
            validate: (v) => (v.length > 0 ? true : "Version required"),
        });
        const since = await input({
            message: "Git ref to start from (tag, commit, or empty for last 50 commits):",
        });
        const until = await input({
            message: "Git ref to end at (default: HEAD):",
            default: "HEAD",
        });
        console.log("\n  Collecting git commits...\n");
        const commits = getGitCommits(since || undefined, until);
        if (commits.length === 0) {
            console.log("  No commits found in the specified range.\n");
            await pressEnterToContinue();
            return;
        }
        console.log(`  Found ${commits.length} commits.`);
        const proceed = await confirm({
            message: "Generate changelog with AI?",
            default: true,
        });
        if (!proceed) {
            console.log("\n  Cancelled.\n");
            await pressEnterToContinue();
            return;
        }
        console.log("\n  Generating changelog with AI... This may take a moment.\n");
        const res = await fetch(`${config.apiUrl}/api/changelogs/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                projectId,
                version,
                since: since || undefined,
                until,
                commits,
            }),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
            await pressEnterToContinue();
            return;
        }
        const data = await res.json();
        const changelog = data.changelog;
        console.log(`  ✓ Changelog ${changelog.version} generated!`);
        console.log(`  ID: ${changelog.id}`);
        console.log(`  Entries: ${changelog.entries.length}`);
        console.log(`  Status: ${changelog.status}`);
        if (changelog.entries.length > 0) {
            console.log("\n  Entries:");
            for (const entry of changelog.entries.slice(0, 5)) {
                const icon = TYPE_ICONS[entry.type] || "[?]";
                console.log(`    ${icon} ${truncate(entry.title, 50)}`);
            }
            if (changelog.entries.length > 5) {
                console.log(`    ... and ${changelog.entries.length - 5} more`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error generating changelog:", error);
        await pressEnterToContinue();
    }
}
async function publishChangelog(config) {
    try {
        const changelogs = await fetchChangelogs(config);
        const draftChangelogs = changelogs.filter((c) => c.status === "draft");
        if (draftChangelogs.length === 0) {
            console.log("\n  No draft changelogs to publish.\n");
            await pressEnterToContinue();
            return;
        }
        const choices = draftChangelogs.map((c) => ({
            name: `${c.version} (${c.entries.length} entries)`,
            value: c.id,
        }));
        choices.push({ name: "Cancel", value: "__cancel__" });
        const changelogId = await select({ message: "Select changelog to publish:", choices });
        if (changelogId === "__cancel__")
            return;
        const changelog = draftChangelogs.find((c) => c.id === changelogId);
        const confirmed = await confirm({
            message: `Publish changelog ${changelog?.version}?`,
            default: true,
        });
        if (!confirmed) {
            console.log("\n  Cancelled.\n");
            await pressEnterToContinue();
            return;
        }
        const res = await fetch(`${config.apiUrl}/api/changelogs/${changelogId}`, {
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
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Changelog ${changelog?.version} published!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error publishing changelog:", error);
        await pressEnterToContinue();
    }
}
async function deleteChangelog(config) {
    try {
        const changelog = await selectChangelog(config, "Select changelog to delete:");
        if (!changelog)
            return;
        const confirmed = await confirm({
            message: `Delete changelog ${changelog.version}? This cannot be undone.`,
            default: false,
        });
        if (!confirmed) {
            console.log("\n  Cancelled.\n");
            await pressEnterToContinue();
            return;
        }
        const res = await fetch(`${config.apiUrl}/api/changelogs/${changelog.id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Changelog deleted.\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error deleting changelog:", error);
        await pressEnterToContinue();
    }
}
// Git helpers
function getGitCommits(since, until) {
    try {
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
            range = "HEAD~50..HEAD";
        }
        const format = "%H|%h|%s|%b|%an|%aI";
        const output = execSync(`git log ${range} --format="${format}" --no-merges`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
        if (!output.trim()) {
            return [];
        }
        const commits = [];
        const lines = output.trim().split("\n");
        let currentCommit = [];
        for (const line of lines) {
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
        if (currentCommit.length > 0) {
            parseCommitLine(currentCommit.join("\n"), commits);
        }
        return commits;
    }
    catch {
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
