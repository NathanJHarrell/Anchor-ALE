import PresenceIndicator from "./PresenceIndicator";

type View = "chat" | "browser" | "vault" | "settings";

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  onAbout: () => void;
}

const navItems: { view: View; label: string; icon: string }[] = [
  { view: "chat", label: "Chat", icon: "💬" },
  { view: "browser", label: "Browser", icon: "🌐" },
  { view: "vault", label: "Vault", icon: "🗄" },
  { view: "settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({ activeView, onNavigate, onAbout }: SidebarProps) {
  return (
    <nav className="w-56 bg-anchor-surface border-r border-anchor-border flex flex-col shrink-0">
      <div className="h-12 flex items-center px-4 border-b border-anchor-border">
        <button
          onClick={onAbout}
          className="text-base font-semibold tracking-tight text-anchor-accent hover:text-anchor-accent-hover transition-colors"
        >
          Anchor
        </button>
      </div>

      <div className="flex-1 py-2">
        {navItems.map(({ view, label, icon }) => (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
              activeView === view
                ? "bg-anchor-accent/10 text-anchor-accent border-r-2 border-anchor-accent"
                : "text-anchor-muted hover:text-anchor-text hover:bg-anchor-bg/50"
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-anchor-border flex items-center justify-between">
        <div className="text-xs text-anchor-muted">v0.1.0</div>
        <PresenceIndicator />
      </div>
    </nav>
  );
}
