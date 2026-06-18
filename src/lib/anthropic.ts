import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Haiku only. Classification is the single LLM call in the app and it's cheap;
// nothing here uses Sonnet or Opus.
export const MODELS = {
  classify: "claude-haiku-4-5-20251001",
} as const;
