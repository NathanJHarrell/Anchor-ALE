import {
  readTextFile,
  exists,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { getSetting } from "../database";
import { getDefaultSystemPrompt, renderTemplate } from "./template";

const SETTINGS_KEY = "systemPromptPath";
const PROMPT_ROOT = "anchor/prompts";

function promptPath(relative: string): string {
  return `${PROMPT_ROOT}/${relative}`;
}

/**
 * Load the system prompt from the user-configured path, or fall back
 * to the built-in default template. Always reads fresh from disk
 * (no caching), so callers get hot-reload behavior for free.
 */
export async function loadSystemPrompt(
  variables?: Record<string, string>,
): Promise<string> {
  const customPath = await getSetting(SETTINGS_KEY);
  let raw: string;

  if (customPath) {
    raw = await readPromptFile(customPath);
  } else {
    raw = getDefaultSystemPrompt();
  }

  return variables ? renderTemplate(raw, variables) : raw;
}

/**
 * Read a prompt markdown file from the prompts directory.
 * Falls back to the default template if the file is missing or empty.
 */
async function readPromptFile(relativePath: string): Promise<string> {
  const fullPath = promptPath(relativePath);

  try {
    const fileExists = await exists(fullPath, { baseDir: BaseDirectory.AppData });
    if (!fileExists) {
      return getDefaultSystemPrompt();
    }

    const content = await readTextFile(fullPath, { baseDir: BaseDirectory.AppData });
    return content.trim() || getDefaultSystemPrompt();
  } catch {
    return getDefaultSystemPrompt();
  }
}

/**
 * Check whether a custom system prompt file is configured and exists.
 */
export async function hasCustomPrompt(): Promise<boolean> {
  const customPath = await getSetting(SETTINGS_KEY);
  if (!customPath) return false;

  try {
    return await exists(promptPath(customPath), { baseDir: BaseDirectory.AppData });
  } catch {
    return false;
  }
}
