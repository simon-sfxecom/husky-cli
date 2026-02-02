import { createRequire } from "module";
import { getConfig } from "../commands/config.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json");

const CACHE_FILE = path.join(os.homedir(), ".husky", "version-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface VersionCache {
  latestVersion: string;
  checkedAt: string;
  minApiVersion?: string;
}

function readCache(): VersionCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    const checkedAt = new Date(data.checkedAt).getTime();
    if (Date.now() - checkedAt > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(cache: VersionCache): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Ignore cache write errors
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch(
      "https://registry.npmjs.org/@simonfestl/husky-cli/latest",
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch {
    return null;
  }
}

async function fetchMinApiVersion(): Promise<string | null> {
  try {
    const config = getConfig();
    if (!config.apiUrl) return null;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch(`${config.apiUrl}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    const minVersion = res.headers.get("X-Min-CLI-Version");
    return minVersion || null;
  } catch {
    return null;
  }
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

export async function checkVersion(options: { silent?: boolean } = {}): Promise<void> {
  const currentVersion = packageJson.version;
  
  let cache = readCache();
  
  if (!cache) {
    const [latestVersion, minApiVersion] = await Promise.all([
      fetchLatestVersion(),
      fetchMinApiVersion(),
    ]);
    
    if (latestVersion) {
      cache = {
        latestVersion,
        checkedAt: new Date().toISOString(),
        minApiVersion: minApiVersion || undefined,
      };
      writeCache(cache);
    }
  }
  
  if (!cache) return;
  
  if (cache.minApiVersion && compareVersions(currentVersion, cache.minApiVersion) < 0) {
    console.error(`\n⛔ CLI version ${currentVersion} is below minimum required (${cache.minApiVersion})`);
    console.error(`   Run: sudo npm install -g @simonfestl/husky-cli@latest\n`);
    process.exit(1);
  }
  
  if (!options.silent && compareVersions(currentVersion, cache.latestVersion) < 0) {
    console.warn(`\n⚠️  CLI outdated: ${currentVersion} → ${cache.latestVersion}`);
    console.warn(`   Run: sudo npm install -g @simonfestl/husky-cli@latest\n`);
  }
}

export function getCurrentVersion(): string {
  return packageJson.version;
}
