import type { Message, StreamChunk, APIConfig } from "../../types";

const OPENAI_API = "https://api.openai.com/v1/chat/completions";

type OpenAIContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OpenAIMessage {
  role: "user" | "assistant" | "system";
  content: string | OpenAIContentBlock[];
}

function formatOpenAIMessage(m: Message): OpenAIMessage {
  if (m.images && m.images.length > 0 && m.role === "user") {
    const blocks: OpenAIContentBlock[] = [
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

export async function* streamOpenAI(
  messages: Message[],
  config: APIConfig,
): AsyncGenerator<StreamChunk> {
  const openaiMessages: OpenAIMessage[] = messages.map(formatOpenAIMessage);

  const response = await fetch(OPENAI_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: openaiMessages,
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

export async function* parseOpenAIStream(
  response: Response,
): AsyncGenerator<StreamChunk> {
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
          const event = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string };
              finish_reason?: string | null;
            }>;
          };
          const choice = event.choices?.[0];
          if (choice?.delta?.content) {
            yield { text: choice.delta.content, done: false };
          }
          if (choice?.finish_reason === "stop") {
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
  if (status === 401) return "Invalid OpenAI API key. Check your key in Settings.";
  if (status === 429) return "Rate limited by OpenAI. Wait a moment and try again.";
  if (status === 400) {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      return parsed.error?.message ?? "Bad request to OpenAI API.";
    } catch {
      return "Bad request to OpenAI API.";
    }
  }
  if (status === 503) return "OpenAI API is temporarily unavailable. Try again shortly.";
  return `OpenAI API error (${status}). Try again or check your settings.`;
}
