import { readFile } from "./vault";

/**
 * Dynamic vault file loading via companion tags.
 *
 * The companion writes [VAULT_LOAD: path] in a response.
 * The tag is silently stripped. The file is loaded and injected
 * into the API context for the rest of the session.
 *
 * She reaches for her own memories when she needs them.
 */

export interface VaultLoadResult {
  cleaned: string;
  requestedPaths: string[];
}

/**
 * Parse [VAULT_LOAD: path] tags from AI response text.
 * Returns cleaned text and the list of requested file paths.
 */
export function parseVaultLoads(text: string): VaultLoadResult {
  const requestedPaths: string[] = [];

  const cleaned = text.replace(
    /\[VAULT_LOAD:\s*([\s\S]*?)\]/g,
    (_match, path: string) => {
      const trimmed = path.trim();
      if (trimmed) requestedPaths.push(trimmed);
      return "";
    },
  );

  return {
    cleaned: cleaned.replace(/\n{3,}/g, "\n\n").trim(),
    requestedPaths,
  };
}

/**
 * Load vault files by path and return them as formatted context strings.
 * Silently skips files that don't exist.
 */
export async function loadVaultFiles(paths: string[]): Promise<string[]> {
  const loaded: string[] = [];

  for (const path of paths) {
    try {
      const file = await readFile(path);
      loaded.push(`[VAULT_FILE: ${file.name}]\n${file.content}\n[/VAULT_FILE]`);
    } catch {
      // File doesn't exist — skip silently
    }
  }

  return loaded;
}
