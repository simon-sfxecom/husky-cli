import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
const CONFIG_DIR = join(homedir(), ".husky");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export function getConfig() {
    try {
        if (!existsSync(CONFIG_FILE)) {
            return {};
        }
        const content = readFileSync(CONFIG_FILE, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return {};
    }
}
function saveConfig(config) {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
export const configCommand = new Command("config")
    .description("Manage CLI configuration");
// husky config set <key> <value>
configCommand
    .command("set <key> <value>")
    .description("Set a configuration value")
    .action((key, value) => {
    const config = getConfig();
    if (key === "api-url") {
        config.apiUrl = value;
    }
    else if (key === "api-key") {
        config.apiKey = value;
    }
    else {
        console.error(`Unknown config key: ${key}`);
        console.log("Available keys: api-url, api-key");
        process.exit(1);
    }
    saveConfig(config);
    console.log(`✓ Set ${key} = ${key === "api-key" ? "***" : value}`);
});
// husky config get <key>
configCommand
    .command("get <key>")
    .description("Get a configuration value")
    .action((key) => {
    const config = getConfig();
    if (key === "api-url") {
        console.log(config.apiUrl || "(not set)");
    }
    else if (key === "api-key") {
        console.log(config.apiKey ? "***" : "(not set)");
    }
    else {
        console.error(`Unknown config key: ${key}`);
        process.exit(1);
    }
});
// husky config list
configCommand
    .command("list")
    .description("List all configuration")
    .action(() => {
    const config = getConfig();
    console.log("Configuration:");
    console.log(`  api-url: ${config.apiUrl || "(not set)"}`);
    console.log(`  api-key: ${config.apiKey ? "***" : "(not set)"}`);
});
