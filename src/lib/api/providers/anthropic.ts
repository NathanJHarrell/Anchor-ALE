import type { Message, StreamChunk, APIConfig } from "../../types";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

function formatAnthropicMessage(m: Message): AnthropicMessage {
  const role = m.role as "user" | "assistant";
  if (m.images && m.images.length > 0) {
    const blocks: AnthropicContentBlock[] = [
      ...m.images.map((img) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: img.media_type, data: img.data },
      })),
      { type: "text" as const, text: m.content },
    ];
    return { role, content: blocks };
  }
  return { role, content: m.content };
}

export async function* streamAnthropic(
  messages: Message[],
  config: APIConfig,
): AsyncGenerator<StreamChunk> {
  const systemMessages = messages.filter((m) => m.role === "system");
  const conversationMessages: AnthropicMessage[] = messages
    .filter((m) => m.role !== "system")
    .map(formatAnthropicMessage);

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: true,
    messages: conversationMessages,
  };

  if (systemMessages.length > 0) {
    body.system = systemMessages.map((m) => m.content).join("\n\n");
  }

  const response = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
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
        if (data === "[DONE]") {
          yield { text: "", done: true };
          return;
        }

        try {
          const event = JSON.parse(data) as Record<string, unknown>;

          if (event.type === "content_block_delta") {
            const delta = event.delta as { text?: string } | undefined;
            if (delta?.text) {
              yield { text: delta.text, done: false };
            }
          } else if (event.type === "message_stop") {
            yield { text: "", done: true };
            return;
          } else if (event.type === "error") {
            const err = event.error as { message?: string } | undefined;
            throw new Error(err?.message ?? "Anthropic stream error.");
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
  if (status === 401) return "Invalid Anthropic API key. Check your key in Settings.";
  if (status === 429) return "Rate limited by Anthropic. Wait a moment and try again.";
  if (status === 400) {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      return parsed.error?.message ?? "Bad request to Anthropic API.";
    } catch {
      return "Bad request to Anthropic API.";
    }
  }
  if (status === 529) return "Anthropic API is overloaded. Try again shortly.";
  return `Anthropic API error (${status}). Try again or check your settings.`;
}
