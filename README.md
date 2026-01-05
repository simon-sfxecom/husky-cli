# Husky CLI

CLI for Huskyv0 Task Orchestration with Claude Agent SDK integration.

## Installation

```bash
# From GitHub (recommended for VMs)
npm install -g github:simon-sfxecom/husky-cli

# Local development
cd packages/cli
npm install
npm run build
npm link
```

## Commands

### Task Management

```bash
# List tasks
husky task list
husky task list --status in_progress

# Create task
husky task create "Fix login bug" --priority high --project abc123

# Start/complete tasks
husky task start <task-id>
husky task done <task-id> --pr https://github.com/...
```

### Configuration

```bash
# Set API URL and key
husky config set api-url https://your-husky-dashboard.run.app
husky config set api-key your-api-key

# View config
husky config list
```

### Agent Commands (VM Execution)

```bash
# Generate execution plan
husky agent plan \
  --session-id=<session-id> \
  --prompt="Fix all TypeScript errors" \
  --api-url=https://husky.example.com \
  --api-key=<api-key> \
  --anthropic-key=<anthropic-key> \
  --workdir=/workspace

# Wait for user approval
husky agent wait-approval \
  --session-id=<session-id> \
  --api-url=https://husky.example.com \
  --api-key=<api-key> \
  --timeout=1800

# Execute approved plan
husky agent execute \
  --session-id=<session-id> \
  --api-url=https://husky.example.com \
  --api-key=<api-key> \
  --anthropic-key=<anthropic-key> \
  --github-token=<github-token>
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `HUSKY_API_URL` | Husky Dashboard URL |
| `HUSKY_API_KEY` | Husky API key |
| `GITHUB_TOKEN` | GitHub token for commits (optional) |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Changelog

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
