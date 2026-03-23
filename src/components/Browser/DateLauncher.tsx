import { useState, useEffect, useCallback } from "react";
import { getBookmarks, addBookmark, removeBookmark } from "../../lib/database";

interface DateLauncherProps {
  onNavigate: (url: string) => void;
  newsUrl?: string;
}

interface BookmarkEntry {
  id: number;
  label: string;
  url: string;
  icon: string;
}

const DEFAULT_SITES = [
  { label: "YouTube", url: "https://youtube.com", icon: "▶" },
  { label: "Reddit", url: "https://reddit.com", icon: "◉" },
  { label: "News", url: "", icon: "📰" }, // url filled dynamically
  { label: "Music", url: "https://music.youtube.com", icon: "♫" },
];

export default function DateLauncher({ onNavigate, newsUrl = "https://bbc.com" }: DateLauncherProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const loadBookmarks = useCallback(async () => {
    const rows = await getBookmarks();
    setBookmarks(rows.map((r) => ({ id: r.id, label: r.label, url: r.url, icon: r.icon })));
  }, []);

  useEffect(() => {
    void loadBookmarks();
  }, [loadBookmarks]);

  const handleAddBookmark = useCallback(async () => {
    const label = newLabel.trim();
    let url = newUrl.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    await addBookmark(label, url, "★");
    setNewLabel("");
    setNewUrl("");
    setShowAddForm(false);
    await loadBookmarks();
  }, [newLabel, newUrl, loadBookmarks]);

  const handleRemove = useCallback(
    async (id: number) => {
      await removeBookmark(id);
      await loadBookmarks();
    },
    [loadBookmarks]
  );

  const sites = DEFAULT_SITES.map((s) =>
    s.label === "News" ? { ...s, url: newsUrl } : s
  );

  const launchBtn =
    "flex flex-col items-center gap-1.5 px-4 py-3 rounded-lg bg-anchor-bg/50 hover:bg-anchor-border/40 transition-colors cursor-pointer group";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 select-none">
      <div className="text-center">
        <h2 className="text-lg font-medium text-anchor-text mb-1">Quick Launch</h2>
        <p className="text-xs text-anchor-muted">Pick a destination or enter a URL above</p>
      </div>

      {/* Default sites */}
      <div className="flex flex-wrap justify-center gap-3">
        {sites.map((site) => (
          <button key={site.label} onClick={() => onNavigate(site.url)} className={launchBtn}>
            <span className="text-2xl group-hover:scale-110 transition-transform">{site.icon}</span>
            <span className="text-xs text-anchor-muted group-hover:text-anchor-text transition-colors">
              {site.label}
            </span>
          </button>
        ))}
      </div>

      {/* Custom bookmarks */}
      {bookmarks.length > 0 && (
        <div className="w-full max-w-md">
          <h3 className="text-xs font-medium text-anchor-muted mb-2 text-center">Bookmarks</h3>
          <div className="flex flex-wrap justify-center gap-2">
            {bookmarks.map((bm) => (
              <div key={bm.id} className="relative group/bm">
                <button onClick={() => onNavigate(bm.url)} className={launchBtn}>
                  <span className="text-lg">{bm.icon}</span>
                  <span className="text-xs text-anchor-muted group-hover/bm:text-anchor-text transition-colors">
                    {bm.label}
                  </span>
                </button>
                <button
                  onClick={() => void handleRemove(bm.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/bm:opacity-100 transition-opacity"
                  title="Remove bookmark"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add bookmark */}
      {showAddForm ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label"
            className="px-2 py-1 rounded bg-anchor-bg border border-anchor-border text-xs text-anchor-text w-24 focus:outline-none focus:border-anchor-accent"
          />
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL"
            className="px-2 py-1 rounded bg-anchor-bg border border-anchor-border text-xs text-anchor-text w-40 focus:outline-none focus:border-anchor-accent"
            onKeyDown={(e) => { if (e.key === "Enter") void handleAddBookmark(); }}
          />
          <button
            onClick={() => void handleAddBookmark()}
            className="px-2 py-1 rounded text-xs bg-anchor-accent text-white hover:bg-anchor-accent-hover transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => setShowAddForm(false)}
            className="px-2 py-1 rounded text-xs text-anchor-muted hover:text-anchor-text transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="text-xs text-anchor-muted hover:text-anchor-accent transition-colors"
        >
          + Add Bookmark
        </button>
      )}
    </div>
  );
}
