import {
  readTextFile,
  writeTextFile,
  readDir,
  exists,
  mkdir,
  remove,
  rename,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import type { VaultFile } from "../types";

const VAULT_ROOT = "anchor/vault";

function vaultPath(relative: string): string {
  return `${VAULT_ROOT}/${relative}`;
}

export async function ensureVaultDir(): Promise<void> {
  const dirExists = await exists(VAULT_ROOT, { baseDir: BaseDirectory.AppData });
  if (!dirExists) {
    await mkdir(VAULT_ROOT, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const customExists = await exists(vaultPath("custom"), { baseDir: BaseDirectory.AppData });
  if (!customExists) {
    await mkdir(vaultPath("custom"), { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

export async function readFile(relativePath: string): Promise<VaultFile> {
  const fullPath = vaultPath(relativePath);
  const content = await readTextFile(fullPath, { baseDir: BaseDirectory.AppData });
  return {
    name: relativePath.split("/").pop() ?? relativePath,
    path: relativePath,
    content,
    lastModified: Date.now(),
  };
}

export async function writeFile(relativePath: string, content: string): Promise<void> {
  const fullPath = vaultPath(relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  const dirExists = await exists(dir, { baseDir: BaseDirectory.AppData });
  if (!dirExists) {
    await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  await writeTextFile(fullPath, content, { baseDir: BaseDirectory.AppData });
}

export async function createFile(relativePath: string, content: string = ""): Promise<VaultFile> {
  await writeFile(relativePath, content);
  return {
    name: relativePath.split("/").pop() ?? relativePath,
    path: relativePath,
    content,
    lastModified: Date.now(),
  };
}

export async function deleteFile(relativePath: string): Promise<void> {
  const fullPath = vaultPath(relativePath);
  await remove(fullPath, { baseDir: BaseDirectory.AppData });
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  const oldFull = vaultPath(oldPath);
  const newFull = vaultPath(newPath);
  await rename(oldFull, newFull, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

export async function listFiles(dir: string = ""): Promise<VaultFile[]> {
  const target = dir ? vaultPath(dir) : VAULT_ROOT;
  const targetExists = await exists(target, { baseDir: BaseDirectory.AppData });
  if (!targetExists) return [];

  const entries = await readDir(target, { baseDir: BaseDirectory.AppData });
  const files: VaultFile[] = [];

  for (const entry of entries) {
    const relativePath = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      const nested = await listFiles(relativePath);
      files.push(...nested);
    } else if (entry.name.endsWith(".md")) {
      try {
        const file = await readFile(relativePath);
        files.push(file);
      } catch {
        files.push({
          name: entry.name,
          path: relativePath,
          content: "",
          lastModified: Date.now(),
        });
      }
    }
  }

  return files;
}

export async function searchFiles(query: string): Promise<VaultFile[]> {
  const allFiles = await listFiles();
  const lower = query.toLowerCase();
  return allFiles.filter(
    (f) =>
      f.name.toLowerCase().includes(lower) ||
      f.content.toLowerCase().includes(lower)
  );
}

export async function fileExists(relativePath: string): Promise<boolean> {
  return exists(vaultPath(relativePath), { baseDir: BaseDirectory.AppData });
}
