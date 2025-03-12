export const NASH_MCP_SERVER_VERSION = "0.1.8";
export const NASH_MCP_DIR = `nash-mcp-${NASH_MCP_SERVER_VERSION}`;

// Installation commands
export const XCODE_INSTALL_COMMAND = "xcode-select --install";
export const HOMEBREW_INSTALL_COMMAND =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

export const NASH_LOCAL_SERVER_PORT = 6274;
export const NASH_LOCAL_SERVER_CHAT_ENDPOINT = `http://localhost:${NASH_LOCAL_SERVER_PORT}/v1/chat/completions/stream`;
export const NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT = `http://localhost:${NASH_LOCAL_SERVER_PORT}/v1/chat/summarize`;
export const NASH_LOCAL_SERVER_MCP_ENDPOINT = `http://localhost:${NASH_LOCAL_SERVER_PORT}/v1/mcp`;
export const NASH_LOCAL_SERVER_MCP_CALL_TOOL_ENDPOINT = `${NASH_LOCAL_SERVER_MCP_ENDPOINT}/call_tool`;

export const TERMS_OF_SERVICE_URL = "https://1mcp.ai/terms-of-service.md";

export const FUNCTION_CALL_MARKER = "<f";

export const NASH_LOCAL_SERVER_VERSION = "0.1.3";
export const NASH_LOCAL_SERVER_PATH = `~/Library/Application\\ Support/Nash/nash-local-server-${NASH_LOCAL_SERVER_VERSION}`;
export const NASH_LOCAL_SERVER_RUN_COMMAND = `cd ${NASH_LOCAL_SERVER_PATH} && .venv/bin/poetry run llm_server`;
