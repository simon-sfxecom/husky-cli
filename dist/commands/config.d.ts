import { Command } from "commander";
interface Config {
    apiUrl?: string;
    apiKey?: string;
    workerId?: string;
    workerName?: string;
}
export declare function getConfig(): Config;
export declare function setConfig(key: "apiUrl" | "apiKey" | "workerId" | "workerName", value: string): void;
export declare const configCommand: Command;
export {};
