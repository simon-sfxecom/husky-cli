# Husky CLI

CLI for Huskyv0 Task Orchestration with Claude Agent SDK integration.

**Part of the [huskyv0 monorepo](https://github.com/simon-sfxecom/huskyv0)**

## Installation

```bash
# From npm (recommended)
npm install -g @simonfestl/husky-cli

# Local development (from monorepo root)
cd packages/cli
npm install
npm run build
npm link
```

## Quick Start

```bash
# Configure API
husky config set api-url https://your-husky-dashboard.run.app
husky config set api-key your-api-key

# Test connection
husky config test

# Interactive mode
husky
```

## Commands

### Task Management

```bash
husky task list                              # List all tasks
husky task list --status in_progress         # Filter by status
husky task list --json                       # JSON output
husky task create "Fix login bug" --priority high
husky task get <task-id>
husky task start <task-id>
husky task done <task-id> --pr https://github.com/...
husky task update <task-id> --status done
husky task delete <task-id>
```

### Project Management

```bash
husky project list
husky project create "New Project" --description "..."
husky project get <project-id>
husky project update <project-id> --status active
husky project delete <project-id>
husky project add-knowledge <project-id> --content "..."
husky project list-knowledge <project-id>
husky project delete-knowledge <project-id> <knowledge-id>
```

### Workflow Management

```bash
husky workflow list
husky workflow create "Onboarding" --department <id>
husky workflow get <workflow-id>
husky workflow update <workflow-id> --name "Updated"
husky workflow delete <workflow-id>
husky workflow add-step <workflow-id> --name "Step 1"
husky workflow update-step <workflow-id> <step-id> --name "Updated"
husky workflow delete-step <workflow-id> <step-id>
husky workflow generate-steps <workflow-id>    # AI-generated
husky workflow generate-mermaid <workflow-id>  # Mermaid diagram
```

### Idea Management

```bash
husky idea list
husky idea create "New feature idea" --category feature
husky idea get <idea-id>
husky idea update <idea-id> --status approved
husky idea delete <idea-id>
husky idea convert-to-task <idea-id>
```

### Department Management

```bash
husky department list
husky department create "Engineering"
husky department get <department-id>
husky department update <department-id> --name "Dev"
husky department delete <department-id>
```

### VM Session Management

```bash
husky vm list
husky vm create --prompt "Fix bugs" --agent claude
husky vm get <session-id>
husky vm start <session-id>
husky vm stop <session-id>
husky vm logs <session-id>
husky vm approve <session-id>
husky vm reject <session-id> --reason "..."
husky vm update <session-id> --status approved
husky vm delete <session-id>
```

### Jules Session Management

```bash
husky jules list
husky jules create --task-id <id> --prompt "..."
husky jules get <session-id>
husky jules message <session-id> --content "..."
husky jules approve <session-id>
husky jules activities <session-id>
husky jules update <session-id> --status completed
husky jules delete <session-id>
```

### Business Strategy

```bash
husky strategy show
husky strategy set-vision "Our vision..."
husky strategy set-mission "Our mission..."
husky strategy add-value --title "Innovation" --description "..."
husky strategy update-value <id> --title "Updated"
husky strategy delete-value <id>
husky strategy add-goal --title "Q1 Goal" --target "..."
husky strategy update-goal <id> --status completed
husky strategy delete-goal <id>
husky strategy add-persona --name "Developer" --description "..."
husky strategy update-persona <id> --name "Updated"
husky strategy delete-persona <id>
```

### Process Management

```bash
husky process list
husky process create "Release Process" --department <id>
husky process get <process-id>
husky process update <process-id> --name "Updated"
husky process delete <process-id>
```

### Roadmap Management

```bash
husky roadmap list
husky roadmap get <roadmap-id>
husky roadmap create "Q1 2025" --description "..."
husky roadmap update <roadmap-id> --name "Updated"
husky roadmap delete <roadmap-id>
husky roadmap add-phase <roadmap-id> --name "Phase 1"
husky roadmap add-feature <roadmap-id> --phase <id> --title "Feature"
husky roadmap list-features <roadmap-id>
husky roadmap update-feature <roadmap-id> <feature-id> --status done
husky roadmap delete-feature <roadmap-id> <feature-id>
husky roadmap convert-feature <roadmap-id> <feature-id>  # To task
husky roadmap generate                                    # AI-generated
```

### Changelog Management

```bash
husky changelog generate --from <tag> --to HEAD
husky changelog list
husky changelog show <changelog-id>
husky changelog publish <changelog-id>
husky changelog delete <changelog-id>
```

### VM Config Management

```bash
husky vm-config list
husky vm-config create --machine-type e2-medium --disk-size 50
husky vm-config update <config-id> --machine-type e2-standard-2
husky vm-config delete <config-id>
```

### Settings

```bash
husky settings get <key>
husky settings set <key> <value>
```

### Configuration

```bash
husky config set api-url https://your-husky-dashboard.run.app
husky config set api-key your-api-key
husky config get api-url
husky config list
husky config test
```

### Help & Documentation

```bash
husky explain task          # Explain task commands
husky explain workflow      # Explain workflow commands
husky explain all           # Full documentation
husky --help
```

### Shell Completion

```bash
husky completion bash >> ~/.bashrc
husky completion zsh >> ~/.zshrc
husky completion fish > ~/.config/fish/completions/husky.fish
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HUSKY_API_URL` | Husky Dashboard URL |
| `HUSKY_API_KEY` | Husky API key |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `GITHUB_TOKEN` | GitHub token for commits (optional) |

## Development

```bash
# From monorepo root
cd packages/cli

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Link globally for testing
npm link
```

## Publishing / Release

### Publishing a New Version

```bash
cd packages/cli

# 1. Bump version
npm version patch  # or minor/major

# 2. Publish to npm (opens browser for authentication)
npm publish --access public

# 3. Commit and push
git add .
git commit -m "chore(cli): release vX.X.X"
git push origin main
```

### Updating on Other Devices

```bash
# Update to latest version
npm update -g @simonfestl/husky-cli

# Or reinstall
npm install -g @simonfestl/husky-cli

# Check installed version
husky --version
```

## Changelog

### v0.5.0 (2026-01-06)
- Full Dashboard feature parity (69 new commands)
- Added: project, workflow, idea, department, vm, jules, process, strategy, settings, vm-config commands
- Added: Interactive TUI mode (`husky` without args)
- Added: Shell completion (bash/zsh/fish)
- Added: `--json` flag for all commands
- Monorepo migration from separate husky-cli repo

### v0.3.0 (2026-01-05)
- Added roadmap commands (list, get, create, generate, phases, features)
- Added changelog commands (generate, list, show, publish)
- Added explain command for documentation
- Added config test command

### v0.2.0 (2025-01-05)
- Added `agent` commands (plan, execute, wait-approval)
- Added StreamClient with batching for efficient API calls
- Integration with Claude Agent SDK
- Support for planning phase before execution

### v0.1.0 (2025-01-04)
- Initial release
- Task management commands (list, create, start, done)
- Configuration management
- API key authentication

## License

MIT
