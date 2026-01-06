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

// husky roadmap update <id>
roadmapCommand
  .command("update <id>")
  .description("Update a roadmap")
  .option("-n, --name <name>", "New name")
  .option("-d, --description <desc>", "New description")
  .option("--type <type>", "New type (project, global)")
  .option("--status <status>", "New status")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Build update payload
    const updateData: Record<string, string> = {};
    if (options.name) updateData.name = options.name;
    if (options.description) updateData.vision = options.description;
    if (options.type) {
      const validTypes = ["project", "global"];
      if (!validTypes.includes(options.type)) {
        console.error(`Error: Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`);
        process.exit(1);
      }
      updateData.type = options.type;
    }
    if (options.status) updateData.status = options.status;

    if (Object.keys(updateData).length === 0) {
      console.error("Error: No update options provided. Use -n/--name, -d/--description, --type, or --status");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Roadmap ${id} not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: API returned ${res.status}`, errorBody.error || "");
        }
        process.exit(1);
      }

      const roadmap: Roadmap = await res.json();

      if (options.json) {
        console.log(JSON.stringify(roadmap, null, 2));
      } else {
        console.log(`✓ Roadmap updated successfully`);
        console.log(`  Name: ${roadmap.name}`);
        console.log(`  Type: ${roadmap.type}`);
        if (roadmap.vision) {
          console.log(`  Vision: ${roadmap.vision}`);
        }
      }
    } catch (error) {
      console.error("Error updating roadmap:", error);
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

// husky roadmap list-features <roadmapId>
roadmapCommand
  .command("list-features <roadmapId>")
  .description("List all features in a roadmap with their IDs and status")
  .option("--json", "Output as JSON")
  .option("--status <status>", "Filter by status (idea, planned, in_progress, done)")
  .option("--priority <priority>", "Filter by priority (must, should, could, wont)")
  .action(async (roadmapId, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmapId}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Roadmap ${roadmapId} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const roadmap: Roadmap = await res.json();
      let features = roadmap.features || [];

      // Apply filters
      if (options.status) {
        features = features.filter((f) => f.status === options.status);
      }
      if (options.priority) {
        features = features.filter((f) => f.priority === options.priority);
      }

      if (options.json) {
        console.log(JSON.stringify(features, null, 2));
      } else {
        printFeaturesList(roadmap.name, features, roadmap.phases || []);
      }
    } catch (error) {
      console.error("Error fetching roadmap features:", error);
      process.exit(1);
    }
  });

// husky roadmap update-feature <roadmapId> <featureId>
roadmapCommand
  .command("update-feature <roadmapId> <featureId>")
  .description("Update a roadmap feature")
  .option("--status <status>", "New status (idea, planned, in_progress, done)")
  .option("--name <name>", "New feature name/title")
  .option("--priority <priority>", "New priority (must, should, could, wont)")
  .option("--description <description>", "New description")
  .option("--phase <phaseId>", "Move to different phase")
  .action(async (roadmapId, featureId, options) => {
    const config = ensureConfig();

    // Build update payload
    const updateData: Record<string, string> = {};
    if (options.status) {
      const validStatuses = ["idea", "planned", "in_progress", "done"];
      if (!validStatuses.includes(options.status)) {
        console.error(`Error: Invalid status "${options.status}". Must be one of: ${validStatuses.join(", ")}`);
        process.exit(1);
      }
      updateData.status = options.status;
    }
    if (options.name) {
      updateData.title = options.name;
    }
    if (options.priority) {
      const validPriorities = ["must", "should", "could", "wont"];
      if (!validPriorities.includes(options.priority)) {
        console.error(`Error: Invalid priority "${options.priority}". Must be one of: ${validPriorities.join(", ")}`);
        process.exit(1);
      }
      updateData.priority = options.priority;
    }
    if (options.description) {
      updateData.description = options.description;
    }
    if (options.phase) {
      updateData.phaseId = options.phase;
    }

    if (Object.keys(updateData).length === 0) {
      console.error("Error: No update options provided. Use --status, --name, --priority, --description, or --phase");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmapId}/features/${featureId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Roadmap or feature not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: API returned ${res.status}`, errorBody.error || "");
        }
        process.exit(1);
      }

      const roadmap: Roadmap = await res.json();
      const updatedFeature = roadmap.features.find((f) => f.id === featureId);

      console.log(`✓ Feature updated successfully`);
      if (updatedFeature) {
        console.log(`  Title:    ${updatedFeature.title}`);
        console.log(`  Status:   ${updatedFeature.status}`);
        console.log(`  Priority: ${updatedFeature.priority}`);
      }
    } catch (error) {
      console.error("Error updating feature:", error);
      process.exit(1);
    }
  });

// husky roadmap delete-feature <roadmapId> <featureId>
roadmapCommand
  .command("delete-feature <roadmapId> <featureId>")
  .description("Delete a feature from a roadmap")
  .option("--force", "Skip confirmation")
  .action(async (roadmapId, featureId, options) => {
    const config = ensureConfig();

    if (!options.force) {
      console.log("Warning: This will permanently delete the feature.");
      console.log("Use --force to confirm deletion.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmapId}/features/${featureId}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Roadmap or feature not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: API returned ${res.status}`, errorBody.error || "");
        }
        process.exit(1);
      }

      console.log(`✓ Feature deleted`);
    } catch (error) {
      console.error("Error deleting feature:", error);
      process.exit(1);
    }
  });

// husky roadmap convert-feature <roadmapId> <featureId>
roadmapCommand
  .command("convert-feature <roadmapId> <featureId>")
  .description("Convert a roadmap feature to a task")
  .option("--priority <priority>", "Task priority (low, medium, high)")
  .option("--assignee <assignee>", "Task assignee (human, llm, unassigned)")
  .option("--json", "Output as JSON")
  .action(async (roadmapId, featureId, options) => {
    const config = ensureConfig();

    try {
      // Build optional body
      const body: Record<string, string> = {};
      if (options.priority) {
        const validPriorities = ["low", "medium", "high"];
        if (!validPriorities.includes(options.priority)) {
          console.error(`Error: Invalid priority "${options.priority}". Must be one of: ${validPriorities.join(", ")}`);
          process.exit(1);
        }
        body.priority = options.priority;
      }
      if (options.assignee) {
        const validAssignees = ["human", "llm", "unassigned"];
        if (!validAssignees.includes(options.assignee)) {
          console.error(`Error: Invalid assignee "${options.assignee}". Must be one of: ${validAssignees.join(", ")}`);
          process.exit(1);
        }
        body.assignee = options.assignee;
      }

      const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmapId}/features/${featureId}/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Roadmap or feature not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: API returned ${res.status}`, errorBody.error || "");
        }
        process.exit(1);
      }

      const result = await res.json();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`✓ Feature converted to task successfully`);
        console.log(`  Task ID:   ${result.task.id}`);
        console.log(`  Title:     ${result.task.title}`);
        console.log(`  Priority:  ${result.task.priority}`);
        console.log(`  Status:    ${result.task.status}`);
      }
    } catch (error) {
      console.error("Error converting feature to task:", error);
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

function printFeaturesList(roadmapName: string, features: Feature[], phases: Phase[]) {
  if (features.length === 0) {
    console.log("\n  No features found.");
    console.log("  Add one with: husky roadmap add-feature <roadmapId> <phaseId> <title>\n");
    return;
  }

  console.log(`\n  FEATURES - ${roadmapName}`);
  console.log("  " + "─".repeat(80));
  console.log(
    `  ${"ID".padEnd(24)} ${"TITLE".padEnd(30)} ${"STATUS".padEnd(12)} ${"PRIORITY".padEnd(8)} PHASE`
  );
  console.log("  " + "─".repeat(80));

  // Create phase lookup map
  const phaseMap = new Map(phases.map((p) => [p.id, p.name]));

  for (const feature of features) {
    const statusIcon =
      feature.status === "done"
        ? "✓"
        : feature.status === "in_progress"
        ? "▶"
        : feature.status === "planned"
        ? "○"
        : "·";
    const phaseName = phaseMap.get(feature.phaseId) || feature.phaseId;
    const truncatedTitle =
      feature.title.length > 28 ? feature.title.substring(0, 25) + "..." : feature.title;
    const truncatedPhase = phaseName.length > 15 ? phaseName.substring(0, 12) + "..." : phaseName;

    console.log(
      `  ${feature.id.padEnd(24)} ${truncatedTitle.padEnd(30)} ${statusIcon} ${feature.status.padEnd(10)} ${feature.priority.padEnd(8)} ${truncatedPhase}`
    );
  }

  // Summary by status
  const ideaCount = features.filter((f) => f.status === "idea").length;
  const plannedCount = features.filter((f) => f.status === "planned").length;
  const inProgressCount = features.filter((f) => f.status === "in_progress").length;
  const doneCount = features.filter((f) => f.status === "done").length;

  console.log("  " + "─".repeat(80));
  console.log(`\n  Summary: ${features.length} total`);
  console.log(`    · Idea: ${ideaCount}  ○ Planned: ${plannedCount}  ▶ In Progress: ${inProgressCount}  ✓ Done: ${doneCount}`);
  console.log("");
}
