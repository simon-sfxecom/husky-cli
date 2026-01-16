import { Command } from "commander";
import { SOPService, SOP_STATUSES, SOPStatus, CreateSOPInput, SOPStep } from "../lib/biz/sop.js";
import { PatternDetectionService } from "../lib/biz/pattern-detection.js";

const DEFAULT_APPROVER = process.env.HUSKY_AGENT_ID || 'system';

function validateStatus(status: string | undefined): SOPStatus | undefined {
    if (!status) return undefined;
    if (!SOP_STATUSES.includes(status as SOPStatus)) {
        console.error(`Invalid status: ${status}. Must be one of: ${SOP_STATUSES.join(', ')}`);
        process.exit(1);
    }
    return status as SOPStatus;
}

export const sopCommand = new Command("sop")
    .description("Standard Operating Procedures management");

sopCommand
    .command("list")
    .description("List SOPs")
    .option("-s, --status <status>", `Filter by status (${SOP_STATUSES.join(", ")})`)
    .option("-c, --category <category>", "Filter by category")
    .option("-l, --limit <num>", "Max results", "50")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const service = new SOPService();
            const sops = await service.list({
                status: options.status as SOPStatus,
                category: options.category,
                limit: parseInt(options.limit, 10),
            });

            if (options.json) {
                console.log(JSON.stringify(sops, null, 2));
                return;
            }

            console.log(`\n  📋 SOPs (${sops.length})\n`);

            if (sops.length === 0) {
                console.log("  No SOPs found.");
                return;
            }

            for (const sop of sops) {
                const statusIcon = getStatusIcon(sop.status);
                console.log(`  ${statusIcon} ${sop.id.padEnd(12)} │ ${sop.status.padEnd(10)} │ ${sop.category.padEnd(15)} │ ${sop.title.slice(0, 35)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("get <id>")
    .description("Get SOP details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const service = new SOPService();
            const sop = await service.get(id);

            if (!sop) {
                console.error(`SOP not found: ${id}`);
                process.exit(1);
            }

            if (options.json) {
                console.log(JSON.stringify(sop, null, 2));
                return;
            }

            console.log(`\n  📋 SOP: ${sop.title}`);
            console.log("  " + "─".repeat(60));
            console.log(`  ID:          ${sop.id}`);
            console.log(`  Status:      ${getStatusIcon(sop.status)} ${sop.status}`);
            console.log(`  Category:    ${sop.category}`);
            console.log(`  Version:     ${sop.version}`);
            console.log(`  Trigger:     ${sop.trigger}`);
            console.log(`  Created:     ${sop.created_at}`);
            console.log(`  Updated:     ${sop.updated_at}`);

            if (sop.approved_by) {
                console.log(`  Approved by: ${sop.approved_by} (${sop.approved_at})`);
            }
            if (sop.deprecated_by) {
                console.log(`  Deprecated by: ${sop.deprecated_by} (${sop.deprecated_at})`);
            }

            console.log(`\n  Description:\n  ${sop.description}`);

            console.log(`\n  Steps (${sop.steps.length}):`);
            for (const step of sop.steps) {
                const required = step.required ? "●" : "○";
                console.log(`    ${required} ${step.order}. ${step.action}`);
                console.log(`       ${step.description}`);
                if (step.tool) console.log(`       Tool: ${step.tool}`);
                if (step.conditions) console.log(`       Conditions: ${step.conditions}`);
            }

            if (sop.tags.length > 0) {
                console.log(`\n  Tags: ${sop.tags.join(", ")}`);
            }
            if (sop.source_tickets.length > 0) {
                console.log(`  Source tickets: ${sop.source_tickets.join(", ")}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("search <query>")
    .description("Semantic search for SOPs")
    .option("-l, --limit <num>", "Max results", "5")
    .option("-s, --status <status>", `Filter by status (${SOP_STATUSES.join(", ")})`)
    .option("-m, --min-score <score>", "Minimum similarity score", "0.5")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const service = new SOPService();
            console.log(`  Searching SOPs for: "${query}"...`);

            const results = await service.search(query, {
                limit: parseInt(options.limit, 10),
                status: options.status as SOPStatus,
                minScore: parseFloat(options.minScore),
            });

            if (options.json) {
                console.log(JSON.stringify(results, null, 2));
                return;
            }

            console.log(`\n  🔍 Search results (${results.length})\n`);

            if (results.length === 0) {
                console.log("  No matching SOPs found.");
                return;
            }

            for (const { sop, score } of results) {
                const statusIcon = getStatusIcon(sop.status);
                console.log(`  [${(score * 100).toFixed(1)}%] ${statusIcon} ${sop.id} │ ${sop.title.slice(0, 40)}`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("create")
    .description("Create a new SOP (draft)")
    .requiredOption("-t, --title <title>", "SOP title")
    .requiredOption("-d, --description <desc>", "SOP description")
    .requiredOption("--trigger <trigger>", "Trigger phrase/condition")
    .requiredOption("-c, --category <category>", "Category")
    .option("--steps <json>", "Steps as JSON array")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--source-tickets <ids>", "Comma-separated ticket IDs")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const service = new SOPService();

            let steps: SOPStep[] = [];
            if (options.steps) {
                try {
                    steps = JSON.parse(options.steps);
                } catch {
                    console.error("Invalid JSON for --steps");
                    process.exit(1);
                }
            }

            const input: CreateSOPInput = {
                title: options.title,
                description: options.description,
                trigger: options.trigger,
                category: options.category,
                steps,
                tags: options.tags ? options.tags.split(",").map((t: string) => t.trim()) : [],
                source_tickets: options.sourceTickets
                    ? options.sourceTickets.split(",").map((id: string) => parseInt(id.trim(), 10))
                    : [],
            };

            console.log(`  Creating SOP: "${input.title}"...`);
            const sop = await service.create(input);

            if (options.json) {
                console.log(JSON.stringify(sop, null, 2));
                return;
            }

            console.log(`  ✓ SOP created: ${sop.id}`);
            console.log(`    Status: ${sop.status} (use 'husky sop approve ${sop.id}' to approve)`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("approve <id>")
    .description("Approve a draft SOP")
    .option("-a, --approver <name>", "Approver name/ID", DEFAULT_APPROVER)
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const service = new SOPService();
            console.log(`  Approving SOP: ${id}...`);

            const sop = await service.approve(id, options.approver);

            if (!sop) {
                console.error(`SOP not found: ${id}`);
                process.exit(1);
            }

            if (options.json) {
                console.log(JSON.stringify(sop, null, 2));
                return;
            }

            console.log(`  ✓ SOP approved: ${sop.id}`);
            console.log(`    Approved by: ${sop.approved_by}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("deprecate <id>")
    .description("Deprecate an SOP")
    .option("-d, --deprecator <name>", "Deprecator name/ID", DEFAULT_APPROVER)
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
        try {
            const service = new SOPService();
            console.log(`  Deprecating SOP: ${id}...`);

            const sop = await service.deprecate(id, options.deprecator);

            if (!sop) {
                console.error(`SOP not found: ${id}`);
                process.exit(1);
            }

            if (options.json) {
                console.log(JSON.stringify(sop, null, 2));
                return;
            }

            console.log(`  ✓ SOP deprecated: ${sop.id}`);
            console.log(`    Deprecated by: ${sop.deprecated_by}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("delete <id>")
    .description("Delete an SOP permanently")
    .option("-y, --yes", "Skip confirmation")
    .action(async (id, options) => {
        try {
            const service = new SOPService();

            if (!options.yes) {
                console.log(`  Warning: This will permanently delete SOP ${id}`);
                console.log(`  Use --yes to confirm.`);
                process.exit(1);
            }

            await service.delete(id);
            console.log(`  ✓ SOP deleted: ${id}`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("stats")
    .description("Show SOP statistics")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const service = new SOPService();
            const stats = await service.stats();

            if (options.json) {
                console.log(JSON.stringify(stats, null, 2));
                return;
            }

            console.log(`\n  📊 SOP Statistics`);
            console.log("  " + "─".repeat(40));
            console.log(`  Total SOPs: ${stats.total}`);

            console.log(`\n  By Status:`);
            console.log(`    📝 Draft:      ${stats.byStatus.draft}`);
            console.log(`    ✅ Approved:   ${stats.byStatus.approved}`);
            console.log(`    ⛔ Deprecated: ${stats.byStatus.deprecated}`);

            if (Object.keys(stats.byCategory).length > 0) {
                console.log(`\n  By Category:`);
                for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
                    console.log(`    ${cat}: ${count}`);
                }
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("categories")
    .description("List SOP categories")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const service = new SOPService();
            const categories = await service.getCategories();

            if (options.json) {
                console.log(JSON.stringify(categories, null, 2));
                return;
            }

            console.log(`\n  📁 SOP Categories (${categories.length})\n`);

            if (categories.length === 0) {
                console.log("  No categories found.");
                return;
            }

            for (const { category, count } of categories) {
                console.log(`  ${category.padEnd(20)} │ ${count} SOP(s)`);
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

sopCommand
    .command("find-trigger <trigger>")
    .description("Find SOP matching a trigger phrase")
    .option("-m, --min-score <score>", "Minimum similarity score", "0.7")
    .option("--json", "Output as JSON")
    .action(async (trigger, options) => {
        try {
            const service = new SOPService();
            console.log(`  Finding SOP for trigger: "${trigger}"...`);

            const result = await service.findByTrigger(trigger, {
                minScore: parseFloat(options.minScore),
            });

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            if (!result) {
                console.log("\n  No matching approved SOP found.");
                return;
            }

            console.log(`\n  ✓ Found SOP: ${result.sop.id} (${(result.score * 100).toFixed(1)}% match)`);
            console.log(`    Title: ${result.sop.title}`);
            console.log(`    Steps: ${result.sop.steps.length}`);
            console.log(`\n  Run 'husky sop get ${result.sop.id}' for full details.`);

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

function getStatusIcon(status: SOPStatus): string {
    switch (status) {
        case "draft": return "📝";
        case "approved": return "✅";
        case "deprecated": return "⛔";
        default: return "○";
    }
}

const detectCommand = sopCommand
    .command("detect")
    .description("Detect patterns in resolved tickets for SOP suggestions");

detectCommand
    .command("analyze")
    .description("Analyze resolved tickets for patterns")
    .option("-c, --category <category>", "Filter by category")
    .option("-m, --min-cluster <num>", "Minimum cluster size", "3")
    .option("-s, --similarity <score>", "Similarity threshold", "0.75")
    .option("-l, --limit <num>", "Max tickets to analyze", "500")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const service = new PatternDetectionService();
            console.log("  Analyzing resolved tickets for patterns...");

            const analysis = await service.detectPatterns({
                category: options.category,
                minClusterSize: parseInt(options.minCluster, 10),
                similarityThreshold: parseFloat(options.similarity),
                limit: parseInt(options.limit, 10),
            });

            if (options.json) {
                console.log(JSON.stringify(analysis, null, 2));
                return;
            }

            console.log(`\n  🔍 Pattern Analysis Results`);
            console.log("  " + "─".repeat(50));
            console.log(`  Total tickets analyzed: ${analysis.total_tickets}`);
            console.log(`  Clusters found: ${analysis.clusters.length}`);
            console.log(`  Unmatched tickets: ${analysis.unmatched_tickets.length}`);

            if (analysis.clusters.length > 0) {
                console.log(`\n  📊 Detected Patterns:\n`);
                for (const cluster of analysis.clusters) {
                    const size = cluster.members.length + 1;
                    const confidence = cluster.suggested_sop?.confidence_score || 0;
                    console.log(`  ${cluster.id}`);
                    console.log(`    Size: ${size} tickets`);
                    console.log(`    Category: ${cluster.problem_category}`);
                    console.log(`    Similarity: ${(cluster.similarity * 100).toFixed(0)}%`);
                    console.log(`    Confidence: ${(confidence * 100).toFixed(0)}%`);
                    console.log(`    Problem: ${cluster.representative.problem.slice(0, 50)}...`);
                    console.log("");
                }

                console.log(`  💡 To create an SOP from a pattern:`);
                console.log(`     husky sop detect create-from <cluster_id>`);
            } else {
                console.log("\n  No significant patterns detected.");
                console.log("  Try lowering --similarity or --min-cluster thresholds.");
            }
            console.log("");

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

detectCommand
    .command("suggestions")
    .description("List SOP suggestions from detected patterns")
    .option("-c, --category <category>", "Filter by category")
    .option("-l, --limit <num>", "Max suggestions", "10")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const service = new PatternDetectionService();
            console.log("  Generating SOP suggestions...");

            const analysis = await service.detectPatterns({
                category: options.category,
                minClusterSize: 3,
                similarityThreshold: 0.7,
                limit: 500,
            });

            const suggestions = analysis.suggestions.slice(0, parseInt(options.limit, 10));

            if (options.json) {
                console.log(JSON.stringify(suggestions, null, 2));
                return;
            }

            console.log(`\n  💡 SOP Suggestions (${suggestions.length})\n`);

            if (suggestions.length === 0) {
                console.log("  No suggestions available.");
                console.log("  Log more resolved tickets with 'husky biz tickets learn log'.");
                return;
            }

            for (const [i, sug] of suggestions.entries()) {
                console.log(`  ${i + 1}. ${sug.title.slice(0, 50)}`);
                console.log(`     Category: ${sug.category}`);
                console.log(`     Steps: ${sug.steps.length}`);
                console.log(`     Confidence: ${(sug.confidence_score * 100).toFixed(0)}%`);
                console.log(`     Source tickets: ${sug.source_tickets.length}`);
                console.log("");
            }

        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

export default sopCommand;
