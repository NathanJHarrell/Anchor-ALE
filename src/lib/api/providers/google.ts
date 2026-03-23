import type { Message, StreamChunk, APIConfig } from "../../types";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function formatGeminiMessage(m: Message): GeminiContent {
  const role = m.role === "assistant" ? ("model" as const) : ("user" as const);
  const parts: GeminiPart[] = [];
  if (m.images && m.images.length > 0) {
    for (const img of m.images) {
      parts.push({ inline_data: { mime_type: img.media_type, data: img.data } });
    }
  }
  parts.push({ text: m.content });
  return { role, parts };
}

export async function* streamGoogle(
  messages: Message[],
  config: APIConfig,
): AsyncGenerator<StreamChunk> {
  const systemMessages = messages.filter((m) => m.role === "system");
  const conversationMessages: GeminiContent[] = messages
    .filter((m) => m.role !== "system")
    .map(formatGeminiMessage);

  const body: Record<string, unknown> = {
    contents: conversationMessages,
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens,
    },
  };

  if (systemMessages.length > 0) {
    body.systemInstruction = {
      parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }],
    };
  }

  const url = `${GEMINI_API}/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(friendlyError(response.status, errorBody));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream available.");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();

        try {
          const event = JSON.parse(data) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
              finishReason?: string;
            }>;
          };
          const candidate = event.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;
          if (text) {
            yield { text, done: false };
          }
          if (candidate?.finishReason === "STOP") {
            yield { text: "", done: true };
            return;
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { text: "", done: true };
}

function friendlyError(status: number, body: string): string {
  if (status === 400) {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      return parsed.error?.message ?? "Bad request to Gemini API.";
    } catch {
      return "Bad request to Gemini API.";
    }
  }
  if (status === 403) return "Invalid Google API key or Gemini not enabled. Check Settings.";
  if (status === 429) return "Rate limited by Google. Wait a moment and try again.";
  if (status === 503) return "Gemini API is temporarily unavailable. Try again shortly.";
  return `Gemini API error (${status}). Try again or check your settings.`;
}
