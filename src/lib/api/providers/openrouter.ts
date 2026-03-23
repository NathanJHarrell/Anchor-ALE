import type { Message, StreamChunk, APIConfig } from "../../types";
import { parseOpenAIStream } from "./openai";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string | OpenRouterContentBlock[];
}

function formatOpenRouterMessage(m: Message): OpenRouterMessage {
  if (m.images && m.images.length > 0 && m.role === "user") {
    const blocks: OpenRouterContentBlock[] = [
      ...m.images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: `data:${img.media_type};base64,${img.data}` },
      })),
      { type: "text" as const, text: m.content },
    ];
    return { role: m.role, content: blocks };
  }
  return { role: m.role, content: m.content };
}

export async function* streamOpenRouter(
  messages: Message[],
  config: APIConfig,
): AsyncGenerator<StreamChunk> {
  const openRouterMessages: OpenRouterMessage[] = messages.map(formatOpenRouterMessage);

  const response = await fetch(OPENROUTER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "HTTP-Referer": "https://anchor-ade.app",
      "X-Title": "Anchor",
    },
    body: JSON.stringify({
      model: config.model,
      messages: openRouterMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(friendlyError(response.status, errorBody));
  }

  yield* parseOpenAIStream(response);
}

function friendlyError(status: number, body: string): string {
  if (status === 401) return "Invalid OpenRouter API key. Check your key in Settings.";
  if (status === 402) return "Insufficient OpenRouter credits. Add credits at openrouter.ai.";
  if (status === 429) return "Rate limited by OpenRouter. Wait a moment and try again.";
  if (status === 400) {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      return parsed.error?.message ?? "Bad request to OpenRouter API.";
    } catch {
      return "Bad request to OpenRouter API.";
    }
  }
  return `OpenRouter API error (${status}). Try again or check your settings.`;
}
