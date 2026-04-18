/**
 * Config Manager — Brain Registry
 * Stores brain metadata in ~/.distill/config.json
 */

import fs from "fs";
import path from "path";
import os from "os";

export interface BrainConfig {
  id: string;
  name: string;
  path: string;
  topic: string;
  created: string;
  lastOpened: string;
  courseCode?: string;
  semester?: string;
  courseColor?: string;
}

interface ConfigFile {
  brains: BrainConfig[];
}

const CONFIG_DIR = path.join(os.homedir(), ".distill");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readConfig(): ConfigFile {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    return { brains: [] };
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeConfig(config: ConfigFile): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * List all registered brains, filtering out any whose path no longer exists on disk.
 */
export function listBrains(): BrainConfig[] {
  const config = readConfig();
  const valid = config.brains.filter((b) => fs.existsSync(b.path));
  // Clean up stale entries
  if (valid.length !== config.brains.length) {
    writeConfig({ brains: valid });
  }
  return valid;
}

/**
 * Get a single brain by ID.
 */
export function getBrain(id: string): BrainConfig | null {
  const config = readConfig();
  return config.brains.find((b) => b.id === id) || null;
}

/**
 * Register a new brain or update an existing one.
 */
export function registerBrain(brain: BrainConfig): void {
  const config = readConfig();
  const idx = config.brains.findIndex((b) => b.id === brain.id);
  if (idx >= 0) {
    config.brains[idx] = brain;
  } else {
    config.brains.push(brain);
  }
  writeConfig(config);
}

/**
 * Remove a brain from the registry (does NOT delete files on disk).
 */
export function removeBrain(id: string): void {
  const config = readConfig();
  config.brains = config.brains.filter((b) => b.id !== id);
  writeConfig(config);
}

/**
 * Update the lastOpened timestamp for a brain.
 */
export function setLastActive(id: string): void {
  const config = readConfig();
  const brain = config.brains.find((b) => b.id === id);
  if (brain) {
    brain.lastOpened = new Date().toISOString();
    writeConfig(config);
  }
}

/**
 * Generate a unique slug ID from a brain name.
 */
export function generateBrainId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Date.now().toString(36);
  return `${slug}-${suffix}`;
}
