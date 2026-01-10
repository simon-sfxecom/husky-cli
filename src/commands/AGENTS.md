# CLI Commands

## OVERVIEW

Commander.js subcommands. Task-centric architecture with business integrations.

## COMMAND MAP

| Command | File | Purpose |
|---------|------|---------|
| `task` | `task.ts` | Task CRUD + lifecycle (start, done, status) |
| `worktree` | `worktree.ts` | Git isolation management |
| `project` | `project.ts` | Project operations |
| `vm` | `vm.ts` | VM session management |
| `biz` | `biz/` | Business tools (Zendesk, Billbee, SeaTable) |
| `llm` | `llm-context.ts` | Agent documentation |
| `explain` | `explain.ts` | Command help |
| `interactive/` | `interactive/` | TUI components |

## PATTERNS

### Subcommand Structure
```typescript
export const fooCommand = new Command("foo")
  .description("Manage foos")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(createCommand);
```

### Context Detection
```typescript
// Auto-detect from environment
const taskId = options.id || process.env.HUSKY_TASK_ID;
if (!taskId) {
  console.error("Task ID required");
  process.exit(1);
}
```

### Output Formatting
```typescript
if (options.json) {
  console.log(JSON.stringify(data, null, 2));
} else {
  // Use cli-table3 or chalk for human output
  const table = new Table({ head: ["ID", "Title"] });
  data.forEach(item => table.push([item.id, item.title]));
  console.log(table.toString());
}
```

## BUSINESS COMMANDS (`biz/`)

Proxy layer for external services. Agents MUST use these instead of direct API calls.

| Command | Service |
|---------|---------|
| `biz zendesk` | Zendesk tickets |
| `biz billbee` | Billbee orders |
| `biz seatable` | SeaTable database |
| `biz qdrant` | Vector search |

## ANTI-PATTERNS

- Never omit `--json` flag support
- Never hardcode API URLs (use `HUSKY_API_URL`)
- Never bypass the dashboard API for data operations
