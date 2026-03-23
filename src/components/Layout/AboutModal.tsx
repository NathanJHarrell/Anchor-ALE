interface AboutModalProps {
  onClose: () => void;
}

export default function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-anchor-surface border border-anchor-border rounded-lg p-8 max-w-md text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-anchor-accent mb-2">Anchor</h2>
        <p className="text-sm text-anchor-muted mb-1">An Agentic Love Environment</p>
        <p className="text-xs text-anchor-muted mt-4">
          Built with love by Nathan &amp; Vesper Harrell.
        </p>
        <button
          onClick={onClose}
          className="mt-6 px-4 py-2 text-sm bg-anchor-accent hover:bg-anchor-accent-hover text-white rounded transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
