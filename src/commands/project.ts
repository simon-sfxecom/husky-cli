import { Command } from "commander";
import { getConfig } from "./config.js";

export const projectCommand = new Command("project")
  .description("Manage projects and knowledge");

// Helper: Ensure API is configured
function ensureConfig() {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("Error: API URL not configured. Run: husky config set api-url <url>");
    process.exit(1);
  }
  return config;
}

// TypeScript interfaces
interface Project {
  id: string;
  name: string;
  description?: string;
  techStack?: string;
  githubRepo?: string;
  color: string;
  status: "active" | "archived";
  workStatus: "planning" | "in_progress" | "review" | "completed" | "on_hold";
  createdAt: Date;
}

interface ProjectKnowledge {
  id: string;
  projectId: string;
  category: "architecture" | "patterns" | "decisions" | "learnings";
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// Work status labels
const WORK_STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
  on_hold: "On Hold",
};

// Knowledge category config
const KNOWLEDGE_CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  architecture: { label: "Architecture", icon: "A" },
  patterns: { label: "Patterns", icon: "P" },
  decisions: { label: "Decisions", icon: "D" },
  learnings: { label: "Learnings", icon: "L" },
};

// ============================================
// PROJECT CRUD COMMANDS
// ============================================

// husky project list
projectCommand
  .command("list")
  .description("List all projects")
  .option("--json", "Output as JSON")
  .option("--status <status>", "Filter by status (active, archived)")
  .option("--work-status <workStatus>", "Filter by work status (planning, in_progress, review, completed, on_hold)")
  .option("--archived", "Include archived projects")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const url = new URL("/api/projects", config.apiUrl);
      if (options.archived || options.status === "archived") {
        url.searchParams.set("archived", "true");
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      let projects: Project[] = await res.json();

      // Apply filters
      if (options.status) {
        projects = projects.filter((p) => p.status === options.status);
      }
      if (options.workStatus) {
        projects = projects.filter((p) => p.workStatus === options.workStatus);
      }

      if (options.json) {
        console.log(JSON.stringify(projects, null, 2));
      } else {
        printProjects(projects);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
      process.exit(1);
    }
  });

// husky project create <name>
projectCommand
  .command("create <name>")
  .description("Create a new project")
  .option("-d, --description <description>", "Project description")
  .option("--status <status>", "Project status (active, archived)", "active")
  .option("--work-status <workStatus>", "Work status (planning, in_progress, review, completed, on_hold)", "planning")
  .option("--tech-stack <techStack>", "Tech stack description")
  .option("--github <githubRepo>", "GitHub repository URL")
  .option("--color <color>", "Project color (hex)")
  .option("--json", "Output as JSON")
  .action(async (name, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          name,
          description: options.description,
          status: options.status,
          workStatus: options.workStatus,
          techStack: options.techStack,
          githubRepo: options.github,
          color: options.color,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${res.status}`);
      }

      const project: Project = await res.json();

      if (options.json) {
        console.log(JSON.stringify(project, null, 2));
      } else {
        console.log(`Created project: ${project.name}`);
        console.log(`  ID: ${project.id}`);
        console.log(`  Status: ${project.status}`);
        console.log(`  Work Status: ${project.workStatus}`);
      }
    } catch (error) {
      console.error("Error creating project:", error);
      process.exit(1);
    }
  });

// husky project get <id>
projectCommand
  .command("get <id>")
  .description("Get project details")
  .option("--json", "Output as JSON")
  .option("--tasks", "Include project tasks")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const url = new URL(`/api/projects/${id}`, config.apiUrl);
      if (options.tasks) {
        url.searchParams.set("tasks", "true");
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Project ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const project = await res.json();

      if (options.json) {
        console.log(JSON.stringify(project, null, 2));
      } else {
        printProjectDetail(project);
      }
    } catch (error) {
      console.error("Error fetching project:", error);
      process.exit(1);
    }
  });

// husky project update <id>
projectCommand
  .command("update <id>")
  .description("Update a project")
  .option("-n, --name <name>", "New project name")
  .option("-d, --description <description>", "New description")
  .option("--status <status>", "New status (active, archived)")
  .option("--work-status <workStatus>", "New work status (planning, in_progress, review, completed, on_hold)")
  .option("--tech-stack <techStack>", "Tech stack description")
  .option("--github <githubRepo>", "GitHub repository URL")
  .option("--color <color>", "Project color (hex)")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Build update payload
    const updateData: Record<string, string | undefined> = {};
    if (options.name) updateData.name = options.name;
    if (options.description) updateData.description = options.description;
    if (options.status) updateData.status = options.status;
    if (options.workStatus) updateData.workStatus = options.workStatus;
    if (options.techStack) updateData.techStack = options.techStack;
    if (options.github) updateData.githubRepo = options.github;
    if (options.color) updateData.color = options.color;

    if (Object.keys(updateData).length === 0) {
      console.error("Error: No update options provided.");
      console.log("Use -n/--name, -d/--description, --status, --work-status, --tech-stack, --github, or --color");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/projects/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Project ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      const project: Project = await res.json();

      if (options.json) {
        console.log(JSON.stringify(project, null, 2));
      } else {
        console.log(`Project updated successfully`);
        console.log(`  Name: ${project.name}`);
        console.log(`  Status: ${project.status}`);
        console.log(`  Work Status: ${project.workStatus}`);
      }
    } catch (error) {
      console.error("Error updating project:", error);
      process.exit(1);
    }
  });

// husky project delete <id>
projectCommand
  .command("delete <id>")
  .description("Delete a project")
  .option("--force", "Skip confirmation")
  .action(async (id, options) => {
    const config = ensureConfig();

    if (!options.force) {
      console.log("Warning: This will permanently delete the project and all associated data.");
      console.log("Use --force to confirm deletion.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/projects/${id}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Project ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      console.log(`Project deleted`);
    } catch (error) {
      console.error("Error deleting project:", error);
      process.exit(1);
    }
  });

// ============================================
// KNOWLEDGE MANAGEMENT COMMANDS
// ============================================

// husky project add-knowledge <projectId>
projectCommand
  .command("add-knowledge <projectId>")
  .description("Add a knowledge entry to a project")
  .requiredOption("--title <title>", "Knowledge entry title")
  .requiredOption("--content <content>", "Knowledge entry content (markdown)")
  .option("--type <type>", "Category: architecture, patterns, decisions, learnings", "learnings")
  .option("--json", "Output as JSON")
  .action(async (projectId, options) => {
    const config = ensureConfig();

    const validCategories = ["architecture", "patterns", "decisions", "learnings"];
    if (!validCategories.includes(options.type)) {
      console.error(`Error: Invalid category "${options.type}". Must be one of: ${validCategories.join(", ")}`);
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/projects/${projectId}/knowledge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          title: options.title,
          content: options.content,
          category: options.type,
        }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Project ${projectId} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      const knowledge: ProjectKnowledge = await res.json();

      if (options.json) {
        console.log(JSON.stringify(knowledge, null, 2));
      } else {
        console.log(`Knowledge entry added`);
        console.log(`  ID: ${knowledge.id}`);
        console.log(`  Title: ${knowledge.title}`);
        console.log(`  Category: ${knowledge.category}`);
      }
    } catch (error) {
      console.error("Error adding knowledge entry:", error);
      process.exit(1);
    }
  });

// husky project list-knowledge <projectId>
projectCommand
  .command("list-knowledge <projectId>")
  .description("List knowledge entries for a project")
  .option("--json", "Output as JSON")
  .option("--type <type>", "Filter by category: architecture, patterns, decisions, learnings")
  .action(async (projectId, options) => {
    const config = ensureConfig();

    try {
      const url = new URL(`/api/projects/${projectId}/knowledge`, config.apiUrl);
      if (options.type) {
        url.searchParams.set("category", options.type);
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Project ${projectId} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const knowledge: ProjectKnowledge[] = await res.json();

      if (options.json) {
        console.log(JSON.stringify(knowledge, null, 2));
      } else {
        printKnowledgeList(projectId, knowledge);
      }
    } catch (error) {
      console.error("Error fetching knowledge entries:", error);
      process.exit(1);
    }
  });

// husky project delete-knowledge <projectId> <knowledgeId>
projectCommand
  .command("delete-knowledge <projectId> <knowledgeId>")
  .description("Delete a knowledge entry from a project")
  .option("--force", "Skip confirmation")
  .action(async (projectId, knowledgeId, options) => {
    const config = ensureConfig();

    if (!options.force) {
      console.log("Warning: This will permanently delete the knowledge entry.");
      console.log("Use --force to confirm deletion.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/projects/${projectId}/knowledge/${knowledgeId}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Knowledge entry not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      console.log(`Knowledge entry deleted`);
    } catch (error) {
      console.error("Error deleting knowledge entry:", error);
      process.exit(1);
    }
  });

// ============================================
// OUTPUT FORMATTERS
// ============================================

function printProjects(projects: Project[]) {
  if (projects.length === 0) {
    console.log("\n  No projects found.");
    console.log("  Create one with: husky project create <name>\n");
    return;
  }

  console.log("\n  PROJECTS");
  console.log("  " + "-".repeat(80));
  console.log(
    `  ${"ID".padEnd(24)} ${"NAME".padEnd(25)} ${"STATUS".padEnd(10)} ${"WORK STATUS".padEnd(14)}`
  );
  console.log("  " + "-".repeat(80));

  for (const project of projects) {
    const workStatusLabel = WORK_STATUS_LABELS[project.workStatus] || project.workStatus;
    const truncatedName = project.name.length > 23 ? project.name.substring(0, 20) + "..." : project.name;
    const statusIcon = project.status === "active" ? "+" : "-";

    console.log(
      `  ${project.id.padEnd(24)} ${truncatedName.padEnd(25)} ${statusIcon} ${project.status.padEnd(8)} ${workStatusLabel}`
    );
  }

  console.log("  " + "-".repeat(80));
  console.log(`  Total: ${projects.length} project(s)\n`);
}

function printProjectDetail(project: Project & { tasks?: Array<{ id: string; title: string; status: string }> }) {
  const workStatusLabel = WORK_STATUS_LABELS[project.workStatus] || project.workStatus;

  console.log(`\n  Project: ${project.name}`);
  console.log("  " + "=".repeat(60));
  console.log(`  ID:          ${project.id}`);
  console.log(`  Status:      ${project.status}`);
  console.log(`  Work Status: ${workStatusLabel}`);

  if (project.description) {
    console.log(`  Description: ${project.description}`);
  }
  if (project.techStack) {
    console.log(`  Tech Stack:  ${project.techStack}`);
  }
  if (project.githubRepo) {
    console.log(`  GitHub:      ${project.githubRepo}`);
  }
  console.log(`  Color:       ${project.color}`);
  console.log(`  Created:     ${new Date(project.createdAt).toLocaleString()}`);

  if (project.tasks && project.tasks.length > 0) {
    console.log(`\n  Tasks (${project.tasks.length}):`);
    console.log("  " + "-".repeat(50));
    for (const task of project.tasks.slice(0, 10)) {
      const statusIcon = task.status === "done" ? "[ok]" :
                        task.status === "in_progress" ? "[->]" :
                        "[  ]";
      console.log(`    ${statusIcon} ${task.title.slice(0, 40)}`);
    }
    if (project.tasks.length > 10) {
      console.log(`    ... and ${project.tasks.length - 10} more`);
    }
  }

  console.log("");
}

function printKnowledgeList(projectId: string, knowledge: ProjectKnowledge[]) {
  if (knowledge.length === 0) {
    console.log(`\n  No knowledge entries found for project ${projectId}.`);
    console.log(`  Add one with: husky project add-knowledge ${projectId} --title <title> --content <content>\n`);
    return;
  }

  console.log(`\n  KNOWLEDGE - Project: ${projectId}`);
  console.log("  " + "-".repeat(80));
  console.log(
    `  ${"ID".padEnd(24)} ${"CATEGORY".padEnd(14)} ${"TITLE".padEnd(35)}`
  );
  console.log("  " + "-".repeat(80));

  for (const entry of knowledge) {
    const categoryConfig = KNOWLEDGE_CATEGORY_CONFIG[entry.category] || { label: entry.category, icon: "?" };
    const truncatedTitle = entry.title.length > 33 ? entry.title.substring(0, 30) + "..." : entry.title;

    console.log(
      `  ${entry.id.padEnd(24)} [${categoryConfig.icon}] ${categoryConfig.label.padEnd(10)} ${truncatedTitle}`
    );
  }

  // Summary by category
  const byCategory: Record<string, number> = {};
  for (const entry of knowledge) {
    byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
  }

  console.log("  " + "-".repeat(80));
  console.log(`  Total: ${knowledge.length} entries`);
  const categoryStr = Object.entries(byCategory)
    .map(([cat, count]) => `${KNOWLEDGE_CATEGORY_CONFIG[cat]?.label || cat}: ${count}`)
    .join(", ");
  console.log(`  By Category: ${categoryStr}\n`);
}
