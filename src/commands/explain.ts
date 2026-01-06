import { Command } from "commander";

export const explainCommand = new Command("explain")
  .description("Explain CLI commands for AI agents")
  .argument("[command]", "Command to explain (task, roadmap, changelog, config, agent)")
  .action((command?: string) => {
    if (!command) {
      printOverview();
    } else {
      switch (command.toLowerCase()) {
        case "task":
          printTaskHelp();
          break;
        case "roadmap":
          printRoadmapHelp();
          break;
        case "changelog":
          printChangelogHelp();
          break;
        case "config":
          printConfigHelp();
          break;
        case "agent":
          printAgentWorkflowHelp();
          break;
        default:
          console.log(`Unknown command: ${command}`);
          console.log("Available: task, roadmap, changelog, config, agent");
          process.exit(1);
      }
    }
  });

function printOverview() {
  console.log(`
HUSKY CLI - AI Task Orchestration

Available Commands:
  task       Task management (list, create, start, complete, qa)
  roadmap    Roadmap & feature planning
  changelog  Generate changelogs from commits
  config     Configure API URL and key

Quick Start:
  1. Configure: husky config set api-url <dashboard-url>
  2. Set key:   husky config set api-key <key>
  3. Get task:  husky task get --id <id>
  4. Work:      husky task status "Working on..."
  5. Complete:  husky task complete --pr <url>

For detailed help on a command: husky explain <command>
For agent workflow guidance:    husky explain agent

Environment Variables:
  HUSKY_TASK_ID    Default task ID for commands (avoids --id flag)
`);
}

function printTaskHelp() {
  console.log(`
HUSKY TASK COMMANDS

Task ID can be passed via --id flag or HUSKY_TASK_ID environment variable.

LIST TASKS
  husky task list
  husky task list --status backlog
  husky task list --status in_progress

  Options:
    -s, --status <status>   Filter by status (backlog, in_progress, review, done)

GET TASK DETAILS
  husky task get --id <id>
  husky task get --id <id> --json

  Options:
    --id <id>    Task ID (or set HUSKY_TASK_ID)
    --json       Output as JSON (useful for parsing)

CREATE TASK
  husky task create "Task title"
  husky task create "Task title" -d "Description" --project proj123

  Options:
    -d, --description <desc>   Task description
    --project <projectId>      Project ID
    --path <path>              Path in project
    -p, --priority <priority>  Priority: low, medium, high (default: medium)

START TASK
  husky task start <id>

  Marks task as in_progress and assigns to agent.

REPORT STATUS
  husky task status "Working on feature X"
  husky task status "Fixing tests" --id <id>

  Options:
    --id <id>    Task ID (or set HUSKY_TASK_ID)

  Use this to report progress during task execution.

SUBMIT PLAN
  husky task plan --summary "Implementation plan"
  husky task plan --file plan.md
  husky task plan --steps "step1,step2,step3"
  echo "Plan content" | husky task plan --stdin

  Options:
    --id <id>           Task ID (or set HUSKY_TASK_ID)
    --summary <text>    Plan summary
    --file <path>       Read plan from file
    --stdin             Read plan from stdin
    --steps <steps>     Comma-separated steps

WAIT FOR APPROVAL
  husky task wait-approval
  husky task wait-approval --timeout 3600

  Options:
    --id <id>              Task ID (or set HUSKY_TASK_ID)
    --timeout <seconds>    Timeout in seconds (default: 1800)

  Exit codes:
    0 = approved
    1 = rejected
    2 = timeout

COMPLETE TASK
  husky task complete --output "Task completed successfully"
  husky task complete --pr https://github.com/org/repo/pull/123
  husky task complete --error "Failed due to X"

  Options:
    --id <id>         Task ID (or set HUSKY_TASK_ID)
    --output <text>   Completion summary
    --pr <url>        Pull request URL
    --error <text>    Error message (marks task as failed)

DONE (Simple completion)
  husky task done <id>
  husky task done <id> --pr <url>

  Options:
    --pr <url>    Link to PR

QA VALIDATION COMMANDS

  husky task qa-start [--max-iterations <n>] [--no-auto-fix]
    Start QA validation for a task.

  husky task qa-status [--json]
    Get current QA validation status.

  husky task qa-approve [--notes <text>]
    Manually approve QA.

  husky task qa-reject [--notes <text>]
    Manually reject QA.

  husky task qa-iteration --iteration <n> --status <status> [--issues <json>]
    Add a QA iteration result (for automated agents).
    Status: approved, rejected, error

  husky task qa-escalate
    Escalate QA to human review.

MERGE CONFLICT RESOLUTION
  husky task merge-conflict --file <path> --ours <content> --theirs <content>
  husky task merge-conflict --file <path> --ours-file ours.txt --theirs-file theirs.txt

  Options:
    --file <path>         Path to conflicted file (required)
    --ours <content>      Content from current branch
    --theirs <content>    Content from incoming branch
    --base <content>      Content from common ancestor (3-way merge)
    --context <text>      Additional context about the merge
    --json                Output as JSON
    --ours-file <path>    Read ours content from file
    --theirs-file <path>  Read theirs content from file
    --base-file <path>    Read base content from file
`);
}

function printRoadmapHelp() {
  console.log(`
HUSKY ROADMAP COMMANDS

LIST ROADMAPS
  husky roadmap list
  husky roadmap list --type global
  husky roadmap list --project proj123 --json

  Options:
    --type <type>        Filter by type (global, project)
    --project <id>       Filter by project ID
    --json               Output as JSON

GET ROADMAP
  husky roadmap get <id>
  husky roadmap get <id> --json

  Options:
    --json    Output as JSON

CREATE ROADMAP
  husky roadmap create "Roadmap name"
  husky roadmap create "Project roadmap" --type project --project proj123

  Options:
    --type <type>           Roadmap type: global, project (default: global)
    --project <projectId>   Project ID (required for project type)
    --vision <vision>       Product vision
    --audience <audience>   Primary target audience

ADD PHASE
  husky roadmap add-phase <roadmapId> "Phase name"
  husky roadmap add-phase rm123 "MVP" --description "Minimum viable product"

  Options:
    --description <desc>    Phase description

ADD FEATURE
  husky roadmap add-feature <roadmapId> <phaseId> "Feature title"
  husky roadmap add-feature rm123 ph456 "User auth" --priority must --complexity high

  Options:
    --description <desc>       Feature description
    --priority <priority>      Priority: must, should, could, wont (default: should)
    --complexity <complexity>  Complexity: low, medium, high (default: medium)
    --impact <impact>          Impact: low, medium, high (default: medium)

GENERATE WITH AI
  husky roadmap generate <roadmapId>
  husky roadmap generate rm123 --context "E-commerce platform"

  Options:
    --context <context>    Additional context for AI generation
    --project <projectId>  Project ID for context

DELETE ROADMAP
  husky roadmap delete <id> --force

  Options:
    --force    Skip confirmation (required)
`);
}

function printChangelogHelp() {
  console.log(`
HUSKY CHANGELOG COMMANDS

GENERATE FROM GIT COMMITS
  husky changelog generate --version 1.0.0 --project proj123
  husky changelog generate --since v0.9.0 --until HEAD --version 1.0.0 --project proj123
  husky changelog generate --version 1.0.0 --project proj123 --dry-run

  Options:
    --since <ref>         Git ref to start from (tag, commit, branch)
    --until <ref>         Git ref to end at (default: HEAD)
    -v, --version <ver>   Version for changelog (required)
    -p, --project <id>    Project ID (required)
    --dry-run             Preview commits without generating

LIST CHANGELOGS
  husky changelog list
  husky changelog list --project proj123 --json

  Options:
    -p, --project <id>    Filter by project ID
    --json                Output as JSON

SHOW CHANGELOG
  husky changelog show <id>
  husky changelog show <id> --json
  husky changelog show <id> --markdown

  Options:
    --json       Output as JSON
    --markdown   Output as Markdown

PUBLISH CHANGELOG
  husky changelog publish <id>

  Changes status from draft to published.

DELETE CHANGELOG
  husky changelog delete <id> --yes

  Options:
    -y, --yes    Skip confirmation (required)
`);
}

function printConfigHelp() {
  console.log(`
HUSKY CONFIG COMMANDS

SET CONFIGURATION
  husky config set api-url https://dashboard.example.com
  husky config set api-key your-api-key

  Available keys:
    api-url    Dashboard API URL (required for all commands)
    api-key    API key for authentication

GET CONFIGURATION
  husky config get api-url
  husky config get api-key

LIST ALL CONFIGURATION
  husky config list

  Shows all configured values (api-key is masked).

Configuration is stored in: ~/.husky/config.json
`);
}

function printAgentWorkflowHelp() {
  console.log(`
HUSKY AGENT WORKFLOW

This guide explains how an AI agent should use the Husky CLI to work on tasks.

TYPICAL WORKFLOW

1. SETUP (once per session)
   export HUSKY_TASK_ID="<task-id>"

2. GET TASK DETAILS
   husky task get --json

3. REPORT PROGRESS (during work)
   husky task status "Analyzing codebase..."
   husky task status "Implementing feature X..."
   husky task status "Running tests..."

4. SUBMIT PLAN (for complex tasks)
   husky task plan --summary "Will implement X by doing Y"
   husky task wait-approval

5. COMPLETE TASK
   husky task complete --output "Implemented feature X" --pr https://github.com/...

   Or if failed:
   husky task complete --error "Could not complete due to X"

EXAMPLE: FULL TASK EXECUTION

  # Setup
  export HUSKY_TASK_ID="abc123"

  # Check task details
  husky task get

  # Start working
  husky task status "Starting task..."

  # Do the work (code changes, etc.)
  husky task status "Implementing changes..."

  # If plan approval needed
  husky task plan --summary "Will add new endpoint and update tests"
  husky task wait-approval

  # Continue work after approval
  husky task status "Running tests..."

  # Complete
  husky task complete --output "Added /api/users endpoint" --pr "https://..."

QA WORKFLOW

After implementation, run QA validation:

  husky task qa-start
  husky task qa-status

  # If issues found, fix and report
  husky task qa-iteration --iteration 1 --status rejected --issues '[{"type":"major","title":"Test failure"}]'

  # After fixes
  husky task qa-iteration --iteration 2 --status approved

  # If stuck, escalate
  husky task qa-escalate

MERGE CONFLICT RESOLUTION

When encountering git merge conflicts:

  husky task merge-conflict \\
    --file src/app.ts \\
    --ours-file .git/MERGE_HEAD/app.ts \\
    --theirs-file .git/HEAD/app.ts \\
    --context "Merging feature branch"

BEST PRACTICES

1. Always set HUSKY_TASK_ID at the start
2. Report status frequently (every significant step)
3. Use --json flag when parsing output programmatically
4. Submit plans for tasks that modify multiple files
5. Include PR URL when completing tasks
6. Use qa-escalate if stuck after max iterations

EXIT CODES

Most commands use standard exit codes:
  0 = Success
  1 = Error/Failure
  2 = Timeout (for wait-approval)
`);
}
