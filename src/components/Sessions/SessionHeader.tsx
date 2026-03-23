import { useState, useRef, useEffect } from "react";
import type { Session } from "../../lib/types";

interface SessionHeaderProps {
  session: Session | null;
  onRename: (name: string) => void;
  onGoHome: () => void;
  messageCount: number;
}

export default function SessionHeader({ session, onRename, onGoHome, messageCount }: SessionHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!session) return null;

  const startEdit = () => {
    if (session.type === "home") return;
    setEditName(session.name);
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== session.name) {
      onRename(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 min-w-0">
      {session.type === "project" && (
        <button
          onClick={onGoHome}
          className="text-xs text-anchor-muted hover:text-anchor-text transition-colors shrink-0"
          title="Back to Home"
        >
          ←
        </button>
      )}

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitEdit}
          className="text-sm font-medium bg-transparent border-b border-anchor-accent text-anchor-text focus:outline-none min-w-0"
        />
      ) : (
        <button
          onClick={startEdit}
          className="text-sm font-medium truncate min-w-0 hover:text-anchor-accent transition-colors"
          title={session.type === "project" ? "Click to rename" : session.name}
        >
          {session.name}
        </button>
      )}

      <span className="text-[10px] px-1.5 py-0.5 rounded bg-anchor-surface text-anchor-muted border border-anchor-border shrink-0">
        {session.type === "home" ? "Home" : "Project"}
      </span>

      {session.type === "project" && messageCount > 0 && (
        <span className="text-[10px] text-anchor-muted shrink-0">
          {messageCount} msgs
        </span>
      )}
    </div>
  );
}
