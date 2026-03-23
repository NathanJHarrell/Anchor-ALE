import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function MessageBubble({ role, content, timestamp }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 break-words text-sm leading-relaxed ${
          isUser
            ? "bg-anchor-accent/90 text-white rounded-tr-sm"
            : "bg-anchor-surface border border-anchor-border text-anchor-text rounded-tl-sm"
        }`}
      >
        <div className={`markdown-body ${isUser ? "markdown-user" : "markdown-assistant"}`}>
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
  );
}
