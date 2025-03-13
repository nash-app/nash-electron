import { ChatMessage, FunctionCall } from "./types";
import { getProviderConfig, logMessageHistory } from "./utils";
import {
  NASH_LOCAL_SERVER_CHAT_ENDPOINT,
  NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT,
} from "../../../constants";

// Types for internal use
interface StreamParser {
  buffer: string;
  functionCallContent: string;
  pendingContent: string;
  foundFunctionCall: boolean;
}

interface StreamHandlers {
  onChunk: (chunk: string, sessionId?: string) => void;
  onFunctionCall?: (name: string, args: Record<string, any>) => void;
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

// Helper function to prepare messages for API request
const prepareMessagesForRequest = (messages: ChatMessage[]) => {
  const completedMessages = messages.filter((m) => {
    if (m.role === "assistant") {
      return !m.isStreaming && m.content;
    }
    return m.role === "user";
  });

  return completedMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
};

// Helper function to make the API request
const makeApiRequest = async (
  messages: ChatMessage[],
  sessionId: string | null,
  modelId: string,
  abortSignal: AbortSignal | null
) => {
  const messageHistory = prepareMessagesForRequest(messages);
  const config = await getProviderConfig(modelId);

  const response = await fetch(NASH_LOCAL_SERVER_CHAT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messageHistory,
      session_id: sessionId,
      api_key: config.key,
      api_base_url: config.baseUrl,
      model: config.model,
      provider: config.provider,
    }),
    signal: abortSignal || undefined,
  });

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => "No error text available");
    console.error("[makeApiRequest] Error response:", {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
};

// Helper function to handle function calls
const handleFunctionCall = async (
  functionCallContent: string,
  pendingContent: string,
  handlers: StreamHandlers,
  messages: ChatMessage[],
  modelId: string,
  abortSignal: AbortSignal | null
) => {
  // Check if already aborted
  if (abortSignal?.aborted) {
    console.log("[handleFunctionCall] Aborted before processing function call");
    return false;
  }

  const functionCallMatch = functionCallContent.match(
    /<function_call>([^]*?)<\/function_call>/
  );

  if (!functionCallMatch || !handlers.onFunctionCall) return false;

  try {
    const functionCall = JSON.parse(functionCallMatch[1]) as FunctionCall[];
    if (functionCall.length === 0) return false;

    const { name, arguments: args = {} } = functionCall[0].function;

    if (handlers.setMessages) {
      handlers.setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage) {
          lastMessage.isStreaming = false;
          lastMessage.content = lastMessage.content + pendingContent;
          if (lastMessage.processingTool) {
            lastMessage.processingTool = {
              ...lastMessage.processingTool,
              name,
              status: "preparing",
              functionCall: JSON.stringify(
                { tool_name: name, arguments: args },
                null,
                2
              ),
            };
          } else {
            lastMessage.processingTool = {
              name,
              status: "preparing",
              functionCall: JSON.stringify(
                { tool_name: name, arguments: args },
                null,
                2
              ),
            };
          }
        }
        logMessageHistory(newMessages, "Before Tool Call - Preparing");
        return newMessages;
      });
    }

    // Check if aborted after setting up the tool
    if (abortSignal?.aborted) {
      console.log("[handleFunctionCall] Aborted before calling tool");
      return false;
    }

    // Add a delay to make the "preparing" state visible
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if aborted after delay
    if (abortSignal?.aborted) {
      console.log("[handleFunctionCall] Aborted after preparing delay");
      return false;
    }

    const result = await handlers.onFunctionCall(name, args);
    
    // Check if aborted after tool call
    if (abortSignal?.aborted) {
      console.log("[handleFunctionCall] Aborted after tool call");
      return false;
    }
    
    await handleToolResult(
      result,
      messages,
      handlers.setMessages,
      handlers.onChunk,
      modelId,
      abortSignal
    );
    return true;
  } catch (e) {
    console.error("[handleFunctionCall] Error:", e);
    return false;
  }
};

// Helper function to process a single line of streamed data
const processStreamLine = async (
  line: string,
  parser: StreamParser,
  handlers: StreamHandlers,
  messages: ChatMessage[],
  modelId: string,
  abortSignal: AbortSignal | null
): Promise<boolean> => {
  if (!line.trim() || !line.startsWith("data: ")) return true;

  const data = line.slice(6);
  if (data === "[DONE]") return false;

  try {
    const parsed = JSON.parse(data);

    if (parsed.session_id) {
      handlers.onChunk("", parsed.session_id);
      return true;
    }

    if (!parsed.content) return true;

    if (parser.foundFunctionCall) {
      parser.functionCallContent += parsed.content;

      if (parser.functionCallContent.includes("</function_call>")) {
        const success = await handleFunctionCall(
          parser.functionCallContent,
          parser.pendingContent,
          handlers,
          messages,
          modelId,
          abortSignal
        );
        parser.foundFunctionCall = false;
        parser.functionCallContent = "";
        return !success; // If function call was handled, stop processing
      }
      return true;
    }

    parser.pendingContent += parsed.content;
    const functionCallIndex = parser.pendingContent.indexOf("<function_call>");

    if (functionCallIndex !== -1) {
      parser.foundFunctionCall = true;
      if (functionCallIndex > 0) {
        const contentBeforeCall = parser.pendingContent.substring(
          0,
          functionCallIndex
        );
        handlers.onChunk(contentBeforeCall);
      }
      parser.functionCallContent =
        parser.pendingContent.substring(functionCallIndex);
      parser.pendingContent = "";
    } else {
      const words = parser.pendingContent.split(" ");
      if (words.length > 1) {
        const completeContent = words.slice(0, -1).join(" ") + " ";
        handlers.onChunk(completeContent);
        parser.pendingContent = words[words.length - 1];
      }
    }
    return true;
  } catch (e) {
    console.error("[processStreamLine] Error parsing SSE data:", e);
    return true;
  }
};

export const streamCompletion = async (
  messages: ChatMessage[],
  sessionId: string | null,
  abortSignal: AbortSignal | null,
  onChunk: (chunk: string, sessionId?: string) => void,
  modelId: string,
  onFunctionCall?: (name: string, args: Record<string, any>) => void,
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
) => {
  const parser: StreamParser = {
    buffer: "",
    functionCallContent: "",
    pendingContent: "",
    foundFunctionCall: false,
  };

  const handlers: StreamHandlers = {
    onChunk,
    onFunctionCall,
    setMessages,
  };

  try {
    // Check if already aborted before starting
    if (abortSignal?.aborted) {
      console.log("[streamCompletion] Already aborted before starting");
      throw new Error("AbortError");
    }

    const response = await makeApiRequest(
      messages,
      sessionId,
      modelId,
      abortSignal
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No reader available");

    const decoder = new TextDecoder();
    let shouldContinue = true;

    while (shouldContinue && !abortSignal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      const decodedChunk = decoder.decode(value, { stream: true });
      parser.buffer += decodedChunk;

      const lines = parser.buffer.split("\n");
      parser.buffer = lines.pop() || "";

      for (const line of lines) {
        shouldContinue = await processStreamLine(
          line,
          parser,
          handlers,
          messages,
          modelId,
          abortSignal
        );
        if (!shouldContinue) break;
      }
    }

    // Check if aborted during streaming
    if (abortSignal?.aborted) {
      console.log("[streamCompletion] Aborted during streaming");
      throw new Error("AbortError");
    }

    if (parser.pendingContent && !parser.foundFunctionCall) {
      onChunk(parser.pendingContent);
      if (setMessages) {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.isStreaming) {
            lastMessage.isStreaming = false;
            logMessageHistory(newMessages, "Initial Message Complete");
          }
          return newMessages;
        });
      }
    }
    
    // Clean up any dangling tool badges when the stream completes
    if (setMessages) {
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        
        // If the last message has a processingTool with status "preparing" but no actual function call was completed,
        // remove the processingTool property
        if (lastMessage && 
            lastMessage.processingTool && 
            lastMessage.processingTool.status === "preparing" && 
            lastMessage.processingTool.name === "tool") {
          delete lastMessage.processingTool;
        }
        
        return newMessages;
      });
    }
  } catch (error) {
    // Handle abort errors
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message === "AbortError")
    ) {
      console.log("[streamCompletion] Request aborted");
      
      // Update UI to reflect the abort
      if (setMessages) {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.isStreaming) {
            lastMessage.isStreaming = false;
          }
          
          // Clean up any dangling tool badges when aborted
          if (lastMessage && 
              lastMessage.processingTool && 
              lastMessage.processingTool.status === "preparing") {
            delete lastMessage.processingTool;
          }
          
          return newMessages;
        });
      }
      
      return;
    }
    console.error("[streamCompletion] Error:", error);
    throw error;
  }
};

const handleToolResult = async (
  result: any,
  messages: ChatMessage[],
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
  onChunk?: (chunk: string, sessionId?: string) => void,
  modelId?: string,
  abortSignal?: AbortSignal | null
) => {
  if (!setMessages || !onChunk || !modelId) return;
  
  // Check if the request has been aborted before proceeding
  if (abortSignal?.aborted) {
    console.log("[handleToolResult] Aborted before starting follow-up");
    return;
  }

  const toolResultMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: `Tool result: ${JSON.stringify(result)}`,
    timestamp: new Date(),
    isToolResult: true,
  };

  const followUpMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    timestamp: new Date(),
    isStreaming: true,
  };

  setMessages((prev) => {
    const newMessages = [...prev, toolResultMessage, followUpMessage];
    logMessageHistory(newMessages, "Before Follow-up Request");
    return newMessages;
  });

  // Add a special instruction to the tool result message to avoid repetition
  const modifiedToolResult = {
    ...toolResultMessage,
    content: `Tool result: ${JSON.stringify(result)}\n\nContinue from your previous response. Do not repeat your initial greeting or restate that you're going to use a tool. Focus on presenting the results of the tool execution in a natural way.`
  };

  try {
    await streamCompletion(
      messages.concat(modifiedToolResult, followUpMessage),
      null,
      abortSignal,
      onChunk,
      modelId,
      undefined,
      setMessages
    );
  } catch (error) {
    // Handle abort errors in the tool result follow-up
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message === "AbortError")
    ) {
      console.log("[handleToolResult] Follow-up request aborted");
      
      // Update the UI to show the abort
      if (setMessages) {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.isStreaming) {
            lastMessage.isStreaming = false;
          }
          return newMessages;
        });
      }
      return;
    }
    throw error;
  }
};

export const summarizeConversation = async (
  messages: ChatMessage[],
  sessionId: string | null = null
) => {
  try {
    const response = await fetch(NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error in summarize:", error);
    throw error;
  }
};
