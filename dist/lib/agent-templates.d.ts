export interface AgentTypeConfig {
    directories: string[];
    dependencies: string[];
    defaultPrompt: string;
    geminiMdTemplate?: string;
}
export interface AgentType {
    id: string;
    departmentId: string;
    name: string;
    slug: string;
    description: string;
    agentConfig: AgentTypeConfig;
    createdAt: string;
    updatedAt: string;
}
export declare const DEFAULT_AGENT_CONFIGS: Record<string, AgentTypeConfig>;
export declare function generateStartupScript(agentType: AgentType | string, huskyApiUrl?: string, huskyApiKey?: string, gcpProject?: string): string;
export declare function getDefaultAgentConfig(slug: string): AgentTypeConfig | undefined;
export declare function listDefaultAgentTypes(): string[];
