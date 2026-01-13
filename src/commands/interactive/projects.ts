import { select, input, confirm } from "@inquirer/prompts";
import { getAuthHeaders } from "../config.js";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate } from "./utils.js";

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  workStatus: string;
  color?: string;
  techStack?: string;
  githubRepo?: string;
}

export async function projectsMenu(): Promise<void> {
  const config = ensureConfig();

  const menuItems: MenuItem[] = [
    { name: "List all projects", value: "list" },
    { name: "View project details", value: "view" },
    { name: "Create new project", value: "create" },
    { name: "Update project", value: "update" },
    { name: "Delete project", value: "delete" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "Projects:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listProjects(config);
      break;
    case "view":
      await viewProject(config);
      break;
    case "create":
      await createProject(config);
      break;
    case "update":
      await updateProject(config);
      break;
    case "delete":
      await deleteProject(config);
      break;
    case "back":
      return;
  }
}

async function fetchProjects(config: ValidConfig): Promise<Project[]> {
  const res = await fetch(`${config.apiUrl}/api/projects`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return res.json();
}

async function selectProject(config: ValidConfig, message: string): Promise<Project | null> {
  const projects = await fetchProjects(config);
  if (projects.length === 0) {
    console.log("\n  No projects found.\n");
    await pressEnterToContinue();
    return null;
  }

  const choices = projects.map((p) => ({
    name: `[${p.status}] ${truncate(p.name, 40)} (${p.workStatus})`,
    value: p.id,
  }));
  choices.push({ name: "Cancel", value: "__cancel__" });

  const projectId = await select({ message, choices });
  if (projectId === "__cancel__") return null;

  return projects.find((p) => p.id === projectId) || null;
}

async function listProjects(config: ValidConfig): Promise<void> {
  try {
    const projects = await fetchProjects(config);

    console.log("\n  PROJECTS");
    console.log("  " + "-".repeat(70));

    if (projects.length === 0) {
      console.log("  No projects found.");
    } else {
      for (const project of projects) {
        const statusIcon = project.status === "active" ? "[+]" : "[-]";
        console.log(`  ${statusIcon} ${truncate(project.name, 40).padEnd(40)} [${project.workStatus}]`);
        console.log(`      ID: ${project.id}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching projects:", error);
    await pressEnterToContinue();
  }
}

async function viewProject(config: ValidConfig): Promise<void> {
  try {
    const project = await selectProject(config, "Select project to view:");
    if (!project) return;

    const res = await fetch(`${config.apiUrl}/api/projects/${project.id}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const fullProject = await res.json();

    console.log(`\n  Project: ${fullProject.name}`);
    console.log("  " + "-".repeat(50));
    console.log(`  ID:          ${fullProject.id}`);
    console.log(`  Status:      ${fullProject.status}`);
    console.log(`  Work Status: ${fullProject.workStatus}`);
    if (fullProject.description) {
      console.log(`  Description: ${fullProject.description}`);
    }
    if (fullProject.techStack) {
      console.log(`  Tech Stack:  ${fullProject.techStack}`);
    }
    if (fullProject.githubRepo) {
      console.log(`  GitHub:      ${fullProject.githubRepo}`);
    }
    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error viewing project:", error);
    await pressEnterToContinue();
  }
}

async function createProject(config: ValidConfig): Promise<void> {
  try {
    const name = await input({
      message: "Project name:",
      validate: (value) => (value.length > 0 ? true : "Name is required"),
    });

    const description = await input({
      message: "Description (optional):",
    });

    const workStatus = await select({
      message: "Work status:",
      choices: [
        { name: "Planning", value: "planning" },
        { name: "In Progress", value: "in_progress" },
        { name: "Review", value: "review" },
        { name: "Completed", value: "completed" },
        { name: "On Hold", value: "on_hold" },
      ],
      default: "planning",
    });

    const techStack = await input({
      message: "Tech stack (optional):",
    });

    const githubRepo = await input({
      message: "GitHub repository URL (optional):",
    });

    const res = await fetch(`${config.apiUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({
        name,
        description: description || undefined,
        status: "active",
        workStatus,
        techStack: techStack || undefined,
        githubRepo: githubRepo || undefined,
      }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const project = await res.json();
    console.log(`\n  ✓ Project created!`);
    console.log(`  ID: ${project.id}`);
    console.log(`  Name: ${project.name}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating project:", error);
    await pressEnterToContinue();
  }
}

async function updateProject(config: ValidConfig): Promise<void> {
  try {
    const project = await selectProject(config, "Select project to update:");
    if (!project) return;

    const updateChoices: MenuItem[] = [
      { name: "Name", value: "name" },
      { name: "Description", value: "description" },
      { name: "Status", value: "status" },
      { name: "Work Status", value: "workStatus" },
      { name: "Tech Stack", value: "techStack" },
      { name: "GitHub Repo", value: "githubRepo" },
      { name: "Cancel", value: "cancel" },
    ];

    const field = await select({ message: "What to update?", choices: updateChoices });
    if (field === "cancel") return;

    let updateData: Record<string, string> = {};

    switch (field) {
      case "name":
        updateData.name = await input({
          message: "New name:",
          default: project.name,
          validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        break;
      case "description":
        updateData.description = await input({
          message: "New description:",
          default: project.description || "",
        });
        break;
      case "status":
        updateData.status = await select({
          message: "New status:",
          choices: [
            { name: "Active", value: "active" },
            { name: "Archived", value: "archived" },
          ],
          default: project.status,
        });
        break;
      case "workStatus":
        updateData.workStatus = await select({
          message: "New work status:",
          choices: [
            { name: "Planning", value: "planning" },
            { name: "In Progress", value: "in_progress" },
            { name: "Review", value: "review" },
            { name: "Completed", value: "completed" },
            { name: "On Hold", value: "on_hold" },
          ],
          default: project.workStatus,
        });
        break;
      case "techStack":
        updateData.techStack = await input({
          message: "New tech stack:",
          default: project.techStack || "",
        });
        break;
      case "githubRepo":
        updateData.githubRepo = await input({
          message: "New GitHub repo URL:",
          default: project.githubRepo || "",
        });
        break;
    }

    const res = await fetch(`${config.apiUrl}/api/projects/${project.id}`, {
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

    console.log(`\n  ✓ Project updated!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error updating project:", error);
    await pressEnterToContinue();
  }
}

async function deleteProject(config: ValidConfig): Promise<void> {
  try {
    const project = await selectProject(config, "Select project to delete:");
    if (!project) return;

    const confirmed = await confirm({
      message: `Delete "${project.name}"? This cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/projects/${project.id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Project deleted.\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting project:", error);
    await pressEnterToContinue();
  }
}
