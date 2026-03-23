import { invoke } from "@tauri-apps/api/core";
import type { PageContent } from "../../lib/types";

/**
 * Fetches page HTML via Tauri (server-side, bypasses CORS) and extracts
 * readable content using site-specific or general heuristics.
 */
export async function getCurrentPageContent(url: string): Promise<PageContent> {
  const html = await invoke<string>("fetch_page_html", { url });
  const doc = new DOMParser().parseFromString(html, "text/html");

  const title = doc.querySelector("title")?.textContent?.trim() ?? url;

  if (isYouTube(url)) return { url, title, text: extractYouTube(doc, title) };
  if (isReddit(url)) return { url, title, text: extractReddit(doc, title) };
  return { url, title, text: extractGeneral(doc) };
}

// ── Site detection ─────────────────────────────────────────────

function isYouTube(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

function isReddit(url: string): boolean {
  return /reddit\.com/i.test(url);
}

// ── YouTube extraction ─────────────────────────────────────────

function extractYouTube(doc: Document, fallbackTitle: string): string {
  const parts: string[] = [];

  // Video title from meta or og:title
  const videoTitle =
    getMeta(doc, "og:title") ??
    getMeta(doc, "title") ??
    fallbackTitle;
  parts.push(`Video: ${videoTitle}`);

  // Channel name
  const channel =
    getMeta(doc, "author") ??
    doc.querySelector("[itemprop='author'] [itemprop='name']")?.getAttribute("content") ??
    doc.querySelector("link[itemprop='name']")?.getAttribute("content");
  if (channel) parts.push(`Channel: ${channel}`);

  // Description
  const description =
    getMeta(doc, "og:description") ??
    getMeta(doc, "description");
  if (description) parts.push(`Description: ${description}`);

  return parts.join("\n\n");
}

// ── Reddit extraction ──────────────────────────────────────────

function extractReddit(doc: Document, fallbackTitle: string): string {
  const parts: string[] = [];

  const postTitle = getMeta(doc, "og:title") ?? fallbackTitle;
  parts.push(`Post: ${postTitle}`);

  // Post body — Reddit SSR renders post content in various containers
  const body =
    doc.querySelector("[data-click-id='text'] .md")?.textContent?.trim() ??
    doc.querySelector(".expando .md")?.textContent?.trim() ??
    getMeta(doc, "og:description");
  if (body) parts.push(`Body: ${body}`);

  // Top comments from SSR markup
  const commentEls = doc.querySelectorAll(".comment .md");
  const comments: string[] = [];
  commentEls.forEach((el, i) => {
    if (i >= 5) return; // top 5 comments
    const text = el.textContent?.trim();
    if (text) comments.push(`  - ${text.slice(0, 300)}`);
  });
  if (comments.length > 0) {
    parts.push(`Top comments:\n${comments.join("\n")}`);
  }

  return parts.join("\n\n");
}

// ── General readability extraction ─────────────────────────────

function extractGeneral(doc: Document): string {
  // Remove non-content elements
  const removeSelectors = [
    "script", "style", "noscript", "nav", "header", "footer",
    "aside", "iframe", "[role='navigation']", "[role='banner']",
    "[role='complementary']", ".sidebar", ".nav", ".menu",
    ".advertisement", ".ad", ".social-share",
  ];
  for (const sel of removeSelectors) {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  }

  // Try to find the main article content
  const article =
    doc.querySelector("article") ??
    doc.querySelector("[role='main']") ??
    doc.querySelector("main") ??
    doc.querySelector(".post-content") ??
    doc.querySelector(".article-body") ??
    doc.querySelector(".entry-content");

  const root = article ?? doc.body;
  if (!root) return "";

  // Extract text from paragraphs for cleaner output
  const paragraphs = root.querySelectorAll("p, h1, h2, h3, h4, li, blockquote, pre");
  const texts: string[] = [];
  paragraphs.forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 20) {
      texts.push(text);
    }
  });

  if (texts.length > 0) return texts.join("\n\n").slice(0, 8000);

  // Fallback: just grab body text
  return (root.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 8000);
}

// ── Helpers ────────────────────────────────────────────────────

function getMeta(doc: Document, name: string): string | null {
  const el =
    doc.querySelector(`meta[property="${name}"]`) ??
    doc.querySelector(`meta[name="${name}"]`);
  return el?.getAttribute("content")?.trim() ?? null;
}
