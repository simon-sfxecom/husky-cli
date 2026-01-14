import { select, input, confirm } from "@inquirer/prompts";
import { getAuthHeaders } from "../config.js";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate } from "./utils.js";
import { resolveProject } from "../../lib/project-resolver.js";
import { requirePermission } from "../../lib/permissions.js";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignee?: string;
  projectId?: string;
}

interface Project {
  id: string;
  name: string;
}

export async function tasksMenu(): Promise<void> {
  const config = ensureConfig();

  const menuItems: MenuItem[] = [
    { name: "List all tasks", value: "list" },
    { name: "View task details", value: "view" },
    { name: "Create new task", value: "create" },
    { name: "Update task", value: "update" },
    { name: "Start task", value: "start" },
    { name: "Mark as done", value: "done" },
    { name: "Delete task", value: "delete" },
    { name: "Search by status", value: "search" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "Tasks:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listTasks(config);
      break;
    case "view":
      await viewTask(config);
      break;
    case "create":
      await createTask(config);
      break;
    case "update":
      await updateTask(config);
      break;
    case "start":
      await startTask(config);
      break;
    case "done":
      await markTaskDone(config);
      break;
    case "delete":
      await deleteTask(config);
      break;
    case "search":
      await searchTasks(config);
      break;
    case "back":
      return;
  }
}

async function fetchTasks(config: ValidConfig, status?: string): Promise<Task[]> {
  const url = new URL("/api/tasks", config.apiUrl);
  if (status) url.searchParams.set("status", status);

  const res = await fetch(url.toString(), {
    headers: getAuthHeaders(),
  });

  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return res.json();
}

async function fetchProjects(config: ValidConfig): Promise<Project[]> {
  const res = await fetch(`${config.apiUrl}/api/projects`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

async function selectTask(config: ValidConfig, message: string): Promise<Task | null> {
  const tasks = await fetchTasks(config);
  if (tasks.length === 0) {
    console.log("\n  No tasks found.\n");
    await pressEnterToContinue();
    return null;
  }

  const choices = tasks.map((t) => ({
    name: `[${t.status}] ${truncate(t.title, 40)} (${t.priority})`,
    value: t.id,
  }));
  choices.push({ name: "Cancel", value: "__cancel__" });

  const taskId = await select({ message, choices });
  if (taskId === "__cancel__") return null;

  return tasks.find((t) => t.id === taskId) || null;
}

async function listTasks(config: ValidConfig): Promise<void> {
  try {
    const tasks = await fetchTasks(config);

    console.log("\n  TASKS");
    console.log("  " + "-".repeat(70));

    if (tasks.length === 0) {
      console.log("  No tasks found.");
    } else {
      for (const task of tasks) {
        const statusIcon = task.status === "done" ? "[x]" : task.status === "in_progress" ? "[>]" : "[ ]";
        console.log(`  ${statusIcon} ${truncate(task.title, 50).padEnd(50)} [${task.priority}]`);
        console.log(`      ID: ${task.id}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching tasks:", error);
    await pressEnterToContinue();
  }
}

async function viewTask(config: ValidConfig): Promise<void> {
  try {
    const task = await selectTask(config, "Select task to view:");
    if (!task) return;

    const res = await fetch(`${config.apiUrl}/api/tasks/${task.id}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const fullTask = await res.json();

    console.log(`\n  Task: ${fullTask.title}`);
    console.log("  " + "-".repeat(50));
    console.log(`  ID:          ${fullTask.id}`);
    console.log(`  Status:      ${fullTask.status}`);
    console.log(`  Priority:    ${fullTask.priority}`);
    console.log(`  Assignee:    ${fullTask.assignee || "unassigned"}`);
    if (fullTask.projectId) {
      console.log(`  Project:     ${fullTask.projectId}`);
    }
    if (fullTask.description) {
      console.log(`  Description: ${fullTask.description}`);
    }
    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error viewing task:", error);
    await pressEnterToContinue();
  }
}

async function createTask(config: ValidConfig): Promise<void> {
  try {
    const title = await input({
      message: "Task title:",
      validate: (value) => (value.length > 0 ? true : "Title is required"),
    });

    const description = await input({
      message: "Description (optional):",
    });

    const priority = await select({
      message: "Priority:",
      choices: [
        { name: "Low", value: "low" },
        { name: "Medium", value: "medium" },
        { name: "High", value: "high" },
      ],
      default: "medium",
    });

    const projects = await fetchProjects(config);
    let projectId: string | undefined;

    if (projects.length > 0) {
      const linkToProject = await confirm({
        message: "Link to a project?",
        default: false,
      });

      if (linkToProject) {
        const selectionMethod = await select({
          message: "How to select project?",
          choices: [
            { name: "Choose from list", value: "list" },
            { name: "Type project name", value: "type" },
          ],
        });

        if (selectionMethod === "list") {
          const projectChoices = projects.map((p) => ({ name: p.name, value: p.id }));
          projectId = await select({ message: "Select project:", choices: projectChoices });
        } else {
          const projectInput = await input({
            message: "Project name or ID:",
            validate: (value) => (value.length > 0 ? true : "Project name required"),
          });

          const resolved = await resolveProject(projectInput, config);

          if (!resolved) {
            console.log(`\n  ❌ Project "${projectInput}" not found.`);
            console.log("  Available projects:");
            for (const p of projects) {
              console.log(`    - ${p.name}`);
            }
            console.log("");
            await pressEnterToContinue();
            return;
          }

          if (resolved.resolvedBy === "fuzzy-match") {
            const confirmFuzzy = await confirm({
              message: `Did you mean "${resolved.projectName}"? (${Math.round(resolved.confidence * 100)}% match)`,
              default: true,
            });
            if (!confirmFuzzy) {
              console.log("\n  Cancelled.\n");
              await pressEnterToContinue();
              return;
            }
          }

          if (resolved.resolvedBy !== "exact-id") {
            console.log(`  ℹ️  Resolved to: ${resolved.projectName}`);
          }

          projectId = resolved.projectId;
        }
      }
    }

    const res = await fetch(`${config.apiUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({
        title,
        description: description || undefined,
        priority,
        projectId,
      }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const task = await res.json();
    console.log(`\n  ✓ Task created!`);
    console.log(`  ID: ${task.id}`);
    console.log(`  Title: ${task.title}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating task:", error);
    await pressEnterToContinue();
  }
}

async function updateTask(config: ValidConfig): Promise<void> {
  try {
    const task = await selectTask(config, "Select task to update:");
    if (!task) return;

    const updateChoices: MenuItem[] = [
      { name: "Status", value: "status" },
      { name: "Priority", value: "priority" },
      { name: "Assignee", value: "assignee" },
      { name: "Link to Project", value: "project" },
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
            { name: "Backlog", value: "backlog" },
            { name: "In Progress", value: "in_progress" },
            { name: "Review", value: "review" },
            { name: "Done", value: "done" },
          ],
          default: task.status,
        });
        break;
      case "priority":
        updateData.priority = await select({
          message: "New priority:",
          choices: [
            { name: "Low", value: "low" },
            { name: "Medium", value: "medium" },
            { name: "High", value: "high" },
            { name: "Urgent", value: "urgent" },
          ],
          default: task.priority,
        });
        break;
      case "assignee":
        updateData.assignee = await select({
          message: "Assign to:",
          choices: [
            { name: "Human", value: "human" },
            { name: "LLM Agent", value: "llm" },
            { name: "Unassigned", value: "unassigned" },
          ],
          default: task.assignee || "unassigned",
        });
        break;
      case "project":
        const projectsForUpdate = await fetchProjects(config);
        if (projectsForUpdate.length === 0) {
          console.log("\n  No projects available.\n");
          await pressEnterToContinue();
          return;
        }

        const projectSelectionMethod = await select({
          message: "How to select project?",
          choices: [
            { name: "Choose from list", value: "list" },
            { name: "Type project name", value: "type" },
            { name: "Remove project link", value: "remove" },
          ],
        });

        if (projectSelectionMethod === "remove") {
          updateData.projectId = "";
        } else if (projectSelectionMethod === "list") {
          const projectChoicesForUpdate = projectsForUpdate.map((p) => ({ name: p.name, value: p.id }));
          updateData.projectId = await select({ message: "Select project:", choices: projectChoicesForUpdate });
        } else {
          const projectInputForUpdate = await input({
            message: "Project name or ID:",
            validate: (value) => (value.length > 0 ? true : "Project name required"),
          });

          const resolvedForUpdate = await resolveProject(projectInputForUpdate, config);

          if (!resolvedForUpdate) {
            console.log(`\n  ❌ Project "${projectInputForUpdate}" not found.`);
            console.log("  Available projects:");
            for (const p of projectsForUpdate) {
              console.log(`    - ${p.name}`);
            }
            console.log("");
            await pressEnterToContinue();
            return;
          }

          if (resolvedForUpdate.resolvedBy === "fuzzy-match") {
            const confirmFuzzyUpdate = await confirm({
              message: `Did you mean "${resolvedForUpdate.projectName}"? (${Math.round(resolvedForUpdate.confidence * 100)}% match)`,
              default: true,
            });
            if (!confirmFuzzyUpdate) {
              console.log("\n  Cancelled.\n");
              await pressEnterToContinue();
              return;
            }
          }

          if (resolvedForUpdate.resolvedBy !== "exact-id") {
            console.log(`  ℹ️  Resolved to: ${resolvedForUpdate.projectName}`);
          }

          updateData.projectId = resolvedForUpdate.projectId;
        }
        break;
      case "title":
        updateData.title = await input({
          message: "New title:",
          default: task.title,
          validate: (v) => (v.length > 0 ? true : "Title required"),
        });
        break;
      case "description":
        updateData.description = await input({
          message: "New description:",
          default: task.description || "",
        });
        break;
    }

    const res = await fetch(`${config.apiUrl}/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Task updated!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error updating task:", error);
    await pressEnterToContinue();
  }
}

async function startTask(config: ValidConfig): Promise<void> {
  // RBAC: Require task:start permission
  requirePermission("task:start");

  try {
    const task = await selectTask(config, "Select task to start:");
    if (!task) return;

    const res = await fetch(`${config.apiUrl}/api/tasks/${task.id}/start`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Task started: ${task.title}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error starting task:", error);
    await pressEnterToContinue();
  }
}

async function markTaskDone(config: ValidConfig): Promise<void> {
  // RBAC: Require task:done permission
  requirePermission("task:done");

  try {
    const task = await selectTask(config, "Select task to mark as done:");
    if (!task) return;

    const prUrl = await input({
      message: "PR URL (optional):",
    });

    const res = await fetch(`${config.apiUrl}/api/tasks/${task.id}/done`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({ prUrl: prUrl || undefined }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Task marked as done: ${task.title}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error marking task done:", error);
    await pressEnterToContinue();
  }
}

async function deleteTask(config: ValidConfig): Promise<void> {
  try {
    const task = await selectTask(config, "Select task to delete:");
    if (!task) return;

    const confirmed = await confirm({
      message: `Delete "${task.title}"? This cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Task deleted.\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting task:", error);
    await pressEnterToContinue();
  }
}

async function searchTasks(config: ValidConfig): Promise<void> {
  try {
    const status = await select({
      message: "Filter by status:",
      choices: [
        { name: "Backlog", value: "backlog" },
        { name: "In Progress", value: "in_progress" },
        { name: "Review", value: "review" },
        { name: "Done", value: "done" },
      ],
    });

    const tasks = await fetchTasks(config, status);

    console.log(`\n  TASKS (${status.replace("_", " ").toUpperCase()})`);
    console.log("  " + "-".repeat(70));

    if (tasks.length === 0) {
      console.log("  No tasks found with this status.");
    } else {
      for (const task of tasks) {
        console.log(`  - ${truncate(task.title, 50)} [${task.priority}]`);
        console.log(`    ID: ${task.id}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error searching tasks:", error);
    await pressEnterToContinue();
  }
}
