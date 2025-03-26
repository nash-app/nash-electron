import { ProviderModel } from "./types";

export const NASH_MCP_SERVER_VERSION = "0.1.15";
export const NASH_LOCAL_SERVER_VERSION = "0.1.12";
export const NASH_MCP_DIR = `nash-mcp-${NASH_MCP_SERVER_VERSION}`;

export const NASH_LOCAL_SERVER_PORT = 6274;
export const NASH_LOCAL_SERVER_CHAT_ENDPOINT = `http://localhost:${NASH_LOCAL_SERVER_PORT}/v1/chat/completions/stream`;
export const NASH_LOCAL_SERVER_TOKEN_INFO_ENDPOINT = `http://localhost:${NASH_LOCAL_SERVER_PORT}/v1/chat/token_info`;
export const NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT = `http://localhost:${NASH_LOCAL_SERVER_PORT}/v1/chat/summarize`;

export const TERMS_OF_SERVICE_URL = "https://1mcp.ai/terms-of-service.md";

export const NASH_LOCAL_SERVER_PATH = `~/Library/Application\\ Support/Nash/nash-local-server-${NASH_LOCAL_SERVER_VERSION}`;
export const NASH_LOCAL_SERVER_RUN_COMMAND = `cd ${NASH_LOCAL_SERVER_PATH} && .venv/bin/poetry run llm_server`;

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
  // { id: "o3-mini", name: "o3-mini", provider: "openai" },
  // { id: "o1", name: "o1", provider: "openai" },
  // { id: "o1-preview", name: "o1-preview", provider: "openai" },
  // { id: "o1-mini", name: "o1-mini", provider: "openai" },
  // { id: "gpt-4o", name: "gpt-4o", provider: "openai" },
  // { id: "gpt-4o-mini", name: "gpt-4o-mini", provider: "openai" },
];

export const DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
};
