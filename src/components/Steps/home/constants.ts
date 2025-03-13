import { ProviderModel } from "./types";

export const ALL_MODELS: ProviderModel[] = [
  {
    id: "claude-3-7-sonnet-latest",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
  },
  {
    id: "claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
  },
  {
    id: "claude-3-5-haiku-latest",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
  },
  { id: "o3-mini", name: "o3-mini", provider: "openai" },
  { id: "o1", name: "o1", provider: "openai" },
  { id: "o1-preview", name: "o1-preview", provider: "openai" },
  { id: "o1-mini", name: "o1-mini", provider: "openai" },
  { id: "gpt-4o", name: "gpt-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "gpt-4o-mini", provider: "openai" },
];

export const DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
};
