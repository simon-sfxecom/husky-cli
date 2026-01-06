import { select, input, confirm } from "@inquirer/prompts";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate } from "./utils.js";

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

export async function roadmapsMenu(): Promise<void> {
  const config = ensureConfig();

  const menuItems: MenuItem[] = [
    { name: "List all roadmaps", value: "list" },
    { name: "View roadmap details", value: "view" },
    { name: "Create new roadmap", value: "create" },
    { name: "Update roadmap", value: "update" },
    { name: "Add phase", value: "add-phase" },
    { name: "Add feature", value: "add-feature" },
    { name: "Update feature", value: "update-feature" },
    { name: "Convert feature to task", value: "convert" },
    { name: "Delete feature", value: "delete-feature" },
    { name: "Generate with AI", value: "generate" },
    { name: "Delete roadmap", value: "delete" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "Roadmaps:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listRoadmaps(config);
      break;
    case "view":
      await viewRoadmap(config);
      break;
    case "create":
      await createRoadmap(config);
      break;
    case "update":
      await updateRoadmap(config);
      break;
    case "add-phase":
      await addPhase(config);
      break;
    case "add-feature":
      await addFeature(config);
      break;
    case "update-feature":
      await updateFeature(config);
      break;
    case "convert":
      await convertFeature(config);
      break;
    case "delete-feature":
      await deleteFeature(config);
      break;
    case "generate":
      await generateRoadmap(config);
      break;
    case "delete":
      await deleteRoadmap(config);
      break;
    case "back":
      return;
  }
}

async function fetchRoadmaps(config: ValidConfig): Promise<Roadmap[]> {
  const res = await fetch(`${config.apiUrl}/api/roadmaps`, {
    headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
  });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return res.json();
}

async function selectRoadmap(config: ValidConfig, message: string): Promise<Roadmap | null> {
  const roadmaps = await fetchRoadmaps(config);
  if (roadmaps.length === 0) {
    console.log("\n  No roadmaps found.\n");
    await pressEnterToContinue();
    return null;
  }

  const choices = roadmaps.map((r) => ({
    name: `[${r.type}] ${truncate(r.name, 40)} (${r.phases?.length || 0} phases)`,
    value: r.id,
  }));
  choices.push({ name: "Cancel", value: "__cancel__" });

  const roadmapId = await select({ message, choices });
  if (roadmapId === "__cancel__") return null;

  // Fetch full roadmap with phases/features
  const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmapId}`, {
    headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
  });
  if (!res.ok) return null;
  return res.json();
}

async function listRoadmaps(config: ValidConfig): Promise<void> {
  try {
    const roadmaps = await fetchRoadmaps(config);

    console.log("\n  ROADMAPS");
    console.log("  " + "-".repeat(70));

    if (roadmaps.length === 0) {
      console.log("  No roadmaps found.");
    } else {
      for (const rm of roadmaps) {
        const phaseCount = rm.phases?.length || 0;
        const featureCount = rm.features?.length || 0;
        console.log(`  [${rm.type}] ${truncate(rm.name, 40)}`);
        console.log(`      ID: ${rm.id}`);
        console.log(`      Phases: ${phaseCount}, Features: ${featureCount}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching roadmaps:", error);
    await pressEnterToContinue();
  }
}

async function viewRoadmap(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap to view:");
    if (!roadmap) return;

    console.log(`\n  Roadmap: ${roadmap.name}`);
    console.log("  " + "-".repeat(60));
    console.log(`  ID:     ${roadmap.id}`);
    console.log(`  Type:   ${roadmap.type}`);
    if (roadmap.vision) {
      console.log(`  Vision: ${truncate(roadmap.vision, 60)}`);
    }

    const phases = (roadmap.phases || []).sort((a, b) => a.order - b.order);
    const features = roadmap.features || [];

    console.log(`\n  Phases (${phases.length}):`);
    console.log("  " + "-".repeat(40));

    for (const phase of phases) {
      const phaseFeatures = features.filter((f) => f.phaseId === phase.id);
      const statusIcon = phase.status === "completed" ? "[OK]" : phase.status === "in_progress" ? "[>>]" : "[..]";
      console.log(`\n  ${statusIcon} ${phase.name} (${phaseFeatures.length} features)`);
      if (phase.description) {
        console.log(`      ${truncate(phase.description, 50)}`);
      }

      for (const feature of phaseFeatures) {
        const pIcon = feature.priority === "must" ? "[M]" : feature.priority === "should" ? "[S]" : "[C]";
        console.log(`      ${pIcon} ${truncate(feature.title, 45)} [${feature.status}]`);
      }
    }

    // Summary
    const mustCount = features.filter((f) => f.priority === "must").length;
    const shouldCount = features.filter((f) => f.priority === "should").length;

    console.log(`\n  Summary: ${features.length} features (${mustCount} must, ${shouldCount} should)`);
    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error viewing roadmap:", error);
    await pressEnterToContinue();
  }
}

async function createRoadmap(config: ValidConfig): Promise<void> {
  try {
    const name = await input({
      message: "Roadmap name:",
      validate: (v) => (v.length > 0 ? true : "Name required"),
    });

    const type = await select({
      message: "Type:",
      choices: [
        { name: "Global", value: "global" },
        { name: "Project-specific", value: "project" },
      ],
      default: "global",
    });

    const vision = await input({
      message: "Product vision (optional):",
    });

    const res = await fetch(`${config.apiUrl}/api/roadmaps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        name,
        type,
        vision: vision || undefined,
        targetAudience: { primary: "All users", secondary: [] },
      }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const roadmap = await res.json();
    console.log(`\n  ✓ Roadmap created!`);
    console.log(`  ID: ${roadmap.id}`);
    console.log(`  Name: ${roadmap.name}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating roadmap:", error);
    await pressEnterToContinue();
  }
}

async function updateRoadmap(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap to update:");
    if (!roadmap) return;

    const updateChoices: MenuItem[] = [
      { name: "Name", value: "name" },
      { name: "Vision", value: "vision" },
      { name: "Type", value: "type" },
      { name: "Cancel", value: "cancel" },
    ];

    const field = await select({ message: "What to update?", choices: updateChoices });
    if (field === "cancel") return;

    let updateData: Record<string, string> = {};

    switch (field) {
      case "name":
        updateData.name = await input({
          message: "New name:",
          default: roadmap.name,
          validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        break;
      case "vision":
        updateData.vision = await input({
          message: "New vision:",
          default: roadmap.vision || "",
        });
        break;
      case "type":
        updateData.type = await select({
          message: "New type:",
          choices: [
            { name: "Global", value: "global" },
            { name: "Project-specific", value: "project" },
          ],
          default: roadmap.type,
        });
        break;
    }

    const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmap.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Roadmap updated!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error updating roadmap:", error);
    await pressEnterToContinue();
  }
}

async function addPhase(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap:");
    if (!roadmap) return;

    const name = await input({
      message: "Phase name:",
      validate: (v) => (v.length > 0 ? true : "Name required"),
    });

    const description = await input({
      message: "Description (optional):",
    });

    const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmap.id}/phases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        name,
        description: description || "",
        status: "planned",
      }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Phase added!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error adding phase:", error);
    await pressEnterToContinue();
  }
}

async function addFeature(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap:");
    if (!roadmap) return;

    const phases = roadmap.phases || [];
    if (phases.length === 0) {
      console.log("\n  No phases in this roadmap. Add a phase first.\n");
      await pressEnterToContinue();
      return;
    }

    // Select phase
    const phaseChoices = phases.map((p) => ({
      name: `${p.name} [${p.status}]`,
      value: p.id,
    }));
    phaseChoices.push({ name: "Cancel", value: "__cancel__" });

    const phaseId = await select({ message: "Select phase:", choices: phaseChoices });
    if (phaseId === "__cancel__") return;

    const title = await input({
      message: "Feature title:",
      validate: (v) => (v.length > 0 ? true : "Title required"),
    });

    const description = await input({
      message: "Description (optional):",
    });

    const priority = await select({
      message: "Priority:",
      choices: [
        { name: "Must have", value: "must" },
        { name: "Should have", value: "should" },
        { name: "Could have", value: "could" },
        { name: "Won't have", value: "wont" },
      ],
      default: "should",
    });

    const complexity = await select({
      message: "Complexity:",
      choices: [
        { name: "Low", value: "low" },
        { name: "Medium", value: "medium" },
        { name: "High", value: "high" },
      ],
      default: "medium",
    });

    const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmap.id}/features`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        title,
        description: description || "",
        rationale: "",
        phaseId,
        priority,
        complexity,
        impact: "medium",
        status: "idea",
        acceptanceCriteria: [],
        userStories: [],
      }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Feature added!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error adding feature:", error);
    await pressEnterToContinue();
  }
}

async function updateFeature(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap:");
    if (!roadmap) return;

    const features = roadmap.features || [];
    if (features.length === 0) {
      console.log("\n  No features in this roadmap.\n");
      await pressEnterToContinue();
      return;
    }

    // Select feature
    const featureChoices = features.map((f) => ({
      name: `[${f.priority}] ${truncate(f.title, 40)} [${f.status}]`,
      value: f.id,
    }));
    featureChoices.push({ name: "Cancel", value: "__cancel__" });

    const featureId = await select({ message: "Select feature:", choices: featureChoices });
    if (featureId === "__cancel__") return;

    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;

    const updateChoices: MenuItem[] = [
      { name: "Status", value: "status" },
      { name: "Priority", value: "priority" },
      { name: "Title", value: "title" },
      { name: "Description", value: "description" },
      { name: "Cancel", value: "cancel" },
    ];

    const field = await select({ message: "What to update?", choices: updateChoices });
    if (field === "cancel") return;

    let updateData: Record<string, string> = {};

    switch (field) {
      case "status":
        updateData.status = await select({
          message: "New status:",
          choices: [
            { name: "Idea", value: "idea" },
            { name: "Planned", value: "planned" },
            { name: "In Progress", value: "in_progress" },
            { name: "Done", value: "done" },
          ],
          default: feature.status,
        });
        break;
      case "priority":
        updateData.priority = await select({
          message: "New priority:",
          choices: [
            { name: "Must have", value: "must" },
            { name: "Should have", value: "should" },
            { name: "Could have", value: "could" },
            { name: "Won't have", value: "wont" },
          ],
          default: feature.priority,
        });
        break;
      case "title":
        updateData.title = await input({
          message: "New title:",
          default: feature.title,
          validate: (v) => (v.length > 0 ? true : "Title required"),
        });
        break;
      case "description":
        updateData.description = await input({
          message: "New description:",
          default: feature.description || "",
        });
        break;
    }

    const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmap.id}/features/${featureId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Feature updated!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error updating feature:", error);
    await pressEnterToContinue();
  }
}

async function convertFeature(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap:");
    if (!roadmap) return;

    const features = roadmap.features || [];
    if (features.length === 0) {
      console.log("\n  No features in this roadmap.\n");
      await pressEnterToContinue();
      return;
    }

    // Select feature
    const featureChoices = features.map((f) => ({
      name: `[${f.priority}] ${truncate(f.title, 40)}`,
      value: f.id,
    }));
    featureChoices.push({ name: "Cancel", value: "__cancel__" });

    const featureId = await select({ message: "Select feature to convert:", choices: featureChoices });
    if (featureId === "__cancel__") return;

    const priority = await select({
      message: "Task priority:",
      choices: [
        { name: "Low", value: "low" },
        { name: "Medium", value: "medium" },
        { name: "High", value: "high" },
      ],
      default: "medium",
    });

    const assignee = await select({
      message: "Assign to:",
      choices: [
        { name: "Human", value: "human" },
        { name: "LLM Agent", value: "llm" },
        { name: "Unassigned", value: "unassigned" },
      ],
      default: "unassigned",
    });

    const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmap.id}/features/${featureId}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({ priority, assignee }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
      await pressEnterToContinue();
      return;
    }

    const result = await res.json();
    console.log(`\n  ✓ Feature converted to task!`);
    console.log(`  Task ID: ${result.task?.id}`);
    console.log(`  Title: ${result.task?.title}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error converting feature:", error);
    await pressEnterToContinue();
  }
}

async function deleteFeature(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap:");
    if (!roadmap) return;

    const features = roadmap.features || [];
    if (features.length === 0) {
      console.log("\n  No features in this roadmap.\n");
      await pressEnterToContinue();
      return;
    }

    // Select feature
    const featureChoices = features.map((f) => ({
      name: `[${f.priority}] ${truncate(f.title, 40)}`,
      value: f.id,
    }));
    featureChoices.push({ name: "Cancel", value: "__cancel__" });

    const featureId = await select({ message: "Select feature to delete:", choices: featureChoices });
    if (featureId === "__cancel__") return;

    const feature = features.find((f) => f.id === featureId);

    const confirmed = await confirm({
      message: `Delete "${feature?.title}"? This cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmap.id}/features/${featureId}`, {
      method: "DELETE",
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Feature deleted.\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting feature:", error);
    await pressEnterToContinue();
  }
}

async function generateRoadmap(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap to generate:");
    if (!roadmap) return;

    const context = await input({
      message: "Additional context for AI (optional):",
    });

    console.log("\n  Generating roadmap with AI... This may take a moment.\n");

    const res = await fetch(`${config.apiUrl}/api/roadmaps/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        roadmapId: roadmap.id,
        additionalContext: context || undefined,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
      await pressEnterToContinue();
      return;
    }

    const result = await res.json();
    console.log(`  ✓ Roadmap generated!`);
    console.log(`  Phases created: ${result.phasesGenerated || "?"}`);
    console.log(`  Features created: ${result.featuresGenerated || "?"}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error generating roadmap:", error);
    await pressEnterToContinue();
  }
}

async function deleteRoadmap(config: ValidConfig): Promise<void> {
  try {
    const roadmap = await selectRoadmap(config, "Select roadmap to delete:");
    if (!roadmap) return;

    const confirmed = await confirm({
      message: `Delete "${roadmap.name}" and all phases/features? This cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/roadmaps/${roadmap.id}`, {
      method: "DELETE",
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Roadmap deleted.\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting roadmap:", error);
    await pressEnterToContinue();
  }
}
