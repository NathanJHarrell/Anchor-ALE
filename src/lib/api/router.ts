import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "../database";
import { Provider } from "../types";
import type { Message, StreamChunk, APIConfig } from "../types";
import { streamAnthropic } from "./providers/anthropic";
import { streamOpenAI } from "./providers/openai";
import { streamGoogle } from "./providers/google";
import { streamOpenRouter } from "./providers/openrouter";

export async function loadAPIConfig(): Promise<APIConfig> {
  const [provider, encryptedKey, model, temperature, maxTokens] =
    await Promise.all([
      getSetting("provider"),
      getSetting("apiKey"),
      getSetting("model"),
      getSetting("temperature"),
      getSetting("maxTokens"),
    ]);

  if (!provider) throw new Error("No provider configured. Open Settings to choose one.");
  if (!encryptedKey) throw new Error("No API key set. Add your key in Settings.");
  if (!model) throw new Error("No model selected. Choose a model in Settings.");

  const apiKey = await invoke<string>("decrypt_string", { input: encryptedKey });

  return {
    provider: provider as Provider,
    apiKey,
    model,
    temperature: temperature ? parseFloat(temperature) : 0.7,
    maxTokens: maxTokens ? parseInt(maxTokens, 10) : 4096,
  };
}

export async function* sendMessage(
  messages: Message[],
  config: APIConfig,
): AsyncGenerator<StreamChunk> {
  switch (config.provider) {
    case Provider.Anthropic:
      yield* streamAnthropic(messages, config);
      break;
    case Provider.OpenAI:
      yield* streamOpenAI(messages, config);
      break;
    case Provider.Google:
      yield* streamGoogle(messages, config);
      break;
    case Provider.OpenRouter:
      yield* streamOpenRouter(messages, config);
      break;
    default:
      throw new Error(`Unknown provider: ${config.provider as string}`);
  }
}

export { estimateTokens } from "./token-counter";
