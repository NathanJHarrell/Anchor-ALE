import { useState, useCallback, type KeyboardEvent, type FormEvent } from "react";

interface NavigationBarProps {
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onHome: () => void;
  onShareWithAI: () => void;
}

export default function NavigationBar({
  currentUrl,
  canGoBack,
  canGoForward,
  isLoading,
  onNavigate,
  onBack,
  onForward,
  onRefresh,
  onHome,
  onShareWithAI,
}: NavigationBarProps) {
  const [inputValue, setInputValue] = useState(currentUrl);
  const [focused, setFocused] = useState(false);

  // Sync input when URL changes externally (but not while user is typing)
  const displayValue = focused ? inputValue : currentUrl;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      let url = inputValue.trim();
      if (!url) return;
      // Auto-add protocol if missing
      if (!/^https?:\/\//i.test(url)) {
        // If it looks like a search query, use DuckDuckGo
        if (!url.includes(".") || url.includes(" ")) {
          url = `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
        } else {
          url = `https://${url}`;
        }
      }
      onNavigate(url);
    },
    [inputValue, onNavigate]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInputValue(currentUrl);
        (e.target as HTMLInputElement).blur();
      }
    },
    [currentUrl]
  );

  const navBtn =
    "px-2 py-1.5 rounded text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-anchor-border/50 text-anchor-muted hover:text-anchor-text";

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 bg-anchor-surface border-b border-anchor-border">
      <button onClick={onBack} disabled={!canGoBack} className={navBtn} title="Back">
        ←
      </button>
      <button onClick={onForward} disabled={!canGoForward} className={navBtn} title="Forward">
        →
      </button>
      <button onClick={onRefresh} className={navBtn} title="Refresh">
        {isLoading ? "◻" : "↻"}
      </button>
      <button onClick={onHome} className={navBtn} title="Home">
        ⌂
      </button>

      <form onSubmit={handleSubmit} className="flex-1 mx-2">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setInputValue(currentUrl);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL or search..."
          className="w-full px-3 py-1.5 rounded-md bg-anchor-bg border border-anchor-border text-sm text-anchor-text placeholder-anchor-muted focus:outline-none focus:border-anchor-accent transition-colors"
          spellCheck={false}
        />
      </form>

      <button
        onClick={onShareWithAI}
        className="px-3 py-1.5 rounded-md text-xs font-medium bg-anchor-accent/15 text-anchor-accent hover:bg-anchor-accent/25 transition-colors whitespace-nowrap"
        title="Share page content with AI chat"
      >
        Share with AI
      </button>
    </div>
  );
}
