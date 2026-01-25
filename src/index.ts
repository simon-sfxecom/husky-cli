#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "module";
import { taskCommand } from "./commands/task.js";
import { configCommand } from "./commands/config.js";
import { agentCommand } from "./commands/agent.js";
import { roadmapCommand } from "./commands/roadmap.js";
import { changelogCommand } from "./commands/changelog.js";
import { explainCommand } from "./commands/explain.js";
import { projectCommand } from "./commands/project.js";
import { ideaCommand } from "./commands/idea.js";
import { departmentCommand } from "./commands/department.js";
import { workflowCommand } from "./commands/workflow.js";

import { vmCommand } from "./commands/vm.js";
import { vmConfigCommand } from "./commands/vm-config.js";
import { processCommand } from "./commands/process.js";
import { settingsCommand } from "./commands/settings.js";
import { strategyCommand } from "./commands/strategy.js";
import { completionCommand } from "./commands/completion.js";
import { worktreeCommand } from "./commands/worktree.js";
import { workerCommand } from "./commands/worker.js";
import { bizCommand } from "./commands/biz.js";

import { printLLMContext, llmCommand } from "./commands/llm-context.js";
import { agentMsgCommand } from "./commands/agent-msg.js";
import { runInteractiveMode } from "./commands/interactive.js";
import { serviceAccountCommand } from "./commands/service-account.js";
import { chatCommand } from "./commands/chat.js";
import { previewCommand } from "./commands/preview.js";
import { initCommand } from "./commands/init.js";
import { brainCommand } from "./commands/brain.js";
import { mermaidCommand } from "./commands/mermaid.js";
import { infraCommand } from "./commands/infra.js";
import { e2eCommand } from "./commands/e2e.js";
import { prCommand } from "./commands/pr.js";
import { youtubeCommand } from "./commands/youtube.js";
import { imageCommand } from "./commands/image.js";
import { authCommand } from "./commands/auth.js";
import { businessCommand } from "./commands/business.js";
import { planCommand } from "./commands/plan.js";
import { diagramsCommand } from "./commands/diagrams.js";

// Read version from package.json
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

const program = new Command();

program
  .name("husky")
  .description("CLI for Huskyv0 Task Orchestration with Claude Agent")
  .version(packageJson.version)
  .option("--llm", "Output LLM reference documentation (markdown)");

program.addCommand(taskCommand);
program.addCommand(configCommand);
program.addCommand(agentCommand);
program.addCommand(roadmapCommand);
program.addCommand(changelogCommand);
program.addCommand(explainCommand);
program.addCommand(projectCommand);
program.addCommand(ideaCommand);
program.addCommand(departmentCommand);
program.addCommand(workflowCommand);
program.addCommand(vmCommand);
program.addCommand(vmConfigCommand);
program.addCommand(processCommand);
program.addCommand(settingsCommand);
program.addCommand(strategyCommand);
program.addCommand(completionCommand);
program.addCommand(worktreeCommand);
program.addCommand(workerCommand);
program.addCommand(bizCommand);
program.addCommand(serviceAccountCommand);
program.addCommand(chatCommand);
program.addCommand(previewCommand);
program.addCommand(llmCommand);
program.addCommand(initCommand);
program.addCommand(agentMsgCommand);
program.addCommand(brainCommand);
program.addCommand(mermaidCommand);
program.addCommand(infraCommand);
program.addCommand(e2eCommand);
program.addCommand(prCommand);
program.addCommand(youtubeCommand);
program.addCommand(imageCommand);
program.addCommand(authCommand);
program.addCommand(businessCommand);
program.addCommand(planCommand);
program.addCommand(diagramsCommand);

// Handle --llm flag specially
if (process.argv.includes("--llm")) {
  printLLMContext();
  process.exit(0);
}

// Check if no command was provided - run interactive mode
if (process.argv.length <= 2) {
  runInteractiveMode();
} else {
  program.parse();
}
// trigger CI
