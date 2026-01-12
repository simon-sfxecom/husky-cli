import { Command } from "commander";
import { AgentBrain, AGENT_TYPES, AgentType, isValidAgentType } from "../lib/biz/agent-brain.js";
import { generateSOP, formatSOPAsMarkdown } from "../lib/biz/sop-generator.js";

const DEFAULT_AGENT = process.env.HUSKY_AGENT_ID || 'default';

function createBrain(agentId: string, agentType?: string): AgentBrain {
    const validAgentType = isValidAgentType(agentType) ? agentType : undefined;
    return new AgentBrain({ agentId, agentType: validAgentType });
}

export const brainCommand = new Command("brain")
    .description("Agent memory and knowledge management");

brainCommand
    .command("remember <content>")
    .description("Store a memory")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("-t, --tags <tags>", "Comma-separated tags")
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--visibility <level>", "Visibility level (private, team, public)", "private")
    .option("--allow-pii", "Skip PII filtering (use only for technical/internal content)")
    .option("--json", "Output as JSON")
    .action(async (content, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const tags = options.tags ? options.tags.split(",").map((t: string) => t.trim()) : [];
            const visibility = options.visibility as "private" | "team" | "public";
            const dbInfo = brain.getDatabaseInfo();

            if (!["private", "team", "public"].includes(visibility)) {
                console.error("Error: Visibility must be 'private', 'team', or 'public'");
                process.exit(1);
            }

            console.log(`  Storing memory for agent: ${options.agent} (db: ${dbInfo.databaseName})...`);
            const id = await brain.remember(content, tags, undefined, visibility, options.allowPii);

            if (options.json) {
                console.log(JSON.stringify({ success: true, id, agent: options.agent, database: dbInfo.databaseName }));
            } else {
                console.log(`  ✓ Memory stored: ${id}`);
            }
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("recall <query>")
    .description("Search memories semantically")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("-l, --limit <num>", "Max results", "5")
    .option("-m, --min-score <score>", "Minimum similarity score (0-1)", "0.5")
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--shared", "Search shared memories from other agents")
    .option("--public-only", "Search only public memories (requires --shared)")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);

            let results;
            if (options.shared) {
                // Search shared memories
                results = await brain.recallShared(
                    query,
                    parseInt(options.limit, 10),
                    parseFloat(options.minScore),
                    options.publicOnly
                );
            } else {
                // Search personal memories
                const dbInfo = brain.getDatabaseInfo();
                console.log(`  Searching memories for: "${query}" (db: ${dbInfo.databaseName})...`);
                results = await brain.recall(
                    query,
                    parseInt(options.limit, 10),
                    parseFloat(options.minScore)
                );
            }

            if (options.json) {
                const dbInfo = brain.getDatabaseInfo();
                console.log(JSON.stringify({ success: true, query, database: dbInfo.databaseName, shared: options.shared || false, results }));
                return;
            }

            const icon = options.shared ? '🌐' : '🧠';
            const label = options.shared ? 'Shared Memories' : 'Memories';
            console.log(`\n  ${icon} ${label} for "${query}" (${results.length} found)\n`);

            if (results.length === 0) {
                console.log(`  No relevant ${options.shared ? 'shared ' : ''}memories found.`);
                return;
            }

            for (const r of results) {
                const tags = r.memory.tags.length > 0 ? ` [${r.memory.tags.join(", ")}]` : "";
                const visibility = options.shared && r.memory.visibility ? ` [${r.memory.visibility}]` : "";
                console.log(`  [${(r.score * 100).toFixed(1)}%]${visibility} ${r.memory.content.slice(0, 80)}${tags}`);
            }
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("list")
    .description("List recent memories")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("-l, --limit <num>", "Max results", "20")
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const dbInfo = brain.getDatabaseInfo();
            const memories = await brain.listMemories(parseInt(options.limit, 10));
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, database: dbInfo.databaseName, memories }));
                return;
            }
            
            console.log(`\n  🧠 Memories for agent: ${options.agent} (db: ${dbInfo.databaseName}) (${memories.length})\n`);
            
            if (memories.length === 0) {
                console.log("  No memories stored yet.");
                return;
            }
            
            for (const m of memories) {
                const date = m.createdAt.toLocaleDateString("de-DE");
                const tags = m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
                console.log(`  ${date} │ ${m.content.slice(0, 60)}...${tags}`);
            }
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("forget <id>")
    .description("Delete a memory")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .action(async (memoryId, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            await brain.forget(memoryId);
            console.log(`  ✓ Memory deleted: ${memoryId}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("stats")
    .description("Show memory statistics")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const dbInfo = brain.getDatabaseInfo();
            const stats = await brain.stats();
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, agent: options.agent, database: dbInfo.databaseName, ...stats }));
                return;
            }
            
            console.log(`\n  🧠 Brain Stats for: ${options.agent} (db: ${dbInfo.databaseName})`);
            console.log(`  ────────────────────────────────`);
            console.log(`  Total memories: ${stats.count}`);
            
            if (Object.keys(stats.tags).length > 0) {
                console.log(`\n  Tags:`);
                const sortedTags = Object.entries(stats.tags).sort((a, b) => b[1] - a[1]);
                for (const [tag, count] of sortedTags.slice(0, 10)) {
                    console.log(`    ${tag}: ${count}`);
                }
            }
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("tags <tags>")
    .description("Find memories by tags")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("-l, --limit <num>", "Max results", "10")
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--json", "Output as JSON")
    .action(async (tags, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const dbInfo = brain.getDatabaseInfo();
            const tagList = tags.split(",").map((t: string) => t.trim());
            const memories = await brain.recallByTags(tagList, parseInt(options.limit, 10));
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, tags: tagList, database: dbInfo.databaseName, memories }));
                return;
            }
            
            console.log(`\n  🏷️  Memories with tags: ${tagList.join(", ")} (db: ${dbInfo.databaseName}) (${memories.length})\n`);
            
            if (memories.length === 0) {
                console.log("  No memories found with these tags.");
                return;
            }
            
            for (const m of memories) {
                console.log(`  ${m.content.slice(0, 70)}...`);
            }
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("info")
    .description("Show current brain configuration")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const dbInfo = brain.getDatabaseInfo();

            if (options.json) {
                console.log(JSON.stringify({
                    agent: options.agent,
                    agentType: dbInfo.agentType || null,
                    database: dbInfo.databaseName,
                    availableTypes: AGENT_TYPES
                }));
                return;
            }

            console.log(`\n  🧠 Brain Configuration`);
            console.log(`  ────────────────────────────────`);
            console.log(`  Agent ID: ${options.agent}`);
            console.log(`  Agent Type: ${dbInfo.agentType || '(not set - using default)'}`);
            console.log(`  Database: ${dbInfo.databaseName}`);
            console.log(`\n  Available agent types: ${AGENT_TYPES.join(", ")}`);
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// ============================================================================
// Phase 2: Cross-Agent Sharing
// ============================================================================

brainCommand
    .command("publish <id>")
    .description("Publish a memory for sharing")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--visibility <level>", "Visibility level (team, public)", "team")
    .action(async (memoryId, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const visibility = options.visibility as "team" | "public";

            if (visibility !== "team" && visibility !== "public") {
                console.error("Error: Visibility must be 'team' or 'public'");
                process.exit(1);
            }

            await brain.publish(memoryId, visibility);
            console.log(`  ✓ Memory published as ${visibility}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("unpublish <id>")
    .description("Unpublish a memory (set to private)")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .action(async (memoryId, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            await brain.unpublish(memoryId);
            console.log(`  ✓ Memory unpublished (set to private)`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("shared")
    .description("List shared memories")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("-l, --limit <num>", "Max results", "20")
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--public-only", "Show only public memories")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const memories = await brain.listShared(parseInt(options.limit, 10), options.publicOnly);

            if (options.json) {
                console.log(JSON.stringify({ success: true, memories }));
                return;
            }

            console.log(`\n  🌐 Shared Memories (${memories.length})\n`);

            if (memories.length === 0) {
                console.log("  No shared memories found.");
                return;
            }

            for (const m of memories) {
                const visibility = m.visibility || 'private';
                const endorsements = m.endorsements || 0;
                console.log(`  [${visibility}] ${m.content.slice(0, 70)}... (${endorsements} 👍)`);
            }
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// ============================================================================
// Phase 3: Quality & Decay
// ============================================================================

brainCommand
    .command("boost <id>")
    .description("Boost a memory (positive feedback)")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .action(async (memoryId, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            await brain.boost(memoryId);
            console.log(`  ✓ Memory boosted: ${memoryId}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("downvote <id>")
    .description("Downvote a memory (negative feedback)")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .action(async (memoryId, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            await brain.downvote(memoryId);
            console.log(`  ✓ Memory downvoted: ${memoryId}`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("quality <id>")
    .description("Show quality metrics for a memory")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--json", "Output as JSON")
    .action(async (memoryId, options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const quality = await brain.getQuality(memoryId);

            if (options.json) {
                console.log(JSON.stringify({ success: true, ...quality }));
                return;
            }

            console.log(`\n  📊 Quality Metrics: ${memoryId}`);
            console.log(`  ────────────────────────────────`);
            console.log(`  Recall Count:    ${quality.recallCount}`);
            console.log(`  Boost Count:     ${quality.boostCount}`);
            console.log(`  Downvote Count:  ${quality.downvoteCount}`);
            console.log(`  Quality Score:   ${quality.qualityScore.toFixed(2)}`);
            console.log(`  Status:          ${quality.status}`);
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("cleanup")
    .description("Archive low-quality memories")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--dry-run", "Show what would be archived without doing it", true)
    .option("--execute", "Actually perform the cleanup (removes dry-run)")
    .option("--threshold <score>", "Quality threshold for archiving", "0.1")
    .option("--min-age-days <days>", "Minimum age in days", "90")
    .option("-t, --tag <tags...>", "Filter by tags (for system migrations)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const dryRun = !options.execute;
            const tags = options.tag as string[] | undefined;
            const toArchive = await brain.cleanup(
                dryRun,
                parseFloat(options.threshold),
                parseInt(options.minAgeDays, 10),
                tags
            );

            if (options.json) {
                console.log(JSON.stringify({ success: true, dryRun, count: toArchive.length, memories: toArchive }));
                return;
            }

            console.log(`\n  🧹 Cleanup ${dryRun ? '(DRY RUN)' : ''}`);
            console.log(`  ────────────────────────────────`);
            console.log(`  Memories to archive: ${toArchive.length}`);

            if (toArchive.length > 0) {
                console.log(`\n  Memories:`);
                for (const m of toArchive.slice(0, 10)) {
                    const age = Math.floor((Date.now() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24));
                    console.log(`    ${m.id.slice(0, 8)} │ ${m.content.slice(0, 50)}... (${age}d old, Q: ${m.qualityScore?.toFixed(2)})`);
                }
                if (toArchive.length > 10) {
                    console.log(`    ... and ${toArchive.length - 10} more`);
                }
            }

            if (dryRun && toArchive.length > 0) {
                console.log(`\n  💡 Use --execute to actually perform the cleanup`);
            }
            console.log("");
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

brainCommand
    .command("purge")
    .description("Permanently delete archived memories")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--retention-days <days>", "Retention period in days", "365")
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const brain = createBrain(options.agent, options.agentType);
            const count = await brain.purge(parseInt(options.retentionDays, 10));

            if (options.json) {
                console.log(JSON.stringify({ success: true, deleted: count }));
                return;
            }

            console.log(`  ✓ Purged ${count} archived memory(ies)`);
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

// ============================================================================
// Phase 5: SOP Generation
// ============================================================================

brainCommand
    .command("generate-sop <topic>")
    .description("Generate SOP from learnings")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("--agent-type <type>", `Agent type for database selection (${AGENT_TYPES.join(", ")})`)
    .option("--min-memories <num>", "Minimum learnings required", "5")
    .option("--json", "Output as JSON")
    .option("-o, --output <file>", "Save SOP to file")
    .action(async (topic, options) => {
        try {
            console.log(`  Generating SOP for topic: ${topic}...`);

            const sop = await generateSOP(options.agent, {
                topic,
                agentType: isValidAgentType(options.agentType) ? options.agentType : undefined,
                minMemories: parseInt(options.minMemories, 10),
            });

            if (options.json) {
                const output = JSON.stringify(sop, null, 2);
                if (options.output) {
                    const fs = await import("fs");
                    fs.writeFileSync(options.output, output);
                    console.log(`  ✓ SOP saved to ${options.output}`);
                } else {
                    console.log(output);
                }
                return;
            }

            const markdown = formatSOPAsMarkdown(sop);

            if (options.output) {
                const fs = await import("fs");
                fs.writeFileSync(options.output, markdown);
                console.log(`  ✓ SOP saved to ${options.output}`);
            } else {
                console.log(markdown);
            }
        } catch (error) {
            console.error("Error:", (error as Error).message);
            process.exit(1);
        }
    });

export default brainCommand;
