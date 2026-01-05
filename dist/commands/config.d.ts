import { Command } from "commander";
interface Config {
    apiUrl?: string;
    apiKey?: string;
}
export declare function getConfig(): Config;
export declare const configCommand: Command;
export {};
