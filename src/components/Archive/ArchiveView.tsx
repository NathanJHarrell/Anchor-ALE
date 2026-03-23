import { useState, useEffect, useCallback, useRef } from "react";
import type { Session, SessionMessage } from "../../lib/types";
import {
  searchMessages,
  getSessionSummary,
  exportSession,
  listArchivedSessions,
  type SessionSummary,
} from "../../lib/sessions/archive";
import { getFullHistory, type DisplayMessage } from "../../lib/sessions";

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "**$1**");
}

function snippetAround(content: string, query: string, radius = 80): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + query.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return prefix + content.slice(start, end) + suffix;
}

// ── Types ───────────────────────────────────────────────────────

interface SessionCard {
  session: Session;
  summary: SessionSummary;
}

interface SearchResult {
  message: SessionMessage;
  sessionName: string;
}

// ── Component ───────────────────────────────────────────────────

export default function ArchiveView() {
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<DisplayMessage[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionMap = useRef<Map<string, string>>(new Map());

  // Load all session cards on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessions = await listArchivedSessions(200);
        if (cancelled) return;

        // Build session name map for search results
        const nameMap = new Map<string, string>();
        for (const s of sessions) nameMap.set(s.id, s.name);
        sessionMap.current = nameMap;

        // Fetch summaries in parallel
        const summaries = await Promise.all(
          sessions.map((s) => getSessionSummary(s.id)),
        );
        if (cancelled) return;

        const result: SessionCard[] = sessions.map((s, i) => ({
          session: s,
          summary: summaries[i]!,
        }));
        setCards(result);
      } catch {
        // Silent fail — empty bookshelf
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!value.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchMessages(value.trim());
        setSearchResults(
          results.map((msg) => ({
            message: msg,
            sessionName: sessionMap.current.get(msg.sessionId) ?? "Unknown",
          })),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Expand a session to view full conversation
  const handleExpand = useCallback(async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      setExpandedMessages([]);
      return;
    }
    setExpandedSession(sessionId);
    setExpandedLoading(true);
    try {
      const history = await getFullHistory(sessionId);
      setExpandedMessages(history);
    } catch {
      setExpandedMessages([]);
    } finally {
      setExpandedLoading(false);
    }
  }, [expandedSession]);

  // Export session as markdown download
  const handleExport = useCallback(async (sessionId: string, sessionName: string) => {
    try {
      const md = await exportSession(sessionId);
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sessionName.replace(/[^a-zA-Z0-9-_ ]/g, "")}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Export failed silently
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-anchor-muted text-sm">Loading bookshelf…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-4">
      {/* Search bar */}
      <div className="px-4 py-3 border-b border-anchor-border shrink-0">
        <div className="max-w-2xl mx-auto relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search across all sessions…"
            className="w-full bg-anchor-bg border border-anchor-border rounded-lg px-4 py-2.5 text-sm text-anchor-text placeholder:text-anchor-muted/50 focus:outline-none focus:border-anchor-accent/50 transition-colors"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-anchor-muted">
              searching…
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto">

          {/* Search results */}
          {searchResults !== null ? (
            <div>
              <div className="text-xs text-anchor-muted mb-3">
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"
              </div>
              {searchResults.length === 0 ? (
                <div className="text-center text-anchor-muted/60 text-sm py-8">
                  No passages found.
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((r) => (
                    <button
                      key={r.message.id}
                      onClick={() => void handleExpand(r.message.sessionId)}
                      className="w-full text-left p-3 rounded-lg bg-anchor-surface border border-anchor-border hover:border-anchor-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-anchor-accent">
                          {r.sessionName}
                        </span>
                        <span className="text-xs text-anchor-muted">
                          {formatDate(r.message.timestamp)}
                        </span>
                        <span className="text-xs text-anchor-muted/50">
                          {r.message.role === "user" ? "you" : "companion"}
                        </span>
                      </div>
                      <div className="text-sm text-anchor-text/80 leading-relaxed">
                        {highlightMatch(
                          snippetAround(r.message.content, searchQuery),
                          searchQuery,
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : cards.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="text-anchor-muted/30 text-4xl mb-3">📚</div>
                <p className="text-anchor-muted text-sm">
                  The bookshelf is empty. Start a conversation to fill it.
                </p>
              </div>
            </div>
          ) : (
            /* Session cards — the bookshelf */
            <div className="space-y-2">
              {cards.map(({ session, summary }) => (
                <div key={session.id}>
                  <div
                    className={`rounded-lg border transition-colors ${
                      expandedSession === session.id
                        ? "bg-anchor-surface border-anchor-accent/30"
                        : "bg-anchor-surface border-anchor-border hover:border-anchor-accent/20"
                    }`}
                  >
                    {/* Card header */}
                    <button
                      onClick={() => void handleExpand(session.id)}
                      className="w-full text-left p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-anchor-text truncate">
                            {session.name}
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-anchor-muted">
                              {summary.messageCount} page{summary.messageCount !== 1 ? "s" : ""}
                            </span>
                            <span className="text-xs text-anchor-muted/50">·</span>
                            <span className="text-xs text-anchor-muted">
                              {formatDate(summary.lastMessage || session.updatedAt)}
                            </span>
                            {summary.duration > 0 && (
                              <>
                                <span className="text-xs text-anchor-muted/50">·</span>
                                <span className="text-xs text-anchor-muted">
                                  {formatDuration(summary.duration)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {session.type === "home" && (
                            <span className="text-xs text-anchor-accent/60 bg-anchor-accent/10 px-1.5 py-0.5 rounded">
                              home
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleExport(session.id, session.name);
                            }}
                            className="text-xs text-anchor-muted hover:text-anchor-text transition-colors px-2 py-1 rounded hover:bg-anchor-bg/50"
                            title="Export as markdown"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    </button>

                    {/* Expanded conversation view */}
                    {expandedSession === session.id && (
                      <div className="border-t border-anchor-border px-4 py-3 max-h-96 overflow-y-auto">
                        {expandedLoading ? (
                          <div className="text-xs text-anchor-muted py-4 text-center">
                            Loading conversation…
                          </div>
                        ) : expandedMessages.length === 0 ? (
                          <div className="text-xs text-anchor-muted/60 py-4 text-center">
                            No messages in this session.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {expandedMessages.map((msg, i) => (
                              <div key={`${msg.timestamp}-${i}`}>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span
                                    className={`text-xs font-medium ${
                                      msg.role === "user"
                                        ? "text-anchor-text/70"
                                        : "text-anchor-accent/80"
                                    }`}
                                  >
                                    {msg.role === "user" ? "You" : "Companion"}
                                  </span>
                                  <span className="text-xs text-anchor-muted/40">
                                    {new Date(msg.timestamp).toLocaleTimeString(undefined, {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <div className="text-sm text-anchor-text/80 leading-relaxed whitespace-pre-wrap pl-2 border-l-2 border-anchor-border">
                                  {msg.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
