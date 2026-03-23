import type { Message, StreamChunk, APIConfig } from "../../types";
import { parseOpenAIStream } from "./openai";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function* streamOpenRouter(
  messages: Message[],
  config: APIConfig,
): AsyncGenerator<StreamChunk> {
  const openRouterMessages: OpenRouterMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

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
