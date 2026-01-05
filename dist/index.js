#!/usr/bin/env node
import { Command } from "commander";
import { taskCommand } from "./commands/task.js";
import { configCommand } from "./commands/config.js";
import { agentCommand } from "./commands/agent.js";
const program = new Command();
program
    .name("husky")
    .description("CLI for Huskyv0 Task Orchestration with Claude Agent")
    .version("0.2.0");
program.addCommand(taskCommand);
program.addCommand(configCommand);
program.addCommand(agentCommand);
program.parse();
