export default function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3 max-w-[75%]">
      <div className="bg-anchor-surface rounded-2xl rounded-tl-sm px-4 py-3 border border-anchor-border">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full bg-anchor-accent/70 animate-[pulse_1.4s_ease-in-out_infinite]"
          />
          <span
            className="w-2 h-2 rounded-full bg-anchor-accent/70 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]"
          />
          <span
            className="w-2 h-2 rounded-full bg-anchor-accent/70 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]"
          />
        </div>
      </div>
    </div>
  );
}
