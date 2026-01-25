/**
 * Husky Diagrams Command
 *
 * Generate and manage AI-powered code visualization diagrams (Mermaid)
 */

import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "../lib/api-client.js";

interface Diagram {
  id: string;
  repoUrl: string;
  projectId?: string;
  type: "flowchart" | "sequence" | "class" | "architecture";
  title: string;
  mermaidCode: string;
  description?: string;
  gitCommitSha?: string;
  generatedBy: "cli" | "github_action" | "manual";
  createdAt: string;
  updatedAt: string;
}

interface ValidationResult {
  valid: boolean;
  diagramType: string | null;
  errors: string[];
  warnings: string[];
}

// Mermaid diagram type patterns
const DIAGRAM_PATTERNS = [
  { name: "flowchart", pattern: /^(flowchart|graph)\s+(TB|BT|LR|RL|TD)/i },
  { name: "sequenceDiagram", pattern: /^sequenceDiagram/i },
  { name: "classDiagram", pattern: /^classDiagram/i },
  { name: "stateDiagram", pattern: /^stateDiagram(-v2)?/i },
];

/**
 * Validate Mermaid diagram syntax
 */
function validateMermaid(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let diagramType: string | null = null;

  const lines = code.trim().split("\n").map((l) => l.trim());
  const cleanCode = lines.join("\n");

  if (!cleanCode) {
    return { valid: false, diagramType: null, errors: ["Empty diagram"], warnings: [] };
  }

  for (const type of DIAGRAM_PATTERNS) {
    if (type.pattern.test(cleanCode)) {
      diagramType = type.name;
      break;
    }
  }

  if (!diagramType) {
    errors.push("Unknown diagram type");
  }

  // Check bracket balance
  const brackets: Record<string, number> = { "[": 0, "{": 0, "(": 0 };
  for (const char of cleanCode) {
    if (char === "[") brackets["["]++;
    else if (char === "]") brackets["["]--;
    else if (char === "{") brackets["{"]++;
    else if (char === "}") brackets["{"]--;
    else if (char === "(") brackets["("]++;
    else if (char === ")") brackets["("]--;
  }

  for (const [bracket, count] of Object.entries(brackets)) {
    if (count !== 0) {
      errors.push(`Unbalanced brackets: ${bracket}`);
    }
  }

  // Check subgraph balance
  const subgraphCount = (cleanCode.match(/\bsubgraph\b/gi) || []).length;
  const endCount = (cleanCode.match(/^\s*end\s*$/gim) || []).length;
  if (subgraphCount > endCount) {
    errors.push(`Missing 'end' for subgraph`);
  }

  return { valid: errors.length === 0, diagramType, errors, warnings };
}

// AI Prompts for diagram generation
const DIAGRAM_PROMPTS: Record<string, string> = {
  flowchart: `Analyze this codebase and create a Mermaid flowchart showing:
- Main entry points and their execution flow
- Key decision points and branches
- Integration with external services
- Error handling paths

Focus on the high-level architecture, not implementation details.
Output ONLY valid Mermaid flowchart code starting with "flowchart TD".
Do not include any explanation or markdown code blocks.`,

  sequence: `Analyze this codebase and create a Mermaid sequence diagram showing:
- Key user interactions and their flow through the system
- API request/response patterns
- Service-to-service communication
- Database interactions

Include the most common/important flows only.
Output ONLY valid Mermaid sequence diagram code starting with "sequenceDiagram".
Do not include any explanation or markdown code blocks.`,

  class: `Analyze this codebase and create a Mermaid class diagram showing:
- Main entities/models and their relationships
- Key interfaces and their implementations
- Important inheritance hierarchies
- Composition relationships

Focus on domain models and core abstractions.
Output ONLY valid Mermaid class diagram code starting with "classDiagram".
Do not include any explanation or markdown code blocks.`,

  architecture: `Analyze this codebase and create a Mermaid architecture diagram showing:
- System components and their boundaries
- External dependencies (databases, APIs, services)
- Data flow between components
- Deployment topology

Use subgraphs to group related components.
Output ONLY valid Mermaid flowchart code with subgraphs starting with "flowchart TB".
Do not include any explanation or markdown code blocks.`,
};

export const diagramsCommand = new Command("diagrams").description(
  "Generate and manage AI-powered code visualization diagrams"
);

// husky diagrams list
diagramsCommand
  .command("list")
  .description("List diagrams")
  .option("--repo <url>", "Filter by repository URL")
  .option("--type <type>", "Filter by type (flowchart, sequence, class, architecture)")
  .option("--json", "Output as JSON")
  .action(async (options: { repo?: string; type?: string; json?: boolean }) => {
    try {
      const api = getApiClient();
      const params = new URLSearchParams();
      if (options.repo) params.set("repoUrl", options.repo);
      if (options.type) params.set("type", options.type);

      const response = await api.get<{ diagrams: Diagram[] }>(
        `/api/diagrams?${params.toString()}`
      );

      if (options.json) {
        console.log(JSON.stringify(response.diagrams, null, 2));
        return;
      }

      if (response.diagrams.length === 0) {
        console.log(chalk.yellow("No diagrams found"));
        return;
      }

      console.log(chalk.bold(`\nDiagrams (${response.diagrams.length}):\n`));
      for (const diagram of response.diagrams) {
        const typeColor =
          diagram.type === "flowchart"
            ? chalk.blue
            : diagram.type === "sequence"
              ? chalk.magenta
              : diagram.type === "class"
                ? chalk.green
                : chalk.yellow;

        console.log(`  ${chalk.bold(diagram.title)}`);
        console.log(`    ID: ${diagram.id}`);
        console.log(`    Type: ${typeColor(diagram.type)}`);
        console.log(`    Repo: ${diagram.repoUrl}`);
        console.log(`    Updated: ${new Date(diagram.updatedAt).toLocaleString()}`);
        console.log();
      }
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky diagrams get <id>
diagramsCommand
  .command("get <id>")
  .description("Get a specific diagram")
  .option("--json", "Output as JSON")
  .option("--code", "Output only the Mermaid code")
  .action(async (id: string, options: { json?: boolean; code?: boolean }) => {
    try {
      const api = getApiClient();
      const diagram = await api.get<Diagram>(`/api/diagrams/${id}`);

      if (options.code) {
        console.log(diagram.mermaidCode);
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(diagram, null, 2));
        return;
      }

      console.log(chalk.bold(`\n${diagram.title}\n`));
      console.log(`Type: ${diagram.type}`);
      console.log(`Repo: ${diagram.repoUrl}`);
      if (diagram.description) console.log(`Description: ${diagram.description}`);
      if (diagram.gitCommitSha) console.log(`Commit: ${diagram.gitCommitSha}`);
      console.log(`Generated by: ${diagram.generatedBy}`);
      console.log();
      console.log(chalk.dim("Mermaid Code:"));
      console.log(chalk.cyan(diagram.mermaidCode));
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky diagrams validate <file-or-code>
diagramsCommand
  .command("validate <input>")
  .description("Validate Mermaid diagram syntax")
  .option("--json", "Output as JSON")
  .action(async (input: string, options: { json?: boolean }) => {
    try {
      const { readFileSync, existsSync } = await import("fs");

      let code: string;
      if (existsSync(input)) {
        code = readFileSync(input, "utf-8");
      } else {
        code = input;
      }

      const result = validateMermaid(code);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
      }

      if (result.diagramType) {
        console.log(`Diagram type: ${result.diagramType}`);
      }

      if (result.errors.length > 0) {
        console.log(chalk.red("\nErrors:"));
        for (const err of result.errors) {
          console.log(`  - ${err}`);
        }
      }

      if (result.warnings.length > 0) {
        console.log(chalk.yellow("\nWarnings:"));
        for (const warn of result.warnings) {
          console.log(`  - ${warn}`);
        }
      }

      if (result.valid) {
        console.log(chalk.green("\nDiagram syntax is valid"));
      } else {
        console.log(chalk.red("\nDiagram has syntax errors"));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky diagrams generate
diagramsCommand
  .command("generate")
  .description("Generate diagrams for a codebase using AI")
  .option("--repo <url>", "Repository URL (required for upload)")
  .option("--path <path>", "Local path to analyze", ".")
  .option("--types <types>", "Diagram types (comma-separated)", "flowchart,architecture")
  .option("--commit <sha>", "Git commit SHA")
  .option("--upload", "Upload to Husky API")
  .option("--json", "Output as JSON")
  .action(
    async (options: {
      repo?: string;
      path: string;
      types: string;
      commit?: string;
      upload?: boolean;
      json?: boolean;
    }) => {
      try {
        const { readdirSync, readFileSync } = await import("fs");
        const { join, relative } = await import("path");

        const types = options.types.split(",").map((t) => t.trim());

        // Collect codebase summary
        console.log(chalk.blue("Analyzing codebase..."));

        const collectFiles = (dir: string, files: string[] = []): string[] => {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              if (!["node_modules", ".git", "dist", ".next", "coverage"].includes(entry.name)) {
                collectFiles(fullPath, files);
              }
            } else if (entry.isFile() && /\.(ts|tsx|js|jsx|py|go|rs)$/.test(entry.name)) {
              files.push(fullPath);
            }
          }
          return files;
        };

        const files = collectFiles(options.path);
        console.log(`Found ${files.length} source files`);

        // Generate diagrams
        const results: Array<{ type: string; title: string; mermaidCode: string; valid: boolean }> = [];

        for (const type of types) {
          if (!DIAGRAM_PROMPTS[type]) {
            console.log(chalk.yellow(`Unknown diagram type: ${type}, skipping`));
            continue;
          }

          console.log(chalk.blue(`Generating ${type} diagram...`));

          // For now, create a placeholder diagram
          // In production, this would call the Anthropic API
          const mermaidCode = generatePlaceholderDiagram(type);

          const validation = validateMermaid(mermaidCode);
          results.push({
            type,
            title: `${type.charAt(0).toUpperCase() + type.slice(1)} Diagram`,
            mermaidCode,
            valid: validation.valid,
          });

          if (validation.valid) {
            console.log(chalk.green(`  ${type}: Valid`));
          } else {
            console.log(chalk.yellow(`  ${type}: ${validation.errors.join(", ")}`));
          }
        }

        // Upload if requested
        if (options.upload && options.repo) {
          console.log(chalk.blue("\nUploading to Husky API..."));
          const api = getApiClient();

          const diagrams = results
            .filter((r) => r.valid)
            .map((r) => ({
              repoUrl: options.repo,
              type: r.type,
              title: r.title,
              mermaidCode: r.mermaidCode,
              gitCommitSha: options.commit,
              generatedBy: "cli" as const,
            }));

          if (diagrams.length > 0) {
            const response = await api.post<{ success: boolean; created: number }>(
              `/api/diagrams/batch`,
              { diagrams }
            );
            console.log(chalk.green(`Uploaded ${response.created} diagrams`));
          }
        }

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(chalk.bold(`\nGenerated ${results.length} diagrams`));
          for (const result of results) {
            console.log(`  ${result.valid ? chalk.green("✓") : chalk.red("✗")} ${result.type}`);
          }
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  );

// Helper function to generate placeholder diagrams
function generatePlaceholderDiagram(type: string): string {
  switch (type) {
    case "flowchart":
      return `flowchart TD
    A[Start] --> B{Check Input}
    B -->|Valid| C[Process]
    B -->|Invalid| D[Error Handler]
    C --> E[Output]
    D --> E
    E --> F[End]`;

    case "sequence":
      return `sequenceDiagram
    participant User
    participant API
    participant DB
    User->>API: Request
    API->>DB: Query
    DB-->>API: Result
    API-->>User: Response`;

    case "class":
      return `classDiagram
    class Application {
        +start()
        +stop()
    }
    class Service {
        +process()
    }
    Application --> Service`;

    case "architecture":
      return `flowchart TB
    subgraph Frontend
        A[Web App]
    end
    subgraph Backend
        B[API Server]
        C[Database]
    end
    A --> B
    B --> C`;

    default:
      return `flowchart TD
    A[Start] --> B[End]`;
  }
}

export default diagramsCommand;
