import { Command } from "commander";
import { getConfig } from "./config.js";
export const settingsCommand = new Command("settings")
    .description("Manage application settings");
// Helper: Ensure API is configured
function ensureConfig() {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    return config;
}
// husky settings get [key]
settingsCommand
    .command("get [key]")
    .description("Get settings (all or specific key)")
    .option("--json", "Output as JSON")
    .action(async (key, options) => {
    const config = ensureConfig();
    try {
        // If no key provided, get all settings
        const url = key
            ? `${config.apiUrl}/api/settings/${encodeURIComponent(key)}`
            : `${config.apiUrl}/api/settings`;
        const res = await fetch(url, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Setting "${key}" not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        const data = await res.json();
        if (options.json) {
            console.log(JSON.stringify(data, null, 2));
        }
        else {
            if (key) {
                // Single setting
                printSingleSetting(key, data);
            }
            else {
                // All settings
                printAllSettings(data);
            }
        }
    }
    catch (error) {
        console.error("Error fetching settings:", error);
        process.exit(1);
    }
});
// husky settings set <key> <value>
settingsCommand
    .command("set <key> <value>")
    .description("Set a setting value")
    .option("--json", "Output as JSON")
    .action(async (key, value, options) => {
    const config = ensureConfig();
    // Try to parse value as JSON for complex types (arrays, objects, booleans, numbers)
    let parsedValue = value;
    try {
        parsedValue = JSON.parse(value);
    }
    catch {
        // Keep as string if not valid JSON
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/settings/${encodeURIComponent(key)}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ value: parsedValue }),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `API error: ${res.status}`);
        }
        const data = await res.json();
        if (options.json) {
            console.log(JSON.stringify(data, null, 2));
        }
        else {
            console.log(`Setting updated successfully`);
            console.log(`  Key:   ${key}`);
            console.log(`  Value: ${formatValue(parsedValue)}`);
        }
    }
    catch (error) {
        console.error("Error setting value:", error);
        process.exit(1);
    }
});
// ============================================
// OUTPUT FORMATTERS
// ============================================
function formatValue(value) {
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}
function printSingleSetting(key, data) {
    const value = "value" in data ? data.value : data;
    console.log(`\n  Setting: ${key}`);
    console.log("  " + "-".repeat(50));
    console.log(`  Value: ${formatValue(value)}`);
    if ("updatedAt" in data && data.updatedAt) {
        console.log(`  Updated: ${new Date(data.updatedAt).toLocaleString()}`);
    }
    console.log("");
}
function printAllSettings(data) {
    // Handle both array and object formats
    const entries = [];
    if (Array.isArray(data)) {
        for (const item of data) {
            entries.push({ key: item.key, value: item.value });
        }
    }
    else {
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === "object" && value !== null && "value" in value) {
                entries.push({ key, value: value.value });
            }
            else {
                entries.push({ key, value: value });
            }
        }
    }
    if (entries.length === 0) {
        console.log("\n  No settings found.\n");
        return;
    }
    console.log("\n  SETTINGS");
    console.log("  " + "-".repeat(70));
    console.log(`  ${"KEY".padEnd(30)} ${"VALUE".padEnd(38)}`);
    console.log("  " + "-".repeat(70));
    for (const entry of entries) {
        const valueStr = formatValue(entry.value);
        const truncatedValue = valueStr.length > 36 ? valueStr.substring(0, 33) + "..." : valueStr;
        console.log(`  ${entry.key.padEnd(30)} ${truncatedValue}`);
    }
    console.log("  " + "-".repeat(70));
    console.log(`  Total: ${entries.length} setting(s)\n`);
}
