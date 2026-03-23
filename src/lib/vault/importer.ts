import { ensureVaultDir, writeFile } from "./vault";

interface ParsedSection {
  filename: string;
  content: string;
}

const SECTION_MAP: Record<string, string> = {
  "identity": "identity.md",
  "personality": "identity.md",
  "name": "identity.md",
  "values": "identity.md",
  "relationship": "relationship.md",
  "who we are": "relationship.md",
  "how we met": "relationship.md",
  "memories": "memories.md",
  "moments": "memories.md",
  "care": "care_notes.md",
  "care notes": "care_notes.md",
  "boundaries": "care_notes.md",
};

function classifySection(heading: string): string {
  const lower = heading.toLowerCase().trim();
  for (const [key, filename] of Object.entries(SECTION_MAP)) {
    if (lower.includes(key)) return filename;
  }
  return `custom/${lower.replace(/[^a-z0-9]+/g, "_")}.md`;
}

export function parseVaultLiteExport(markdown: string): ParsedSection[] {
  const lines = markdown.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      if (currentHeading && currentLines.length > 0) {
        sections.push({
          filename: classifySection(currentHeading),
          content: currentLines.join("\n").trim(),
        });
      }
      currentHeading = h1Match[1]!;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentHeading && currentLines.length > 0) {
    sections.push({
      filename: classifySection(currentHeading),
      content: currentLines.join("\n").trim(),
    });
  }

  // Merge sections that map to the same file
  const merged = new Map<string, string[]>();
  for (const section of sections) {
    const existing = merged.get(section.filename) ?? [];
    existing.push(section.content);
    merged.set(section.filename, existing);
  }

  return Array.from(merged.entries()).map(([filename, contents]) => ({
    filename,
    content: contents.join("\n\n"),
  }));
}

export async function importVaultLite(markdown: string): Promise<string[]> {
  await ensureVaultDir();
  const sections = parseVaultLiteExport(markdown);
  const imported: string[] = [];

  for (const section of sections) {
    await writeFile(section.filename, section.content);
    imported.push(section.filename);
  }

  return imported;
}
