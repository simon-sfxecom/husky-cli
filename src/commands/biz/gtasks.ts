import { Command } from "commander";
import chalk from "chalk";
import { GoogleTasksClient } from "../../lib/biz/gtasks.js";

const gtasksCommand = new Command("gtasks")
  .description("Google Tasks integration for human-agent communication");

gtasksCommand
  .command("lists")
  .description("List all task lists")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const client = await GoogleTasksClient.fromConfig();
    const lists = await client.getLists();
    
    if (opts.json) {
      console.log(JSON.stringify(lists, null, 2));
    } else {
      console.log(chalk.bold("Task Lists:\n"));
      for (const list of lists) {
        console.log(`  ${chalk.blue(list.title)} (${list.id})`);
      }
    }
  });

gtasksCommand
  .command("list")
  .description("List tasks in Husky list")
  .option("--all", "Include completed tasks")
  .option("--list <id>", "Use specific list ID")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const client = await GoogleTasksClient.fromConfig();
    const tasks = await client.getTasks(opts.list, { showCompleted: opts.all });
    
    if (opts.json) {
      console.log(JSON.stringify(tasks, null, 2));
    } else {
      console.log(chalk.bold("Tasks:\n"));
      for (const task of tasks) {
        const status = task.status === "completed" 
          ? chalk.green("✓") 
          : chalk.yellow("○");
        const due = task.due ? chalk.gray(` (due: ${task.due.split("T")[0]})`) : "";
        console.log(`  ${status} ${task.title}${due}`);
        console.log(chalk.gray(`     ID: ${task.id}`));
        if (task.notes) {
          console.log(chalk.gray(`     ${task.notes.split("\n")[0]}...`));
        }
        console.log("");
      }
    }
  });

gtasksCommand
  .command("create <title>")
  .description("Create a new task")
  .option("--notes <text>", "Add notes to task")
  .option("--due &lt;date&gt;", "Due date (YYYY-MM-DD or 'tomorrow')")
  .option("--list <id>", "Target list ID")
  .option("--json", "Output as JSON")
  .action(async (title, opts) => {
    const client = await GoogleTasksClient.fromConfig();
    
    let due: Date | undefined;
    if (opts.due === "tomorrow") {
      due = new Date();
      due.setDate(due.getDate() + 1);
    } else if (opts.due) {
      due = new Date(opts.due);
    }
    
    const task = await client.createTask(title, { notes: opts.notes, due }, opts.list);
    
    if (opts.json) {
      console.log(JSON.stringify(task, null, 2));
    } else {
      console.log(chalk.green(`✓ Task created: ${task.title}`));
      console.log(chalk.gray(`  ID: ${task.id}`));
    }
  });

gtasksCommand
  .command("complete &lt;taskId&gt;")
  .description("Mark task as completed")
  .option("--list <id>", "List ID")
  .action(async (taskId, opts) => {
    const client = await GoogleTasksClient.fromConfig();
    await client.completeTask(taskId, opts.list);
    console.log(chalk.green(`✓ Task completed`));
  });

gtasksCommand
  .command("note &lt;taskId&gt; <text>")
  .description("Add note to existing task")
  .option("--list <id>", "List ID")
  .action(async (taskId, text, opts) => {
    const client = await GoogleTasksClient.fromConfig();
    await client.addNote(taskId, text, opts.list);
    console.log(chalk.green(`✓ Note added`));
  });

gtasksCommand
  .command("for-human <title>")
  .description("Create task for human action (used by agents)")
  .option("--notes <text>", "Details for the human")
  .option("--due <when>", "Due date: tomorrow, next-week, or YYYY-MM-DD")
  .option("--link <url>", "Related URL")
  .option("--json", "Output as JSON")
  .action(async (title, opts) => {
    const client = await GoogleTasksClient.fromConfig();
    const task = await client.createForHuman(title, {
      notes: opts.notes,
      due: opts.due,
      link: opts.link,
    });
    
    if (opts.json) {
      console.log(JSON.stringify(task, null, 2));
    } else {
      console.log(chalk.green(`✓ Task for human created: ${task.title}`));
      console.log(chalk.gray(`  ID: ${task.id}`));
      console.log(chalk.blue(`  → Will appear in your Google Tasks app`));
    }
  });

gtasksCommand
  .command("poll")
  .description("Check for new tasks that agents can work on")
  .option("--since &lt;hours&gt;", "Only tasks from last N hours", "24")
  .option("--create-husky-tasks", "Automatically create Husky tasks")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const client = await GoogleTasksClient.fromConfig();
    
    const since = new Date();
    since.setHours(since.getHours() - parseInt(opts.since));
    
    const tasks = await client.pollForAgentTasks(since);
    
    if (opts.json) {
      console.log(JSON.stringify(tasks, null, 2));
    } else if (tasks.length === 0) {
      console.log(chalk.gray("No new tasks for agents"));
    } else {
      console.log(chalk.bold(`Found ${tasks.length} task(s) for agents:\n`));
      for (const task of tasks) {
        console.log(`  ${chalk.yellow("○")} ${task.title}`);
        if (opts.createHuskyTasks) {
          console.log(chalk.gray(`     → Would create Husky task`));
        }
      }
    }
  });

export { gtasksCommand };
export default gtasksCommand;