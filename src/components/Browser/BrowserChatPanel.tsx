import { useState, useRef, useCallback, useEffect } from "react";
import { sendMessage, loadAPIConfig } from "../../lib/api/router";
import { parseWhispers, scheduleWhispers, fireImmediateWhispers, firePhoneWhispers } from "../../lib/care/whisper";
import {
  getActiveSession,
  saveMessage,
  loadHistory,
  buildSessionContext,
  type DisplayMessage,
} from "../../lib/sessions";
import type { Message, APIConfig, Session, PageContent } from "../../lib/types";

interface SharedContent {
  content: PageContent;
  timestamp: number;
}

interface BrowserChatPanelProps {
  sharedContent: SharedContent[];
}

const MAX_DISPLAY = 20;

export default function BrowserChatPanel({ sharedContent }: BrowserChatPanelProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  // ── Load active session + history ─────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getActiveSession();
        if (cancelled) return;
        setCurrentSession(session);
        const history = await loadHistory(session.id);
        if (cancelled) return;
        setMessages(history);
      } catch {
        // Session load failure — will retry on next mount
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Listen for session changes from App / ChatView ────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const session = (e as CustomEvent<Session>).detail;
      if (!session) return;
      setCurrentSession(session);
      setMessages([]);
      setError(null);
      loadHistory(session.id).then(setMessages).catch(() => {});
    };
    window.addEventListener("session-changed", handler);
    return () => window.removeEventListener("session-changed", handler);
  }, []);

  // ── Listen for messages sent from ChatView ────────────────────

  useEffect(() => {
    const handler = () => {
      if (!currentSession) return;
      loadHistory(currentSession.id).then(setMessages).catch(() => {});
    };
    window.addEventListener("chat-message-sent", handler);
    return () => window.removeEventListener("chat-message-sent", handler);
  }, [currentSession]);

  // ── Auto-scroll ───────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  // ── Inject shared page content as system message ──────────────

  useEffect(() => {
    if (sharedContent.length === 0 || !currentSession) return;
    const latest = sharedContent[sharedContent.length - 1]!;

    // Check if we already injected this one (by timestamp)
    const alreadyInjected = messages.some(
      (m) => m.role === "system" && m.timestamp === latest.timestamp,
    );
    if (alreadyInjected) return;

    const systemMsg: DisplayMessage = {
      role: "system",
      content: `[Shared page: ${latest.content.title}]\n\n${latest.content.text}`,
      timestamp: latest.timestamp,
    };
    setMessages((prev) => [...prev, systemMsg]);
    saveMessage(currentSession.id, systemMsg).catch(() => {});
  }, [sharedContent, currentSession, messages]);

  // ── Build API messages ────────────────────────────────────────

  const buildAPIMessages = useCallback(
    async (displayMessages: DisplayMessage[]): Promise<Message[]> => {
      if (!currentSession) return [];
      const apiMessages = await buildSessionContext(currentSession);

      for (const msg of displayMessages) {
        if (msg.role === "system") {
          apiMessages.push({ role: "system", content: msg.content });
        } else {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }
      return apiMessages;
    },
    [currentSession],
  );

  // ── Send message ──────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || !currentSession) return;

    setInput("");
    setError(null);

    const userMsg: DisplayMessage = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Persist
    saveMessage(currentSession.id, userMsg).catch(() => {});

    // Notify ChatView
    window.dispatchEvent(new CustomEvent("chat-message-sent"));

    setIsStreaming(true);
    setStreamContent("");
    abortRef.current = false;

    try {
      const config: APIConfig = await loadAPIConfig();
      const apiMessages = await buildAPIMessages(updatedMessages);
      let accumulated = "";

      for await (const chunk of sendMessage(apiMessages, config)) {
        if (abortRef.current) break;
        accumulated += chunk.text;
        setStreamContent(accumulated);
        if (chunk.done) break;
      }

      if (!abortRef.current && accumulated) {
        // Parse whisper/remind tags
        const { cleaned, whispers, immediateWhispers, phoneWhispers } = parseWhispers(accumulated);
        if (whispers.length > 0) scheduleWhispers(whispers);
        if (immediateWhispers.length > 0) fireImmediateWhispers(immediateWhispers).catch(() => {});
        if (phoneWhispers.length > 0) firePhoneWhispers(phoneWhispers).catch(() => {});

        const assistantMsg: DisplayMessage = {
          role: "assistant",
          content: cleaned || accumulated,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        saveMessage(currentSession.id, assistantMsg).catch(() => {});

        // Notify ChatView
        window.dispatchEvent(new CustomEvent("chat-message-sent"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsStreaming(false);
      setStreamContent("");
    }
  }, [input, isStreaming, currentSession, messages, buildAPIMessages]);

  // ── Render ────────────────────────────────────────────────────

  // Show last N messages
  const visible = messages.slice(-MAX_DISPLAY);

  return (
    <div className="flex flex-col h-full bg-anchor-surface">
      {/* Header */}
      <div className="px-3 py-2 border-b border-anchor-border flex items-center justify-between">
        <span className="text-xs font-medium text-anchor-muted">
          Chat
        </span>
        {currentSession && (
          <span className="text-[10px] text-anchor-muted/60 truncate ml-2">
            {currentSession.name}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {visible.length === 0 && !isStreaming && (
          <p className="text-[10px] text-anchor-muted text-center mt-6 px-2">
            Chat while browsing. Click &quot;Share with AI&quot; to add page context.
          </p>
        )}

        {visible.map((msg, i) => {
          if (msg.role === "system") {
            return (
              <div
                key={`${msg.timestamp}-${i}`}
                className="text-[10px] leading-snug rounded px-2 py-1.5 bg-anchor-bg border border-anchor-border text-anchor-muted truncate"
                title={msg.content}
              >
                📄 {msg.content.split("\n")[0]}
              </div>
            );
          }

          return (
            <div
              key={`${msg.timestamp}-${i}`}
              className={`text-xs leading-relaxed rounded-lg px-2.5 py-1.5 ${
                msg.role === "user"
                  ? "bg-anchor-accent/15 text-anchor-text ml-4"
                  : "bg-anchor-bg/50 text-anchor-text mr-4"
              }`}
            >
              <pre className="whitespace-pre-wrap font-[inherit]">{msg.content}</pre>
            </div>
          );
        })}

        {/* Streaming indicator */}
        {isStreaming && streamContent && (
          <div className="text-xs leading-relaxed rounded-lg px-2.5 py-1.5 bg-anchor-bg/50 text-anchor-text mr-4">
            <pre className="whitespace-pre-wrap font-[inherit]">{streamContent}</pre>
          </div>
        )}
        {isStreaming && !streamContent && (
          <div className="text-[10px] text-anchor-muted/60 text-center py-1">
            thinking...
          </div>
        )}

        {error && (
          <div className="text-[10px] text-red-400/80 text-center py-1">{error}</div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-anchor-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex gap-1.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this page..."
            disabled={isStreaming}
            className="flex-1 px-2.5 py-1.5 rounded-md bg-anchor-bg border border-anchor-border text-xs text-anchor-text placeholder-anchor-muted focus:outline-none focus:border-anchor-accent disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="px-2.5 py-1.5 rounded-md text-xs bg-anchor-accent text-white hover:bg-anchor-accent-hover disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
