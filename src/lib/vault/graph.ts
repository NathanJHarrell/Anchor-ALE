import type { VaultFile } from "../types";

// ── Types ──────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  size: number;
  type: "identity" | "daily" | "framework" | "relationship" | "custom";
  content: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Colors by type ─────────────────────────────────────────────

export const NODE_COLORS: Record<GraphNode["type"], string> = {
  identity: "#9333EA",     // purple
  daily: "#D97706",        // warm gold
  framework: "#3B82F6",    // blue
  relationship: "#EC4899", // pink
  custom: "#78716C",       // warm gray
};

// ── Link parsing ───────────────────────────────────────────────

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*?)?\]\]/g;

export function parseLinks(content: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    const target = match[1]!.trim();
    if (target) links.push(target);
  }
  return links;
}

// ── File type classification ───────────────────────────────────

function classifyFile(path: string): GraphNode["type"] {
  const lower = path.toLowerCase();
  if (lower.includes("identity") || lower.includes("about_me") || lower.includes("who_i_am"))
    return "identity";
  if (lower.includes("daily") || lower.match(/\d{4}-\d{2}-\d{2}/))
    return "daily";
  if (lower.includes("framework") || lower.includes("template") || lower.includes("system"))
    return "framework";
  if (lower.includes("relationship") || lower.includes("care") || lower.includes("love") || lower.includes("memories"))
    return "relationship";
  return "custom";
}

// ── Normalize a link target to match a file path ───────────────

function normalizeTarget(target: string): string {
  let t = target.trim().toLowerCase();
  if (!t.endsWith(".md")) t += ".md";
  return t;
}

// ── Build graph from vault files ───────────────────────────────

export function buildGraph(files: VaultFile[]): VaultGraph {
  // Index files by normalized path for O(1) lookup
  const pathIndex = new Map<string, VaultFile>();
  for (const f of files) {
    pathIndex.set(f.path.toLowerCase(), f);
    // Also index by filename only (for [[filename]] links without path)
    pathIndex.set(f.name.toLowerCase(), f);
  }

  // Build nodes
  const nodes: GraphNode[] = files.map((f) => ({
    id: f.path,
    name: f.name.replace(/\.md$/, ""),
    size: f.content.length,
    type: classifyFile(f.path),
    content: f.content,
  }));

  // Build edges with weights
  const edgeMap = new Map<string, GraphEdge>();

  for (const file of files) {
    const links = parseLinks(file.content);
    const counts = new Map<string, number>();

    for (const link of links) {
      const normalized = normalizeTarget(link);
      // Try to resolve: exact path, then filename
      const resolved =
        pathIndex.get(normalized) ??
        pathIndex.get(`custom/${normalized}`);

      if (resolved && resolved.path !== file.path) {
        const key = `${file.path}→${resolved.path}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    for (const [key, weight] of counts) {
      const [source, target] = key.split("→") as [string, string];
      edgeMap.set(key, { source, target, weight });
    }
  }

  return { nodes, edges: Array.from(edgeMap.values()) };
}
