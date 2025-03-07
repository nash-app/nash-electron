export const NASH_VERSION = "0.1.8";
export const NASH_MCP_DIR = `nash-mcp-${NASH_VERSION}`;

// Installation commands
export const XCODE_INSTALL_COMMAND = "xcode-select --install";
export const HOMEBREW_INSTALL_COMMAND =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

export const NASH_LLM_SERVER_ENDPOINT =
  "http://localhost:8001/v1/chat/completions/stream";
export const NASH_LLM_SUMMARIZE_ENDPOINT =
  "http://localhost:8001/v1/chat/summarize";

export const TERMS_OF_SERVICE_URL = 'https://1mcp.ai/terms-of-service.md';
