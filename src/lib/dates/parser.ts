// ── Date Parser: Extract [DATE_ADD] tags from AI responses ───────

import type { DateEntry } from "../types";

export interface DateAddRequest {
  label: string;
  date: string;
  type: DateEntry["type"];
}

const DATE_ADD_PATTERN = /\[DATE_ADD:\s*([^|]+)\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(anniversary|birthday|milestone|custom)\s*\]/g;

/**
 * Parse [DATE_ADD: label | YYYY-MM-DD | type] tags from an AI response.
 */
export function parseDateAdds(response: string): DateAddRequest[] {
  const requests: DateAddRequest[] = [];
  DATE_ADD_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = DATE_ADD_PATTERN.exec(response)) !== null) {
    const label = match[1]!.trim();
    const date = match[2]!.trim();
    const type = match[3]!.trim() as DateEntry["type"];
    if (label && date) {
      requests.push({ label, date, type });
    }
  }

  return requests;
}

/**
 * Strip [DATE_ADD] tags from the response for display.
 */
export function stripDateAdds(response: string): string {
  return response.replace(DATE_ADD_PATTERN, "").trim();
}
