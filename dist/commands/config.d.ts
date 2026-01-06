import { Command } from "commander";
interface Config {
    apiUrl?: string;
    apiKey?: string;
}
export declare function getConfig(): Config;
export declare function setConfig(key: "apiUrl" | "apiKey", value: string): void;
export declare const configCommand: Command;
export {};
