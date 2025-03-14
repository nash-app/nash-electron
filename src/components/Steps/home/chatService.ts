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

  console.log("Preparing messages for request:", JSON.stringify(messages.map(m => ({
    role: m.role,
    isHidden: m.isHidden,
    isStreaming: m.isStreaming,
    content: m.content?.substring(0, 30) + "..."
  }))));

  // Filter messages to only include relevant messages
  // and format them exactly as expected by the server
  const filteredMessages = messages.filter((m) => {
    // Skip hidden messages
    if (m.isHidden) {
      return false;
    }
    
    // For assistant messages, only include those that are complete (not streaming)
    if (m.role === "assistant") {
      return !m.isStreaming;
    }
    
    // Include all user messages
    return m.role === "user";
  });

  console.log("Filtered messages:", filteredMessages.length);

  // If we don't have any user messages, we need to ensure there's at least one
  if (!filteredMessages.some(m => m.role === "user")) {
    console.log("No user messages found, adding a synthetic one");
    
    // Find the first non-hidden message as reference
    const firstMessage = messages.find(m => !m.isHidden);
    
    // If we have a tool result in the messages, convert it to a user query
    const toolResultMsg = messages.find(m => m.toolResult && !m.isHidden);
    
    if (toolResultMsg && toolResultMsg.toolResult) {
      // Create a synthetic user message based on the tool result
      filteredMessages.unshift({
        id: uuidv4(),
        role: "user",
        content: `Please analyze the results from the tool ${toolResultMsg.toolResult.toolName}`,
        timestamp: new Date()
      });
    } else if (firstMessage) {
      // Fallback to a generic user message
      filteredMessages.unshift({
        id: uuidv4(),
        role: "user",
        content: "Please continue with your explanation based on the previous messages.",
        timestamp: new Date()
      });
    } else {
      throw new Error("No suitable messages found to create a conversation");
    }
  }

  // Check if we have any messages at all after filtering
  if (filteredMessages.length === 0) {
    throw new Error(
      "No messages left after filtering. At least one user message is required."
    );
  }

  // Check if the first message is from a user (required by Anthropic)
  if (filteredMessages[0].role !== "user") {
    console.log("First message is not from user, rearranging messages");
    
    // Find the first user message
    const firstUserMessageIndex = filteredMessages.findIndex(m => m.role === "user");
    
    if (firstUserMessageIndex >= 0) {
      // Move the first user message to the beginning
      const userMessage = filteredMessages.splice(firstUserMessageIndex, 1)[0];
      filteredMessages.unshift(userMessage);
    } else {
      // If we somehow got here without a user message, add a synthetic one
      filteredMessages.unshift({
        id: uuidv4(),
        role: "user",
        content: "Please continue with your analysis and explanation.",
        timestamp: new Date()
      });
    }
  }

  // Map messages to the exact format expected by the server
  const messagesForRequest = filteredMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  console.log("Final message count for request:", messagesForRequest.length);

  // Default model name
  const modelName = "claude-3-sonnet-20240229";

  return { messagesForRequest, modelName };
}

// Extract tool call content between the tool call markers and clean up streaming data format
const extractToolCallContent = (content: string): string | null => {
  if (!content.includes(TOOL_CALL_START_MARKER)) {
    return null;
  }

  // Extract the tool call JSON - similar to Python implementation
  const startTag = TOOL_CALL_START_MARKER;
  const endTag = TOOL_CALL_END_MARKER;
  const startIdx = content.indexOf(startTag) + startTag.length;
  const endIdx = content.indexOf(endTag);
  
  // If no end marker found, take everything after the start marker
  let extractedContent;
  if (startIdx <= 0 || endIdx <= 0) {
    extractedContent = content.substring(startIdx).trim();
  } else {
    // Return the content between markers
    extractedContent = content.substring(startIdx, endIdx).trim();
  }
  
  // Clean up streaming data format - this handles the SSE data format
  if (extractedContent.includes('data: {"content":')) {
    console.log("Cleaning up streaming data format");
    let cleanedContent = "";
    
    // Process line by line
    const lines = extractedContent.split('\n');
    for (const line of lines) {
      // Look for data: {"content": "..."} pattern
      const match = line.match(/data:\s*{"content":\s*"(.*)"\}/);
      if (match && match[1]) {
        // Extract just the content and unescape it
        let extracted = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        cleanedContent += extracted;
      } else if (!line.includes('data: [DONE]')) {
        // Include non-data lines (but skip [DONE] markers)
        cleanedContent += line;
      }
    }
    
    // Special case - if the content starts with "}" or other JSON fragments, 
    // try to clean it up further by removing the first line
    if (cleanedContent.startsWith('}') || cleanedContent.startsWith('"')) {
      // Look for the start of a valid JSON object
      const jsonStart = cleanedContent.indexOf('{');
      if (jsonStart > 0) {
        cleanedContent = cleanedContent.substring(jsonStart);
        console.log("Removed invalid JSON prefix");
      }
    }
    
    // Further clean up any remaining issues that might prevent JSON parsing
    cleanedContent = cleanedContent.replace(/^\s*"/, ''); // Remove leading quotes
    
    return cleanedContent;
  }
  
  return extractedContent;
};

// Parse the tool call JSON - simplified to match Python reference implementation
const parseToolCall = (content: string) => {
  try {
    // First try to directly parse the content as JSON
    const jsonObj = JSON.parse(content);
    
    // Check if we have a function object with name
    if (jsonObj && jsonObj.function && jsonObj.function.name) {
      return {
        toolCallFound: true,
        toolName: jsonObj.function.name,
        arguments: jsonObj.function.arguments || {},
      };
    }
    
    // If we have a list, take the first item
    if (Array.isArray(jsonObj) && jsonObj.length > 0) {
      const call = jsonObj[0];
      if (call && call.function && call.function.name) {
        return {
          toolCallFound: true,
          toolName: call.function.name,
          arguments: call.function.arguments || {},
        };
      }
    }
    
    return {
      toolCallFound: false,
      toolName: null,
      arguments: null,
      error: "No valid function call found in JSON"
    };
  } catch (e) {
    // If JSON parse fails, try a more lenient approach with regex
    try {
      // Try to extract the name with regex
      const nameMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
      if (nameMatch && nameMatch[1]) {
        // Try to extract arguments
        let args = {};
        const argsMatch = content.match(/"arguments"\s*:\s*(\{[^}]*\})/);
        if (argsMatch && argsMatch[1]) {
          try {
            args = JSON.parse(argsMatch[1]);
          } catch (e) {
            // If arguments can't be parsed, use empty object
          }
        }
        
        return {
          toolCallFound: true,
          toolName: nameMatch[1],
          arguments: args,
        };
      }
    } catch (regexError) {
      // If regex approach fails too, return error
    }
    
    return {
      toolCallFound: false,
      toolName: null,
      arguments: null,
      error: `Error parsing tool call JSON: ${e}`
    };
  }
};

// Helper function to handle tool calls - simplified to match Python reference implementation
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

  // Make sure we have the closing tag - following Python reference
  let messageWithClosingTag = toolCallContent;
  if (!toolCallContent.includes(TOOL_CALL_END_MARKER)) {
    messageWithClosingTag = toolCallContent + TOOL_CALL_END_MARKER;
  }

  // Extract the content between the markers
  const extractedContent = extractToolCallContent(messageWithClosingTag);
  if (!extractedContent) {
    return { success: false, sessionId };
  }

  // Parse the tool call using our new parser
  const parsedToolCall = parseToolCall(extractedContent);
  
  // If we couldn't parse the tool call, return failure
  if (!parsedToolCall.toolCallFound || !parsedToolCall.toolName) {
    return { success: false, sessionId };
  }

  // Get the tool name and arguments
  const toolName = parsedToolCall.toolName;
  const toolArgs = parsedToolCall.arguments || {};

  // First, update the UI to show we're processing a tool call
  if (handlers.setMessages) {
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
          name: toolName, // Use actual tool name without ID suffix
          status: "calling",
          functionCall: messageWithClosingTag, // Store the raw tool call content
        };
      } else {
        // FALLBACK: If we can't find the assistant message, add a new one
        newMessages.push({
          id: uuidv4(),
          role: "assistant",
          content: "Processing tool call...",
          timestamp: new Date(),
          processingTool: {
            name: toolName,
            status: "calling",
            functionCall: messageWithClosingTag
          }
        });
      }
      return newMessages;
    });
    
    // Now process the tool call
    try {
      // Call the tool with parsed arguments
      if (handlers.onToolCall) {
        const result = await handlers.onToolCall(toolName, toolArgs);

        // Update the UI with the result
        await updateUIWithToolResult(
          handlers,
          toolName, // Use regular tool name - no suffix
          result,
          messages,
          modelId,
          abortSignal,
          sessionId
        );

        return { success: true, sessionId };
      }
    } catch (error) {
      console.error("Error calling tool:", error);
      return { success: false, sessionId };
    }
  }

  // If we get here, we couldn't process the tool call
  return { success: false, sessionId };
};

// Helper function to update the UI with tool results - simplified based on Python reference
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
  
  // Format the result 
  const formattedResult =
    typeof result === "object"
      ? JSON.stringify(result, null, 2)
      : String(result);

  // Update the processing tool status to "completed"
  handlers.setMessages((prevMessages) => {
    const newMessages = [...prevMessages];
    
    // Find the message with this specific tool call in "calling" status
    const processingIndex = newMessages.findIndex(
      (m) =>
        m.processingTool?.name === toolName &&
        m.processingTool?.status === "calling"
    );

    // If we can't find an exact match, look for any tool in "calling" status
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
    // Find the assistant message that contained the tool call
    const lastAssistantIndex = prevMessages.findIndex(
      (m) => m.role === "assistant" && !m.toolResult
    );

    const toolResultMessage: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: `Tool result: ${formattedResult}`,
      timestamp: new Date(),
      toolResult: {
        toolName, // Use the clean tool name
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

  // Match Python reference implementation - use tool result and add a synthetic user message if needed
  // No try-catch block here - let errors propagate
  // The tool result is already added as an assistant message
  console.log("Tool result added as assistant message - matching Python reference implementation");
  
  // Get the updated messages
  const allMessages = [...updatedMessages];
  console.log("Updated messages count:", allMessages.length);
  
  // ALWAYS add a user message for tool result follow-up - this is critical
  console.log("Adding synthetic user message for tool result follow-up - FORCED");
  
  // Add a synthetic user message asking for analysis of the tool result
  const syntheticUserMessage: ChatMessage = {
    id: uuidv4(),
    role: "user",
    content: `Please analyze the results from the ${toolName} tool.`,
    timestamp: new Date(),
  };
  
  // Add to our messages array and to the UI
  allMessages.push(syntheticUserMessage);
  
  // Force UI update with new message
  handlers.setMessages((prevMessages) => {
    console.log("Adding synthetic message to UI");
    return [...prevMessages, syntheticUserMessage];
  });

  // Call streamCompletion with the updated messages - do this immediately
  console.log("IMMEDIATELY starting new completion after tool call");
  
  // Debug log the message sequence
  allMessages.forEach((m, i) => {
    console.log(`Message ${i}: role=${m.role}, content=${m.content?.substring(0, 30)}...`);
  });
  
  // Create a function to retry multiple times if needed
  const executeStreamWithRetry = async (retryCount = 3) => {
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`Attempt ${attempt} to start follow-up completion`);
        
        await streamCompletion(
          allMessages,
          handlers,
          modelId,
          abortSignal,
          sessionId
        );
        
        console.log("Follow-up completion succeeded!");
        return; // Success, exit the retry loop
      } catch (error) {
        console.error(`Error in follow-up stream completion attempt ${attempt}:`, error);
        
        if (attempt < retryCount) {
          // Wait longer between retries
          const delay = attempt * 500;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error("All follow-up completion attempts failed");
          
          // If all attempts fail, show an error message to the user
          handlers.setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            newMessages.push({
              id: uuidv4(),
              role: "assistant",
              content: "I wasn't able to analyze the tool results due to a technical issue. Please try again.",
              timestamp: new Date(),
            });
            return newMessages;
          });
        }
      }
    }
  };
  
  // Execute with retries
  executeStreamWithRetry();
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
                    // Try to extract tool name from the initial content - simplified approach
                    // Start with a default name
                    let toolName = "Preparing...";
                    
                    // Parse any available content to get a better tool name
                    try {
                        // Try to parse tool call - this is a simpler approach than before
                        const content = afterStartMarker.trim();
                        
                        // First check if we have a JSON object we can parse
                        if (content.startsWith("{")) {
                            try {
                                const parsed = JSON.parse(content);
                                if (parsed.function?.name) {
                                    toolName = parsed.function.name;
                                }
                            } catch (e) {
                                // JSON parsing failed, try regex as fallback
                                const nameMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
                                if (nameMatch && nameMatch[1]) {
                                    toolName = nameMatch[1];
                                }
                            }
                        }
                    } catch (e) {
                        // Keep the default name
                    }

                    // Set the processing state
                    handlers.setMessages((prevMessages) => {
                        const newMessages = [...prevMessages];
                        const lastAssistantIndex = newMessages.findIndex(
                            (m) => m.id === assistantMessageId
                        );
                        if (lastAssistantIndex >= 0) {
                            newMessages[lastAssistantIndex].processingTool = {
                                name: toolName, // Use the clean tool name without ID
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
      console.log("Tool call found in full response but not processed during streaming");
      console.log("Full response length:", fullResponse.length);
      
      try {
        // Make sure we have the closing tag - following Python reference
        let messageWithClosingTag = fullResponse;
        if (!fullResponse.includes(TOOL_CALL_END_MARKER)) {
          messageWithClosingTag = fullResponse + TOOL_CALL_END_MARKER;
          console.log("Added closing tag to tool call");
        }
        
        // Extract the tool call content similar to the Python implementation
        const startTag = TOOL_CALL_START_MARKER;
        const endTag = TOOL_CALL_END_MARKER;
        const startIdx = messageWithClosingTag.indexOf(startTag);
        const endIdx = messageWithClosingTag.indexOf(endTag, startIdx);
        
        console.log(`Tool call bounds: start=${startIdx}, end=${endIdx}`);
        
        if (startIdx >= 0 && endIdx > startIdx) {
          // Extract the tool call including the markers
          const extractedToolCall = messageWithClosingTag.substring(startIdx, endIdx + endTag.length);
          console.log("Extracted tool call length:", extractedToolCall.length);
          
          // ALTERNATIVE APPROACH: Directly add tool to UI without processing
          // This ensures a tool badge shows up even if the handler fails
          if (handlers.setMessages) {
            // Use a direct update method focused on finding the right message
            handlers.setMessages((prevMessages) => {
              const newMessages = [...prevMessages];
              
              // Find the most recent messages from assistant
              const assistantMessages = newMessages
                .filter(m => m.role === "assistant")
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
              
              if (assistantMessages.length > 0) {
                // Get the most recent assistant message
                const messageToUpdate = assistantMessages[0];
                console.log("Found message to update with ID:", messageToUpdate.id);
                
                // Try to get a good tool name from the extracted tool call
                let toolName = "tool";
                try {
                  // First, log the exact tool call for debugging
                  const rawContent = extractedToolCall.replace(startTag, "").replace(endTag, "").trim();
                  console.log("Raw tool call content:", rawContent);
                  
                  // Extract the content between the markers
                  const content = extractToolCallContent(extractedToolCall);
                  console.log("Extracted content:", content);
                  
                  if (content) {
                    // Log the content we're trying to parse
                    console.log("Content to parse:", content);
                    
                    // Try multiple approaches to extract the name
                    
                    // 1. Try to parse as JSON first
                    try {
                      // Try to fix common JSON issues first
                      let fixedContent = content;
                      
                      // If content starts with unexpected characters, try to find valid JSON
                      if (fixedContent.startsWith('}') || fixedContent.startsWith('"')) {
                        const jsonStart = fixedContent.indexOf('{');
                        if (jsonStart >= 0) {
                          fixedContent = fixedContent.substring(jsonStart);
                          console.log("Fixed content by finding proper JSON start");
                        }
                      }
                      
                      // Try parsing the cleaned content
                      const jsonObj = JSON.parse(fixedContent);
                      console.log("Parsed JSON:", jsonObj);
                      
                      if (jsonObj.function && jsonObj.function.name) {
                        toolName = jsonObj.function.name;
                        console.log("Found tool name from JSON:", toolName);
                      }
                    } catch (jsonError) {
                      console.log("JSON parse failed:", jsonError.message);
                      
                      // 2. Try regex for function.name format
                      const functionNameMatch = content.match(/"function"[^}]*"name"\s*:\s*"([^"]+)"/);
                      if (functionNameMatch && functionNameMatch[1]) {
                        toolName = functionNameMatch[1];
                        console.log("Found tool name from function regex:", toolName);
                      } else {
                        // 3. Try simple name regex
                        const nameMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
                        if (nameMatch && nameMatch[1]) {
                          toolName = nameMatch[1];
                          console.log("Found tool name from simple regex:", toolName);
                        } else {
                          // 4. Last resort - try to find any quoted word that might be a name
                          const wordMatch = content.match(/"([^"]+)"/);
                          if (wordMatch && wordMatch[1] && wordMatch[1].length > 1) {
                            // Only use if it looks like a reasonable name
                            toolName = wordMatch[1];
                            console.log("Found potential tool name from quotes:", toolName);
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error("Error extracting tool name:", e);
                }
                
                // Final sanitization - ensure the tool name doesn't contain invalid characters
                if (toolName.includes('data:') || toolName.includes('}') || toolName.includes('{')) {
                  // Try one more generic approach - look for name field in the function
                  const nameMatch = extractedToolCall.match(/["']name["']\s*:\s*["']([^"']+)["']/);
                  if (nameMatch && nameMatch[1]) {
                    toolName = nameMatch[1];
                    console.log("Found tool name from final regex:", toolName);
                  } else {
                    toolName = "tool";
                    console.log("Sanitized invalid tool name");
                  }
                }
                
                console.log("Using final tool name:", toolName);
                
                // Add the tool to the message
                messageToUpdate.processingTool = {
                  name: toolName, 
                  status: "calling",
                  functionCall: extractedToolCall
                };
              }
              
              return newMessages;
            });
          }
          
          // Wait longer to ensure UI is updated
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Process the tool call using our handler function
          await handleToolCall(
            extractedToolCall,
            currentContent,
            handlers,
            messages,
            modelId || modelName || "",
            abortSignal,
            sessionId
          );
        } else {
          console.error("Could not find proper tool call boundaries in full response");
          console.log("Start marker position:", startIdx);
          console.log("End marker position:", endIdx);
        }
      } catch (error) {
        console.error("Error processing tool call from full response:", error);
      }
    }

    // Check if we have an unfinished tool call
    // This matches the Python reference implementation for handling incomplete tool calls
    if (inToolCall && toolCallContent) {
      console.log("Handling unfinished tool call at end of stream");
      console.log("Unfinished tool call content length:", toolCallContent.length);
      
      try {
        // Make sure we have the closing tag - following Python reference
        let messageWithClosingTag = toolCallContent;
        if (!toolCallContent.includes(TOOL_CALL_END_MARKER)) {
          messageWithClosingTag = toolCallContent + TOOL_CALL_END_MARKER;
          console.log("Added closing tag to unfinished tool call");
        }
        
        // Similar to the full response handler, force a UI update first
        if (handlers.setMessages) {
          // Use a direct update method focused on finding the right message
          handlers.setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            
            // Find the most recent messages that is from the assistant
            const assistantMessages = newMessages
              .filter(m => m.role === "assistant")
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            
            if (assistantMessages.length > 0) {
              // Get the most recent assistant message
              const messageToUpdate = assistantMessages[0];
              console.log("Found message to update with ID:", messageToUpdate.id);
              
              // Try to get a good tool name from the content - with enhanced extraction
              let toolName = "unfinished_tool";
              try {
                // First, log the exact tool call for debugging
                const rawContent = messageWithClosingTag.replace(TOOL_CALL_START_MARKER, "").replace(TOOL_CALL_END_MARKER, "").trim();
                console.log("Raw unfinished tool call content:", rawContent);
                
                // Extract the content between the markers
                const content = extractToolCallContent(messageWithClosingTag);
                console.log("Extracted unfinished content:", content);
                
                if (content) {
                  // Log the content we're trying to parse
                  console.log("Content to parse for unfinished tool:", content);
                  
                  // Try multiple approaches to extract the name - same approach as above
                  
                  // 1. Try to parse as JSON first
                  try {
                    // Try to fix common JSON issues first
                    let fixedContent = content;
                    
                    // If content starts with unexpected characters, try to find valid JSON
                    if (fixedContent.startsWith('}') || fixedContent.startsWith('"')) {
                      const jsonStart = fixedContent.indexOf('{');
                      if (jsonStart >= 0) {
                        fixedContent = fixedContent.substring(jsonStart);
                        console.log("Fixed unfinished content by finding proper JSON start");
                      }
                    }
                    
                    // Try parsing the cleaned content
                    const jsonObj = JSON.parse(fixedContent);
                    console.log("Parsed JSON (unfinished):", jsonObj);
                    
                    if (jsonObj.function && jsonObj.function.name) {
                      toolName = jsonObj.function.name;
                      console.log("Found unfinished tool name from JSON:", toolName);
                    }
                  } catch (jsonError) {
                    console.log("JSON parse failed (unfinished):", jsonError.message);
                    
                    // 2. Try regex for function.name format
                    const functionNameMatch = content.match(/"function"[^}]*"name"\s*:\s*"([^"]+)"/);
                    if (functionNameMatch && functionNameMatch[1]) {
                      toolName = functionNameMatch[1];
                      console.log("Found unfinished tool name from function regex:", toolName);
                    } else {
                      // 3. Try simple name regex
                      const nameMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
                      if (nameMatch && nameMatch[1]) {
                        toolName = nameMatch[1];
                        console.log("Found unfinished tool name from simple regex:", toolName);
                      } else {
                        // 4. Last resort - try to find any quoted word that might be a name
                        const wordMatch = content.match(/"([^"]+)"/);
                        if (wordMatch && wordMatch[1] && wordMatch[1].length > 1) {
                          // Only use if it looks like a reasonable name
                          toolName = wordMatch[1];
                          console.log("Found potential unfinished tool name from quotes:", toolName);
                        }
                      }
                    }
                  }
                }
              } catch (e) {
                console.error("Error extracting tool name from unfinished call:", e);
              }
              
              // Final sanitization - ensure the tool name doesn't contain invalid characters
              if (toolName.includes('data:') || toolName.includes('}') || toolName.includes('{')) {
                // Try one more generic approach - look for name field in the function
                const nameMatch = messageWithClosingTag.match(/["']name["']\s*:\s*["']([^"']+)["']/);
                if (nameMatch && nameMatch[1]) {
                  toolName = nameMatch[1];
                  console.log("Found tool name from final regex for unfinished call:", toolName);
                } else {
                  toolName = "unfinished_tool";
                  console.log("Sanitized invalid unfinished tool name");
                }
              }
              
              console.log("Using final tool name for unfinished call:", toolName);
              
              // Add the tool to the message - force it even if there's already a tool
              messageToUpdate.processingTool = {
                name: toolName, 
                status: "calling",
                functionCall: messageWithClosingTag
              };
            } else {
              console.error("No assistant messages found to update for unfinished tool call");
            }
            
            return newMessages;
          });
        }
        
        // Wait longer to ensure UI is updated
        await new Promise(resolve => setTimeout(resolve, 300));

        // Process the tool call with the added closing tag
        const result = await handleToolCall(
          messageWithClosingTag,
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
      } catch (error) {
        console.error("Error processing unfinished tool call:", error);
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
