/**
 * SOP (Standard Operating Procedure) Generator
 *
 * Generates SOPs from agent learnings using LLM.
 * Leverages PII-free embeddings for safe processing.
 */

import { AgentBrain, AgentType, Memory } from './agent-brain.js';

export interface SOPGenerationOptions {
    topic: string;
    agentType?: AgentType;
    minMemories?: number;
    format?: 'markdown' | 'json';
}

export interface SOPSection {
    title: string;
    content: string;
    examples?: string[];
}

export interface SOP {
    title: string;
    topic: string;
    sections: SOPSection[];
    sourceCount: number;
    generatedAt: string;
}

/**
 * Generate SOP from learnings
 *
 * TODO: In future, use Vertex AI/Gemini to:
 * 1. Recall relevant memories by topic
 * 2. Group and cluster similar learnings
 * 3. Extract patterns and best practices
 * 4. Generate structured SOP document
 */
export async function generateSOP(
    agentId: string,
    options: SOPGenerationOptions
): Promise<SOP> {
    const { topic, agentType, minMemories = 5, format = 'markdown' } = options;

    // Initialize brain
    const brain = new AgentBrain({ agentId, agentType });

    // Recall memories related to topic
    const results = await brain.recall(topic, 50, 0.3);

    if (results.length < minMemories) {
        throw new Error(
            `Not enough learnings found for topic "${topic}" (found ${results.length}, need ${minMemories})`
        );
    }

    // Group memories by tags
    const grouped = groupMemoriesByTags(results.map(r => r.memory));

    // Generate SOP sections (basic version - TODO: use LLM for better structure)
    const sections: SOPSection[] = [];

    for (const [tag, memories] of Object.entries(grouped)) {
        sections.push({
            title: formatTagAsTitle(tag),
            content: summarizeMemories(memories),
            examples: memories.slice(0, 3).map(m => m.content),
        });
    }

    return {
        title: `SOP: ${topic}`,
        topic,
        sections,
        sourceCount: results.length,
        generatedAt: new Date().toISOString(),
    };
}

/**
 * Group memories by tags
 */
function groupMemoriesByTags(memories: Memory[]): Record<string, Memory[]> {
    const groups: Record<string, Memory[]> = {};

    for (const memory of memories) {
        for (const tag of memory.tags) {
            // Skip task/project specific tags
            if (tag.startsWith('task:') || tag.startsWith('project:')) {
                continue;
            }

            if (!groups[tag]) {
                groups[tag] = [];
            }
            groups[tag].push(memory);
        }
    }

    // Sort by number of memories
    return Object.fromEntries(
        Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
    );
}

/**
 * Format tag as section title
 */
function formatTagAsTitle(tag: string): string {
    // Remove prefixes
    const cleaned = tag.replace(/^(type|source|category):/, '');

    // Capitalize
    return cleaned
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Summarize memories into a paragraph
 */
function summarizeMemories(memories: Memory[]): string {
    // Basic summarization (TODO: use LLM for better summary)
    if (memories.length === 1) {
        return memories[0].content;
    }

    const commonThemes = extractCommonThemes(memories);
    return `Based on ${memories.length} learnings: ${commonThemes}`;
}

/**
 * Extract common themes from memories
 */
function extractCommonThemes(memories: Memory[]): string {
    // Simple word frequency analysis (TODO: use LLM for semantic analysis)
    const words: Record<string, number> = {};

    for (const memory of memories) {
        const tokens = memory.content
            .toLowerCase()
            .split(/\W+/)
            .filter(w => w.length > 4); // Only words > 4 chars

        for (const word of tokens) {
            words[word] = (words[word] || 0) + 1;
        }
    }

    // Get top 5 words
    const topWords = Object.entries(words)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

    return `Common themes include: ${topWords.join(', ')}`;
}

/**
 * Format SOP as Markdown
 */
export function formatSOPAsMarkdown(sop: SOP): string {
    let md = `# ${sop.title}\n\n`;
    md += `**Topic:** ${sop.topic}  \n`;
    md += `**Generated:** ${new Date(sop.generatedAt).toLocaleString()}  \n`;
    md += `**Sources:** ${sop.sourceCount} learnings  \n\n`;
    md += `---\n\n`;

    for (const section of sop.sections) {
        md += `## ${section.title}\n\n`;
        md += `${section.content}\n\n`;

        if (section.examples && section.examples.length > 0) {
            md += `### Examples\n\n`;
            for (const example of section.examples) {
                md += `- ${example}\n`;
            }
            md += `\n`;
        }
    }

    return md;
}
