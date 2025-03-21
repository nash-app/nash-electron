// Internal record-keeping state for tool use
// justGotToolName: bool
// justGotToolArgs: bool
// justGotToolResult: bool

// TOOL USE EXAMPLE

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolUseChunk1: any = {
  content: "I'll get your secrets",
  tool_name: null,
  tool_args: null,
  tool_result: null,
  new_raw_llm_messages: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolUseChunk2: any = {
  content: null,
  tool_name: "list_secrets",
  tool_args: null,
  tool_result: null,
  new_raw_llm_messages: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolUseChunk3: any = {
  content: null,
  tool_name: null,
  tool_args: "{}",
  tool_result: null,
  new_raw_llm_messages: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolUseChunk4: any = {
  content: null,
  tool_name: null,
  tool_args: null,
  tool_result: null,
  new_raw_llm_messages: null,
};

// Because I just had tool args, I'm still in
// internal record-keeping state of "justGotToolArgs: true"
export const toolUseExample1Chunks = [
  toolUseChunk1,
  toolUseChunk2,
  toolUseChunk3,
  toolUseChunk4,
];

/**
 * Generator function that simulates streaming tool use chunks with a delay
 * @param chunks - Array of chunks to stream
 * @param delayMs - Delay between chunks in milliseconds (default: 500ms)
 */
export async function* streamToolUseChunks(
  chunks: any[],
  delayMs = 500
): AsyncGenerator<any> {
  for (const chunk of chunks) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield chunk;
  }
}
