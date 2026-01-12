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

### E2E Testing (E2E Agent)

```bash
# Run E2E tests for a task
husky e2e run <task-id>
husky e2e run <task-id> --secret ADMIN_PASSWORD --retries 2
husky e2e run <task-id> --env TEST_USER=admin --headed

# E2E Inbox (pending test requests)
husky e2e inbox                          # List all inbox messages
husky e2e inbox --status pending         # Filter by status
husky e2e inbox --task <task-id>         # Filter by task

# Watch for new E2E requests (auto-processing)
husky e2e watch --interval 30
husky e2e watch --once                   # Process once and exit

# Complete E2E test request (used by e2e-bridge)
husky e2e done <inbox-id> --passed       # Mark as passed
husky e2e done <inbox-id> --failed --notes "reason"

# Browser automation utilities
husky e2e screenshot <url>               # Take screenshot
husky e2e screenshot <url> --upload      # Upload to GCS
husky e2e record <url>                   # Record browser session

# Artifact management
husky e2e upload <file> --task <id>      # Upload to GCS
husky e2e list --task <id>               # List artifacts
husky e2e clean --older-than 7           # Clean old artifacts
```

### PR Management (PR Agent)

```bash
husky pr list                          # List open PRs
husky pr get <pr-number>               # Get PR details
husky pr review <pr-number>            # Start review
husky pr approve <pr-number>           # Approve PR
husky pr request-changes <pr-number> --comment "..."
husky pr merge <pr-number>             # Merge PR
husky pr close <pr-number>             # Close PR
```

### Infrastructure (DevOps)

```bash
husky infra status                     # Overall infra status
husky infra vms                        # List all VMs
husky infra services                   # Cloud Run services
husky infra logs <service>             # Service logs
husky infra metrics                    # Resource metrics
```

### YouTube Summarization

```bash
husky youtube <url>                    # Summarize video with Gemini AI
husky youtube <url> --remember         # Also store in Second Brain
husky youtube <url> --json             # JSON output
```

### Image Generation

```bash
husky image "a futuristic city"        # Generate image with Imagen 3
husky image "..." --output ./image.png # Save to file
husky image "..." --aspect 16:9        # Aspect ratio
```

### Mermaid Diagrams

```bash
husky mermaid validate <file>          # Validate Mermaid syntax
husky mermaid validate --stdin         # Validate from stdin
```

### Service Accounts

```bash
husky sa list                          # List service accounts
husky sa create <name> --role worker   # Create service account
husky sa get <id>                      # Get details
husky sa delete <id>                   # Delete service account
```

### Agent Messaging

```bash
husky agent-msg send <to> "message"    # Send to another agent
husky agent-msg inbox                  # Check inbox
husky agent-msg read <id>              # Read message
```

### Preview Deployments

```bash
husky preview list                     # List PR previews
husky preview get <pr-number>          # Get preview URL
husky preview logs <pr-number>         # Preview logs
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

### Chat / Messaging

```bash
# Check pending messages
husky chat pending
husky chat pending --json

# View inbox (GitHub + Google Chat)
husky chat inbox
husky chat inbox --unread

# Reply to any message (auto-detects platform)
husky chat reply-to <messageId> "Your response"

# Reply in Google Chat thread
husky chat reply-chat "Message" --thread <threadName>

# Mark message as read
husky chat mark-read <messageId>

# Watch for messages (inject into tmux)
husky chat watch-inject --tmux-session supervisor
```

The `reply-to` command automatically detects whether the message is from GitHub or Google Chat and uses the appropriate API to send the reply.

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

### Authentication (Session Tokens)

Session tokens provide short-lived JWT authentication for agents. They are created using `HUSKY_API_KEY` and auto-refresh when expired.

```bash
# Login (creates 1-hour session token)
husky auth login --agent supervisor
husky auth login --agent husky-worker-1

# Check session status
husky auth session
husky auth session --json

# Refresh token manually
husky auth refresh
husky auth refresh --agent supervisor

# Logout (clear session)
husky auth logout
```

**VM Startup Pattern:**
```bash
#!/bin/bash
VM_NAME=$(hostname)
husky auth login --agent "$VM_NAME"
# All subsequent commands use Bearer token
```

**How it works:**
1. `HUSKY_API_KEY` is used once to create a session token
2. All subsequent API calls use `Authorization: Bearer <token>`
3. Token auto-refreshes when expired or within 5 minutes of expiry
4. Falls back to `x-api-key` if refresh fails

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

### v1.12.0 (2026-01-12) - Session Token Authentication

**New Features:**
- `husky auth login --agent <name>` - Create session token from HUSKY_API_KEY
- `husky auth logout` - Clear session token
- `husky auth session` - Show session status (agent, role, expiry)
- `husky auth refresh` - Manually refresh token

**Improvements:**
- All API calls now use Bearer token authentication (auto-refresh)
- Token auto-refreshes when expired or within 5 minutes of expiry
- Falls back to x-api-key for backwards compatibility
- JWT_SECRET now required in production (fail-fast)

**Documentation:**
- Added missing command sections: pr, infra, youtube, image, mermaid, sa, agent-msg, preview
- Updated architecture docs with session token flow

**Code Quality:**
- Removed `as any` type suppression in sop.ts

### v1.7.0 (2026-01-11) - E2E Agent Production Ready

**New Features:**
- `husky e2e inbox` - List E2E test requests from API
- `husky e2e watch` - Watch for and auto-process E2E requests
- `husky e2e run --secret` - Inject secrets from GCP Secret Manager
- `husky e2e run --env` - Set environment variables for tests
- `husky e2e run --retries` - Retry failed tests automatically

**Improvements:**
- All artifact URLs now use HTTPS
- Better error handling in E2E commands
- Updated permissions for e2e_agent role

### v1.1.0 (2026-01-09) - Unified Reply System

**New Features:**
- `husky chat reply-to` now supports both GitHub and Google Chat
- Auto-detects platform from message metadata
- GitHub replies use GitHub App (no PAT required on VM)

**Improvements:**
- Require 8+ character prefix for messageId matching (prevents misdirected replies)
- Better error messages for short messageId prefixes

### v1.0.0 (2026-01-08) - Supervisor Architecture

**BREAKING CHANGES:**
- Removed: `husky jules` commands (replaced by supervisor architecture)
- Removed: `husky services` commands (deprecated)
- Removed: VM Pool management (now automated by supervisor)
- Deprecated: `husky agent` commands (use `husky task` instead)

**New Features:**
- Added: `husky chat` command for supervisor communication
- Added: Project resolver to prevent orphaned tasks
- Added: Implementation plans via `husky task plan`
- Added: QA review pipeline support

**Improvements:**
- Version now read dynamically from package.json
- Simplified task workflow
- Scope-based API key system support

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
