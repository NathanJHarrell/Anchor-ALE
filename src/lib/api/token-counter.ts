import type { Message } from "../types";

const TOKENS_PER_WORD = 1.3;

export function estimateTokens(messages: Message[]): number {
  let totalWords = 0;
  for (const message of messages) {
    totalWords += message.content.split(/\s+/).filter(Boolean).length;
  }
  return Math.ceil(totalWords * TOKENS_PER_WORD);
}
