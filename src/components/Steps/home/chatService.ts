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
import { getProviderConfig } from "./utils";
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
  // Prepare messages for API request
  if (!messages || !Array.isArray(messages)) {
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
    throw new Error(
      "No messages found for the conversation. At least one user message is required."
    );
  }

  // Check if the first message is from a user (required by Anthropic)
  if (completedMessages[0].role !== "user") {
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
  if (!content.includes(TOOL_CALL_START_MARKER)) {
    return null;
  }

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

    return cleanedContent;
  }

  return null;
};

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
      return null;
    }
  }

  // If the above approach fails, fall back to the original method
  // Find the first { character which might start JSON
  const jsonStartIndex = cleanedContent.indexOf("{");
  if (jsonStartIndex < 0) {
    return null;
  }

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
        if (bracketCount === 0) {
          break; // We found a complete JSON object
        }
      }
    }
  }

  return extracted;
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
    return { success: false, sessionId };
  }

  // ADDED: Generate a unique ID for this tool call to help with tracking
  const toolCallId = uuidv4().substring(0, 8);

  // Extract the content with our helper function that handles missing end markers
  const extractedContent = extractToolCallContent(toolCallContent);

  if (!extractedContent) {
    return { success: false, sessionId };
  }

  // Extract JSON content using our custom function
  const extractedJson = findJsonInToolCall(extractedContent);

  // First, update the UI to show we're processing a tool call
  if (handlers.setMessages) {
    try {
      // Default tool name
      let toolName = "Unknown Tool";
      let functionCall = extractedContent;
      
      // Try to parse the JSON to get the tool name
      if (extractedJson) {
        try {
          const jsonObj = JSON.parse(extractedJson);
          
          if (jsonObj.function && jsonObj.function.name) {
            toolName = jsonObj.function.name;
            functionCall = JSON.stringify(jsonObj, null, 2);
          }
        } catch (e) {
        }
      } else {
      }

      // If we couldn't get the tool name from JSON, try regex
      if (toolName === "Unknown Tool") {
        const nameMatch =
          extractedContent.match(/["']?name["']?\s*:\s*["']([^"']+)["']/i) ||
          extractedContent.match(/nash_(\w+)/i);
        if (nameMatch) {
          toolName = nameMatch[1];
        }
      }

      // FIXED: Add the tool call ID to the tool name to ensure uniqueness
      const uniqueToolName = `${toolName}_${toolCallId}`;
      
      // Add more logging
      // Update the UI to show we're processing this tool
      handlers.setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        // Find the last assistant message to update
        const lastAssistantIndex = newMessages.findIndex(
          (m) => m.role === "assistant" && m.isStreaming !== false
        );

        if (lastAssistantIndex >= 0) {
          // Log before updating
          // Add processing tool info to show the badge
          newMessages[lastAssistantIndex].processingTool = {
            name: uniqueToolName, // Use unique name
            status: "calling",
            functionCall: toolCallContent, // Store the raw tool call content
          };
        } else {
          // FALLBACK: If we can't find the assistant message, add a new one
          newMessages.push({
            id: uuidv4(),
            role: "assistant",
            content: "Processing tool call...",
            timestamp: new Date(),
            processingTool: {
              name: uniqueToolName,
              status: "calling",
              functionCall: toolCallContent
            }
          });
        }
        return newMessages;
      });
      
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

              // Handle any tool dynamically
              if (handlers.onToolCall) {
                const result = await handlers.onToolCall(toolName, toolArgs);

                // Update the UI with the result
                await updateUIWithToolResult(
                  handlers,
                  uniqueToolName, // Use unique name
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
          }
        }

        // Fallback to regex-based extraction if JSON parsing failed
        const nameMatch =
          extractedContent.match(/["']?name["']?\s*:\s*["']([^"']+)["']/i) ||
          extractedContent.match(/nash_(\w+)/i);

        if (nameMatch) {
          const toolName = nameMatch[1];

          // Call the tool with empty args as fallback
          if (handlers.onToolCall) {
            try {
              const result = await handlers.onToolCall(toolName, {});

              // Update the UI with the result
              await updateUIWithToolResult(
                handlers,
                uniqueToolName, // Use unique name
                result,
                messages,
                modelId,
                abortSignal,
                sessionId
              );

              return { success: true, sessionId };
            } catch (e) {
            }
          }
        }

        // If we get here, we couldn't process the tool call
        return { success: false, sessionId };
      } catch (error) {
        return { success: false, sessionId };
      }
    } catch (parseError) {
    }
  }

  // If we get here, we couldn't process the tool call
  return { success: false, sessionId };
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

  // Extract toolCallId from the unique toolName if present
  const toolCallId = toolName.includes('_') ? toolName.split('_').pop() : 'unknown';
  
  const formattedResult =
    typeof result === "object"
      ? JSON.stringify(result, null, 2)
      : String(result);

  // Update the processing tool status to "completed"
  handlers.setMessages((prevMessages) => {
    const newMessages = [...prevMessages];
    
    // FIXED: More specific selector that requires BOTH matching tool name AND calling status
    // This prevents updating the wrong badge when multiple tools are called
    const processingIndex = newMessages.findIndex(
      (m) =>
        m.processingTool?.name === toolName &&
        m.processingTool?.status === "calling"
    );

    // If we can't find an exact match, fall back to finding any calling tool as a last resort
    const fallbackIndex = processingIndex >= 0 ? processingIndex : 
      newMessages.findIndex(m => m.processingTool?.status === "calling");

    const indexToUpdate = processingIndex >= 0 ? processingIndex : fallbackIndex;

    if (indexToUpdate >= 0 && newMessages[indexToUpdate].processingTool) {
      // Update the tool status and add response
      newMessages[indexToUpdate].processingTool.status = "completed";
      newMessages[indexToUpdate].processingTool.response = formattedResult;
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
      }
    }, 500); // Small delay to ensure UI updates first
  } catch (error) {
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

        // Check if response contains a tool call pattern but wasn't handled during streaming
        if (
          responseText.includes(TOOL_CALL_START_MARKER) &&
          !parser.toolCallProcessed
        ) {
          // Always add a closing tag if needed - some models don't include it
          let messageWithToolCall = responseText;
          if (!responseText.includes(TOOL_CALL_END_MARKER)) {
            messageWithToolCall = responseText + TOOL_CALL_END_MARKER;
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
      handlers.onChunk("", newSessionId);
      return { shouldContinue: true, sessionId: newSessionId };
    }

    // Handle content chunks
    if (parsed.content !== undefined) {
      const content = parsed.content;

      // FIXED: Reset tool call state when a new tool call starts
      // This ensures each tool call is treated as a fresh cycle
      const isToolCallStart = content.includes(TOOL_CALL_START_MARKER);
      const isToolCallEnd = content.includes(TOOL_CALL_END_MARKER);

      // If it's the start of a tool call, mark that we're entering tool call content
      if (isToolCallStart) {
        // FIXED: Reset state for new tool call
        parser.isToolCallContent = true;
        parser.toolCallContent = "";
        parser.toolCallProcessed = false; // Reset the processed flag for new tool call
      }

      if (parser.isToolCallContent) {
        // When in tool call mode, accumulate the content for later processing
        parser.toolCallContent += content;

        // If we've reached the end of the tool call, prepare for processing
        if (isToolCallEnd) {
          parser.isToolCallContent = false;
          
          // FIXED: Process the tool call immediately when we have a complete tool call
          // This prevents issues with state management for subsequent tool calls
          if (!parser.toolCallProcessed && handlers.onToolCall && handlers.setMessages) {
            const { success, sessionId: newSessionId } = await handleToolCall(
              parser.toolCallContent,
              parser.pendingContent,
              handlers,
              messages,
              modelId,
              abortSignal,
              sessionId
            );
            
            // Mark as processed to avoid duplicate processing
            parser.toolCallProcessed = success;
            
            // Reset tool call content after processing
            parser.toolCallContent = "";
            
            // Update session ID if needed
            if (newSessionId) {
              sessionId = newSessionId;
            }
          }
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
      throw new Error(parsed.error.message || "Unknown server error");
    }

    // Handle warnings
    if (parsed.warning) {
      throw new Error(
        `Warning: ${parsed.warning.warning}. ${parsed.warning.suggestions[0]}`
      );
    }

    return { shouldContinue: true, sessionId };
  } catch (error) {
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
  if (!messages || !Array.isArray(messages)) {
    throw new Error("Invalid messages");
  }

  // Check if the last message is already an assistant message that's streaming
  const lastMessage = messages[messages.length - 1];
  
  const hasAssistantMessage =
    lastMessage && lastMessage.role === "assistant" && lastMessage.isStreaming;

  // Create a unique ID for the assistant's message if needed
  const assistantMessageId = hasAssistantMessage ? lastMessage.id : uuidv4();

  // Create a pending message for the assistant if needed
  let pendingAssistantMessage: ChatMessage | null = null;

  if (!hasAssistantMessage) {
    pendingAssistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      isStreaming: true,
      timestamp: new Date(),
    };

    // Add the assistant message placeholder
    if (handlers.setMessages) {
      handlers.setMessages((prevMessages) => {
        // Check if we already have an assistant message with isStreaming=true
        const existingAssistantIndex = prevMessages.findIndex(
          m => m.role === "assistant" && m.isStreaming === true
        );
        
        if (existingAssistantIndex >= 0) {
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

    // Log the request for debugging
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
      throw new Error(
        `API error: ${response.status} ${response.statusText}, ${errorText}`
      );
    }

    const sessionIdHeader = response.headers.get("X-Session-Id");
    if (sessionIdHeader) {
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
                const afterStartMarker = content.split(TOOL_CALL_START_MARKER)[1] || "";
             
                toolCallContent += afterStartMarker;
             

                // Check if we have a tool call marker and handler
                if (handlers.onToolCall && handlers.setMessages) {
                    // Try to extract tool name from the initial content
                    let initialToolName = "Preparing...";
                    try {
                        // First try to find a complete JSON object
                        const jsonMatch = afterStartMarker.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const jsonObj = JSON.parse(jsonMatch[0]);
                            if (jsonObj.function?.name) {
                                initialToolName = jsonObj.function.name;
                            }
                        } else {
                            // Try regex patterns
                            const nameMatch = afterStartMarker.match(/["']?name["']?\s*:\s*["']([^"']+)["']/i);
                            if (nameMatch) {
                                initialToolName = nameMatch[1];
                            }
                        }
                    } catch (e) {
                    }

                    // Set the processing state
                    handlers.setMessages((prevMessages) => {
                        const newMessages = [...prevMessages];
                        const lastAssistantIndex = newMessages.findIndex(
                            (m) => m.id === assistantMessageId
                        );
                        if (lastAssistantIndex >= 0) {
                            newMessages[lastAssistantIndex].processingTool = {
                                name: initialToolName,
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
          }
        }
      }
    }

  

    // Check for tool calls in the full response that might have been missed during streaming
    if (
      fullResponse.includes(TOOL_CALL_START_MARKER) &&
      !inToolCall &&
      handlers.onToolCall
    ) {
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
              const cleanedContent = extractedToolCall
                .replace(TOOL_CALL_START_MARKER, "")
                .replace(TOOL_CALL_END_MARKER, "")
                .trim();
              
              // Try to extract the tool name using regex
              const nameMatch = cleanedContent.match(/"name"\s*:\s*"([^"]+)"/);
              if (nameMatch && nameMatch[1]) {
                toolName = nameMatch[1];
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
                  }
                }
              }
            } catch (e) {
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
      console.log("Request aborted");
    } else {
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
    console.error("Error:", error);
    throw error;
  }
};

// Improve the tool call handling function
const cleanToolCalls = (content: string): string => {
  if (!content || typeof content !== "string") return "";

  // If the content contains a tool call marker, only show content before it
  if (content.includes("<tool_call>")) {
    const parts = content.split("<tool_call>");

    // If there's content before the tool call, show it
    if (parts[0].trim()) {
      return parts[0].trim();
    }

    // If there's no content before the tool call, show a more informative message
    // Try to extract the tool name from the tool call if possible
    const toolCallContent = parts[1] || "";

    // First try to extract from function.name format (server logs format)
    const functionMatch = toolCallContent.match(
      /"function"[\s\S]*?"name"[\s\S]*?:[\s\S]*?"([^"]+)"/
    );
    if (functionMatch && functionMatch[1]) {
      const toolName = functionMatch[1];
      return `I'm using the ${toolName} tool to get information for you...`;
    }

    // Fallback to simpler name extraction
    const simpleMatch = toolCallContent.match(/"name"\s*:\s*"([^"]+)"/);
    if (simpleMatch && simpleMatch[1]) {
      return `I'm using the ${simpleMatch[1]} tool to get information for you...`;
    }

    // Generic message when we can't extract a specific tool name
    return "I'm using a tool to get information for you...";
  }

  return content;
};
