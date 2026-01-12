/**
 * Agent Identity Resolution
 *
 * Resolves agent identity for learnings and brain operations.
 * Priority: workerId (config) > HUSKY_AGENT_ID (env) > session-based ID (fallback)
 */

import { getConfig } from '../commands/config.js';
import { AgentType, AGENT_TYPES, isValidAgentType } from './biz/agent-brain.js';
import { randomUUID } from 'crypto';
import * as os from 'os';

export interface AgentIdentity {
    agentId: string;
    agentType?: AgentType;
    source: 'config' | 'env' | 'session';
    workerId?: string;
}

let sessionAgentId: string | undefined;

/**
 * Get session-based agent ID (created once per CLI session)
 */
function getSessionAgentId(): string {
    if (!sessionAgentId) {
        const hostname = os.hostname();
        const timestamp = Date.now().toString(36);
        const random = randomUUID().split('-')[0];
        sessionAgentId = `session-${hostname}-${timestamp}-${random}`;
    }
    return sessionAgentId;
}

/**
 * Resolve agent identity from config, env, or generate session ID
 */
export function resolveAgentIdentity(): AgentIdentity {
    const config = getConfig();

    // Priority 1: workerId from config (persistent)
    if (config.workerId) {
        const agentType = config.agentType && isValidAgentType(config.agentType)
            ? config.agentType
            : undefined;

        return {
            agentId: config.workerId,
            agentType,
            source: 'config',
            workerId: config.workerId,
        };
    }

    // Priority 2: HUSKY_AGENT_ID from environment
    const envAgentId = process.env.HUSKY_AGENT_ID;
    if (envAgentId) {
        const envAgentType = process.env.HUSKY_AGENT_TYPE;
        const agentType = envAgentType && isValidAgentType(envAgentType)
            ? envAgentType
            : undefined;

        return {
            agentId: envAgentId,
            agentType,
            source: 'env',
        };
    }

    // Priority 3: Session-based ID (fallback)
    const sessionId = getSessionAgentId();
    return {
        agentId: sessionId,
        agentType: undefined,
        source: 'session',
    };
}

/**
 * Get agent ID (convenience method)
 */
export function getAgentId(): string {
    return resolveAgentIdentity().agentId;
}

/**
 * Get agent type (convenience method)
 */
export function getAgentType(): AgentType | undefined {
    return resolveAgentIdentity().agentType;
}
