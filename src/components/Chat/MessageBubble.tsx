import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageImage {
  media_type: string;
  data: string;
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  images?: MessageImage[];
  companionInitiated?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function MessageBubble({ role, content, timestamp, images, companionInitiated }: MessageBubbleProps) {
  const isUser = role === "user";
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const openImage = useCallback((src: string) => {
    setExpandedImage(src);
  }, []);

  const closeImage = useCallback(() => {
    setExpandedImage(null);
  }, []);

  return (
    <>
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[75%] rounded-2xl px-4 py-2.5 break-words text-sm leading-relaxed ${
            isUser
              ? "bg-anchor-accent/90 text-white rounded-tr-sm"
              : companionInitiated
                ? "bg-anchor-surface/60 border border-anchor-border/40 text-anchor-text rounded-tl-sm"
                : "bg-anchor-surface border border-anchor-border text-anchor-text rounded-tl-sm"
          }`}
        >
          {/* Images above text */}
          {images && images.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {images.map((img, i) => {
                const src = `data:${img.media_type};base64,${img.data}`;
                return (
                  <img
                    key={i}
                    src={src}
                    alt={`Attached ${i + 1}`}
                    onClick={() => openImage(src)}
                    className="max-w-[200px] max-h-[200px] object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  />
                );
              })}
            </div>
          )}

          <div className={`markdown-body ${isUser ? "markdown-user" : "markdown-assistant"}`}>
            {companionInitiated && (
              <span className="text-anchor-muted/60 text-xs mr-1 select-none">✧</span>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
          <div
            className={`text-[10px] mt-1 ${
              isUser ? "text-white/50 text-right" : "text-anchor-muted"
            }`}
          >
            {formatTime(timestamp)}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {expandedImage && (
        <div
          onClick={closeImage}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
        >
          <img
            src={expandedImage}
            alt="Expanded"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={closeImage}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
