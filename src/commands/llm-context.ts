import { createRequire } from "module";
import { getConfig, isSessionActive } from "./config.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json");

// Permission check helper (simplified - checks prefix match)
function hasPermission(permissions: string[], required: string): boolean {
    if (permissions.includes("*")) return true;
    if (permissions.includes(required)) return true;
    const [scope] = required.split(":");
    if (permissions.includes(`${scope}:*`)) return true;
    return false;
}

// Section generators
function getHeader(role: string): string {
    return `# Husky CLI Reference (v${packageJson.version})

> **Your Role:** \`${role}\`

> [!CAUTION]
> ## MANDATORY: You MUST Use Husky CLI
>
> As an AI agent working in this environment, you are **REQUIRED** to use the Husky CLI for all operations.
>
> **DO NOT:**
> - Make direct API calls to external services
> - Bypass Husky CLI for task management
>
> **ALWAYS:**
> - Check \`husky config test\` before operations
> - Use the commands listed below for your role

---

## Configuration

\`\`\`bash
husky config list                       # Show current config
husky config test                       # Verify API connection
husky auth session                      # Check session status
husky auth permissions                  # Show your permissions
\`\`\`
`;
}

function getTaskSection(permissions: string[]): string {
    const canCreate = hasPermission(permissions, "task:create");
    const canStart = hasPermission(permissions, "task:start");
    const canDone = hasPermission(permissions, "task:done");
    const canComplete = hasPermission(permissions, "task:complete");

    let section = `
---

## Tasks

\`\`\`bash
husky task list [--status <status>]     # List tasks
husky task get <id>                     # Get task details
husky task message <id> "msg"           # Post status message
`;

    if (canCreate) {
        section += `husky task create                       # Create new task
`;
    }
    if (canStart) {
        section += `husky task start <id>                   # Start task (auto-creates worktree!)
`;
    }
    if (canDone || canComplete) {
        section += `husky task done <id> [--pr <url>]       # Mark task as done
`;
    }

    section += `\`\`\`
`;
    return section;
}

function getWorktreeSection(): string {
    return `
---

## Worktrees (Git Isolation)

\`\`\`bash
husky worktree list                     # List worktrees
husky worktree create <name>            # Create isolated worktree
husky worktree create <name> --task-id <id>  # Create and register with task
husky worktree merge <name>             # Merge back to base branch
husky worktree push <name>              # Push branch to remote
husky worktree pr <name> -t "Title"     # Create pull request
husky worktree remove <name>            # Remove worktree
\`\`\`
`;
}

function getPRSection(): string {
    return `
---

## Pull Requests

\`\`\`bash
husky worktree pr <name> -t "Title"     # Create PR from worktree
husky worktree push <name>              # Push branch to remote
husky worktree merge <name>             # Merge back to base
\`\`\`
`;
}

function getBizSection(permissions: string[]): string {
    const hasBizAll = hasPermission(permissions, "biz:*");
    const hasBizRead = hasPermission(permissions, "biz:read");
    const hasTickets = hasBizAll || hasPermission(permissions, "biz:tickets");
    const hasOrders = hasBizAll || hasPermission(permissions, "biz:orders");
    const hasProducts = hasBizAll || hasPermission(permissions, "biz:products");

    let section = `
---

## Business Operations (husky biz)
`;

    if (hasTickets) {
        section += `
### Tickets (Zendesk)
\`\`\`bash
husky biz tickets list                  # List recent tickets
husky biz tickets get <id>              # Get ticket details
husky biz tickets search "<query>"      # Search tickets
`;
        if (hasBizAll) {
            section += `husky biz tickets reply <id> "<msg>"    # Reply to ticket
husky biz tickets note <id> "<note>"    # Add internal note
husky biz tickets close <id>            # Close ticket
`;
        }
        section += `husky biz tickets similar <id>          # Find similar tickets
husky biz tickets knowledge "<query>"   # Search resolved tickets
\`\`\`
`;
    }

    if (hasOrders || hasBizRead) {
        section += `
### Orders (Billbee)
\`\`\`bash
husky biz orders list                   # List orders
husky biz orders get <id>               # Get order details
husky biz orders search "<query>"       # Search orders
\`\`\`
`;
    }

    if (hasProducts || hasBizRead) {
        section += `
### Products (Billbee)
\`\`\`bash
husky biz products list                 # List products
husky biz products get <id>             # Get product details
husky biz products sku <sku>            # Get by SKU
\`\`\`
`;
    }

    if (hasBizAll || hasBizRead) {
        section += `
### Customers
\`\`\`bash
husky biz customers search <email>      # Search by email
husky biz customers orders <email>      # Get order history
husky biz customers 360 <email>         # Full customer view (Billbee + Zendesk)
\`\`\`

### SeaTable (Supply Chain)
\`\`\`bash
husky biz seatable tables               # List tables
husky biz seatable find-supplier "<q>"  # Search suppliers
husky biz seatable stock-check <sku>    # Check stock levels
\`\`\`
`;
    }

    return section;
}

function getWorkflowSection(): string {
    return `
---

## Workflows & Processes

Diese Dokumentation hilft dir, Geschaeftsprozesse zu verstehen (z.B. Warenfluss, Bestellprozess).

\`\`\`bash
husky workflow list                     # List workflows
husky workflow get <id>                 # Get workflow details (inkl. Mermaid diagram)

husky process list                      # List processes/SOPs
husky process get <id>                  # Get process details
\`\`\`
`;
}

function getRoadmapSection(canWrite: boolean): string {
    let section = `
---

## Roadmaps

\`\`\`bash
husky roadmap list                      # List roadmaps
husky roadmap get <id>                  # Get roadmap details
husky roadmap milestones <id>           # List milestones
`;
    if (canWrite) {
        section += `husky roadmap create                    # Create new roadmap
husky roadmap add-milestone <id>        # Add milestone
`;
    }
    section += `\`\`\`
`;
    return section;
}

function getProjectSection(): string {
    return `
---

## Projects

\`\`\`bash
husky project list                      # List projects
husky project get <id>                  # Get project details
husky project tasks <id>                # List project tasks
\`\`\`
`;
}

function getChatSection(permissions: string[]): string {
    const canReply = hasPermission(permissions, "chat:reply") || hasPermission(permissions, "chat:*");

    let section = `
---

## Chat (Google Chat Integration)

\`\`\`bash
husky chat inbox                        # Get messages
husky chat inbox --unread               # Only unread messages
husky chat pending                      # Get pending messages
`;
    if (canReply) {
        section += `husky chat reply-chat --space <id> "msg" # Send message
husky chat send "<message>"             # Send as supervisor
husky chat review "<question>"          # Request human review
\`\`\`
`;
    } else {
        section += `\`\`\`
`;
    }
    return section;
}

function getDeploySection(): string {
    return `
---

## Deployment

\`\`\`bash
husky deploy sandbox                    # Deploy to sandbox environment
\`\`\`
`;
}

function getBrainSection(role: string): string {
    return `
---

## Agent Brain (Lernender Agent)

> [!IMPORTANT]
> **MANDATORY WORKFLOW**
>
> 1. **VOR der Arbeit**: \`husky brain recall\` - Pruefe ob aehnliches Problem bereits geloest wurde
> 2. **NACH der Arbeit**: \`husky brain remember\` - Speichere neue Erkenntnisse

Dein Brain-Typ: \`${role}\`

\`\`\`bash
# Wissen abrufen
husky brain recall "suchbegriff"        # Semantic Search
husky brain recall "problem" --limit 10 # Mehr Ergebnisse

# Wissen speichern
husky brain remember "Loesung..." --tags "tag1,tag2"

# Weitere Commands
husky brain list                        # Alle eigenen Memories
husky brain tags "tag1,tag2"            # Nach Tags suchen
husky brain stats                       # Statistiken
\`\`\`
`;
}

function getSessionSection(): string {
    return `
---

## Session Logging (Self-Improving System)

> [!NOTE]
> Sessions werden automatisch geloggt und bei VM-Shutdown exportiert.
> Analysierte Sessions ermoeglichen semantische Suche nach aehnlichen Problemen/Loesungen.

\`\`\`bash
# Session Management
husky session current                   # Zeigt aktuelle Session
husky session list --limit 10           # Sessions auflisten
husky session log --tool "Bash" ...     # Tool-Call loggen (via Hook)
husky session export --to-firestore     # Logs exportieren

# Analyse & Embeddings
husky session analyze                   # Analyse triggern (async)
husky session embed                     # Embeddings generieren
husky session summary                   # Analyse-Summary anzeigen

# Semantische Suche (mit Vector Embeddings)
husky session search "trigger fehler"   # Nach aehnlichen Problemen suchen
husky session search "RLS" --type errors      # Nur Fehler
husky session search "fix" --type learnings   # Nur Learnings
\`\`\`

### Insights (Aggregierte Analytics)
\`\`\`bash
husky insights errors --since 7d        # Fehler der letzten 7 Tage
husky insights learnings --since 7d     # Learnings anzeigen
husky insights stats --since 7d         # Aggregierte Statistiken
\`\`\`
`;
}

function getVMSection(): string {
    return `
---

## VM Sessions (Cloud Agents)

\`\`\`bash
husky vm list                           # List VM sessions
husky vm create                         # Create new VM
husky vm status <id>                    # Get VM status
husky vm ssh <id>                       # SSH into VM
husky vm delete <id>                    # Delete VM
\`\`\`
`;
}

function getWorkerSection(): string {
    return `
---

## Workers (Multi-Agent Coordination)

\`\`\`bash
husky worker whoami                     # Show current worker identity
husky worker list                       # List all workers
husky worker activity                   # Who is working on what
\`\`\`
`;
}

function getAgentMsgSection(): string {
    return `
---

## Agent Messaging

\`\`\`bash
husky agent-msg send --type <type> --title "<title>"
husky agent-msg list                    # List messages
husky agent-msg pending                 # Pending messages
husky agent-msg respond <id> --approve  # Approve request
husky agent-msg wait <id>               # Wait for response
\`\`\`
`;
}

function getAdminSection(): string {
    return `
---

## Admin Commands

\`\`\`bash
husky settings list                     # List dashboard settings
husky settings set <key> <value>        # Update setting
husky auth keys                         # List API keys
husky auth create-key --name <n> --role <r>  # Create API key
\`\`\`
`;
}

function getTips(): string {
    return `
---

## Tips

1. **Immer \`--json\` flag** verwenden fuer strukturierten Output
2. **Config testen**: \`husky config test\` vor API calls
3. **Brain nutzen**: Vor jeder Aufgabe \`husky brain recall\`
`;
}

// Role-based context generation
export function generateLLMContext(role?: string, permissions?: string[]): string {
    // Use provided values or try to get from config
    const config = getConfig();
    const effectiveRole = role || config.sessionRole || config.role || "worker";
    const effectivePermissions = permissions || config.permissions || [];

    let context = getHeader(effectiveRole);

    // Task section - always included (all roles have task:read)
    context += getTaskSection(effectivePermissions);

    // Worktree section - for workers and pr_agent
    if (hasPermission(effectivePermissions, "worktree:*") ||
        hasPermission(effectivePermissions, "pr:create")) {
        context += getWorktreeSection();
    }

    // PR section - for pr_agent
    if (hasPermission(effectivePermissions, "pr:create") ||
        hasPermission(effectivePermissions, "pr:merge")) {
        context += getPRSection();
    }

    // Business operations - for support, purchasing, ops, workers with biz:read
    if (hasPermission(effectivePermissions, "biz:*") ||
        hasPermission(effectivePermissions, "biz:read") ||
        hasPermission(effectivePermissions, "biz:tickets") ||
        hasPermission(effectivePermissions, "biz:orders")) {
        context += getBizSection(effectivePermissions);
    }

    // Workflows & Processes - for anyone with workflow:read or process:read
    if (hasPermission(effectivePermissions, "workflow:read") ||
        hasPermission(effectivePermissions, "workflow:*") ||
        hasPermission(effectivePermissions, "process:read") ||
        hasPermission(effectivePermissions, "process:*")) {
        context += getWorkflowSection();
    }

    // Roadmaps - for workers, supervisors
    if (hasPermission(effectivePermissions, "roadmap:read") ||
        hasPermission(effectivePermissions, "roadmap:*")) {
        const canWrite = hasPermission(effectivePermissions, "roadmap:*");
        context += getRoadmapSection(canWrite);
    }

    // Projects - for workers
    if (hasPermission(effectivePermissions, "project:read") ||
        hasPermission(effectivePermissions, "project:*")) {
        context += getProjectSection();
    }

    // Chat - for support, supervisor
    if (hasPermission(effectivePermissions, "chat:read") ||
        hasPermission(effectivePermissions, "chat:reply") ||
        hasPermission(effectivePermissions, "chat:*")) {
        context += getChatSection(effectivePermissions);
    }

    // Deploy - for e2e_agent
    if (hasPermission(effectivePermissions, "deploy:sandbox") ||
        hasPermission(effectivePermissions, "deploy:*")) {
        context += getDeploySection();
    }

    // VM management - for supervisor, admin
    if (hasPermission(effectivePermissions, "vm:*")) {
        context += getVMSection();
    }

    // Worker coordination - for supervisor
    if (hasPermission(effectivePermissions, "worker:*")) {
        context += getWorkerSection();
        context += getAgentMsgSection();
    }

    // Admin section
    if (hasPermission(effectivePermissions, "admin:*") ||
        hasPermission(effectivePermissions, "settings:*")) {
        context += getAdminSection();
    }

    // Brain - always included
    context += getBrainSection(effectiveRole);

    // Session Logging - always included
    context += getSessionSection();

    // Tips - always included
    context += getTips();

    return context;
}

export async function printLLMContext(): Promise<void> {
    // Try to fetch permissions if we have a session
    const config = getConfig();
    let permissions: string[] = [];
    let role = config.sessionRole || config.role || "worker";

    if (isSessionActive() && config.apiUrl && config.apiKey) {
        try {
            const { getPermissions } = await import("../lib/permissions-cache.js");
            const perms = await getPermissions();
            permissions = perms.permissions;
            role = perms.role;
        } catch {
            // Use defaults if fetch fails
            permissions = config.permissions || [];
        }
    } else {
        permissions = config.permissions || [];
    }

    console.log(generateLLMContext(role, permissions));
}

// Command export for subcommand registration
import { Command } from "commander";
export const llmCommand = new Command("llm")
    .description("Output LLM reference documentation (role-based)")
    .option("--full", "Show full documentation (all commands)")
    .action(async (options) => {
        if (options.full) {
            // Show everything - use admin permissions
            console.log(generateLLMContext("admin", ["*"]));
        } else {
            await printLLMContext();
        }
    });
