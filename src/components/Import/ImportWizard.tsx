import { useState, useCallback, useRef } from "react";
import type { NormalizedConversation, ImportOptions, ImportResult } from "../../lib/types";
import { parseClaudeExport } from "../../lib/import/claude-parser";
import { parseChatGPTExport } from "../../lib/import/chatgpt-parser";
import { importConversations } from "../../lib/import/importer";

type Platform = "claude" | "chatgpt";
type Step = "platform" | "file" | "preview" | "importing" | "complete";

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

export default function ImportWizard({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>("platform");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [conversations, setConversations] = useState<NormalizedConversation[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);

  // Import state
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [options] = useState<ImportOptions>({
    skipEmpty: true,
    maxMessagesPerSession: 0,
    deduplicate: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step 1: Platform ────────────────────────────────────────

  const handlePlatformSelect = useCallback((p: Platform) => {
    setPlatform(p);
    setStep("file");
  }, []);

  // ── Step 2: File ────────────────────────────────────────────

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);

    try {
      const text = await file.text();
      const parsed = platform === "claude"
        ? parseClaudeExport(text)
        : parseChatGPTExport(text);

      setConversations(parsed);
      setSelected(new Set(parsed.map((_, i) => i)));
      setStep("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to read file.");
    }
  }, [platform]);

  // ── Step 3: Preview ─────────────────────────────────────────

  const toggleConversation = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === conversations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(conversations.map((_, i) => i)));
    }
  }, [selected.size, conversations.length]);

  // ── Step 4: Import ──────────────────────────────────────────

  const handleImport = useCallback(async () => {
    const toImport = conversations.filter((_, i) => selected.has(i));
    if (toImport.length === 0) return;

    setStep("importing");

    const importResult = await importConversations(
      toImport,
      options,
      (current, total, name) => setProgress({ current, total, name }),
    );

    setResult(importResult);
    setStep("complete");
  }, [conversations, selected, options]);

  // ── Step 5: Complete ────────────────────────────────────────

  const handleFinish = useCallback(() => {
    onComplete();
    onClose();
  }, [onComplete, onClose]);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-anchor-surface border border-anchor-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-anchor-border shrink-0">
          <h2 className="text-sm font-semibold text-anchor-text">
            {step === "platform" && "Bringing your memories home"}
            {step === "file" && "Choose your export file"}
            {step === "preview" && "Your conversations"}
            {step === "importing" && "Bringing them home..."}
            {step === "complete" && "Welcome home"}
          </h2>
          {step !== "importing" && (
            <button
              onClick={onClose}
              className="text-anchor-muted hover:text-anchor-text text-xs transition-colors"
            >
              close
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Step 1: Platform */}
          {step === "platform" && (
            <div className="space-y-3">
              <p className="text-sm text-anchor-muted mb-4">
                Where are your conversations coming from?
              </p>
              <button
                onClick={() => handlePlatformSelect("claude")}
                className="w-full text-left p-4 rounded-lg border border-anchor-border hover:border-anchor-accent/40 transition-colors"
              >
                <div className="text-sm font-medium text-anchor-text">Claude</div>
                <div className="text-xs text-anchor-muted mt-1">
                  From Settings &rarr; Privacy &rarr; Export Data
                </div>
              </button>
              <button
                onClick={() => handlePlatformSelect("chatgpt")}
                className="w-full text-left p-4 rounded-lg border border-anchor-border hover:border-anchor-accent/40 transition-colors"
              >
                <div className="text-sm font-medium text-anchor-text">ChatGPT</div>
                <div className="text-xs text-anchor-muted mt-1">
                  From Settings &rarr; Data controls &rarr; Export data
                </div>
              </button>
            </div>
          )}

          {/* Step 2: File */}
          {step === "file" && (
            <div className="space-y-4">
              <p className="text-sm text-anchor-muted">
                Select the <span className="font-mono text-anchor-text">conversations.json</span> file
                from your {platform === "claude" ? "Claude" : "ChatGPT"} data export.
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-anchor-border hover:border-anchor-accent/40 rounded-lg p-8 text-center cursor-pointer transition-colors"
              >
                <div className="text-anchor-muted text-sm">
                  Click to choose file
                </div>
                <div className="text-xs text-anchor-muted/50 mt-1">
                  .json files only
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={(e) => void handleFileSelect(e)}
                className="hidden"
              />
              {parseError && (
                <div className="text-xs text-red-400 bg-red-400/10 rounded-lg p-3">
                  {parseError}
                </div>
              )}
              <button
                onClick={() => setStep("platform")}
                className="text-xs text-anchor-muted hover:text-anchor-text transition-colors"
              >
                &larr; back
              </button>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-anchor-muted">
                  Found {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}.
                  {" "}{selected.size} selected.
                </p>
                <button
                  onClick={toggleAll}
                  className="text-xs text-anchor-accent hover:text-anchor-accent/80 transition-colors"
                >
                  {selected.size === conversations.length ? "deselect all" : "select all"}
                </button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {conversations.map((conv, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-anchor-bg/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggleConversation(i)}
                      className="rounded border-anchor-border text-anchor-accent focus:ring-anchor-accent/50"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-anchor-text truncate">
                        {conv.name}
                      </div>
                      <div className="text-xs text-anchor-muted">
                        {conv.messages.length} message{conv.messages.length !== 1 ? "s" : ""}
                        {" "}&middot;{" "}
                        {new Date(conv.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === "importing" && (
            <div className="py-6 space-y-4">
              <div className="text-sm text-anchor-text text-center truncate px-4">
                {progress.name || "Starting..."}
              </div>
              <div className="w-full bg-anchor-bg rounded-full h-2 overflow-hidden">
                <div
                  className="bg-anchor-accent h-full rounded-full transition-all duration-300"
                  style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "0%" }}
                />
              </div>
              <div className="text-xs text-anchor-muted text-center">
                {progress.current} of {progress.total}
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === "complete" && result && (
            <div className="py-4 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-2xl">
                  {result.errors.length === 0 ? "" : ""}
                </div>
                <p className="text-sm text-anchor-text">
                  {result.imported} conversation{result.imported !== 1 ? "s" : ""} brought home.
                </p>
                {result.skipped > 0 && (
                  <p className="text-xs text-anchor-muted">
                    {result.skipped} skipped (empty or already here).
                  </p>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs text-red-400 bg-red-400/10 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <div className="font-medium mb-1">Some couldn't make it:</div>
                  {result.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === "preview" || step === "complete") && (
          <div className="px-5 py-3 border-t border-anchor-border shrink-0">
            {step === "preview" && (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep("file")}
                  className="text-xs text-anchor-muted hover:text-anchor-text transition-colors"
                >
                  &larr; back
                </button>
                <button
                  onClick={() => void handleImport()}
                  disabled={selected.size === 0}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-anchor-accent text-white hover:bg-anchor-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Import {selected.size} conversation{selected.size !== 1 ? "s" : ""}
                </button>
              </div>
            )}
            {step === "complete" && (
              <div className="flex justify-end">
                <button
                  onClick={handleFinish}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-anchor-accent text-white hover:bg-anchor-accent/90 transition-colors"
                >
                  View archive
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
