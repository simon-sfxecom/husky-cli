import { Command } from "commander";
interface Config {
    apiUrl?: string;
    apiKey?: string;
    workerId?: string;
    workerName?: string;
    billbeeApiKey?: string;
    billbeeUsername?: string;
    billbeePassword?: string;
    billbeeBaseUrl?: string;
    zendeskSubdomain?: string;
    zendeskEmail?: string;
    zendeskApiToken?: string;
    seatableApiToken?: string;
    seatableServerUrl?: string;
    qdrantUrl?: string;
    qdrantApiKey?: string;
    gcpProjectId?: string;
    gcpLocation?: string;
}
export declare function getConfig(): Config;
export declare function setConfig(key: "apiUrl" | "apiKey" | "workerId" | "workerName", value: string): void;
export declare const configCommand: Command;
export {};
