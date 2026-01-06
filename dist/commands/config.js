import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
const CONFIG_DIR = join(homedir(), ".husky");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
// API Key validation - must be at least 16 characters, alphanumeric + common key chars (base64, JWT, etc.)
function validateApiKey(key) {
    if (key.length < 16) {
        return { valid: false, error: "API key must be at least 16 characters long" };
    }
    // Allow: letters, numbers, dashes, underscores, dots, plus, slash, equals (base64/JWT compatible)
    if (!/^[a-zA-Z0-9_\-\.+/=]+$/.test(key)) {
        return { valid: false, error: "API key contains invalid characters" };
    }
    return { valid: true };
}
// URL validation
function validateApiUrl(url) {
    try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
            return { valid: false, error: "API URL must use http or https protocol" };
        }
        return { valid: true };
    }
    catch {
        return { valid: false, error: "Invalid URL format" };
    }
}
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
// Helper to set a single config value (used by interactive mode)
export function setConfig(key, value) {
    const config = getConfig();
    config[key] = value;
    saveConfig(config);
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
        const validation = validateApiUrl(value);
        if (!validation.valid) {
            console.error(`Error: ${validation.error}`);
            process.exit(1);
        }
        config.apiUrl = value;
    }
    else if (key === "api-key") {
        const validation = validateApiKey(value);
        if (!validation.valid) {
            console.error(`Error: ${validation.error}`);
            process.exit(1);
        }
        config.apiKey = value;
    }
    else {
        console.error(`Unknown config key: ${key}`);
        console.log("Available keys: api-url, api-key");
        process.exit(1);
    }
    saveConfig(config);
    console.log(`Set ${key} = ${key === "api-key" ? "***" : value}`);
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
// husky config test
configCommand
    .command("test")
    .description("Test API connection with configured credentials")
    .action(async () => {
    const config = getConfig();
    // Check if configuration is complete
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    if (!config.apiKey) {
        console.error("Error: API key not configured. Run: husky config set api-key <key>");
        process.exit(1);
    }
    console.log("Testing API connection...");
    try {
        const url = new URL("/api/tasks", config.apiUrl);
        const res = await fetch(url.toString(), {
            headers: {
                "x-api-key": config.apiKey,
            },
        });
        if (res.ok) {
            console.log(`API connection successful (API URL: ${config.apiUrl})`);
        }
        else if (res.status === 401) {
            console.error(`API connection failed: Unauthorized (HTTP 401)`);
            console.error("  Check your API key with: husky config set api-key <key>");
            process.exit(1);
        }
        else if (res.status === 403) {
            console.error(`API connection failed: Forbidden (HTTP 403)`);
            console.error("  Your API key may not have the required permissions");
            process.exit(1);
        }
        else {
            console.error(`API connection failed: HTTP ${res.status}`);
            try {
                const body = await res.json();
                if (body.error) {
                    console.error(`  Error: ${body.error}`);
                }
            }
            catch {
                // Ignore JSON parse errors
            }
            process.exit(1);
        }
    }
    catch (error) {
        if (error instanceof TypeError && error.message.includes("fetch")) {
            console.error(`API connection failed: Could not connect to ${config.apiUrl}`);
            console.error("  Check your API URL with: husky config set api-url <url>");
        }
        else {
            console.error(`API connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        process.exit(1);
    }
});
