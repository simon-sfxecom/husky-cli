#!/usr/bin/env node
import { Command } from "commander";
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
import { julesCommand } from "./commands/jules.js";
import { vmCommand } from "./commands/vm.js";
import { vmConfigCommand } from "./commands/vm-config.js";
import { processCommand } from "./commands/process.js";
import { settingsCommand } from "./commands/settings.js";
import { strategyCommand } from "./commands/strategy.js";
import { completionCommand } from "./commands/completion.js";
import { worktreeCommand } from "./commands/worktree.js";
import { workerCommand } from "./commands/worker.js";
import { bizCommand } from "./commands/biz.js";
import { servicesCommand } from "./commands/services.js";
import { printLLMContext, llmCommand } from "./commands/llm-context.js";
import { runInteractiveMode } from "./commands/interactive.js";
import { serviceAccountCommand } from "./commands/service-account.js";
const program = new Command();
program
    .name("husky")
    .description("CLI for Huskyv0 Task Orchestration with Claude Agent")
    .version("0.9.5")
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
program.addCommand(julesCommand);
program.addCommand(vmCommand);
program.addCommand(vmConfigCommand);
program.addCommand(processCommand);
program.addCommand(settingsCommand);
program.addCommand(strategyCommand);
program.addCommand(completionCommand);
program.addCommand(worktreeCommand);
program.addCommand(workerCommand);
program.addCommand(bizCommand);
program.addCommand(servicesCommand);
program.addCommand(serviceAccountCommand);
program.addCommand(llmCommand);
// Handle --llm flag specially
if (process.argv.includes("--llm")) {
    printLLMContext();
    process.exit(0);
}
// Check if no command was provided - run interactive mode
if (process.argv.length <= 2) {
    runInteractiveMode();
}
else {
    program.parse();
}
