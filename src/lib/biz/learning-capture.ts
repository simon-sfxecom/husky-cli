/**
 * Learning Capture Service
 *
 * Automatically captures learnings when a task is completed.
 * Uses LLM (Vertex AI) to extract meaningful learnings from task context.
 */

import { AgentBrain, AgentType } from './agent-brain.js';
import { getConfig } from '../../commands/config.js';

export interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority?: string;
    projectId?: string;
    metadata?: Record<string, unknown>;
}

export interface LearningCaptureInput {
    taskId: string;
    task: Task;
    prUrl?: string;
    explicitLearnings?: string;
    agentId: string;
    agentType?: AgentType;
}

export interface LearningResult {
    id: string;
    content: string;
    tags: string[];
}

/**
 * Generate learnings from task context using LLM
 */
async function generateLearningsFromTask(
    task: Task,
    prUrl?: string
): Promise<{ content: string; tags: string[] }[]> {
    // For now, return basic task-based learnings
    // TODO: In future, use Vertex AI to extract deeper insights from:
    // - Task description
    // - PR diff/content
    // - Related comments/discussions
    // - Error patterns encountered

    const learnings: { content: string; tags: string[] }[] = [];

    // Basic learning from task completion
    const basicTags = [
        `task:${task.id}`,
        ...(task.projectId ? [`project:${task.projectId}`] : []),
        'type:completion',
    ];

    // Create a learning from the task
    const taskLearning = {
        content: `Completed task: ${task.title}${task.description ? ` - ${task.description}` : ''}${prUrl ? ` (PR: ${prUrl})` : ''}`,
        tags: basicTags,
    };

    learnings.push(taskLearning);

    return learnings;
}

/**
 * Capture learnings from a completed task
 *
 * This function:
 * 1. Generates learnings from task context (or uses explicit learnings)
 * 2. Stores them in the agent's brain
 * 3. Returns the learning IDs
 */
export async function captureLearnings(
    input: LearningCaptureInput
): Promise<LearningResult[]> {
    const { taskId, task, prUrl, explicitLearnings, agentId, agentType } = input;

    // Initialize agent brain
    const brain = new AgentBrain({ agentId, agentType });

    const results: LearningResult[] = [];

    // If explicit learnings provided, store them directly
    if (explicitLearnings) {
        const tags = [
            `task:${taskId}`,
            ...(task.projectId ? [`project:${task.projectId}`] : []),
            'type:explicit',
            'source:manual',
        ];

        const id = await brain.remember(explicitLearnings, tags, {
            taskId,
            taskTitle: task.title,
            prUrl,
            capturedAt: new Date().toISOString(),
        });

        results.push({
            id,
            content: explicitLearnings,
            tags,
        });

        return results;
    }

    // Generate learnings from task context
    try {
        const generatedLearnings = await generateLearningsFromTask(task, prUrl);

        for (const learning of generatedLearnings) {
            const id = await brain.remember(learning.content, learning.tags, {
                taskId,
                taskTitle: task.title,
                prUrl,
                capturedAt: new Date().toISOString(),
                source: 'auto-generated',
            });

            results.push({
                id,
                content: learning.content,
                tags: learning.tags,
            });
        }
    } catch (error) {
        console.warn('  ⚠️  Failed to generate learnings:', error instanceof Error ? error.message : error);
        // Don't fail task completion if learning capture fails
    }

    return results;
}

/**
 * Fetch task details from API
 */
export async function fetchTask(taskId: string, apiUrl: string, apiKey?: string): Promise<Task | null> {
    try {
        const res = await fetch(`${apiUrl}/api/tasks/${taskId}`, {
            headers: apiKey ? { 'x-api-key': apiKey } : {},
        });

        if (!res.ok) {
            return null;
        }

        return await res.json();
    } catch {
        return null;
    }
}
