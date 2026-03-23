import { useState, useRef, useEffect, useCallback } from "react";

interface InputBarProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

const MAX_CHARS = 10_000;

export default function InputBar({ onSend, disabled }: InputBarProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Re-focus after sending completes (disabled goes from true -> false)
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      if (val.length <= MAX_CHARS) {
        setText(val);
      }
      // Auto-resize
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    },
    [],
  );

  return (
    <div className="border-t border-anchor-border bg-anchor-bg px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Waiting for response…" : "Say something…"}
          rows={1}
          className="flex-1 resize-none bg-anchor-surface border border-anchor-border rounded-xl px-4 py-2.5 text-sm text-anchor-text placeholder:text-anchor-muted/60 focus:outline-none focus:border-anchor-accent/50 transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="shrink-0 bg-anchor-accent hover:bg-anchor-accent-hover disabled:opacity-40 disabled:hover:bg-anchor-accent text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
      <div className="text-[10px] text-anchor-muted mt-1">Markdown supported</div>
      {text.length > MAX_CHARS * 0.8 && (
        <div className="text-[10px] text-anchor-muted mt-1 text-right">
          {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </div>
      )}
    </div>
  );
}
