/**
 * Husky Biz Qdrant Command
 *
 * Vector database operations for semantic search
 */
import { Command } from "commander";
import { QdrantClient } from "../../lib/biz/index.js";
export const qdrantCommand = new Command("qdrant")
    .description("Vector database operations (Qdrant)");
// husky biz qdrant collections
qdrantCommand
    .command("collections")
    .description("List all collections")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    try {
        const client = QdrantClient.fromConfig();
        const collections = await client.listCollections();
        if (options.json) {
            console.log(JSON.stringify(collections, null, 2));
            return;
        }
        console.log(`\n  📊 Qdrant Collections (${collections.length})\n`);
        for (const name of collections) {
            try {
                const info = await client.getCollection(name);
                console.log(`  📁 ${name.padEnd(35)} │ ${info.pointsCount} points`);
            }
            catch {
                console.log(`  📁 ${name}`);
            }
        }
        console.log("");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz qdrant info <collection>
qdrantCommand
    .command("info <collection>")
    .description("Get collection info")
    .option("--json", "Output as JSON")
    .action(async (collection, options) => {
    try {
        const client = QdrantClient.fromConfig();
        const info = await client.getCollection(collection);
        if (options.json) {
            console.log(JSON.stringify(info, null, 2));
            return;
        }
        console.log(`\n  📁 Collection: ${info.name}`);
        console.log(`     Points: ${info.pointsCount}`);
        console.log(`     Vectors: ${info.vectorsCount}\n`);
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz qdrant count <collection>
qdrantCommand
    .command("count <collection>")
    .description("Count points in collection")
    .action(async (collection) => {
    try {
        const client = QdrantClient.fromConfig();
        const count = await client.count(collection);
        console.log(count);
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz qdrant search <collection>
qdrantCommand
    .command("search <collection>")
    .description("Search with vector (input from stdin or --vector)")
    .option("--vector <json>", "Vector as JSON array")
    .option("-l, --limit <num>", "Number of results", "5")
    .option("--json", "Output as JSON")
    .action(async (collection, options) => {
    try {
        const client = QdrantClient.fromConfig();
        let vector;
        if (options.vector) {
            vector = JSON.parse(options.vector);
        }
        else {
            console.error("Error: --vector required (as JSON array)");
            console.log("Example: --vector '[0.1, 0.2, ...]'");
            process.exit(1);
        }
        const results = await client.search(collection, vector, parseInt(options.limit, 10));
        if (options.json) {
            console.log(JSON.stringify(results, null, 2));
            return;
        }
        console.log(`\n  🔍 Search Results in ${collection} (${results.length})\n`);
        for (const result of results) {
            const score = result.score.toFixed(4);
            const id = String(result.id).slice(0, 12);
            const payloadPreview = result.payload
                ? Object.entries(result.payload).slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join(' │ ')
                : '';
            console.log(`  [${id}] score: ${score} │ ${payloadPreview}`);
        }
        console.log("");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz qdrant get <collection> <id>
qdrantCommand
    .command("get <collection> <id>")
    .description("Get a point by ID")
    .option("--json", "Output as JSON")
    .action(async (collection, id, options) => {
    try {
        const client = QdrantClient.fromConfig();
        const point = await client.getPoint(collection, id);
        if (!point) {
            console.error(`Point "${id}" not found in collection "${collection}".`);
            process.exit(1);
        }
        if (options.json) {
            console.log(JSON.stringify(point, null, 2));
            return;
        }
        console.log(`\n  📊 Point ${id}`);
        console.log(`     Vector dimensions: ${point.vector.length}`);
        if (point.payload) {
            console.log(`     Payload:`);
            for (const [key, value] of Object.entries(point.payload)) {
                console.log(`       ${key}: ${String(value).slice(0, 60)}`);
            }
        }
        console.log("");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
// husky biz qdrant delete <collection> <id>
qdrantCommand
    .command("delete <collection> <id>")
    .description("Delete a point")
    .option("-f, --force", "Skip confirmation")
    .action(async (collection, id, options) => {
    try {
        const client = QdrantClient.fromConfig();
        if (!options.force) {
            console.log(`⚠️  About to delete point ${id} from ${collection}`);
            console.log("   Use --force to skip this confirmation");
            process.exit(0);
        }
        await client.deletePoints(collection, [id]);
        console.log(`✓ Deleted point ${id} from ${collection}`);
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
});
export default qdrantCommand;
