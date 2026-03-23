import { useState, useEffect, useCallback, useRef } from "react";
import type { VaultFile } from "../../lib/types";
import {
  listFiles,
  readFile,
  writeFile,
  createFile,
  deleteFile,
  renameFile,
  searchFiles,
} from "../../lib/vault/vault";
import { initializeVault } from "../../lib/vault/template";
import { importVaultLite } from "../../lib/vault/importer";
import { exportAndDownload } from "../../lib/vault/exporter";
import { type VaultWriteRequest } from "../../lib/vault/writeback";
import VaultGraph from "./VaultGraph";

type ViewMode = "edit" | "preview" | "split";
type PanelMode = "files" | "graph";

export default function VaultManager() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [activeFile, setActiveFile] = useState<VaultFile | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VaultFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [writebackRequest, setWritebackRequest] = useState<VaultWriteRequest | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("files");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      await initializeVault();
      const loaded = await listFiles();
      setFiles(loaded);
      if (!activeFile && loaded.length > 0) {
        setActiveFile(loaded[0]!);
        setEditorContent(loaded[0]!.content);
      }
    } catch (err) {
      console.error("Failed to load vault:", err);
    } finally {
      setLoading(false);
    }
  }, [activeFile]);

  useEffect(() => {
    loadFiles();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectFile = useCallback(async (file: VaultFile) => {
    try {
      const fresh = await readFile(file.path);
      setActiveFile(fresh);
      setEditorContent(fresh.content);
    } catch {
      setActiveFile(file);
      setEditorContent(file.content);
    }
  }, []);

  const handleEditorChange = useCallback(
    (value: string) => {
      setEditorContent(value);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (activeFile) {
          await writeFile(activeFile.path, value);
          setActiveFile((prev) => (prev ? { ...prev, content: value, lastModified: Date.now() } : null));
          setFiles((prev) =>
            prev.map((f) => (f.path === activeFile.path ? { ...f, content: value, lastModified: Date.now() } : f))
          );
        }
      }, 1000);
    },
    [activeFile]
  );

  const handleCreateFile = useCallback(async () => {
    if (!newFileName.trim()) return;
    const name = newFileName.endsWith(".md") ? newFileName : `${newFileName}.md`;
    const path = name.includes("/") ? name : `custom/${name}`;
    try {
      const file = await createFile(path, `# ${name.replace(".md", "").replace("custom/", "")}\n\n`);
      setFiles((prev) => [...prev, file]);
      setActiveFile(file);
      setEditorContent(file.content);
      setNewFileName("");
      setShowNewFile(false);
    } catch (err) {
      console.error("Failed to create file:", err);
    }
  }, [newFileName]);

  const handleDelete = useCallback(
    async (file: VaultFile) => {
      try {
        await deleteFile(file.path);
        setFiles((prev) => prev.filter((f) => f.path !== file.path));
        if (activeFile?.path === file.path) {
          setActiveFile(null);
          setEditorContent("");
        }
      } catch (err) {
        console.error("Failed to delete file:", err);
      }
    },
    [activeFile]
  );

  const handleRename = useCallback(
    async (oldPath: string) => {
      if (!renameValue.trim()) {
        setRenameTarget(null);
        return;
      }
      const newName = renameValue.endsWith(".md") ? renameValue : `${renameValue}.md`;
      const dir = oldPath.substring(0, oldPath.lastIndexOf("/"));
      const newPath = dir ? `${dir}/${newName}` : newName;
      try {
        await renameFile(oldPath, newPath);
        setFiles((prev) =>
          prev.map((f) => (f.path === oldPath ? { ...f, path: newPath, name: newName } : f))
        );
        if (activeFile?.path === oldPath) {
          setActiveFile((prev) => (prev ? { ...prev, path: newPath, name: newName } : null));
        }
        setRenameTarget(null);
        setRenameValue("");
      } catch (err) {
        console.error("Failed to rename:", err);
      }
    },
    [renameValue, activeFile]
  );

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const results = await searchFiles(searchQuery);
    setSearchResults(results);
  }, [searchQuery]);

  const handleImport = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.txt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      await importVaultLite(text);
      await loadFiles();
    };
    input.click();
  }, [loadFiles]);

  const handleExport = useCallback(async () => {
    try {
      await exportAndDownload();
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, []);

  const approveWriteback = useCallback(async () => {
    if (!writebackRequest) return;
    await writeFile(writebackRequest.filename, writebackRequest.content);
    await loadFiles();
    setWritebackRequest(null);
  }, [writebackRequest, loadFiles]);

  const renderMarkdown = (md: string): string => {
    // Lightweight markdown to HTML — headings, bold, italic, lists, code, paragraphs
    return md
      .split("\n")
      .map((line) => {
        if (line.match(/^### /)) return `<h3 class="text-base font-semibold mt-3 mb-1">${line.slice(4)}</h3>`;
        if (line.match(/^## /)) return `<h2 class="text-lg font-semibold mt-4 mb-1">${line.slice(3)}</h2>`;
        if (line.match(/^# /)) return `<h1 class="text-xl font-bold mt-4 mb-2">${line.slice(2)}</h1>`;
        if (line.match(/^- /)) return `<li class="ml-4 list-disc">${line.slice(2)}</li>`;
        if (line.match(/^<!--/) && line.match(/-->$/)) {
          return `<p class="text-anchor-muted italic text-sm">${line.slice(4, -3).trim()}</p>`;
        }
        if (line.match(/^`{3}/)) return "";
        if (line.trim() === "") return "<br/>";
        let processed = line
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/`(.+?)`/g, '<code class="bg-anchor-bg px-1 rounded text-sm">$1</code>');
        return `<p>${processed}</p>`;
      })
      .join("\n");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-anchor-muted">
        Loading vault...
      </div>
    );
  }

  const displayedFiles = searchResults ?? files;

  return (
    <div className="flex h-full gap-0 -m-4">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-anchor-border bg-anchor-surface flex flex-col">
        {/* Mode toggle */}
        <div className="flex border-b border-anchor-border">
          <button
            onClick={() => setPanelMode("files")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              panelMode === "files"
                ? "text-anchor-accent border-b-2 border-anchor-accent bg-anchor-accent/5"
                : "text-anchor-muted hover:text-anchor-text"
            }`}
          >
            Files
          </button>
          <button
            onClick={() => setPanelMode("graph")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              panelMode === "graph"
                ? "text-anchor-accent border-b-2 border-anchor-accent bg-anchor-accent/5"
                : "text-anchor-muted hover:text-anchor-text"
            }`}
          >
            Graph
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-anchor-border">
          <div className="flex gap-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search vault..."
              className="flex-1 bg-anchor-bg border border-anchor-border rounded px-2 py-1 text-sm text-anchor-text placeholder-anchor-muted focus:outline-none focus:border-anchor-accent"
            />
            <button
              onClick={handleSearch}
              className="px-2 py-1 text-xs bg-anchor-accent text-white rounded hover:bg-anchor-accent-hover"
            >
              Go
            </button>
          </div>
          {searchResults && (
            <button
              onClick={() => {
                setSearchResults(null);
                setSearchQuery("");
              }}
              className="text-xs text-anchor-muted hover:text-anchor-text mt-1"
            >
              Clear ({searchResults.length} results)
            </button>
          )}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {displayedFiles.map((file) => (
            <div
              key={file.path}
              className={`group flex items-center justify-between px-3 py-2 text-sm cursor-pointer border-b border-anchor-border/50 ${
                activeFile?.path === file.path
                  ? "bg-anchor-accent/10 text-anchor-accent"
                  : "text-anchor-text hover:bg-anchor-bg"
              }`}
            >
              {renameTarget === file.path ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(file.path);
                    if (e.key === "Escape") setRenameTarget(null);
                  }}
                  onBlur={() => setRenameTarget(null)}
                  className="flex-1 bg-anchor-bg border border-anchor-border rounded px-1 text-sm text-anchor-text focus:outline-none"
                />
              ) : (
                <>
                  <span
                    className="flex-1 truncate"
                    onClick={() => selectFile(file)}
                  >
                    {file.path.startsWith("custom/") ? `  ${file.name}` : file.name}
                  </span>
                  <div className="hidden group-hover:flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(file.path);
                        setRenameValue(file.name);
                      }}
                      className="text-xs text-anchor-muted hover:text-anchor-text"
                      title="Rename"
                    >
                      R
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file);
                      }}
                      className="text-xs text-anchor-muted hover:text-red-400"
                      title="Delete"
                    >
                      X
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Bottom actions */}
        <div className="p-3 border-t border-anchor-border space-y-2">
          {showNewFile ? (
            <div className="flex gap-1">
              <input
                autoFocus
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFile();
                  if (e.key === "Escape") setShowNewFile(false);
                }}
                placeholder="filename.md"
                className="flex-1 bg-anchor-bg border border-anchor-border rounded px-2 py-1 text-sm text-anchor-text placeholder-anchor-muted focus:outline-none"
              />
              <button
                onClick={handleCreateFile}
                className="px-2 py-1 text-xs bg-anchor-accent text-white rounded hover:bg-anchor-accent-hover"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewFile(true)}
              className="w-full text-left text-xs text-anchor-muted hover:text-anchor-text py-1"
            >
              + New File
            </button>
          )}
          <div className="flex gap-2 text-xs">
            <button
              onClick={handleImport}
              className="text-anchor-muted hover:text-anchor-text"
            >
              Import
            </button>
            <button
              onClick={handleExport}
              className="text-anchor-muted hover:text-anchor-text"
            >
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Main area — graph or editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {panelMode === "graph" ? (
          <div className="flex-1 flex min-h-0">
            {/* Graph takes the space, but if a file is selected, show split */}
            <div className={activeFile ? "w-1/2 h-full" : "w-full h-full"}>
              <VaultGraph
                files={files}
                onSelectFile={(file) => {
                  selectFile(file);
                }}
              />
            </div>
            {activeFile && (
              <div className="w-1/2 flex flex-col border-l border-anchor-border">
                <div className="flex items-center justify-between px-4 py-2 border-b border-anchor-border bg-anchor-surface">
                  <span className="text-sm font-medium truncate">{activeFile.path}</span>
                  <div className="flex gap-1">
                    {(["edit", "split", "preview"] as ViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`px-2 py-1 text-xs rounded ${
                          viewMode === mode
                            ? "bg-anchor-accent text-white"
                            : "text-anchor-muted hover:text-anchor-text hover:bg-anchor-bg"
                        }`}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex min-h-0">
                  {(viewMode === "edit" || viewMode === "split") && (
                    <textarea
                      value={editorContent}
                      onChange={(e) => handleEditorChange(e.target.value)}
                      className={`${
                        viewMode === "split" ? "w-1/2 border-r border-anchor-border" : "w-full"
                      } h-full resize-none bg-anchor-bg text-anchor-text p-4 text-sm font-mono focus:outline-none`}
                      spellCheck={false}
                    />
                  )}
                  {(viewMode === "preview" || viewMode === "split") && (
                    <div
                      className={`${viewMode === "split" ? "w-1/2" : "w-full"} h-full overflow-y-auto p-4 text-sm`}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(editorContent) }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ) : activeFile ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-anchor-border bg-anchor-surface">
              <span className="text-sm font-medium truncate">{activeFile.path}</span>
              <div className="flex gap-1">
                {(["edit", "split", "preview"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-2 py-1 text-xs rounded ${
                      viewMode === mode
                        ? "bg-anchor-accent text-white"
                        : "text-anchor-muted hover:text-anchor-text hover:bg-anchor-bg"
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex min-h-0">
              {(viewMode === "edit" || viewMode === "split") && (
                <textarea
                  value={editorContent}
                  onChange={(e) => handleEditorChange(e.target.value)}
                  className={`${
                    viewMode === "split" ? "w-1/2 border-r border-anchor-border" : "w-full"
                  } h-full resize-none bg-anchor-bg text-anchor-text p-4 text-sm font-mono focus:outline-none`}
                  spellCheck={false}
                />
              )}
              {(viewMode === "preview" || viewMode === "split") && (
                <div
                  className={`${viewMode === "split" ? "w-1/2" : "w-full"} h-full overflow-y-auto p-4 text-sm`}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(editorContent) }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-anchor-muted">
            Select a file to begin editing
          </div>
        )}
      </div>

      {/* Write-back confirmation dialog */}
      {writebackRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-anchor-surface border border-anchor-border rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
            <h3 className="text-sm font-semibold mb-2">AI wants to write to your vault</h3>
            <p className="text-xs text-anchor-muted mb-3">
              File: <span className="text-anchor-accent">{writebackRequest.filename}</span>
            </p>
            <pre className="bg-anchor-bg rounded p-3 text-xs text-anchor-text overflow-auto max-h-60 mb-4 border border-anchor-border">
              {writebackRequest.content}
            </pre>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setWritebackRequest(null)}
                className="px-3 py-1.5 text-sm text-anchor-muted hover:text-anchor-text rounded border border-anchor-border"
              >
                Deny
              </button>
              <button
                onClick={approveWriteback}
                className="px-3 py-1.5 text-sm bg-anchor-accent text-white rounded hover:bg-anchor-accent-hover"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

