// ── Care Engine: Varied Reminder Text (Optional) ─────────────────
//
// Uses a cheap model (Haiku) to generate varied reminder messages.
// One API call per reminder type, cached for the day to minimize cost.

import { loadAPIConfig } from "../api/router";
import type { ReminderTone } from "./reminders";

interface CachedText {
  text: string;
  date: string; // YYYY-MM-DD
}

const cache = new Map<string, CachedText>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const TONE_PROMPTS: Record<ReminderTone, string> = {
  gentle: "Speak softly and warmly, like a caring friend.",
  direct: "Be clear and matter-of-fact, no fluff.",
  playful: "Be lighthearted and fun, maybe a little cheeky.",
};

/**
 * Generate a varied reminder message using a cheap model.
 * Falls back to the default message on any failure.
 */
export async function getVariedText(
  reminderKey: string,
  defaultMessage: string,
  tone: ReminderTone,
): Promise<string> {
  const today = todayKey();
  const cacheKey = `${reminderKey}-${tone}`;

  // Return cached if from today
  const cached = cache.get(cacheKey);
  if (cached && cached.date === today) {
    return cached.text;
  }

  try {
    const config = await loadAPIConfig();

    // Use Haiku for cheapness — override model
    const body = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: `Write a single short reminder message (under 10 words) for: "${defaultMessage}". ${TONE_PROMPTS[tone]} Just the message text, no quotes or explanation.`,
        },
      ],
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    if (!response.ok) return defaultMessage;

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };
    const text = data.content[0]?.text?.trim();

    if (text) {
      cache.set(cacheKey, { text, date: today });
      return text;
    }
  } catch {
    // Fall through to default
  }

  return defaultMessage;
}
