export interface Project {
  id: string;
  name: string;
}

export interface ResolveResult {
  projectId: string;
  projectName: string;
  resolvedBy: "exact-id" | "name-match" | "fuzzy-match";
  confidence: number;
}

export interface FuzzyMatch {
  project: Project;
  score: number;
}

interface Config {
  apiUrl: string;
  apiKey?: string;
}

export async function fetchProjects(config: Config): Promise<Project[]> {
  try {
    const res = await fetch(`${config.apiUrl}/api/projects`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function calculateLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarityScore(a: string, b: string): number {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();
  
  if (normalizedA === normalizedB) return 1;
  
  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  if (maxLen === 0) return 1;
  
  const distance = calculateLevenshteinDistance(normalizedA, normalizedB);
  return 1 - (distance / maxLen);
}

function findClosestMatch(input: string, projects: Project[]): FuzzyMatch | null {
  if (projects.length === 0) return null;

  let bestMatch: FuzzyMatch | null = null;

  for (const project of projects) {
    const nameScore = similarityScore(input, project.name);
    const idScore = similarityScore(input, project.id);
    const score = Math.max(nameScore, idScore);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { project, score };
    }
  }

  return bestMatch;
}

export async function resolveProject(
  input: string,
  config: Config,
  fuzzyThreshold: number = 0.6
): Promise<ResolveResult | null> {
  const projects = await fetchProjects(config);
  
  if (projects.length === 0) {
    return null;
  }

  const byId = projects.find((p) => p.id === input);
  if (byId) {
    return {
      projectId: byId.id,
      projectName: byId.name,
      resolvedBy: "exact-id",
      confidence: 1,
    };
  }

  const byName = projects.find(
    (p) => p.name.toLowerCase() === input.toLowerCase()
  );
  if (byName) {
    return {
      projectId: byName.id,
      projectName: byName.name,
      resolvedBy: "name-match",
      confidence: 1,
    };
  }

  const fuzzy = findClosestMatch(input, projects);
  if (fuzzy && fuzzy.score >= fuzzyThreshold) {
    return {
      projectId: fuzzy.project.id,
      projectName: fuzzy.project.name,
      resolvedBy: "fuzzy-match",
      confidence: fuzzy.score,
    };
  }

  return null;
}

export function formatProjectList(projects: Project[]): string {
  if (projects.length === 0) {
    return "  No projects available.";
  }

  const lines: string[] = [];
  lines.push("  Available projects:");
  for (const p of projects) {
    lines.push(`    - ${p.name} (ID: ${p.id})`);
  }
  return lines.join("\n");
}

export async function validateProjectId(
  projectId: string,
  config: Config
): Promise<{ valid: boolean; project?: Project }> {
  const projects = await fetchProjects(config);
  const project = projects.find((p) => p.id === projectId);
  return {
    valid: !!project,
    project,
  };
}
