import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamingMessageProps {
  content: string;
  timestamp: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function StreamingMessage({ content, timestamp }: StreamingMessageProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] bg-anchor-surface border border-anchor-border text-anchor-text rounded-2xl rounded-tl-sm px-4 py-2.5 break-words text-sm leading-relaxed">
        <div className="markdown-body markdown-assistant">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          <span className="inline-block w-0.5 h-4 bg-anchor-accent/70 animate-pulse ml-0.5 align-text-bottom" />
        </div>
        <div className="text-[10px] mt-1 text-anchor-muted">
          {formatTime(timestamp)}
        </div>
      </div>
    </div>
  );
}
