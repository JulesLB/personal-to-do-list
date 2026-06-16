import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MODELS = {
  classify: "claude-haiku-4-5-20251001",
  write: "claude-sonnet-4-6",
} as const;
