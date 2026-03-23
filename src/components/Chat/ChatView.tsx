import { useState, useRef, useCallback, useEffect } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { sendMessage, loadAPIConfig, estimateTokens } from "../../lib/api/router";
import { getSetting } from "../../lib/database";
import { buildVaultContext } from "../../lib/vault/injector";
import type { Message, APIConfig } from "../../lib/types";
import MessageBubble from "./MessageBubble";
import StreamingMessage from "./StreamingMessage";
import ThinkingIndicator from "./ThinkingIndicator";
import InputBar from "./InputBar";
import CareNotifications from "./CareNotifications";
import { parseWhispers, scheduleWhispers } from "../../lib/care/whisper";
import {
  createAftercareState,
  recordMessage,
  checkAftercare,
  type AftercareNotification,
  type AftercareAction,
} from "../../lib/care/aftercare";

interface DisplayMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface StatusInfo {
  content: string;
  timestamp: number;
}

interface ChatViewProps {
  onNavigate?: (view: "vault" | "browser") => void;
}

export default function ChatView({ onNavigate }: ChatViewProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamTimestamp, setStreamTimestamp] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [statusMessages, setStatusMessages] = useState<StatusInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [aftercare, setAftercare] = useState<AftercareNotification | null>(null);

  const systemPromptRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollLockedRef = useRef(false);
  const abortRef = useRef(false);
  const aftercareRef = useRef(createAftercareState());

  // ── System prompt loading ───────────────────────────────────────

  const loadSystemPrompt = useCallback(async () => {
    try {
      const promptPath = await getSetting("systemPromptPath");
      if (!promptPath) {
        systemPromptRef.current = null;
        return;
      }
      const content = await readTextFile(promptPath);
      systemPromptRef.current = content;
    } catch {
      systemPromptRef.current = null;
    }
  }, []);

  useEffect(() => {
    loadSystemPrompt();
  }, [loadSystemPrompt]);

  // ── Auto-scroll ─────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    if (!isScrollLockedRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamContent, isThinking, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isScrollLockedRef.current = distanceFromBottom > 80;
  }, []);

  // ── Build API messages ──────────────────────────────────────────

  const buildAPIMessages = useCallback(
    async (displayMessages: DisplayMessage[]): Promise<Message[]> => {
      const apiMessages: Message[] = [];

      // System prompt first
      if (systemPromptRef.current) {
        apiMessages.push({ role: "system", content: systemPromptRef.current });
      }

      // Vault context
      try {
        const vaultCtx = await buildVaultContext();
        if (vaultCtx) {
          apiMessages.push({ role: "system", content: vaultCtx });
        }
      } catch {
        // Vault unavailable — continue without
      }

      // Conversation messages
      for (const msg of displayMessages) {
        if (msg.role !== "system") {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }

      return apiMessages;
    },
    [],
  );

  // ── Slash commands ──────────────────────────────────────────────

  const handleSlashCommand = useCallback(
    async (input: string): Promise<boolean> => {
      const cmd = input.toLowerCase().trim();

      if (cmd === "/clear") {
        setMessages([]);
        setStatusMessages([]);
        setError(null);
        return true;
      }

      if (cmd === "/reload") {
        await loadSystemPrompt();
        setStatusMessages((prev) => [
          ...prev,
          {
            content: systemPromptRef.current
              ? "System prompt reloaded."
              : "No system prompt file configured.",
            timestamp: Date.now(),
          },
        ]);
        return true;
      }

      if (cmd === "/vault") {
        onNavigate?.("vault");
        return true;
      }

      if (cmd === "/date") {
        onNavigate?.("browser");
        return true;
      }

      if (cmd === "/status") {
        try {
          const config = await loadAPIConfig();
          const conversationMessages = messages.filter(
            (m) => m.role !== "system",
          );
          const apiMsgs = conversationMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
          const tokens = estimateTokens(apiMsgs);
          setStatusMessages((prev) => [
            ...prev,
            {
              content: `Provider: ${config.provider} · Model: ${config.model} · ~${tokens.toLocaleString()} tokens`,
              timestamp: Date.now(),
            },
          ]);
        } catch (err) {
          setStatusMessages((prev) => [
            ...prev,
            {
              content: `Status unavailable: ${err instanceof Error ? err.message : "Unknown error"}`,
              timestamp: Date.now(),
            },
          ]);
        }
        return true;
      }

      return false;
    },
    [loadSystemPrompt, messages, onNavigate],
  );

  // ── Send message ────────────────────────────────────────────────

  const handleSend = useCallback(
    async (text: string) => {
      // Check slash commands
      if (text.startsWith("/")) {
        const handled = await handleSlashCommand(text);
        if (handled) return;
      }

      setError(null);
      const userMsg: DisplayMessage = {
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      // Track for aftercare detection
      recordMessage(aftercareRef.current, text.length);
      setIsStreaming(true);
      setIsThinking(true);
      setStreamContent("");
      setStreamTimestamp(Date.now());
      abortRef.current = false;

      try {
        const config: APIConfig = await loadAPIConfig();
        const apiMessages = await buildAPIMessages(updatedMessages);
        let accumulated = "";

        for await (const chunk of sendMessage(apiMessages, config)) {
          if (abortRef.current) break;

          if (isThinking) setIsThinking(false);
          accumulated += chunk.text;
          setStreamContent(accumulated);
          setIsThinking(false);

          if (chunk.done) break;
        }

        if (!abortRef.current && accumulated) {
          // Parse whisper tags from AI response
          const { cleaned, whispers } = parseWhispers(accumulated);
          if (whispers.length > 0) {
            scheduleWhispers(whispers);
          }

          const finalContent = cleaned || accumulated;
          const assistantMsg: DisplayMessage = {
            role: "assistant",
            content: finalContent,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);

          // Track for aftercare detection
          recordMessage(aftercareRef.current, finalContent.length);
          const ac = checkAftercare(aftercareRef.current);
          if (ac) setAftercare(ac);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setIsStreaming(false);
        setIsThinking(false);
        setStreamContent("");
      }
    },
    [messages, handleSlashCommand, buildAPIMessages],
  );

  // ── Render ──────────────────────────────────────────────────────

  const handleAftercareAction = useCallback(
    (action: AftercareAction) => {
      setAftercare(null);
      if (action === "check_in") {
        handleSend("How are you doing right now?");
      } else if (action === "open_vault") {
        onNavigate?.("vault");
      }
    },
    [handleSend, onNavigate],
  );

  const isEmpty = messages.length === 0 && statusMessages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full -m-4">
      {/* Care notifications banner */}
      <CareNotifications
        aftercare={aftercare}
        onAftercareAction={handleAftercareAction}
        onAftercareDismiss={() => setAftercare(null)}
      />

      {/* Message area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {isEmpty && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-anchor-muted/40 text-4xl mb-3">~</div>
              <p className="text-anchor-muted text-sm">
                Start a conversation.
              </p>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, i) => {
            // Interleave status messages that occurred before this message
            const statusBefore = statusMessages.filter(
              (s) =>
                s.timestamp <= msg.timestamp &&
                (i === 0 || s.timestamp > messages[i - 1]!.timestamp),
            );

            return (
              <div key={`${msg.timestamp}-${i}`}>
                {statusBefore.map((s, si) => (
                  <div
                    key={`status-${s.timestamp}-${si}`}
                    className="text-center text-xs text-anchor-muted/70 py-2 italic"
                  >
                    {s.content}
                  </div>
                ))}
                {msg.role !== "system" && (
                  <MessageBubble
                    role={msg.role as "user" | "assistant"}
                    content={msg.content}
                    timestamp={msg.timestamp}
                  />
                )}
              </div>
            );
          })}

          {/* Status messages after last message */}
          {statusMessages
            .filter(
              (s) =>
                messages.length === 0 ||
                s.timestamp > messages[messages.length - 1]!.timestamp,
            )
            .map((s, si) => (
              <div
                key={`status-trailing-${s.timestamp}-${si}`}
                className="text-center text-xs text-anchor-muted/70 py-2 italic"
              >
                {s.content}
              </div>
            ))}

          {isThinking && <ThinkingIndicator />}
          {isStreaming && streamContent && (
            <StreamingMessage
              content={streamContent}
              timestamp={streamTimestamp}
            />
          )}

          {error && (
            <div className="text-center text-xs text-red-400/80 py-2">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <InputBar onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
