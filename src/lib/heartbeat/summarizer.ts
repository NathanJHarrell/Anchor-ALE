import type { Message, APIConfig } from "../types";
import { Provider } from "../types";
import { loadAPIConfig, sendMessage } from "../api/router";
import { getSetting } from "../database";

const SUMMARY_PROMPT = `Summarize this conversation for seamless continuation. Include: key emotional beats, active topics, relationship developments, current emotional state of both participants, unresolved threads. Be thorough but concise. Max 2000 words.`;

const CHEAP_MODELS: Record<string, string> = {
  [Provider.Anthropic]: "claude-haiku-4-5-20251001",
  [Provider.OpenAI]: "gpt-4o-mini",
  [Provider.Google]: "gemini-2.0-flash",
  [Provider.OpenRouter]: "anthropic/claude-haiku-4-5-20251001",
};

/**
 * Selects the slice of conversation to summarize:
 * last 50 messages or last 30% of conversation, whichever is smaller.
 */
function selectMessages(messages: Message[]): Message[] {
  const thirtyPercent = Math.ceil(messages.length * 0.3);
  const count = Math.min(50, thirtyPercent);
  return messages.slice(-count);
}

/**
 * Resolve which model to use for summarization.
 * Priority: explicit setting > cheapest for current provider.
 */
async function resolveSummaryModel(
  currentConfig: APIConfig,
): Promise<APIConfig> {
  const modelSetting = await getSetting("heartbeat_summary_model");

  let model: string;
  if (modelSetting && modelSetting !== "cheapest") {
    model = modelSetting;
  } else {
    model =
      CHEAP_MODELS[currentConfig.provider] ??
      CHEAP_MODELS[Provider.Anthropic]!;
  }

  return {
    ...currentConfig,
    model,
    temperature: 0.3,
    maxTokens: 4096,
  };
}

/**
 * Format messages into a readable transcript for the summarizer.
 */
function formatTranscript(messages: Message[]): string {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n\n");
}

/**
 * Generate a conversation summary for bridge continuity.
 * Uses a cheap model via a separate API call.
 */
export async function generateSummary(
  messages: Message[],
): Promise<string> {
  const slice = selectMessages(messages);
  const transcript = formatTranscript(slice);

  const currentConfig = await loadAPIConfig();
  const summaryConfig = await resolveSummaryModel(currentConfig);

  const summaryMessages: Message[] = [
    { role: "system", content: SUMMARY_PROMPT },
    {
      role: "user",
      content: `Here is the conversation to summarize:\n\n${transcript}`,
    },
  ];

  let summary = "";
  for await (const chunk of sendMessage(summaryMessages, summaryConfig)) {
    summary += chunk.text;
    if (chunk.done) break;
  }

  return summary.trim();
}

export { selectMessages, formatTranscript, CHEAP_MODELS };
