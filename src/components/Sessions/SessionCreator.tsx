import { useState, useRef, useEffect } from "react";

interface SessionCreatorProps {
  onCreate: (name: string) => void;
  onCancel: () => void;
}

export default function SessionCreator({ onCreate, onCancel }: SessionCreatorProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) {
      onCreate(name.trim());
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="px-3 py-1.5">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        placeholder="Session name…"
        className="w-full px-2 py-1 text-xs bg-anchor-bg border border-anchor-border rounded text-anchor-text placeholder:text-anchor-muted/50 focus:outline-none focus:border-anchor-accent"
      />
    </div>
  );
}
