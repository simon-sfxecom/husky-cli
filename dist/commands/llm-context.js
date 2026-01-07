/**
 * LLM Context Generator
 * Outputs markdown reference for LLM agents
 */
const VERSION = "0.9.4";
export function generateLLMContext() {
    return `# Husky CLI Reference (v${VERSION})

> [!CAUTION]
> ## MANDATORY: You MUST Use Husky CLI
> 
> As an AI agent working in this environment, you are **REQUIRED** to use the Husky CLI for all business operations and task management.
> 
> **DO NOT:**
> - Make direct API calls to Billbee, Zendesk, or other services
> - Bypass Husky CLI for task management
> - Create custom integrations when Husky commands exist
> 
> **ALWAYS:**
> - Use \`husky biz\` commands for business operations
> - Use \`husky task\` commands for task lifecycle
> - Use \`husky worktree\` for Git isolation
> - Check \`husky config test\` before operations

---

## What is Husky?

Husky is the **central orchestration layer** for AI agents. It provides:
- **Dashboard API** - Task management, projects, roadmaps
- **Billbee** - E-commerce orders and products
- **Zendesk** - Customer support tickets
- **SeaTable** - Supply chain and inventory
- **Qdrant** - Vector database for semantic search
- **Vertex AI** - Embeddings for similarity search

---

## Configuration

\`\`\`bash
husky config set api-url <dashboard-url>
husky config set api-key <key>
husky config list
husky config test
\`\`\`

---

## Core Commands

### Tasks
\`\`\`bash
husky task list [--status <status>]     # List tasks
husky task get <id>                     # Get task details
husky task create                       # Create new task
husky task start <id>                   # Start working on task
husky task done <id> [--pr <url>]       # Mark task as done
husky task update <id>                  # Update task fields
\`\`\`

### Projects
\`\`\`bash
husky project list                      # List projects
husky project get <id>                  # Get project details
husky project create                    # Create new project
\`\`\`

### Worktrees (Git)
\`\`\`bash
husky worktree list                     # List worktrees
husky worktree create <name>            # Create isolated worktree
husky worktree delete <name>            # Delete worktree
\`\`\`

---

## Business Operations (husky biz)

### Tickets (Zendesk)
\`\`\`bash
husky biz tickets list                  # List recent tickets
husky biz tickets get <id>              # Get ticket details
husky biz tickets search "<query>"      # Search tickets
husky biz tickets reply <id> "<msg>"    # Reply to ticket
husky biz tickets note <id> "<note>"    # Add internal note
husky biz tickets close <id>            # Close ticket

# Prebuild (Semantic Search)
husky biz tickets similar <id>          # Find similar tickets
husky biz tickets find-similar "<q>"    # Semantic ticket search
husky biz tickets knowledge "<query>"   # Search resolved tickets
\`\`\`

### Orders (Billbee)
\`\`\`bash
husky biz orders list                   # List orders
husky biz orders get <id>               # Get order details
husky biz orders search "<query>"       # Search orders
\`\`\`

### Products (Billbee)
\`\`\`bash
husky biz products list                 # List products
husky biz products get <id>             # Get product details
husky biz products sku <sku>            # Get by SKU
\`\`\`

### Customers
\`\`\`bash
husky biz customers search <email>      # Search by email
husky biz customers orders <email>      # Get order history
husky biz customers 360 <email>         # Full customer view (Billbee + Zendesk)
\`\`\`

### SeaTable (Supply Chain)
\`\`\`bash
husky biz seatable tables               # List tables
husky biz seatable rows <table>         # List rows
husky biz seatable find-supplier "<q>"  # Search suppliers
husky biz seatable order-status <no>    # Get order status
husky biz seatable stock-check <sku>    # Check stock levels
\`\`\`

### Qdrant (Vector DB)
\`\`\`bash
husky biz qdrant collections            # List collections
husky biz qdrant info <name>            # Collection info
husky biz qdrant count <name>           # Count points
husky biz qdrant search <coll> "<q>"    # Semantic search
\`\`\`

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`HUSKY_ENV\` | Environment prefix (PROD/SANDBOX) |
| \`PROD_BILLBEE_API_KEY\` | Billbee API key |
| \`PROD_ZENDESK_API_TOKEN\` | Zendesk token |
| \`PROD_SEATABLE_API_TOKEN\` | SeaTable token |
| \`PROD_QDRANT_URL\` | Qdrant URL |
| \`PROD_QDRANT_API_KEY\` | Qdrant API key |

---

## Usage Tips for LLM Agents

1. **Always use \`--json\` flag** when available for structured output
2. **Check config first**: \`husky config test\` before API calls
3. **Use prebuild commands** for complex workflows (e.g., \`tickets similar\`)
4. **Customer 360** combines Billbee + Zendesk data in one call
5. **Semantic search** requires Qdrant and Vertex AI configured
`;
}
export function printLLMContext() {
    console.log(generateLLMContext());
}
// Command export for subcommand registration
import { Command } from "commander";
export const llmCommand = new Command("llm")
    .description("Output LLM reference documentation (markdown)")
    .action(() => {
    printLLMContext();
});
