/**
 * Nash Electron Chat Service
 *
 * This module handles communication with the backend LLM service,
 * focusing on message streaming and tool call processing.
 *
 * Key functionality:
 * 1. Streaming text responses from various LLM providers
 * 2. Detecting and processing tool calls in streaming responses
 * 3. Handling tool call execution and updating UI with results
 *
 * Tool Call Processing Approach:
 * - We detect <tool_call> markers in streamed responses
 * - Tool calls are extracted and processed as they arrive
 * - Missing closing </tool_call> tags are handled gracefully
 * - A debug button allows users to manually process tool calls if needed
 * - Clean UI separates tool calls from regular content
 *
 * The system is designed to be robust against various LLM provider
 * implementations of tool calls, supporting both complete and
 * incomplete (missing closing tags) formats.
 */

import { ChatMessage, ToolCall } from "./types";
import { getProviderConfig, logMessageHistory } from "./utils";
import {
  NASH_LOCAL_SERVER_CHAT_ENDPOINT,
  NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT,
  TOOL_CALL_START_MARKER,
  TOOL_CALL_END_MARKER,
} from "../../../constants";
import { v4 as uuidv4 } from "uuid";

// Types for internal use
interface StreamParser {
  buffer: string;
  pendingContent: string;
  toolCallContent: string;
  isToolCallContent: boolean;
  toolCallProcessed: boolean;
}

interface StreamHandlers {
  onChunk: (chunk: string, sessionId?: string) => void;
  onToolCall?: (name: string, args: Record<string, any>) => Promise<any>;
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onContent?: (content: string) => void;
}

// Helper function to prepare messages for API request
export function prepareMessagesForRequest(messages: ChatMessage[]): {
  messagesForRequest: any[];
  modelName: string;
} {
  // Ensure messages is an array
  if (!messages || !Array.isArray(messages)) {
    console.error(
      "[prepareMessagesForRequest] Messages is not an array:",
      messages
    );
    throw new Error("Messages must be an array");
  }


  // Filter messages to only include completed messages, not streaming ones
  // and format them exactly as expected by the server
  const completedMessages = messages.filter((m) => {
    // For assistant messages, only include those that are complete (not streaming)
    if (m.role === "assistant") {
      return !m.isStreaming;
    }
    return m.role === "user";
  });


  // Check if we have any messages at all
  if (completedMessages.length === 0) {
    console.error("[prepareMessagesForRequest] No completed messages found");
    throw new Error(
      "No messages found for the conversation. At least one user message is required."
    );
  }

  // Check if the first message is from a user (required by Anthropic)
  if (completedMessages[0].role !== "user") {
    console.error("[prepareMessagesForRequest] First message is not from user:", completedMessages[0]);
    throw new Error(
      "The first message must be from a user. This is required by Anthropic's API."
    );
  }

  // Map messages to the exact format expected by the server
  const messagesForRequest = completedMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Default model name
  const modelName = "claude-3-sonnet-20240229";

  return { messagesForRequest, modelName };
}



// Separate function to extract tool call content even when closing tag is missing
const extractToolCallContent = (content: string): string | null => {
  // First try to find content between start and end markers
  const toolCallRegex = new RegExp(
    `${TOOL_CALL_START_MARKER}([\\s\\S]*?)${TOOL_CALL_END_MARKER}`
  );
  const match = content.match(toolCallRegex);

  if (match && match[1]) {
    return match[1].trim();
  }

  // If no end marker is found, extract everything after the start marker
  const startIndex = content.indexOf(TOOL_CALL_START_MARKER);
  if (startIndex >= 0) {
    // Extract everything after the start marker
    const extractedContent = content
      .substring(startIndex + TOOL_CALL_START_MARKER.length)
      .trim();
    
    // Clean up the SSE data format
    const cleanedContent = extractedContent
      .split("\n")
      .filter(line => line.trim())
      .map(line => {
        // Extract content from data: {"content": "..."} format
        const contentMatch = line.match(/data: {"content": "(.*)"}/);
        if (contentMatch && contentMatch[1]) {
          return contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
        return line;
      })
      .join("");
    
    console.log(
      "[extractToolCallContent] Extracted and cleaned content without end marker:",
      cleanedContent
    );
    return cleanedContent;
  }

  return null;
};

// Helper function to handle tool calls
const handleToolCall = async (
  toolCallContent: string,
  pendingContent: string,
  handlers: StreamHandlers,
  messages: ChatMessage[],
  modelId: string,
  abortSignal: AbortSignal | null,
  sessionId: string | null
): Promise<{ success: boolean; sessionId: string | null }> => {
  // Check if already aborted
  if (abortSignal?.aborted) {
    console.log("[handleToolCall] Aborted before processing tool call");
    return { success: false, sessionId };
  }

  

  // Log the raw tool call content for debugging
  console.log("[handleToolCall] RAW TOOL CALL CONTENT:", {
    content: toolCallContent,
    length: toolCallContent.length,
    startMarkerIndex: toolCallContent.indexOf(TOOL_CALL_START_MARKER),
    endMarkerIndex: toolCallContent.indexOf(TOOL_CALL_END_MARKER),
    hasEndMarker: toolCallContent.includes(TOOL_CALL_END_MARKER),
  });

  // Extract the content with our helper function that handles missing end markers
  const extractedContent = extractToolCallContent(toolCallContent);

  if (!extractedContent) {

    return { success: false, sessionId };
  }


  // More aggressive approach to find JSON - look for direct JSON after the tool call marker
  const findJsonInToolCall = (content: string) => {
    // First, clean up the content by removing SSE data format
    const cleanedContent = content
      .split("\n")
      .filter(line => line.trim())
      .map(line => {
        // Extract content from data: {"content": "..."} format
        const contentMatch = line.match(/data: {"content": "(.*)"}/);
        if (contentMatch && contentMatch[1]) {
          return contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
        return line;
      })
      .join("");

    // Try to reconstruct a complete JSON object
    if (cleanedContent.includes('"function"')) {
      try {
        // This is likely a function call object
        let reconstructedJson = '{"function": {';
        
        // Extract the name
        const nameMatch = cleanedContent.match(/"name":\s*"([^"]+)"/);
        if (nameMatch) {
          reconstructedJson += `"name": "${nameMatch[1]}"`;
        }
        
        // Extract arguments if present
        const argsMatch = cleanedContent.match(/"arguments":\s*(\{[^}]*\})/);
        if (argsMatch) {
          reconstructedJson += `, "arguments": ${argsMatch[1]}`;
        } else {
          reconstructedJson += ', "arguments": {}';
        }
        
        reconstructedJson += '}}';
        
        return reconstructedJson;
      } catch (e) {
        console.warn("[findJsonInToolCall] Failed to reconstruct JSON:", e);
      }
    }

    // If the above approach fails, fall back to the original method
    // Find the first { character which might start JSON
    const jsonStartIndex = cleanedContent.indexOf("{");
    if (jsonStartIndex < 0) return null;

    // Try to extract a complete JSON object
    let bracketCount = 0;
    let extracted = "";
    let inString = false;
    let escapeNext = false;

    for (let i = jsonStartIndex; i < cleanedContent.length; i++) {
      const char = cleanedContent[i];
      extracted += char;

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") bracketCount++;
        if (char === "}") {
          bracketCount--;
          if (bracketCount === 0) break; // We found a complete JSON object
        }
      }
    }

    return extracted;
  };

  // Try to extract JSON content using our custom function
  const extractedJson = findJsonInToolCall(extractedContent);
  console.log("[handleToolCall] Extracted JSON:", extractedJson);

  // First, update the UI to show we're processing a tool call
  if (handlers.setMessages) {
    try {
      // Default tool name
      let toolName = "Unknown Tool";
      let functionCall = extractedContent;
      console.log("[handleToolCall] Extracted content:", extractedContent);
      // Try to parse the JSON to get the tool name
      if (extractedJson) {
        try {
          const jsonObj = JSON.parse(extractedJson);
          if (jsonObj.function && jsonObj.function.name) {
            console.log('@@@', jsonObj,jsonObj.function.name)
            toolName = jsonObj.function.name;
            functionCall = JSON.stringify(jsonObj, null, 2);
            console.log("[handleToolCall] Found tool name in JSON:", toolName);
          }
        } catch (e) {
          console.error(
            "[handleToolCall] Error parsing JSON for tool name:",
            e
          );
        }
      }

      // If we couldn't get the tool name from JSON, try regex
      if (toolName === "Unknown Tool") {
        const nameMatch =
          extractedContent.match(/["']?name["']?\s*:\s*["']([^"']+)["']/i) ||
          extractedContent.match(/nash_(\w+)/i);
        if (nameMatch) {
          toolName = nameMatch[1];
          console.log("[handleToolCall] Found tool name with regex:", toolName);
        }
      }

      // Update the UI to show we're processing this tool
      handlers.setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        // Find the last assistant message to update
        const lastAssistantIndex = newMessages.findIndex(
          (m) => m.role === "assistant" && m.isStreaming !== false
        );

        if (lastAssistantIndex >= 0) {
          // Add processing tool info to show the badge
          newMessages[lastAssistantIndex].processingTool = {
            name: toolName,
            status: "calling",
            functionCall: toolCallContent, // Store the raw tool call content
          };
        }
        return newMessages;
      });
    } catch (parseError) {
      console.error(
        "[handleToolCall] Error updating UI for tool call:",
        parseError
      );
    }
  }

  // Now try to process the tool call
  try {
    // First try with the extracted JSON
    if (extractedJson) {
      try {
        const jsonObj = JSON.parse(extractedJson);

        // Handle the server format we're seeing in logs
        if (jsonObj.function && jsonObj.function.name) {
          const toolName = jsonObj.function.name;
          const toolArgs = jsonObj.function.arguments || {};

          console.log(
            `[handleToolCall] Calling tool '${toolName}' with args:`,
            toolArgs
          );

          // Special handling for nash_secrets tool
          if (toolName === "nash_secrets") {
            console.log("[handleToolCall] Detected nash_secrets tool call");

            // Call the tool
            const result = await handlers.onToolCall?.(toolName, toolArgs);
            console.log(`[handleToolCall] Tool '${toolName}' result:`, result);

            // Update the UI with the result
            await updateUIWithToolResult(
              handlers,
              toolName,
              result,
              messages,
              modelId,
              abortSignal,
              sessionId
            );

            return { success: true, sessionId };
          }

          // Handle other tools
          if (handlers.onToolCall) {
            const result = await handlers.onToolCall(toolName, toolArgs);
            console.log(`[handleToolCall] Tool '${toolName}' result:`, result);

            // Update the UI with the result
            await updateUIWithToolResult(
              handlers,
              toolName,
              result,
              messages,
              modelId,
              abortSignal,
              sessionId
            );

            return { success: true, sessionId };
          }
        }
      } catch (e) {
        console.error("[handleToolCall] Error processing JSON tool call:", e);
      }
    }

    // Fallback to regex-based extraction if JSON parsing failed
    const nameMatch =
      extractedContent.match(/["']?name["']?\s*:\s*["']([^"']+)["']/i) ||
      extractedContent.match(/nash_(\w+)/i);

    if (nameMatch) {
      const toolName = nameMatch[1];
      console.log(
        `[handleToolCall] Extracted tool name '${toolName}' using regex`
      );

      // Special handling for nash_secrets tool
      if (toolName === "secrets" || toolName.includes("secret")) {
        console.log(
          "[handleToolCall] Detected nash_secrets tool call via regex"
        );

        // Call the tool with empty args
        if (handlers.onToolCall) {
          const result = await handlers.onToolCall("nash_secrets", {});
          console.log(`[handleToolCall] Tool 'nash_secrets' result:`, result);

          // Update the UI with the result
          await updateUIWithToolResult(
            handlers,
            "nash_secrets",
            result,
            messages,
            modelId,
            abortSignal,
            sessionId
          );

          return { success: true, sessionId };
        }
      }

      // Try to call the tool with empty args as fallback
      if (handlers.onToolCall) {
        try {
          const result = await handlers.onToolCall(toolName, {});
          console.log(`[handleToolCall] Tool '${toolName}' result:`, result);

          // Update the UI with the result
          await updateUIWithToolResult(
            handlers,
            toolName,
            result,
            messages,
            modelId,
            abortSignal,
            sessionId
          );

          return { success: true, sessionId };
        } catch (e) {
          console.error(
            `[handleToolCall] Error calling tool '${toolName}':`,
            e
          );
        }
      }
    }

    // If we get here, we couldn't process the tool call
    console.log("[handleToolCall] Could not process tool call");

    // Update UI to show error
    if (handlers.setMessages) {
      handlers.setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        // Find any message with a processing tool
        const processingIndex = newMessages.findIndex(
          (m) => m.processingTool && m.processingTool.status === "calling"
        );

        if (
          processingIndex >= 0 &&
          newMessages[processingIndex].processingTool
        ) {
          newMessages[processingIndex].processingTool.status = "completed";
          newMessages[processingIndex].processingTool.response =
            "Error: Could not process tool call";
        }
        return newMessages;
      });
    }

    return { success: false, sessionId };
  } catch (error) {
    console.error("[handleToolCall] Error in tool call processing:", error);

    // Update UI to show error
    if (handlers.setMessages) {
      handlers.setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        // Find any message with a processing tool
        const processingIndex = newMessages.findIndex(
          (m) => m.processingTool && m.processingTool.status === "calling"
        );

        if (
          processingIndex >= 0 &&
          newMessages[processingIndex].processingTool
        ) {
          newMessages[processingIndex].processingTool.status = "completed";
          newMessages[processingIndex].processingTool.response = `Error: ${
            error.message || String(error)
          }`;
        }
        return newMessages;
      });
    }

    return { success: false, sessionId };
  }
};

// Helper function to update the UI with tool results
const updateUIWithToolResult = async (
  handlers: StreamHandlers,
  toolName: string,
  result: any,
  messages: ChatMessage[],
  modelId: string = "",
  abortSignal: AbortSignal | null = null,
  sessionId: string | null = null
) => {
  if (!handlers.setMessages) return;

  const formattedResult =
    typeof result === "object"
      ? JSON.stringify(result, null, 2)
      : String(result);

  // Update the processing tool status to "completed"
  handlers.setMessages((prevMessages) => {
    const newMessages = [...prevMessages];
    // Find the message with this tool being processed
    const processingIndex = newMessages.findIndex(
      (m) =>
        m.processingTool?.name === toolName ||
        (m.processingTool && m.processingTool.status === "calling")
    );

    if (processingIndex >= 0 && newMessages[processingIndex].processingTool) {
      // Update the tool status and add response
      newMessages[processingIndex].processingTool.status = "completed";
      newMessages[processingIndex].processingTool.response = formattedResult;
    }

    return newMessages;
  });

  // Add a message for the tool result
  let updatedMessages: ChatMessage[] = [];
  
  handlers.setMessages((prevMessages) => {
    // Find the last assistant message (which likely contained the tool call)
    const lastAssistantIndex = prevMessages.findIndex(
      (m) => m.role === "assistant" && !m.toolResult
    );

    const toolResultMessage: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: `Tool result: ${formattedResult}`,
      timestamp: new Date(),
      toolResult: {
        toolName,
        result: formattedResult,
      },
    };

    // If we found an assistant message, modify it to remove tool call markup
    if (lastAssistantIndex >= 0) {
      const newMessages = [...prevMessages];
      const assistantMessage = newMessages[lastAssistantIndex];

      // Clean up the assistant message content if it contains a tool call
      if (assistantMessage.content?.includes("<tool_call>")) {
        // Keep only the text before the tool call
        const beforeToolCall = assistantMessage.content
          .split("<tool_call>")[0]
          .trim();
        if (beforeToolCall) {
          assistantMessage.content = beforeToolCall;
        }
      }

      // Insert the tool result message after the assistant message
      newMessages.splice(lastAssistantIndex + 1, 0, toolResultMessage);
      updatedMessages = newMessages;
      return newMessages;
    }

    // Fallback: just append the tool result message
    updatedMessages = [...prevMessages, toolResultMessage];
    return updatedMessages;
  });

  // Now send the tool result back to the LLM to get a response
  try {
    console.log("[updateUIWithToolResult] Sending tool result back to LLM:", {
      toolName,
      result: formattedResult,
    });

    // Create a new message to send to the LLM
    const toolResultForLLM: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: `Tool '${toolName}' returned the following result:\n\n\`\`\`\n${formattedResult}\n\`\`\`\n\nPlease analyze this result and provide your insights.`,
      timestamp: new Date(),
      isHidden: true, // This message won't be shown in the UI
    };

    // Add this message to the conversation
    handlers.setMessages((prevMessages) => {
      return [...prevMessages, toolResultForLLM];
    });

    // Get the updated messages
    const allMessages = [...updatedMessages, toolResultForLLM];

    // Call streamCompletion with the updated messages
    setTimeout(async () => {
      try {
        await streamCompletion(
          allMessages,
          handlers,
          modelId,
          abortSignal,
          sessionId
        );
      } catch (error) {
        console.error("[updateUIWithToolResult] Error getting LLM response for tool result:", error);
      }
    }, 500); // Small delay to ensure UI updates first
  } catch (error) {
    console.error("[updateUIWithToolResult] Error processing tool result:", error);
  }
};

// Helper function to process a single line of streamed data
const processStreamLine = async (
  line: string,
  parser: StreamParser,
  handlers: StreamHandlers,
  messages: ChatMessage[],
  modelId: string,
  abortSignal: AbortSignal | null,
  sessionId: string | null
): Promise<{ shouldContinue: boolean; sessionId: string | null }> => {
  if (!line.startsWith("data: ")) {
    return { shouldContinue: true, sessionId };
  }

  const data = line.substring(6); // Remove "data: " prefix

  if (data === "[DONE]") {
    console.log("[processStreamLine] Received [DONE] marker");

    // Send any remaining content
    if (parser.pendingContent) {
      handlers.onChunk(parser.pendingContent);
      parser.pendingContent = "";
    }

    // Check if we have a complete message with tool call that wasn't handled during streaming
    if (handlers.setMessages && handlers.onToolCall) {
      const latestMessages = [...messages];

      // Find the most recent assistant message
      const lastAssistantMessageIndex = latestMessages.findIndex(
        (msg) => msg.role === "assistant"
      );

      if (lastAssistantMessageIndex >= 0) {
        const assistantMessage = latestMessages[lastAssistantMessageIndex];
        const responseText = assistantMessage.content || "";

        // Log the raw message content to check for tool calls
        console.log("[processStreamLine] RAW ASSISTANT MESSAGE:", {
          content: responseText,
          containsToolCallStart: responseText.includes(TOOL_CALL_START_MARKER),
          containsToolCallEnd: responseText.includes(TOOL_CALL_END_MARKER),
        });

        // Check if response contains a tool call pattern but wasn't handled during streaming
        if (
          responseText.includes(TOOL_CALL_START_MARKER) &&
          !parser.toolCallProcessed
        ) {
          console.log(
            "[processStreamLine] Tool call found in complete message that wasn't processed during streaming"
          );

          // Always add a closing tag if needed - some models don't include it
          let messageWithToolCall = responseText;
          if (!responseText.includes(TOOL_CALL_END_MARKER)) {
            messageWithToolCall = responseText + TOOL_CALL_END_MARKER;
            console.log(
              "[processStreamLine] Adding missing closing tag to tool call"
            );
          }

          // Process the tool call
          const { success, sessionId: newSessionId } = await handleToolCall(
            messageWithToolCall,
            "",
            handlers,
            latestMessages,
            modelId,
            abortSignal,
            sessionId
          );

          if (success) {
            return {
              shouldContinue: false,
              sessionId: newSessionId || sessionId,
            };
          }
        }
      }
    }

    return { shouldContinue: false, sessionId };
  }

  try {
    const parsed = JSON.parse(data);

    // Handle session ID updates
    if (parsed.session_id) {
      const newSessionId = parsed.session_id;
      console.log(`[processStreamLine] Received session_id: ${newSessionId}`);
      handlers.onChunk("", newSessionId);
      return { shouldContinue: true, sessionId: newSessionId };
    }

    // Handle content chunks
    if (parsed.content !== undefined) {
      const content = parsed.content;

      // Log content chunks for debugging
      console.log(
        "[processStreamLine] Content chunk:",
        JSON.stringify({
          content,
          containsToolCallStart: content.includes(TOOL_CALL_START_MARKER),
          containsToolCallEnd: content.includes(TOOL_CALL_END_MARKER),
        })
      );

      // Check if this is a duplicate chunk or a continuation of a tool call
      // If we're receiving a chunk that's a tool call continuation, we should handle it differently
      const isToolCallStart = content.includes(TOOL_CALL_START_MARKER);
      const isToolCallEnd = content.includes(TOOL_CALL_END_MARKER);

      // If it's the start of a tool call, mark that we're entering tool call content
      if (isToolCallStart && !parser.isToolCallContent) {
        console.log("[processStreamLine] Entering tool call content");
        parser.isToolCallContent = true;
        parser.toolCallContent = "";
      }

      if (parser.isToolCallContent) {
        // When in tool call mode, accumulate the content for later processing
        parser.toolCallContent += content;

        // If we've reached the end of the tool call, prepare for processing
        if (isToolCallEnd) {
          console.log("[processStreamLine] Tool call content complete");
          parser.isToolCallContent = false;
          parser.toolCallProcessed = true;
        }
      }

      // For UI display, we should still send all chunks to be shown
      // But be careful about what gets added to pendingContent to avoid duplication
      // We'll just pass the content directly to the UI handler without adding to pendingContent
      handlers.onChunk(content);

      return { shouldContinue: true, sessionId };
    }

    // Handle errors
    if (parsed.error) {
      console.error("[processStreamLine] Error from server:", parsed.error);
      throw new Error(parsed.error.message || "Unknown server error");
    }

    // Handle warnings
    if (parsed.warning) {
      console.warn("[processStreamLine] Warning from server:", parsed.warning);
      throw new Error(
        `Warning: ${parsed.warning.warning}. ${parsed.warning.suggestions[0]}`
      );
    }

    return { shouldContinue: true, sessionId };
  } catch (error) {
    console.error("[processStreamLine] Error parsing stream line:", error);
    throw error;
  }
};

// Update streamCompletion parameter order to fix the required parameter error
export const streamCompletion = async (
  messages: ChatMessage[],
  handlers: StreamHandlers,
  modelId: string | null = null,
  abortSignal: AbortSignal | null = null,
  sessionId: string | null = null,
  modelName: string | null = null
): Promise<{ success: boolean; sessionId: string | null }> => {
  console.log("[streamCompletion] Starting with sessionId:", sessionId);
  console.log("[streamCompletion] Messages received:", messages.map(m => ({ id: m.id, role: m.role, content: m.content?.substring(0, 20) })));

  if (!messages || !Array.isArray(messages)) {
    console.error("[streamCompletion] Invalid messages:", messages);
    return { success: false, sessionId };
  }

  // Check if the last message is already an assistant message that's streaming
  const lastMessage = messages[messages.length - 1];
  console.log("[streamCompletion] Last message:", { 
    id: lastMessage?.id, 
    role: lastMessage?.role, 
    isStreaming: lastMessage?.isStreaming 
  });
  
  const hasAssistantMessage =
    lastMessage && lastMessage.role === "assistant" && lastMessage.isStreaming;
  console.log("[streamCompletion] Has assistant message:", hasAssistantMessage);

  // Create a unique ID for the assistant's message if needed
  const assistantMessageId = hasAssistantMessage ? lastMessage.id : uuidv4();
  console.log("[streamCompletion] Assistant message ID:", assistantMessageId);

  // Create a pending message for the assistant if needed
  let pendingAssistantMessage: ChatMessage | null = null;

  if (!hasAssistantMessage) {
    console.log("[streamCompletion] Creating new assistant message");
    pendingAssistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      isStreaming: true,
      timestamp: new Date(),
    };

    // Add the assistant message placeholder
    if (handlers.setMessages) {
      console.log("[streamCompletion] Adding new assistant message to state");
      handlers.setMessages((prevMessages) => {
        console.log("[streamCompletion] Previous messages:", prevMessages.map(m => ({ id: m.id, role: m.role })));
        
        // Check if we already have an assistant message with isStreaming=true
        const existingAssistantIndex = prevMessages.findIndex(
          m => m.role === "assistant" && m.isStreaming === true
        );
        
        if (existingAssistantIndex >= 0) {
          console.log("[streamCompletion] Found existing assistant message, not adding a new one");
          return prevMessages;
        }
        
        return [...prevMessages, pendingAssistantMessage!];
      });
    }
  }

  try {
    // Prepare messages for the request
    const { messagesForRequest, modelName: streamModelName } =
      prepareMessagesForRequest(messages);

    // Get the provider configuration
    const config = await getProviderConfig(modelId || modelName || "");
    console.log("[streamCompletion] Using provider config:", {
      provider: config.provider,
      model: config.model,
      hasApiKey: !!config.key,
      hasBaseUrl: !!config.baseUrl,
    });

    // Log the request for debugging
    console.log(
      "[streamCompletion] Sending request to",
      NASH_LOCAL_SERVER_CHAT_ENDPOINT
    );
    console.log(
      "[streamCompletion] Model: ",
      modelId || modelName || streamModelName,
      "with messages",
      messagesForRequest.map((m: any) => ({
        role: m.role,
        contentLength: m.content?.length || 0,
      }))
    );

    // Make the API request
    const response = await fetch(NASH_LOCAL_SERVER_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messagesForRequest,
        stream: true,
        session_id: sessionId,
        api_key: config.key,
        api_base_url: config.baseUrl,
        model: config.model,
        provider: config.provider,
      }),
      signal: abortSignal || undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[streamCompletion] API response error:", {
        status: response.status,
        statusText: response.statusText,
        text: errorText,
      });
      throw new Error(
        `API error: ${response.status} ${response.statusText}, ${errorText}`
      );
    }

    const sessionIdHeader = response.headers.get("X-Session-Id");
    if (sessionIdHeader) {
      console.log("[streamCompletion] Received session ID:", sessionIdHeader);
      sessionId = sessionIdHeader;
      // Notify about the new session ID
      handlers.onChunk("", sessionIdHeader);
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    // Track state for tool call detection
    let inToolCall = false;
    let toolCallContent = "";
    let currentContent = "";
    let fullResponse = "";

    // Read from the stream
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      console.log(
        `[streamCompletion] Received chunk (${chunk.length} bytes)`,
        chunk.length > 500 ? chunk.substring(0, 500) + "..." : chunk
      );

      // Add to full response for later analysis
      fullResponse += chunk;

      // Process the chunk line by line
      const lines = chunk.split("\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const eventData = line.substring(6);
          if (eventData === "[DONE]") {
        
            continue;
          }

          try {
            // Parse the full event object
            const event = JSON.parse(eventData);
            

            // If there's content in this chunk, process it
            if (event.content) {
              const content = event.content;
            
              
              // Call the handlers with the content
              handlers.onContent?.(content);
              handlers.onChunk?.(content);
              currentContent += content;
              continue;
            }
            
            // If there's delta.content in this chunk, process it
            if (event.delta?.content) {
              const content = event.delta.content;
              

              // Check for tool call markers
              if (content.includes(TOOL_CALL_START_MARKER)) {
              
                inToolCall = true;

                // Extract any content before the tool call
                const beforeToolCall = content.split(TOOL_CALL_START_MARKER)[0];
                if (beforeToolCall) {
                  handlers.onContent?.(beforeToolCall);
                  currentContent += beforeToolCall;
                }

                // Start collecting tool call content
                toolCallContent = TOOL_CALL_START_MARKER;
                toolCallContent += content.split(TOOL_CALL_START_MARKER)[1] || "";

                // Check if we have a tool call marker and handler
                if (handlers.onToolCall && handlers.setMessages) {
                  // Set the processing state
                  handlers.setMessages((prevMessages) => {
                    const newMessages = [...prevMessages];
                    const lastAssistantIndex = newMessages.findIndex(
                      (m) => m.id === assistantMessageId
                    );
                    if (lastAssistantIndex >= 0) {
                      newMessages[lastAssistantIndex].processingTool = {
                        name: "Preparing...",
                        status: "preparing",
                        response: "",
                      };
                    }
                    return newMessages;
                  });
                }
              } else if (inToolCall) {
                // We're collecting a tool call
                toolCallContent += content;

                // Check if this chunk contains the end marker
                if (content.includes(TOOL_CALL_END_MARKER)) {
                 
                  inToolCall = false;

                  // Process the tool call
                  const result = await handleToolCall(
                    toolCallContent,
                    currentContent,
                    handlers,
                    messages,
                    modelId || modelName || "",
                    abortSignal,
                    sessionId
                  );

                  // Extract any content after the end marker
                  const afterEndMarker = content.split(TOOL_CALL_END_MARKER)[1];
                  if (afterEndMarker) {
                    handlers.onContent?.(afterEndMarker);
                    currentContent += afterEndMarker;
                  }

                  // Update session ID if it changed
                  if (result.sessionId) {
                    sessionId = result.sessionId;
                  }
                }
              } else {
                // Regular content
               
                handlers.onContent?.(content);
                handlers.onChunk?.(content);
                currentContent += content;
              }
            } else if (event.session_id) {
              // Handle session ID updates
            
              sessionId = event.session_id;
              handlers.onChunk?.("", event.session_id);
            } 
          } catch (error) {
            console.error(
              "[streamCompletion] Error parsing event data:",
              error,
              eventData
            );
          }
        }
      }
    }

    console.log(
      "[streamCompletion] Stream completed, full response:",
      fullResponse
    );

    // Check for tool calls in the full response that might have been missed during streaming
    if (
      fullResponse.includes(TOOL_CALL_START_MARKER) &&
      !inToolCall &&
      handlers.onToolCall
    ) {
      console.log(
        "[streamCompletion] Found tool call in full response that wasn't processed during streaming"
      );

      // Extract the tool call content
      const startIndex = fullResponse.indexOf(TOOL_CALL_START_MARKER);
      let endIndex = fullResponse.indexOf(TOOL_CALL_END_MARKER, startIndex);

      // If no end marker, take everything after the start marker
      let extractedToolCall;
      if (endIndex === -1) {
        extractedToolCall =
          fullResponse.substring(startIndex) + TOOL_CALL_END_MARKER;
      } else {
        // Include the end marker in the extracted content
        endIndex += TOOL_CALL_END_MARKER.length;
        extractedToolCall = fullResponse.substring(startIndex, endIndex);
      }

      console.log(
        "[streamCompletion] Extracted tool call from full response:",
        extractedToolCall
      );

      // Update the UI to show we're processing a tool
      if (handlers.setMessages) {
        handlers.setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          const lastAssistantIndex = newMessages.findIndex(
            (m) => m.id === assistantMessageId
          );
          if (lastAssistantIndex >= 0) {
            // Try to extract the tool name from the tool call
            let toolName = "Unknown Tool";
            try {
              const toolCallContent = extractedToolCall
                .replace(TOOL_CALL_START_MARKER, "")
                .replace(TOOL_CALL_END_MARKER, "")
                .trim();
              
              // Clean up the content by removing SSE data format
              const cleanedContent = toolCallContent
                .split("\n")
                .filter(line => line.trim())
                .map(line => {
                  // Extract content from data: {"content": "..."} format
                  const contentMatch = line.match(/data: {"content": "(.*)"}/);
                  if (contentMatch && contentMatch[1]) {
                    return contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
                  }
                  return line;
                })
                .join("");
              
              // Try to extract the tool name using regex
              const nameMatch = cleanedContent.match(/"name"\s*:\s*"([^"]+)"/);
              if (nameMatch && nameMatch[1]) {
                toolName = nameMatch[1];
              } else if (cleanedContent.includes("nash_secrets")) {
                toolName = "nash_secrets";
              } else {
                // Try to parse as JSON if regex fails
                const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    const jsonObj = JSON.parse(jsonMatch[0]);
                    if (jsonObj.function && jsonObj.function.name) {
                      toolName = jsonObj.function.name;
                    }
                  } catch (jsonError) {
                    console.warn("Error parsing JSON in streamCompletion:", jsonError);
                  }
                }
              }
            } catch (e) {
              console.error(
                "[streamCompletion] Error extracting tool name:",
                e
              );
            }

            newMessages[lastAssistantIndex].processingTool = {
              name: toolName,
              status: "calling",
              functionCall: extractedToolCall, // Store the raw tool call content
            };
          }
          return newMessages;
        });
      }

      // Process the tool call
      await handleToolCall(
        extractedToolCall,
        currentContent,
        handlers,
        messages,
        modelId || modelName || "",
        abortSignal,
        sessionId
      );
    }

    // Check if we have an unfinished tool call
    if (inToolCall && toolCallContent) {
      console.log(
        "[streamCompletion] Processing unfinished tool call at end of stream"
      );

      // Add closing tag if missing
      if (!toolCallContent.includes(TOOL_CALL_END_MARKER)) {
        toolCallContent += TOOL_CALL_END_MARKER;
      }

      // Process the tool call
      const result = await handleToolCall(
        toolCallContent,
        currentContent,
        handlers,
        messages,
        modelId || modelName || "",
        abortSignal,
        sessionId
      );

      // Update session ID if it changed
      if (result.sessionId) {
        sessionId = result.sessionId;
      }
    }

    // Set isStreaming to false for the assistant's message
    if (handlers.setMessages) {
      handlers.setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        console.log("TEST [streamCompletion] Updated messages:", newMessages, fullResponse);
        const assistantIndex = newMessages.findIndex(
          (m) => m.id === assistantMessageId
        );
        if (assistantIndex >= 0) {
          newMessages[assistantIndex].isStreaming = false;
        }
        return newMessages;
      });
    }

    return { success: true, sessionId };
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("[streamCompletion] Request aborted");
    } else {
      console.error("[streamCompletion] Error in stream:", error);

      // Add error message
      if (handlers.setMessages && assistantMessageId) {
        handlers.setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          const assistantIndex = newMessages.findIndex(
            (m) => m.id === assistantMessageId
          );
          if (assistantIndex >= 0) {
            newMessages[assistantIndex].content = `Error: ${
              error.message || String(error)
            }`;
            newMessages[assistantIndex].isError = true;
            newMessages[assistantIndex].isStreaming = false;
          }
          return newMessages;
        });
      }
    }
    throw error;
  }
};

// Helper function to extract tool call content from a string
function extractToolCallFromContent(content: string): string | null {
  if (!content.includes(TOOL_CALL_START_MARKER)) {
    return null;
  }

  const startIndex = content.indexOf(TOOL_CALL_START_MARKER);
  let endIndex = content.indexOf(TOOL_CALL_END_MARKER, startIndex);

  // If no end marker, take everything after the start marker
  if (endIndex === -1) {
    const toolCallContent = content.substring(startIndex);
    return toolCallContent + TOOL_CALL_END_MARKER; // Add closing tag
  }

  // Include the end marker in the extracted content
  endIndex += TOOL_CALL_END_MARKER.length;
  return content.substring(startIndex, endIndex);
}

// This function is no longer needed since we handle tool results directly in handleToolCall
// Keeping it for reference but marking it as deprecated
const handleToolResult = async (
  result: any,
  messages: ChatMessage[],
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
  onChunk?: (chunk: string, sessionId?: string) => void,
  modelId?: string,
  abortSignal?: AbortSignal | null
) => {
  console.warn(
    "[handleToolResult] This function is deprecated and should not be called directly"
  );
  return;
};

export const summarizeConversation = async (
  messages: ChatMessage[],
  sessionId: string | null = null
) => {
  try {
    // Prepare messages in the format expected by the server
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    console.log(
      "[summarizeConversation] Sending request with sessionId:",
      sessionId
    );

    const response = await fetch(NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: formattedMessages,
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("[summarizeConversation] Error:", error);
    throw error;
  }
};
