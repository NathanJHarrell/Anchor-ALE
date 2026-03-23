import { useState, useCallback, useRef, useEffect } from "react";
import NavigationBar from "./NavigationBar";
import DateLauncher from "./DateLauncher";
import { getCurrentPageContent } from "./ContentExtractor";
import { addBrowserHistory } from "../../lib/database";
import type { PageContent } from "../../lib/types";

const HOME_URL = "";
const DEFAULT_SPLIT = 0.6; // 60% browser, 40% chat
const MIN_SPLIT = 0.3;
const MAX_SPLIT = 0.8;

interface SharedContent {
  content: PageContent;
  timestamp: number;
}

export default function BrowserView() {
  // Navigation state
  const [currentUrl, setCurrentUrl] = useState(HOME_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Split view
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Shared content
  const [sharedContent, setSharedContent] = useState<SharedContent[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // AI navigation suggestions from chat
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // Chat input
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant" | "context"; text: string }[]>([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, sharedContent]);

  // ── Navigation ───────────────────────────────────────────────

  const navigateTo = useCallback(
    (url: string) => {
      if (!url) {
        setCurrentUrl(HOME_URL);
        return;
      }
      setCurrentUrl(url);
      setIsLoading(true);

      // Update history stack
      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(url);
        return newHistory;
      });
      setHistoryIndex((prev) => prev + 1);

      // Save to SQLite browser history
      const title = url; // Will be updated when iframe loads
      void addBrowserHistory(url, title);
    },
    [historyIndex]
  );

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]!);
      setIsLoading(true);
    }
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]!);
      setIsLoading(true);
    }
  }, [history, historyIndex]);

  const refresh = useCallback(() => {
    if (iframeRef.current && currentUrl) {
      setIsLoading(true);
      iframeRef.current.src = currentUrl;
    }
  }, [currentUrl]);

  const goHome = useCallback(() => {
    setCurrentUrl(HOME_URL);
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // ── Content extraction & sharing ─────────────────────────────

  const shareWithAI = useCallback(async () => {
    if (!currentUrl) return;
    setIsExtracting(true);
    try {
      const content = await getCurrentPageContent(currentUrl);
      const shared: SharedContent = { content, timestamp: Date.now() };
      setSharedContent((prev) => [...prev, shared]);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "context" as const,
          text: `📄 Shared: ${content.title}\n\n${content.text.slice(0, 500)}${content.text.length > 500 ? "..." : ""}`,
        },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "context" as const, text: "⚠ Could not extract content from this page." },
      ]);
    } finally {
      setIsExtracting(false);
    }
  }, [currentUrl]);

  // ── Chat with AI navigation detection ────────────────────────

  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text }]);

    // Simulate assistant response (real API integration happens in ChatView)
    // For now, demonstrate AI navigation detection
    setTimeout(() => {
      const response = `I see your message. The shared browser context is available for our conversation.`;
      setChatMessages((prev) => [...prev, { role: "assistant", text: response }]);

      // Check for [NAVIGATE: url] pattern in response
      const navMatch = /\[NAVIGATE:\s*(https?:\/\/[^\]]+)\]/i.exec(response);
      if (navMatch?.[1]) {
        setAiSuggestion(navMatch[1]);
      }
    }, 300);
  }, [chatInput]);

  // ── Resizable divider ────────────────────────────────────────

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, ratio)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // ── Render ───────────────────────────────────────────────────

  const showBrowser = currentUrl !== HOME_URL;

  return (
    <div className="flex flex-col h-full -m-4">
      {/* Navigation bar — always visible */}
      <NavigationBar
        currentUrl={currentUrl}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < history.length - 1}
        isLoading={isLoading || isExtracting}
        onNavigate={navigateTo}
        onBack={goBack}
        onForward={goForward}
        onRefresh={refresh}
        onHome={goHome}
        onShareWithAI={() => void shareWithAI()}
      />

      {/* AI navigation suggestion banner */}
      {aiSuggestion && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-anchor-accent/10 border-b border-anchor-border text-xs">
          <span className="text-anchor-accent">AI suggests:</span>
          <button
            onClick={() => {
              navigateTo(aiSuggestion);
              setAiSuggestion(null);
            }}
            className="text-anchor-accent underline hover:text-anchor-accent-hover transition-colors truncate max-w-md"
          >
            {aiSuggestion}
          </button>
          <button
            onClick={() => setAiSuggestion(null)}
            className="text-anchor-muted hover:text-anchor-text ml-auto"
          >
            ×
          </button>
        </div>
      )}

      {/* Main content area — split view */}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* Browser panel */}
        <div
          className="min-h-0 overflow-hidden"
          style={{ width: showBrowser ? `${splitRatio * 100}%` : "100%" }}
        >
          {showBrowser ? (
            <iframe
              ref={iframeRef}
              src={currentUrl}
              onLoad={handleIframeLoad}
              className="w-full h-full border-none bg-white"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
              title="Anchor Browser"
            />
          ) : (
            <DateLauncher onNavigate={navigateTo} />
          )}
        </div>

        {/* Resizable divider — only when browsing */}
        {showBrowser && (
          <div
            onMouseDown={handleDragStart}
            className={`w-1 cursor-col-resize shrink-0 transition-colors ${
              isDragging ? "bg-anchor-accent" : "bg-anchor-border hover:bg-anchor-accent/50"
            }`}
          />
        )}

        {/* Chat panel — visible when browsing */}
        {showBrowser && (
          <div
            className="flex flex-col min-h-0 bg-anchor-surface border-l border-anchor-border"
            style={{ width: `${(1 - splitRatio) * 100}%` }}
          >
            <div className="px-3 py-2 border-b border-anchor-border text-xs font-medium text-anchor-muted">
              Chat — Browser Context
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {chatMessages.length === 0 && sharedContent.length === 0 && (
                <p className="text-xs text-anchor-muted text-center mt-8">
                  Click &quot;Share with AI&quot; to send page content here, then chat about it.
                </p>
              )}

              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-xs leading-relaxed rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-anchor-accent/15 text-anchor-text ml-6"
                      : msg.role === "context"
                        ? "bg-anchor-bg border border-anchor-border text-anchor-muted"
                        : "bg-anchor-bg/50 text-anchor-text mr-6"
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-[inherit]">{msg.text}</pre>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div className="p-3 border-t border-anchor-border">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChatMessage();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about this page..."
                  className="flex-1 px-3 py-1.5 rounded-md bg-anchor-bg border border-anchor-border text-xs text-anchor-text placeholder-anchor-muted focus:outline-none focus:border-anchor-accent"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md text-xs bg-anchor-accent text-white hover:bg-anchor-accent-hover transition-colors"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Drag overlay to prevent iframe from stealing mouse events */}
      {isDragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}
