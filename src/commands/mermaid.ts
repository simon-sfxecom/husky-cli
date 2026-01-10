/**
 * Husky Mermaid Command
 *
 * Validates Mermaid diagram syntax to catch common AI mistakes
 * (missing brackets, invalid keywords, etc.)
 */

import { Command } from "commander";
import { readFileSync, existsSync } from "fs";

// Mermaid diagram type patterns
const DIAGRAM_TYPES = [
  { name: "flowchart", pattern: /^(flowchart|graph)\s+(TB|BT|LR|RL|TD)/i },
  { name: "sequenceDiagram", pattern: /^sequenceDiagram/i },
  { name: "classDiagram", pattern: /^classDiagram/i },
  { name: "stateDiagram", pattern: /^stateDiagram(-v2)?/i },
  { name: "erDiagram", pattern: /^erDiagram/i },
  { name: "gantt", pattern: /^gantt/i },
  { name: "pie", pattern: /^pie/i },
  { name: "gitGraph", pattern: /^gitGraph/i },
  { name: "mindmap", pattern: /^mindmap/i },
  { name: "timeline", pattern: /^timeline/i },
  { name: "journey", pattern: /^journey/i },
];

interface ValidationResult {
  valid: boolean;
  diagramType: string | null;
  errors: string[];
  warnings: string[];
}

/**
 * Validate Mermaid diagram syntax
 */
function validateMermaid(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let diagramType: string | null = null;

  // Clean up code
  const lines = code.trim().split("\n").map(l => l.trim());
  const cleanCode = lines.join("\n");

  // Check for empty input
  if (!cleanCode) {
    return { valid: false, diagramType: null, errors: ["Empty diagram"], warnings: [] };
  }

  // Detect diagram type
  for (const type of DIAGRAM_TYPES) {
    if (type.pattern.test(cleanCode)) {
      diagramType = type.name;
      break;
    }
  }

  if (!diagramType) {
    errors.push(`Unknown diagram type. First line should be one of: flowchart, sequenceDiagram, classDiagram, etc.`);
    errors.push(`Got: "${lines[0].substring(0, 50)}..."`);
  }

  // Check bracket balance
  const brackets = { "[": 0, "{": 0, "(": 0, "<": 0 };
  const bracketPairs: Record<string, string> = { "[": "]", "{": "}", "(": ")", "<": ">" };

  for (let i = 0; i < cleanCode.length; i++) {
    const char = cleanCode[i];
    if (char in brackets) {
      brackets[char as keyof typeof brackets]++;
    } else if (char === "]") {
      brackets["["]--;
    } else if (char === "}") {
      brackets["{"]--;
    } else if (char === ")") {
      brackets["("]--;
    } else if (char === ">") {
      // Only count > if it's not part of an arrow
      const prev = cleanCode[i - 1];
      if (prev !== "-" && prev !== "=") {
        brackets["<"]--;
      }
    }
  }

  for (const [open, count] of Object.entries(brackets)) {
    if (count > 0) {
      errors.push(`Unmatched '${open}' - missing ${count} closing '${bracketPairs[open]}'`);
    } else if (count < 0) {
      errors.push(`Unmatched '${bracketPairs[open]}' - ${Math.abs(count)} extra closing bracket(s)`);
    }
  }

  // Check for common syntax issues based on diagram type
  if (diagramType === "flowchart" || diagramType?.startsWith("graph")) {
    // Check node definitions
    const nodePattern = /([A-Za-z0-9_]+)\s*(\[|\(|\{|\[\[|\(\(|\{\{)/g;
    let match: RegExpExecArray | null;
    while ((match = nodePattern.exec(cleanCode)) !== null) {
      const nodeId = match[1];
      const bracket = match[2];
      const fullMatch = match[0];

      // Check if bracket is properly closed on same line (simple check)
      const lineWithNode = lines.find(l => l.includes(fullMatch));
      if (lineWithNode) {
        const closingBracket = bracket === "[[" ? "]]" :
                               bracket === "((" ? "))" :
                               bracket === "{{" ? "}}" :
                               bracket === "[" ? "]" :
                               bracket === "(" ? ")" :
                               bracket === "{" ? "}" : "";
        if (!lineWithNode.includes(closingBracket)) {
          warnings.push(`Node '${nodeId}' might have unclosed bracket '${bracket}'`);
        }
      }
    }

    // Check arrow syntax
    const invalidArrows = cleanCode.match(/[^-=]>[^>|{(\[]/g);
    if (invalidArrows) {
      warnings.push(`Possible invalid arrow syntax. Use '-->' or '==>' for connections.`);
    }
  }

  if (diagramType === "sequenceDiagram") {
    // Check participant definitions
    const hasParticipant = /participant\s+\w+/i.test(cleanCode);
    const hasActor = /actor\s+\w+/i.test(cleanCode);

    if (!hasParticipant && !hasActor) {
      warnings.push("No 'participant' or 'actor' defined. Consider adding them for clarity.");
    }
  }

  // Check for common typos
  const typos: Record<string, string> = {
    "subgrah": "subgraph",
    "paticipant": "participant",
    "sequnce": "sequence",
    "flowcart": "flowchart",
    "digram": "diagram",
  };

  for (const [typo, correct] of Object.entries(typos)) {
    if (cleanCode.toLowerCase().includes(typo)) {
      errors.push(`Typo detected: '${typo}' should be '${correct}'`);
    }
  }

  // Check subgraph balance (only count "end" at start of line or after whitespace, not inside labels)
  const subgraphCount = (cleanCode.match(/\bsubgraph\b/gi) || []).length;
  // Match "end" only when it's a standalone keyword (start of line or after spaces, not inside brackets)
  const endMatches = cleanCode.match(/^\s*end\s*$/gim) || [];
  const endCount = endMatches.length;

  if (subgraphCount > endCount) {
    errors.push(`Missing 'end' for subgraph - found ${subgraphCount} subgraph(s) but only ${endCount} end(s)`);
  } else if (endCount > subgraphCount && subgraphCount > 0) {
    warnings.push(`Extra 'end' keyword(s) - found ${endCount} end(s) but only ${subgraphCount} subgraph(s)`);
  }

  // Check for unclosed quotes
  const quoteCount = (cleanCode.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    errors.push(`Unclosed quote - found ${quoteCount} quote(s), should be even`);
  }

  return {
    valid: errors.length === 0,
    diagramType,
    errors,
    warnings,
  };
}

export const mermaidCommand = new Command("mermaid")
  .description("Validate Mermaid diagram syntax");

// husky mermaid validate <code-or-file>
mermaidCommand
  .command("validate <input>")
  .description("Validate Mermaid diagram syntax (pass code or file path)")
  .option("--file", "Treat input as file path")
  .option("--json", "Output as JSON")
  .action((input: string, options: { file?: boolean; json?: boolean }) => {
    let code: string;

    if (options.file || existsSync(input)) {
      // Read from file
      if (!existsSync(input)) {
        console.error(`Error: File not found: ${input}`);
        process.exit(1);
      }
      code = readFileSync(input, "utf-8");
    } else {
      // Use input as code directly
      code = input;
    }

    const result = validateMermaid(code);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    }

    // Human-readable output
    if (result.diagramType) {
      console.log(`Diagram type: ${result.diagramType}`);
    }

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log("\nWarnings:");
      for (const warn of result.warnings) {
        console.log(`  - ${warn}`);
      }
    }

    if (result.valid) {
      console.log("\nDiagram syntax is valid");
    } else {
      console.log("\nDiagram has syntax errors");
      process.exit(1);
    }
  });

// husky mermaid check (alias for validate with stdin support)
mermaidCommand
  .command("check")
  .description("Check Mermaid syntax from stdin")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const code = Buffer.concat(chunks).toString("utf-8");

    const result = validateMermaid(code);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.valid) {
        console.log(`Valid ${result.diagramType || "diagram"}`);
      } else {
        console.log(`Invalid: ${result.errors.join(", ")}`);
      }
    }

    process.exit(result.valid ? 0 : 1);
  });

export default mermaidCommand;
