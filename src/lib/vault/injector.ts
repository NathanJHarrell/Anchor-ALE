import { readFile, listFiles } from "./vault";
import { getSetting, setSetting } from "../database";
import type { VaultFile } from "../types";

const VAULT_START = "[VAULT_START]";
const VAULT_END = "[VAULT_END]";
const SETTINGS_KEY = "vault_auto_load_files";
const VAULT_LOAD_MODE_KEY = "vault_load_mode";

const DEFAULT_AUTO_LOAD = [
  "identity.md",
  "relationship.md",
  "memories.md",
  "care_notes.md",
  "memory_essence.md",
  "conversation_index.md",
  "obsidian_index.md",
];

export type VaultLoadMode = "all" | "specific";

export async function getVaultLoadMode(): Promise<VaultLoadMode> {
  const mode = await getSetting(VAULT_LOAD_MODE_KEY);
  if (mode === "specific") return "specific";
  return "all";
}

export async function setVaultLoadMode(mode: VaultLoadMode): Promise<void> {
  await setSetting(VAULT_LOAD_MODE_KEY, mode);
}

export async function getAutoLoadFiles(): Promise<string[]> {
  const saved = await getSetting(SETTINGS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved) as string[];
    } catch {
      return DEFAULT_AUTO_LOAD;
    }
  }
  return DEFAULT_AUTO_LOAD;
}

export async function setAutoLoadFiles(files: string[]): Promise<void> {
  await setSetting(SETTINGS_KEY, JSON.stringify(files));
}

export async function buildVaultContext(fileList?: string[]): Promise<string> {
  // If explicit file list passed, use it directly
  if (fileList) {
    return loadAndFormat(fileList);
  }

  // Check configured load mode
  const mode = await getVaultLoadMode();

  if (mode === "specific") {
    // Load only the configured auto-load files
    const filesToLoad = await getAutoLoadFiles();
    return loadAndFormat(filesToLoad);
  }

  // Default: load ALL vault files
  return buildFullVaultContext();
}

export async function buildFullVaultContext(): Promise<string> {
  const files = await listFiles();
  if (files.length === 0) return "";

  const sections = files
    .map((f) => `--- ${f.name} ---\n${f.content}`)
    .join("\n\n");

  return `${VAULT_START}\n${sections}\n${VAULT_END}`;
}

/** Estimate token count for vault content. ~1 token per 4 characters. */
export function estimateVaultTokens(files: VaultFile[]): number {
  let totalChars = 0;
  for (const f of files) {
    totalChars += f.content.length + f.name.length + 10; // overhead for markers
  }
  return Math.ceil(totalChars / 4);
}

async function loadAndFormat(filePaths: string[]): Promise<string> {
  const loaded: VaultFile[] = [];

  for (const path of filePaths) {
    try {
      const file = await readFile(path);
      loaded.push(file);
    } catch {
      // File doesn't exist or can't be read — skip silently
    }
  }

  if (loaded.length === 0) return "";

  const sections = loaded
    .map((f) => `--- ${f.name} ---\n${f.content}`)
    .join("\n\n");

  return `${VAULT_START}\n${sections}\n${VAULT_END}`;
}
