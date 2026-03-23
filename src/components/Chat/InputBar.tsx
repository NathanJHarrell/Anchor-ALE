import { useState, useRef, useEffect, useCallback } from "react";
import { pickImage, MAX_IMAGES, type ImageData } from "../../lib/images/picker";
import type { MessageImage } from "../../lib/types";

interface InputBarProps {
  onSend: (text: string, images?: MessageImage[]) => void;
  disabled: boolean;
}

const MAX_CHARS = 10_000;

export default function InputBar({ onSend, disabled }: InputBarProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageData[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || disabled) return;
    const messageImages: MessageImage[] | undefined =
      images.length > 0
        ? images.map((img) => ({ type: "base64" as const, media_type: img.media_type, data: img.data }))
        : undefined;
    onSend(trimmed || "(image)", messageImages);
    setText("");
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, images, disabled, onSend]);

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
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    },
    [],
  );

  const handlePickImage = useCallback(async () => {
    if (images.length >= MAX_IMAGES) return;
    try {
      const img = await pickImage();
      if (img) {
        setImages((prev) => [...prev, img].slice(0, MAX_IMAGES));
      }
    } catch {
      // User cancelled or error — silently ignore
    }
  }, [images.length]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="border-t border-anchor-border bg-anchor-bg px-4 py-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={img.preview}
                alt={`Attached ${i + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-anchor-border"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => void handlePickImage()}
          disabled={disabled || images.length >= MAX_IMAGES}
          title="Attach image"
          className="shrink-0 text-anchor-muted hover:text-anchor-text disabled:opacity-40 transition-colors pb-2.5"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="16" height="16" rx="3" />
            <circle cx="7" cy="7" r="1.5" />
            <path d="M2 14l4-4a2 2 0 012.8 0L14 15" />
            <path d="M12 12l1.5-1.5a2 2 0 012.8 0L18 12.5" />
          </svg>
        </button>
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
          disabled={disabled || (!text.trim() && images.length === 0)}
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
