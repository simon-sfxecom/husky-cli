import { Command } from "commander";
import { getConfig } from "./config.js";

export const roadmapCommand = new Command("roadmap")
  .description("Manage roadmaps");

// Helper: Ensure API is configured
function ensureConfig() {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("Error: API URL not configured. Run: husky config set api-url <url>");
    process.exit(1);
  }
  return config;
}

interface Roadmap {
  id: string;
  name: string;
  type: string;
  vision?: string;
  projectId?: string;
  phases: Phase[];
  features: Feature[];
}

interface Phase {
  id: string;
  name: string;
  description: string;
  order: number;
  status: string;
  featureIds: string[];
}

interface Feature {
  id: string;
  title: string;
  description: string;
  priority: string;
  complexity: string;
  impact: string;
  status: string;
  phaseId: string;
}

// husky roadmap list
roadmapCommand
  .command("list")
  .description("List all roadmaps")
  .option("--type <type>", "Filter by type (global, project)")
  .option("--project <projectId>", "Filter by project ID")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const url = new URL("/api/roadmaps", config.apiUrl);
      if (options.type) {
        url.searchParams.set("type", options.type);
      }
      if (options.project) {
        url.searchParams.set("projectId", options.project);
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const roadmaps: Roadmap[] = await res.json();

      if (options.json) {
        console.log(JSON.stringify(roadmaps, null, 2));
      } else {
        printRoadmaps(roadmaps);
      }
    } catch (error) {
      console.error("Error fetching roadmaps:", error);
      process.exit(1);
    }
  });

// husky roadmap get <id>
roadmapCommand
  .command("get <id>")
  .description("Get roadmap details")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/${id}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Roadmap ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const roadmap: Roadmap = await res.json();

      if (options.json) {
        console.log(JSON.stringify(roadmap, null, 2));
      } else {
        printRoadmapDetail(roadmap);
      }
    } catch (error) {
      console.error("Error fetching roadmap:", error);
      process.exit(1);
    }
  });

// husky roadmap create <name>
roadmapCommand
  .command("create <name>")
  .description("Create a new roadmap")
  .option("--type <type>", "Roadmap type (global, project)", "global")
  .option("--project <projectId>", "Project ID (for project type)")
  .option("--vision <vision>", "Product vision")
  .option("--audience <audience>", "Primary target audience")
  .action(async (name, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          name,
          type: options.type,
          projectId: options.project,
          vision: options.vision,
          targetAudience: {
            primary: options.audience || "All users",
            secondary: [],
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const roadmap: Roadmap = await res.json();
      console.log(`✓ Created roadmap: ${roadmap.name}`);
      console.log(`  ID: ${roadmap.id}`);
    } catch (error) {
      console.error("Error creating roadmap:", error);
      process.exit(1);
    }
  });

// husky roadmap add-phase <roadmapId> <name>
roadmapCommand
  .command("add-phase <roadmapId> <name>")
  .description("Add a phase to a roadmap")
  .option("--description <description>", "Phase description")
  .action(async (roadmapId, name, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmapId}/phases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          name,
          description: options.description || "",
          status: "planned",
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const roadmap: Roadmap = await res.json();
      console.log(`✓ Added phase "${name}" to roadmap`);
      console.log(`  Total phases: ${roadmap.phases.length}`);
    } catch (error) {
      console.error("Error adding phase:", error);
      process.exit(1);
    }
  });

// husky roadmap add-feature <roadmapId> <phaseId> <title>
roadmapCommand
  .command("add-feature <roadmapId> <phaseId> <title>")
  .description("Add a feature to a roadmap phase")
  .option("--description <description>", "Feature description")
  .option("--priority <priority>", "Priority (must, should, could, wont)", "should")
  .option("--complexity <complexity>", "Complexity (low, medium, high)", "medium")
  .option("--impact <impact>", "Impact (low, medium, high)", "medium")
  .action(async (roadmapId, phaseId, title, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmapId}/features`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          title,
          description: options.description || "",
          rationale: "",
          phaseId,
          priority: options.priority,
          complexity: options.complexity,
          impact: options.impact,
          status: "idea",
          acceptanceCriteria: [],
          userStories: [],
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const roadmap: Roadmap = await res.json();
      console.log(`✓ Added feature "${title}" to phase`);
      console.log(`  Total features: ${roadmap.features.length}`);
    } catch (error) {
      console.error("Error adding feature:", error);
      process.exit(1);
    }
  });

// husky roadmap generate <roadmapId>
roadmapCommand
  .command("generate <roadmapId>")
  .description("Generate roadmap phases and features using AI")
  .option("--context <context>", "Additional context for AI generation")
  .option("--project <projectId>", "Project ID for context")
  .action(async (roadmapId, options) => {
    const config = ensureConfig();

    console.log("Generating roadmap with AI...");
    console.log("This may take a moment...\n");

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          roadmapId,
          projectId: options.project,
          additionalContext: options.context,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || `API error: ${res.status}`);
      }

      const result = await res.json();
      console.log(`✓ Roadmap generated successfully!`);
      console.log(`  Phases created: ${result.phasesGenerated}`);
      console.log(`  Features created: ${result.featuresGenerated}`);
      console.log("");

      if (result.roadmap) {
        printRoadmapDetail(result.roadmap);
      }
    } catch (error) {
      console.error("Error generating roadmap:", error);
      process.exit(1);
    }
  });

// husky roadmap delete <id>
roadmapCommand
  .command("delete <id>")
  .description("Delete a roadmap")
  .option("--force", "Skip confirmation")
  .action(async (id, options) => {
    const config = ensureConfig();

    if (!options.force) {
      console.log("Warning: This will permanently delete the roadmap and all its phases/features.");
      console.log("Use --force to confirm deletion.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/${id}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      console.log(`✓ Roadmap deleted`);
    } catch (error) {
      console.error("Error deleting roadmap:", error);
      process.exit(1);
    }
  });

function printRoadmaps(roadmaps: Roadmap[]) {
  if (roadmaps.length === 0) {
    console.log("\n  No roadmaps found.");
    console.log("  Create one with: husky roadmap create <name>\n");
    return;
  }

  console.log("\n  ROADMAPS");
  console.log("  " + "─".repeat(60));

  for (const roadmap of roadmaps) {
    const typeLabel = roadmap.type === "global" ? "[Global]" : "[Project]";
    const phaseCount = roadmap.phases?.length || 0;
    const featureCount = roadmap.features?.length || 0;
    console.log(
      `  ${typeLabel.padEnd(10)} ${roadmap.name.padEnd(30)} ${phaseCount} phases, ${featureCount} features`
    );
    console.log(`             ID: ${roadmap.id}`);
  }

  console.log("");
}

function printRoadmapDetail(roadmap: Roadmap) {
  console.log(`\n  Roadmap: ${roadmap.name}`);
  console.log("  " + "─".repeat(60));
  console.log(`  ID:       ${roadmap.id}`);
  console.log(`  Type:     ${roadmap.type}`);
  if (roadmap.vision) {
    console.log(`  Vision:   ${roadmap.vision}`);
  }
  if (roadmap.projectId) {
    console.log(`  Project:  ${roadmap.projectId}`);
  }

  const phases = roadmap.phases || [];
  const features = roadmap.features || [];

  console.log(`\n  Phases: ${phases.length}`);
  console.log("  " + "─".repeat(40));

  for (const phase of phases.sort((a, b) => a.order - b.order)) {
    const phaseFeatures = features.filter((f) => f.phaseId === phase.id);
    const statusIcon = phase.status === "completed" ? "✓" : phase.status === "in_progress" ? "▶" : "○";
    console.log(`\n  ${statusIcon} ${phase.name} (${phaseFeatures.length} features)`);
    if (phase.description) {
      console.log(`    ${phase.description}`);
    }

    for (const feature of phaseFeatures) {
      const priorityIcon =
        feature.priority === "must"
          ? "🔴"
          : feature.priority === "should"
          ? "🟠"
          : feature.priority === "could"
          ? "🟡"
          : "⚪";
      console.log(`      ${priorityIcon} ${feature.title} [${feature.priority}/${feature.complexity}]`);
    }
  }

  // Summary
  const mustCount = features.filter((f) => f.priority === "must").length;
  const shouldCount = features.filter((f) => f.priority === "should").length;
  const couldCount = features.filter((f) => f.priority === "could").length;

  console.log(`\n  Summary:`);
  console.log(`    Total Features: ${features.length}`);
  console.log(`    Must Have: ${mustCount}`);
  console.log(`    Should Have: ${shouldCount}`);
  console.log(`    Could Have: ${couldCount}`);
  console.log("");
}
