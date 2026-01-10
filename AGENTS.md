# Husky CLI (@simonfestl/husky-cli)

## OVERVIEW

Commander.js CLI for task management. Used by humans and AI agents inside VMs.

## STRUCTURE

```
src/
├── index.ts           # Entry point
├── commands/          # Subcommands (see commands/AGENTS.md)
│   ├── task.ts        # Task lifecycle (1220 lines)
│   ├── worktree.ts    # Git isolation
│   ├── biz/           # Business integrations (Zendesk, Billbee)
│   └── interactive/   # TUI components
└── lib/
    ├── api.ts         # Dashboard API client
    ├── worktree.ts    # Git worktree manager (753 lines)
    └── biz/           # Business API wrappers
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add command | `src/commands/` |
| Add biz integration | `src/lib/biz/` + `src/commands/biz/` |
| Modify API client | `src/lib/api.ts` |
| Git operations | `src/lib/worktree.ts` |

## CONVENTIONS

### Command Pattern
```typescript
import { Command } from "commander";
import { getApiClient } from "../lib/api.js";  // Note: .js extension!

export const myCommand = new Command("my-cmd")
  .description("Does something")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const api = getApiClient();
    const result = await api.get("/endpoint");
    if (options.json) {
      console.log(JSON.stringify(result));
    } else {
      // Human-readable output
    }
  });
```

### ESM Imports
- Use `.js` extension for local imports (TypeScript compiles to ESM)
- Example: `import { foo } from "../lib/bar.js";`

### Environment Variables
- `HUSKY_API_URL` - Dashboard API base URL
- `HUSKY_API_KEY` - Authentication key
- `HUSKY_TASK_ID` - Auto-detected task context (set by agents)
- `HUSKY_PROJECT_ID` - Project filter

### Agent-Friendly
- All commands support `--json` flag
- `husky llm` outputs markdown documentation for agents
- `husky explain <command>` provides detailed help

## BUILD

```bash
npm run build    # TypeScript → dist/
npm run dev      # Watch mode
npm test         # Vitest
```

## ANTI-PATTERNS

- Never call external APIs directly → use `husky biz` wrapper
- Never skip `--json` support on new commands
- Never use CommonJS imports (ESM only)
