import { Command } from "commander";
import { AgentBrain } from "../lib/biz/agent-brain.js";

const DEFAULT_AGENT = process.env.HUSKY_AGENT_ID || 'default';

export const brainCommand = new Command("brain")
    .description("Agent memory and knowledge management");

brainCommand
    .command("remember <content>")
    .description("Store a memory")
    .option("-a, --agent <id>", "Agent ID", DEFAULT_AGENT)
    .option("-t, --tags <tags>", "Comma-separated tags")
    .option("--json", "Output as JSON")
    .action(async (content, options) => {
        try {
            const brain = new AgentBrain(options.agent);
            const tags = options.tags ? options.tags.split(",").map((t: string) => t.trim()) : [];
            
            console.log(`  Storing memory for agent: ${options.agent}...`);
            const id = await brain.remember(content, tags);
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, id, agent: options.agent }));
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
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
        try {
            const brain = new AgentBrain(options.agent);
            
            console.log(`  Searching memories for: "${query}"...`);
            const results = await brain.recall(
                query, 
                parseInt(options.limit, 10),
                parseFloat(options.minScore)
            );
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, query, results }));
                return;
            }
            
            console.log(`\n  🧠 Memories for "${query}" (${results.length} found)\n`);
            
            if (results.length === 0) {
                console.log("  No relevant memories found.");
                return;
            }
            
            for (const r of results) {
                const tags = r.memory.tags.length > 0 ? ` [${r.memory.tags.join(", ")}]` : "";
                console.log(`  [${(r.score * 100).toFixed(1)}%] ${r.memory.content.slice(0, 80)}${tags}`);
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
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const brain = new AgentBrain(options.agent);
            const memories = await brain.listMemories(parseInt(options.limit, 10));
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, memories }));
                return;
            }
            
            console.log(`\n  🧠 Memories for agent: ${options.agent} (${memories.length})\n`);
            
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
    .action(async (memoryId, options) => {
        try {
            const brain = new AgentBrain(options.agent);
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
    .option("--json", "Output as JSON")
    .action(async (options) => {
        try {
            const brain = new AgentBrain(options.agent);
            const stats = await brain.stats();
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, agent: options.agent, ...stats }));
                return;
            }
            
            console.log(`\n  🧠 Brain Stats for: ${options.agent}`);
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
    .option("--json", "Output as JSON")
    .action(async (tags, options) => {
        try {
            const brain = new AgentBrain(options.agent);
            const tagList = tags.split(",").map((t: string) => t.trim());
            const memories = await brain.recallByTags(tagList, parseInt(options.limit, 10));
            
            if (options.json) {
                console.log(JSON.stringify({ success: true, tags: tagList, memories }));
                return;
            }
            
            console.log(`\n  🏷️  Memories with tags: ${tagList.join(", ")} (${memories.length})\n`);
            
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

export default brainCommand;
