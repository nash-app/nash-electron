import * as React from "react";
import { SetupStep } from "../types";
import { Header } from "../Header";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "../ui/prompt-input";
import {
  Message,
  MessageContent,
  MessageActions,
} from "../ui/message";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Square, ArrowUp, FileText, ChevronRight, ChevronDown, User } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import nashLogoWhite from "../../../public/nash-logo-white.svg";
import { cn } from "../../lib/utils";
import { ChatContainer } from "../ui/chat-container";
import {
  NASH_LOCAL_SERVER_CHAT_ENDPOINT,
  NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT,
  NASH_LOCAL_SERVER_MCP_CALL_TOOL_ENDPOINT,
} from "../../constants";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
} from "../ui/select";
import anthropicIcon from "../../../public/models/anthropic.png";
import openAIIcon from "../../../public/models/openai.png";
import { v4 as uuidv4 } from 'uuid';

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  processingTool?: {
    name: string;
    status: "preparing" | "calling" | "completed";
    functionCall?: string;
    response?: string;
  };
}

interface ChatProps {
  onNavigate: (step: SetupStep) => void;
}

interface FunctionCall {
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

interface ModelConfig {
  provider: string;
  baseUrl?: string;
  selectedModel?: string;
}

interface ProviderModel {
  id: string;
  name: string;
  provider: string;
}

interface ConfigAlert {
  type: "error" | "warning";
  message: string;
  link?: {
    text: string;
    step: SetupStep;
  };
}

const ALL_MODELS: ProviderModel[] = [
  { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet", provider: "anthropic" },
  { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", provider: "anthropic" },
  { id: "o3-mini", name: "o3-mini", provider: "openai" },
  { id: "o1", name: "o1", provider: "openai" },
  { id: "o1-preview", name: "o1-preview", provider: "openai" },
  { id: "o1-mini", name: "o1-mini", provider: "openai" },
  { id: "gpt-4o", name: "gpt-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "gpt-4o-mini", provider: "openai" },
];

const getProviderConfig = async (modelId: string) => {
  const keys = await window.electron.getKeys();
  const modelConfigs = await window.electron.getModelConfigs() as ModelConfig[];
  
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (!model) {
    console.error("[getProviderConfig] Model not found:", modelId);
    throw new Error("Selected model not found.");
  }

  
  const key = keys.find(k => k.provider === model.provider)?.value;
  const config = modelConfigs.find(c => c.provider === model.provider);

  if (!key) {
    console.error("[getProviderConfig] API key not found for provider:", model.provider);
    throw new Error(`${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} API key not found. Please add your API key in the Models section.`);
  }



  return {
    key,
    baseUrl: config?.baseUrl,
    model: modelId,
    provider: model.provider
  };
};

const logMessageHistory = (messages: ChatMessage[], context: string) => {
  console.log("\n");
  console.log("🔍 ================================");
  console.log(`📝 MESSAGE HISTORY [${context}]`);
  console.log("================================");
  console.log("Total messages:", messages.length);
  messages.forEach((msg, i) => {
    console.log("\n-------------------");
    console.log(`📨 Message ${i + 1}:`);
    console.log("👤 Role:", msg.role);
    console.log("🆔 ID:", msg.id);
    console.log("📄 Content:", msg.content);
    console.log("🔄 Is Streaming:", msg.isStreaming);
    if (msg.processingTool) {
      console.log("🛠  Tool:", {
        name: msg.processingTool.name,
        status: msg.processingTool.status,
        functionCall: msg.processingTool.functionCall,
        response: msg.processingTool.response
      });
    }
  });
  console.log("\n================================\n");
};

const streamCompletion = async (
  messages: ChatMessage[],          // All messages in the conversation
  sessionId: string | null,         // Session ID for continuity between requests
  abortSignal: AbortSignal | null,  // Signal to abort the request
  onChunk: (chunk: string, sessionId?: string) => void,  // Callback for streaming chunks
  modelId: string,                  // ID of the LLM model to use
  onFunctionCall?: (name: string, args: Record<string, any>) => void,  // Callback for tool calls
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void  // State updater
) => {
  // Log initial information about the request
  console.log("[streamCompletion] Starting stream with model:", modelId);
  console.log("[streamCompletion] Initial messages:", messages.map(m => ({
    role: m.role,
    content: m.content,
    id: m.id,
    isStreaming: m.isStreaming,
    processingTool: m.processingTool
  })));
  
  // State variables for tracking function calls in the response
  let foundFunctionCall = false;    // Flag to indicate if we found a function call
  let functionCallContent = "";     // Buffer to collect function call content
  let pendingContent = "";          // Buffer for regular content before sending to UI

  // Helper function to prepare and send requests to the LLM server
  const makeRequest = async (messages: ChatMessage[], isFollowUp = false) => {
    // Filter messages to only include completed ones (not streaming)
    // For assistant messages, we need content and not streaming
    // For user messages, we include all of them (including tool results)
    const completedMessages = messages.filter(m => {
      // For regular messages, only include non-streaming ones with content
      if (m.role === 'assistant') {
        return !m.isStreaming && m.content;
      }
      // Always include user messages, especially tool results
      return m.role === 'user';
    });
    
    // Convert to the format expected by the server
    const messageHistory = completedMessages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Check if we have a tool result message (for debugging)
    const hasToolResult = completedMessages.some(m => 
      m.role === 'user' && m.content.startsWith('Tool result:')
    );

    // Log the messages being sent to the server
    console.log(`[streamCompletion] ${isFollowUp ? 'Follow-up' : 'Initial'} request messages:`, 
      messageHistory.map((m, i) => ({
        index: i,
        role: m.role,
        contentPreview: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : '')
      }))
    );
    
    // Additional logging for follow-up requests
    if (isFollowUp) {
      console.log(`[streamCompletion] Has tool result message: ${hasToolResult}`);
      console.log(`[streamCompletion] Total messages being sent: ${messageHistory.length}`);
    }

    // Get API configuration for the selected model
    const config = await getProviderConfig(modelId);
    const defaultBaseUrls: Record<string, string> = {
      anthropic: "https://api.anthropic.com",
      openai: "https://api.openai.com",
    };
    
    // Use custom base URL if provided, otherwise use default
    const baseUrl = config.baseUrl || defaultBaseUrls[config.provider];
    
    // Make the actual request to the LLM server
    return fetch(NASH_LOCAL_SERVER_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messageHistory,      // The conversation history
        session_id: sessionId,         // For continuity between requests
        api_key: config.key,           // API key for the provider
        api_base_url: baseUrl,         // Base URL for the provider's API
        model: config.model,           // Model ID to use
        provider: config.provider      // Provider (anthropic/openai)
      }),
      signal: abortSignal || undefined, // For cancellation
    });
  };

  try {
    // Make the initial request with all messages
    const response = await makeRequest(messages);
    console.log("[streamCompletion] Initial response:", response);

    // Handle error responses
    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error text available");
      console.error("[streamCompletion] Error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get a reader for the response stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No reader available");
    }

    // Set up decoding for the stream
    const decoder = new TextDecoder();
    let buffer = "";

    // Process the stream chunk by chunk
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;  // End of stream

      // Check if the request was aborted
      if (abortSignal?.aborted) {
        console.log("[streamCompletion] Main request aborted");
        reader.cancel();
        throw new Error("AbortError");
      }

      // Decode the chunk and add to buffer
      const decodedChunk = decoder.decode(value, { stream: true });
      buffer += decodedChunk;
      
      // Split buffer by newlines to process each SSE event
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";  // Keep the last incomplete line in buffer

      // Process each line (SSE event)
      for (const line of lines) {
        if (!line.trim()) continue;  // Skip empty lines
        
        // SSE events start with "data: "
        if (line.startsWith("data: ")) {
          const data = line.slice(6); // Remove "data: " prefix
          if (data === "[DONE]") break;  // End marker

          try {
            // Parse the JSON data
            const parsed = JSON.parse(data);

            // Handle session ID updates
            if (parsed.session_id) {
              onChunk("", parsed.session_id);  // Pass session ID to callback
              continue;
            }

            // Skip if no content
            if (!parsed.content) continue;

            // If we're collecting a function call, add to the buffer
            if (foundFunctionCall) {
              functionCallContent += parsed.content;
              
              // Check if the function call is complete
              if (functionCallContent.includes("</function_call>")) {
                // Extract the function call JSON
                const functionCallMatch = functionCallContent.match(/<function_call>([^]*?)<\/function_call>/);
                if (functionCallMatch && onFunctionCall) {
                  try {
                    // Parse the function call
                    const functionCall = JSON.parse(functionCallMatch[1]) as FunctionCall[];
                    
                    if (functionCall.length > 0) {
                      // Extract function name and arguments
                      const { name, arguments: args = {} } = functionCall[0].function;
                      
                      // Update the current assistant message with the function call
                      if (setMessages) {
                        setMessages((prev) => {
                          const newMessages = [...prev];
                          const lastMessage = newMessages[newMessages.length - 1];
                          if (lastMessage) {
                            // Mark message as complete and add the function call
                            lastMessage.isStreaming = false;
                            lastMessage.content = lastMessage.content + pendingContent;
                            lastMessage.processingTool = {
                              name,
                              status: "preparing",
                              functionCall: JSON.stringify({ tool_name: name, arguments: args }, null, 2)
                            };
                          }
                          // Log the messages before calling the tool
                          logMessageHistory(newMessages, "Before Tool Call");
                          return newMessages;
                        });
                      }

                      // Call the tool and get the result
                      const result = await onFunctionCall(name, args);
                      console.log("[streamCompletion] Tool result:", result);

                      // Create a message to represent the tool result
                      const toolResultMessage: ChatMessage = {
                        id: uuidv4(),
                        role: "user",  // Tool results are sent as user messages
                        content: `Tool result: ${JSON.stringify(result)}`,
                        timestamp: new Date()
                      };

                      // Create a new assistant message for the follow-up response
                      const followUpMessage: ChatMessage = {
                        id: uuidv4(),
                        role: "assistant",
                        content: "",
                        timestamp: new Date(),
                        isStreaming: true,  // Mark as streaming
                      };

                      // Add the follow-up message to the UI
                      if (setMessages) {
                        setMessages(prev => {
                          const newMessages = [...prev, followUpMessage];
                          logMessageHistory(newMessages, "Before Follow-up Request");
                          return newMessages;
                        });
                      }

                      // Cancel the current stream since we're starting a new one
                      reader.cancel();
                      
                      // Prepare messages for the follow-up request
                      // 1. Get all user messages
                      const userMessages = messages.filter(m => m.role === 'user');
                      // 2. Get completed assistant messages with content
                      const assistantMessages = messages.filter(m => 
                        m.role === 'assistant' && !m.isStreaming && m.content
                      );
                      
                      // 3. Combine all messages with the tool result at the end
                      const messagesForRequest = [
                        ...userMessages,
                        ...assistantMessages,
                        toolResultMessage  // Make sure the tool result is the last message
                      ];
                      
                      // Log the tool result message
                      console.log("[streamCompletion] Tool result message:", {
                        id: toolResultMessage.id,
                        role: toolResultMessage.role,
                        content: toolResultMessage.content
                      });
                      
                      // Log all messages being sent in the follow-up request
                      console.log("[streamCompletion] Follow-up request will include messages:", 
                        messagesForRequest.map(m => ({
                          id: m.id,
                          role: m.role,
                          contentPreview: m.content.substring(0, 50) + (m.content.length > 50 ? '...' : '')
                        }))
                      );
                      
                      // Log the full message history
                      logMessageHistory(messagesForRequest, "Follow-up Request Messages");
                      
                      // Verify that the tool result message is included
                      const toolResultIncluded = messagesForRequest.some(m => 
                        m.id === toolResultMessage.id
                      );
                      
                      console.log(`[streamCompletion] Tool result message included: ${toolResultIncluded}`);
                      
                      // If somehow the tool result was filtered out, add it back
                      if (!toolResultIncluded) {
                        console.error("[streamCompletion] Tool result message was filtered out! Adding it back.");
                        messagesForRequest.push(toolResultMessage);
                      }
                      
                      // Make the follow-up request with the tool result
                      const followUpResponse = await makeRequest(messagesForRequest, true);

                      // Handle errors in the follow-up request
                      if (!followUpResponse.ok) {
                        throw new Error(`Follow-up request failed: ${followUpResponse.statusText}`);
                      }

                      // Get a reader for the follow-up response
                      const followUpReader = followUpResponse.body?.getReader();
                      if (!followUpReader) {
                        throw new Error("No reader available for follow-up response");
                      }

                      // Process the follow-up response stream
                      let followUpBuffer = "";
                      while (true) {
                        const { done, value } = await followUpReader.read();
                        if (done) break;

                        // Check if the request was aborted
                        if (abortSignal?.aborted) {
                          console.log("[streamCompletion] Follow-up request aborted");
                          followUpReader.cancel();
                          throw new Error("AbortError");
                        }

                        // Decode and process the chunk
                        const chunk = decoder.decode(value, { stream: true });
                        followUpBuffer += chunk;
                        const lines = followUpBuffer.split("\n");
                        followUpBuffer = lines.pop() || "";

                        // Process each line in the follow-up response
                        for (const line of lines) {
                          if (!line.trim()) continue;
                          if (line.startsWith("data: ")) {
                            const data = line.slice(6);
                            if (data === "[DONE]") break;

                            try {
                              // Parse and handle content chunks
                              const parsed = JSON.parse(data);
                              if (parsed.content) {
                                if (setMessages) {
                                  setMessages((prev) => {
                                    const newMessages = [...prev];
                                    const lastMessage = newMessages[newMessages.length - 1];
                                    if (lastMessage?.isStreaming) {
                                      // Add content to the streaming message
                                      // Prevent duplicate content
                                      if (!lastMessage.content.endsWith(parsed.content)) {
                                        lastMessage.content += parsed.content;
                                      }
                                    }
                                    return newMessages;
                                  });
                                }
                              }
                            } catch (e) {
                              console.error("[streamCompletion] Error parsing follow-up chunk:", e);
                            }
                          }
                        }
                      }

                      // Mark the follow-up message as complete
                      if (setMessages) {
                        setMessages((prev) => {
                          const newMessages = [...prev];
                          const lastMessage = newMessages[newMessages.length - 1];
                          if (lastMessage?.isStreaming) {
                            lastMessage.isStreaming = false;
                            // Log the complete message history
                            logMessageHistory(newMessages, "Tool Response Complete");
                          }
                          return newMessages;
                        });
                      }

                      // Exit the function since we've handled the tool call
                      return;
                    }
                  } catch (e) {
                    // Handle errors in function call processing
                    console.error("[streamCompletion] Error in tool handling:", e);
                    foundFunctionCall = false;
                    functionCallContent = "";
                  }
                }
                // Reset function call state if we couldn't process it
                foundFunctionCall = false;
                functionCallContent = "";
              }
              continue;  // Continue collecting function call content
            }

            // Add content to the pending buffer
            pendingContent += parsed.content;
            
            // Check if this chunk contains the start of a function call
            const functionCallIndex = pendingContent.indexOf("<function_call>");
            
            if (functionCallIndex !== -1) {
              // Found a function call
              foundFunctionCall = true;
              if (functionCallIndex > 0) {
                // Send any content before the function call to the UI
                const contentBeforeCall = pendingContent.substring(0, functionCallIndex);
                console.log("[streamCompletion] Sending chunk to initial message:", contentBeforeCall);
                onChunk(contentBeforeCall);
              }
              // Start collecting the function call content
              functionCallContent = pendingContent.substring(functionCallIndex);
              pendingContent = "";
            } else {
              // No function call, just regular content
              // Only send complete words to avoid cutting words in half
              const words = pendingContent.split(" ");
              if (words.length > 1) {
                const completeContent = words.slice(0, -1).join(" ") + " ";
                onChunk(completeContent);  // Send complete words to UI
                pendingContent = words[words.length - 1];  // Keep the last word for next time
              }
            }
          } catch (e) {
            // Handle errors in SSE data parsing
            console.error("[streamCompletion] Error parsing SSE data:", e, "\nRaw data:", data);
          }
        }
      }
    }

    // Handle any remaining content after the stream ends
    if (pendingContent && !foundFunctionCall) {
      onChunk(pendingContent);  // Send remaining content to UI
      if (setMessages) {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.isStreaming) {
            // Mark the message as complete
            lastMessage.isStreaming = false;
            console.log("[streamCompletion] Initial message completed:", {
              id: lastMessage.id,
              role: lastMessage.role,
              content: lastMessage.content,
              processingTool: lastMessage.processingTool
            });
            // Log the complete message history
            logMessageHistory(newMessages, "Initial Message Complete");
          }
          return newMessages;
        });
      }
    }
  } catch (error) {
    // Handle abort errors specially
    if (error instanceof Error && error.name === "AbortError") {
      console.log("[streamCompletion] Request aborted");
      return;  // Just return silently for aborted requests
    }
    
    // For errors with the message "AbortError" (from our manual throws)
    if (error instanceof Error && error.message === "AbortError") {
      console.log("[streamCompletion] Request aborted (manual)");
      return;  // Just return silently for aborted requests
    }
    
    // Log and rethrow other errors
    console.error("[streamCompletion] Error:", error);
    throw error;
  }
};

async function summarizeConversation(
  messages: ChatMessage[],
  sessionId: string | null = null
) {
  const endpoint = NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error in summarize:", error);
    throw error;
  }
}



export function Home({ onNavigate }: ChatProps): React.ReactElement {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [configAlerts, setConfigAlerts] = useState<ConfigAlert[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentContentRef = useRef("");
  const isProcessingToolRef = useRef(false);

  // Load configured providers on mount
  React.useEffect(() => {
    const loadConfiguredProviders = async () => {
      console.log("[loadConfiguredProviders] Loading provider configurations...");
      try {
        const keys = await window.electron.getKeys();
        const providers = new Set(keys.map(k => k.provider));
        console.log("[loadConfiguredProviders] Found providers:", Array.from(providers));
        setConfiguredProviders(providers);
        
        // Set default model based on available keys
        if (!selectedModel) {
          console.log("[loadConfiguredProviders] No model selected, selecting default...");
          if (providers.has("anthropic")) {
            console.log("[loadConfiguredProviders] Setting default to Claude 3.7");
            setSelectedModel("claude-3-7-sonnet-latest");
          } else if (providers.has("openai")) {
            console.log("[loadConfiguredProviders] Setting default to O3 Mini");
            setSelectedModel("o3-mini");
          }
        }

        // Set alerts if no keys configured
        if (providers.size === 0) {
          console.log("[loadConfiguredProviders] No providers configured");
          setConfigAlerts([{
            type: "error",
            message: "",
            link: {
              text: "Add API key",
              step: SetupStep.Models
            }
          }]);
        }
      } catch (error) {
        console.error("[loadConfiguredProviders] Error:", error);
        setConfigAlerts([{
          type: "error",
          message: "Error checking configurations. Please try again."
        }]);
      }
    };
    loadConfiguredProviders();
  }, []);

  // Monitor selected model changes
  React.useEffect(() => {
    if (selectedModel) {
      console.log("[modelChangeMonitor] Model changed to:", selectedModel);
      const model = ALL_MODELS.find(m => m.id === selectedModel);
      if (model) {
        const provider = model.provider;
        console.log("[modelChangeMonitor] Checking provider configuration:", provider);
        if (!configuredProviders.has(provider)) {
          console.log("[modelChangeMonitor] Provider not configured:", provider);
          setConfigAlerts([{
            type: "error",
            message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key required. Please add your API key in the`,
            link: {
              text: "Models section",
              step: SetupStep.Models
            }
          }]);
        } else {
          console.log("[modelChangeMonitor] Provider properly configured:", provider);
          setConfigAlerts([]);
        }
      }
    }
  }, [selectedModel, configuredProviders]);

  const handleToolCall = useCallback(async (name: string, args: Record<string, any>) => {
    // Prevent concurrent tool calls
    if (isProcessingToolRef.current) {
        console.log("[handleToolCall] Tool call already in progress, skipping");
        return;
    }
    isProcessingToolRef.current = true;

    console.log("[handleToolCall] Starting tool call:", { name, args });
    
    try {
        // Update the last message to show we're processing a tool
        setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage) {
                console.log("[handleToolCall] Setting tool processing state for message:", lastMessage.id);
                lastMessage.processingTool = {
                    name,
                    status: "calling",
                    functionCall: JSON.stringify({ tool_name: name, arguments: args }, null, 2)
                };
            }
            return newMessages;
        });

        console.log("[handleToolCall] Making request to tool endpoint");
        const response = await fetch(NASH_LOCAL_SERVER_MCP_CALL_TOOL_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ tool_name: name, arguments: args }),
        });

        if (!response.ok) {
            throw new Error(`Tool call failed: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("[handleToolCall] Tool call successful, result:", result);
        
        // Update tool status to completed
        setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage?.processingTool) {
                console.log("[handleToolCall] Updating tool status to completed for message:", lastMessage.id);
                lastMessage.processingTool = {
                    ...lastMessage.processingTool,
                    status: "completed",
                    response: JSON.stringify(result, null, 2)
                };
            }
            return newMessages;
        });

        return result;

    } catch (error) {
        console.error("[handleToolCall] Error:", error);
        setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.processingTool) {
                lastMessage.processingTool = {
                    ...lastMessage.processingTool,
                    status: "completed",
                    response: JSON.stringify({ error: error.message }, null, 2)
                };
            }
            return prev;
        });
        throw error;
    } finally {
        isProcessingToolRef.current = false;
    }
}, []);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      console.log("[handleStop] Aborting current stream");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isProcessingToolRef.current = false;
    setIsLoading(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading || configuredProviders.size === 0 || !selectedModel) {
      console.log("[handleSubmit] Submission blocked:", {
        hasInput: !!input.trim(),
        isLoading,
        hasProviders: configuredProviders.size > 0,
        hasModel: !!selectedModel
      });
      return;
    }

    console.log("[handleSubmit] Starting submission with model:", selectedModel);
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    // Add both messages to the state
    const updatedMessages = [...messages, userMessage, assistantMessage];
    setMessages(updatedMessages);
    setIsLoading(true);
    setInput("");
    currentContentRef.current = "";

    // Create a new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;
    console.log("[handleSubmit] Created new AbortController");

    try {
      await streamCompletion(
        updatedMessages,  // Use the updated messages array that already includes the new messages
        sessionId,
        controller.signal, // Pass the abort signal
        (chunk, newSessionId) => {
          if (newSessionId) {
            setSessionId(newSessionId);
            return;
          }

          setMessages((prevMessages) => {
            const lastMessage = prevMessages[prevMessages.length - 1];
            if (lastMessage?.role === "assistant" && lastMessage.isStreaming) {
              return prevMessages.map((msg) =>
                msg.id === lastMessage.id
                  ? { ...msg, content: (msg.content || "") + chunk }
                  : msg
              );
            }
            return prevMessages;
          });
        },
        selectedModel,
        (name, args) => handleToolCall(name, args),
        setMessages
      );

      setMessages((prevMessages) => {
        const lastMessage = prevMessages[prevMessages.length - 1];
        if (lastMessage?.role === "assistant" && lastMessage.isStreaming) {
          const updatedMessages = prevMessages.map((msg) =>
            msg.id === lastMessage.id
              ? {
                  ...msg,
                  isStreaming: false,
                }
              : msg
          );
          logMessageHistory(updatedMessages, "Final Message Complete");
          return updatedMessages;
        }
        return prevMessages;
      });
    } catch (error) {
      console.error("Error in chat stream:", error);
      
      // Only show error message if it wasn't an abort error
      if (error instanceof Error && error.name !== "AbortError") {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage.role === "assistant" && lastMessage.isStreaming) {
            return prev.map((msg) =>
              msg.id === lastMessage.id
                ? {
                    ...msg,
                    content: "Sorry, there was an error processing your request.",
                    isStreaming: false,
                  }
                : msg
            );
          }
          return prev;
        });
      } else {
        // For abort errors, just mark the message as no longer streaming
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage.role === "assistant" && lastMessage.isStreaming) {
            return prev.map((msg) =>
              msg.id === lastMessage.id
                ? {
                    ...msg,
                    isStreaming: false,
                  }
                : msg
            );
          }
          return prev;
        });
        console.log("[handleSubmit] Request was aborted");
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, messages, sessionId, handleToolCall, setMessages, selectedModel, configuredProviders]);

  const handleSummarize = useCallback(async () => {
    if (isLoading || messages.length === 0) return;

    setIsLoading(true);
    try {
      const result = await summarizeConversation(messages, sessionId);

      if (result.success) {
        const summaryMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: "**Conversation Summary:**\n\n" + result.summary,
          timestamp: new Date(),
        };

        setMessages([summaryMessage]);

        if (result.session_id) {
          setSessionId(result.session_id);
        }
      }
    } catch (error) {
      console.error("Error summarizing conversation:", error);
    } finally {
      setIsLoading(false);
    }
  }, [messages, sessionId, isLoading]);

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentStep={SetupStep.Home} />

      {configAlerts.length > 0 && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <div className="max-w-4xl mx-auto">
            {configAlerts.map((alert, index) => (
              <div key={index} className="text-red-500 text-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>
                  {alert.message}
                  {alert.link && (
                    <button
                      onClick={() => onNavigate(alert.link!.step)}
                      className="ml-1 text-red-400 hover:text-red-300 underline focus:outline-none"
                    >
                      {alert.link.text}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatContainer
          ref={chatContainerRef}
          className="flex-1 space-y-2 px-4 pt-8 max-w-4xl mx-auto w-full"
          autoScroll={true}
        >
          {messages.map((message, index) => (
            <div key={message.id} className="flex flex-col gap-2">
              <Message>
                <Avatar className="h-[44px] w-[44px] rounded-lg">
                  {message.role === "assistant" ? (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                      <img src={nashLogoWhite} alt="Nash" className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  )}
                </Avatar>
                <MessageContent className={cn(
                  "rounded-lg px-3 py-2 break-words max-w-max",
                  message.role === "user" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-100",
                )}>
                  {message.content}
                </MessageContent>
              </Message>
              {message.processingTool && (
                <div className="flex flex-col gap-2 pl-12">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="secondary"
                      className={cn(
                        "max-w-max text-sm py-1.5 bg-purple-700 hover:bg-purple-800 text-white",
                        message.processingTool?.functionCall ? "cursor-pointer" : "cursor-default"
                      )}
                      onClick={() => {
                        if (message.processingTool?.functionCall) {
                          setExpandedTools(prev => ({
                            ...prev,
                            [message.id]: !prev[message.id]
                          }));
                        }
                      }}
                    >
                      <span className="flex items-center gap-1 font-mono">
                        {message.processingTool.status === "preparing" && `Preparing ${message.processingTool.name}...`}
                        {message.processingTool.status === "calling" && `Calling ${message.processingTool.name}...`}
                        {message.processingTool.status === "completed" && `Used ${message.processingTool.name}`}
                        {message.processingTool.status === "completed" && message.processingTool.functionCall && (
                          expandedTools[message.id] ? 
                            <ChevronDown className="h-4 w-4" /> : 
                            <ChevronRight className="h-4 w-4" />
                        )}
                      </span>
                    </Badge>
                  </div>
                  {expandedTools[message.id] && message.processingTool.functionCall && (
                    <div className="flex flex-col gap-3 bg-zinc-800/50 border border-zinc-700/50 p-4 rounded-lg overflow-x-auto">
                      <div className="flex flex-col gap-2">
                        <div className="text-sm text-purple-300 font-medium flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                          </svg>
                          Function Call
                        </div>
                        <pre className="text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800">
                          {message.processingTool.functionCall}
                        </pre>
                      </div>
                      {message.processingTool.response && (
                        <div className="flex flex-col gap-2">
                          <div className="text-sm text-emerald-300 font-medium flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Response
                          </div>
                          <pre className="text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800">
                            {message.processingTool.response}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </ChatContainer>

        <div className="p-4">
          <div className="max-w-4xl mx-auto">
            <PromptInput
              value={input}
              onValueChange={setInput}
              isLoading={isLoading}
              onSubmit={handleSubmit}
            >
              <PromptInputTextarea
                placeholder={configuredProviders.size === 0 ? "Please add an API key to start chatting..." : "Ask me anything..."}
                disabled={isLoading || configuredProviders.size === 0}
                className="!h-[100px] !rounded-md"
              />
              <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedModel}
                    onValueChange={(value) => {
                      setSelectedModel(value);
                      const model = ALL_MODELS.find(m => m.id === value);
                      if (model) {
                        const provider = model.provider;
                        window.electron.getKeys().then(keys => {
                          const hasKey = keys.some(k => k.provider === provider);
                          if (!hasKey) {
                            setConfigAlerts([{
                              type: "error",
                              message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key required. Please add your API key in the`,
                              link: {
                                text: "Models section",
                                step: SetupStep.Models
                              }
                            }]);
                          } else {
                            setConfigAlerts([]);
                          }
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-[200px] h-8 text-gray-400">
                      <SelectValue>
                        {selectedModel ? ALL_MODELS.find(m => m.id === selectedModel)?.name : "Select a model"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup className="mb-2">
                        <SelectLabel className="flex items-center justify-between pr-2">
                          <div className="flex items-center gap-2">
                            <div className="bg-white rounded-md w-5 h-5 flex items-center justify-center overflow-hidden">
                              <img src={anthropicIcon} alt="Anthropic" className="w-4 h-4" />
                            </div>
                            Anthropic
                          </div>
                          {!configuredProviders.has("anthropic") && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onNavigate(SetupStep.Models);
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                              </svg>
                              Add key
                            </button>
                          )}
                        </SelectLabel>
                        {ALL_MODELS.filter(m => m.provider === "anthropic").map(model => (
                          <SelectItem 
                            key={model.id} 
                            value={model.id}
                            disabled={!configuredProviders.has("anthropic") || model.id === selectedModel}
                            className={cn(
                              !configuredProviders.has("anthropic") && "opacity-50 cursor-not-allowed",
                              model.id === selectedModel && "bg-zinc-700/50"
                            )}
                          >
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>{model.name}</span>
                              {model.id === selectedModel ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : <div className="w-4 shrink-0" />}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="flex items-center justify-between pr-2">
                          <div className="flex items-center gap-2">
                            <div className="bg-white rounded-md w-5 h-5 flex items-center justify-center overflow-hidden">
                              <img src={openAIIcon} alt="OpenAI" className="w-4 h-4" />
                            </div>
                            OpenAI
                          </div>
                          {!configuredProviders.has("openai") && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onNavigate(SetupStep.Models);
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                              </svg>
                              Add key
                            </button>
                          )}
                        </SelectLabel>
                        {ALL_MODELS.filter(m => m.provider === "openai").map(model => (
                          <SelectItem 
                            key={model.id} 
                            value={model.id}
                            disabled={!configuredProviders.has("openai") || model.id === selectedModel}
                            className={cn(
                              !configuredProviders.has("openai") && "opacity-50 cursor-not-allowed",
                              model.id === selectedModel && "bg-zinc-700/50"
                            )}
                          >
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>{model.name}</span>
                              {model.id === selectedModel ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : <div className="w-4 shrink-0" />}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  {messages.length > 0 && (
                    <PromptInputAction tooltip="Summarize conversation">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={handleSummarize}
                        disabled={isLoading || messages.length === 0}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </PromptInputAction>
                  )}
                  <PromptInputAction
                    tooltip={isLoading ? "Stop generation" : "Send message"}
                  >
                    <Button
                      variant="default"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={isLoading ? handleStop : handleSubmit}
                      disabled={(!input.trim() && !isLoading) || configuredProviders.size === 0 || !selectedModel}
                    >
                      {isLoading ? (
                        <Square className="h-5 w-5" />
                      ) : (
                        <ArrowUp className="h-5 w-5" />
                      )}
                    </Button>
                  </PromptInputAction>
                </div>
              </PromptInputActions>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
