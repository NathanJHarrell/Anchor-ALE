import { useState, useEffect, useCallback, useRef } from "react";
import PresenceIndicator from "./PresenceIndicator";
import SessionCreator from "../Sessions/SessionCreator";
import type { Session } from "../../lib/types";

type View = "chat" | "browser" | "vault" | "archive" | "settings";

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  onAbout: () => void;
  sessions: Session[];
  activeSession: Session | null;
  onSessionSwitch: (session: Session) => void;
  onSessionCreate: (name: string) => void;
  onSessionRename: (sessionId: string, name: string) => void;
  onSessionDelete: (sessionId: string) => void;
}

const navItems: { view: View; label: string; icon: string }[] = [
  { view: "chat", label: "Chat", icon: "💬" },
  { view: "browser", label: "Browser", icon: "🌐" },
  { view: "vault", label: "Vault", icon: "🗄" },
  { view: "archive", label: "Archive", icon: "📚" },
  { view: "settings", label: "Settings", icon: "⚙" },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Sidebar({
  activeView,
  onNavigate,
  onAbout,
  sessions,
  activeSession,
  onSessionSwitch,
  onSessionCreate,
  onSessionRename,
  onSessionDelete,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  const homeSession = sessions.find((s) => s.type === "home");
  const projectSessions = sessions
    .filter((s) => s.type !== "home")
    .sort((a, b) => b.updatedAt - a.updatedAt);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  }, []);

  const handleCreate = useCallback((name: string) => {
    setCreating(false);
    onSessionCreate(name);
  }, [onSessionCreate]);

  const startRename = useCallback((sessionId: string, currentName: string) => {
    setContextMenu(null);
    setRenaming(sessionId);
    setRenameValue(currentName);
  }, []);

  const commitRename = useCallback(() => {
    if (renaming && renameValue.trim()) {
      onSessionRename(renaming, renameValue.trim());
    }
    setRenaming(null);
  }, [renaming, renameValue, onSessionRename]);

  const handleDelete = useCallback((sessionId: string) => {
    setContextMenu(null);
    onSessionDelete(sessionId);
  }, [onSessionDelete]);

  const renderSession = (session: Session) => {
    const isActive = activeSession?.id === session.id;
    const isHome = session.type === "home";
    const isRenaming = renaming === session.id;

    return (
      <button
        key={session.id}
        onClick={() => onSessionSwitch(session)}
        onContextMenu={isHome ? undefined : (e) => handleContextMenu(e, session.id)}
        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors group ${
          isActive
            ? "bg-[#9333EA]/10 text-[#9333EA] border-l-2 border-[#9333EA]"
            : "text-anchor-muted hover:text-anchor-text hover:bg-anchor-bg/50 border-l-2 border-transparent"
        }`}
      >
        <span className="shrink-0 text-[10px]">{isHome ? "⌂" : "◆"}</span>
        {isRenaming ? (
          <input
            ref={renameRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent border-b border-anchor-accent text-anchor-text text-xs focus:outline-none"
          />
        ) : (
          <span className="truncate flex-1 min-w-0">{session.name}</span>
        )}
        {!isHome && !isRenaming && (
          <span className="text-[9px] text-anchor-muted/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {relativeTime(session.updatedAt)}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav className="w-56 bg-anchor-surface border-r border-anchor-border flex flex-col shrink-0">
      <div className="h-12 flex items-center px-4 border-b border-anchor-border">
        <button
          onClick={onAbout}
          className="text-base font-semibold tracking-tight text-anchor-accent hover:text-anchor-accent-hover transition-colors"
        >
          Anchor
        </button>
      </div>

      {/* Sessions section */}
      <div className="border-b border-anchor-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-wider text-anchor-muted/70 hover:text-anchor-muted transition-colors"
        >
          <span>Sessions</span>
          <div className="flex items-center gap-1">
            <span
              onClick={(e) => {
                e.stopPropagation();
                setCreating(true);
              }}
              className="text-anchor-muted/50 hover:text-anchor-accent text-sm cursor-pointer transition-colors"
              title="New project"
            >
              +
            </span>
            <span className="text-[8px]">{collapsed ? "▸" : "▾"}</span>
          </div>
        </button>

        {!collapsed && (
          <div className="pb-1">
            {homeSession && renderSession(homeSession)}
            {projectSessions.map(renderSession)}
            {creating && (
              <SessionCreator
                onCreate={handleCreate}
                onCancel={() => setCreating(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Nav items */}
      <div className="flex-1 py-2">
        {navItems.map(({ view, label, icon }) => (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
              activeView === view
                ? "bg-anchor-accent/10 text-anchor-accent border-r-2 border-anchor-accent"
                : "text-anchor-muted hover:text-anchor-text hover:bg-anchor-bg/50"
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-anchor-border flex items-center justify-between">
        <div className="text-xs text-anchor-muted">v0.1.0</div>
        <PresenceIndicator />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-anchor-surface border border-anchor-border rounded shadow-lg py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const s = sessions.find((s) => s.id === contextMenu.sessionId);
              if (s) startRename(s.id, s.name);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-anchor-text hover:bg-anchor-bg/50 transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenu.sessionId)}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </nav>
  );
}
