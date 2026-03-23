import { readFile, listFiles } from "./vault";
import { getSetting, setSetting } from "../database";
import type { VaultFile } from "../types";

const VAULT_START = "[VAULT_START]";
const VAULT_END = "[VAULT_END]";
const SETTINGS_KEY = "vault_auto_load_files";

const DEFAULT_AUTO_LOAD = [
  "identity.md",
  "relationship.md",
  "memories.md",
  "care_notes.md",
];

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
  const filesToLoad = fileList ?? await getAutoLoadFiles();
  const loaded: VaultFile[] = [];

  for (const path of filesToLoad) {
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

export async function buildFullVaultContext(): Promise<string> {
  const files = await listFiles();
  const paths = files.map((f) => f.path);
  return buildVaultContext(paths);
}
