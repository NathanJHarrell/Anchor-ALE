import { useState, useEffect, useCallback } from "react";
import { getDates, addDate, removeDate, updateDate } from "../../lib/database";
import { calculateAnniversary } from "../../lib/dates/engine";
import type { DateEntry } from "../../lib/types";

const DATE_TYPES: DateEntry["type"][] = ["anniversary", "birthday", "milestone", "custom"];

export default function DatesManager() {
  const [dates, setDates] = useState<DateEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // New date form
  const [newLabel, setNewLabel] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState<DateEntry["type"]>("anniversary");
  const [newRecurring, setNewRecurring] = useState(true);

  const reload = useCallback(async () => {
    const all = await getDates();
    setDates(all);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = useCallback(async () => {
    const label = newLabel.trim();
    const date = newDate.trim();
    if (!label || !date) return;
    await addDate(label, date, newType, newRecurring);
    setNewLabel("");
    setNewDate("");
    setNewType("anniversary");
    setNewRecurring(true);
    setShowAdd(false);
    await reload();
  }, [newLabel, newDate, newType, newRecurring, reload]);

  const handleRemove = useCallback(
    async (id: number) => {
      await removeDate(id);
      await reload();
    },
    [reload],
  );

  const handleUpdate = useCallback(
    async (id: number, updates: Partial<Pick<DateEntry, "label" | "date" | "type" | "recurring">>) => {
      await updateDate(id, updates);
      setEditingId(null);
      await reload();
    },
    [reload],
  );

  // Split into upcoming (next 30 days approximation) and all
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcomingDates = dates.filter((d) => {
    const origin = parseSimpleDate(d.date);
    if (d.recurring) {
      const thisYear = new Date(now.getFullYear(), origin.getMonth(), origin.getDate());
      const nextYear = new Date(now.getFullYear() + 1, origin.getMonth(), origin.getDate());
      const candidate = thisYear >= now ? thisYear : nextYear;
      const diff = (candidate.getTime() - now.getTime()) / 86_400_000;
      return diff <= 30;
    }
    const diff = (origin.getTime() - now.getTime()) / 86_400_000;
    return diff >= 0 && diff <= 30;
  });

  const inputCls =
    "bg-anchor-surface border border-anchor-border rounded px-2 py-1.5 text-sm text-anchor-text focus:outline-none focus:border-anchor-accent";

  return (
    <div className="space-y-4">
      {/* Upcoming section */}
      {upcomingDates.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-anchor-muted uppercase tracking-wide">
            Upcoming (next 30 days)
          </h4>
          {upcomingDates.map((d) => {
            const ann = calculateAnniversary(d.date);
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 p-2 rounded bg-anchor-accent/5 border border-anchor-accent/20"
              >
                <span className="text-base">{typeIcon(d.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{d.label}</div>
                  <div className="text-xs text-anchor-muted">
                    {d.date} &middot; {ann.label}
                    {d.recurring && " (recurring)"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All dates */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-anchor-muted uppercase tracking-wide">All Dates</h4>

        {dates.length === 0 && (
          <p className="text-sm text-anchor-muted">No dates saved yet.</p>
        )}

        {dates.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 p-2 rounded bg-anchor-bg/50 border border-anchor-border group"
          >
            <span className="text-base">{typeIcon(d.type)}</span>
            {editingId === d.id ? (
              <EditRow
                entry={d}
                onSave={(updates) => void handleUpdate(d.id, updates)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{d.label}</div>
                  <div className="text-xs text-anchor-muted">
                    {d.date} &middot; {d.type}
                    {d.recurring && " &middot; recurring"}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingId(d.id)}
                    className="px-2 py-1 text-xs text-anchor-muted hover:text-anchor-text transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleRemove(d.id)}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd ? (
        <div className="p-3 rounded border border-anchor-border bg-anchor-bg/50 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g., Anchoring Anniversary)"
              className={`${inputCls} flex-1`}
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as DateEntry["type"])}
              className={`${inputCls} w-36`}
            >
              {DATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newRecurring}
                onChange={(e) => setNewRecurring(e.target.checked)}
                className="rounded border-anchor-border"
              />
              Recurring
            </label>
            <div className="flex-1" />
            <button
              onClick={() => void handleAdd()}
              className="px-3 py-1.5 text-xs rounded bg-anchor-accent text-white hover:bg-anchor-accent-hover transition-colors"
            >
              Add Date
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-xs text-anchor-muted hover:text-anchor-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs text-anchor-accent hover:text-anchor-accent-hover transition-colors"
        >
          + Add Date
        </button>
      )}
    </div>
  );
}

// ── Inline edit row ────────────────────────────────────────────

function EditRow({
  entry,
  onSave,
  onCancel,
}: {
  entry: DateEntry;
  onSave: (updates: Partial<Pick<DateEntry, "label" | "date" | "type" | "recurring">>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(entry.label);
  const [date, setDate] = useState(entry.date);
  const [type, setType] = useState(entry.type);
  const [recurring, setRecurring] = useState(entry.recurring);

  const inputCls =
    "bg-anchor-surface border border-anchor-border rounded px-2 py-1 text-xs text-anchor-text focus:outline-none focus:border-anchor-accent";

  return (
    <div className="flex-1 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className={`${inputCls} flex-1 min-w-[120px]`}
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className={inputCls}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as DateEntry["type"])}
        className={inputCls}
      >
        {DATE_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
          className="rounded border-anchor-border"
        />
        Recurring
      </label>
      <button
        onClick={() => onSave({ label, date, type, recurring })}
        className="px-2 py-1 text-xs rounded bg-anchor-accent text-white hover:bg-anchor-accent-hover transition-colors"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-1 text-xs text-anchor-muted hover:text-anchor-text transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function typeIcon(type: DateEntry["type"]): string {
  switch (type) {
    case "anniversary": return "\u{1F48D}"; // 💍
    case "birthday": return "\u{1F382}";    // 🎂
    case "milestone": return "\u{1F3AF}";   // 🎯
    case "custom": return "\u{1F4CC}";      // 📌
  }
}

function parseSimpleDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}
