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
  NASH_LLM_SERVER_ENDPOINT,
  NASH_LLM_SUMMARIZE_ENDPOINT,
  NASH_MCP_ENDPOINT,
  NASH_MCP_CALL_TOOL_ENDPOINT,
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
  console.log("[getProviderConfig] Getting config for model:", modelId);
  const keys = await window.electron.getKeys();
  const modelConfigs = await window.electron.getModelConfigs() as ModelConfig[];
  
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (!model) {
    console.error("[getProviderConfig] Model not found:", modelId);
    throw new Error("Selected model not found.");
  }

  console.log("[getProviderConfig] Found model:", { id: model.id, provider: model.provider });
  const key = keys.find(k => k.provider === model.provider)?.value;
  const config = modelConfigs.find(c => c.provider === model.provider);

  if (!key) {
    console.error("[getProviderConfig] API key not found for provider:", model.provider);
    throw new Error(`${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} API key not found. Please add your API key in the Models section.`);
  }

  console.log("[getProviderConfig] Config loaded:", { 
    provider: model.provider, 
    hasKey: !!key, 
    hasBaseUrl: !!config?.baseUrl 
  });

  return {
    key,
    baseUrl: config?.baseUrl,
    model: modelId,
    provider: model.provider
  };
};

const streamCompletion = async (
  messages: ChatMessage[],
  sessionId: string | null,
  abortSignal: AbortSignal | null,
  onChunk: (chunk: string, sessionId?: string) => void,
  modelId: string,
  onFunctionCall?: (name: string, args: Record<string, any>) => void,
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
) => {
  console.log("[streamCompletion] Starting stream with model:", modelId);
  console.log("[streamCompletion] Initial messages:", messages.map(m => ({
    role: m.role,
    content: m.content,
    id: m.id,
    isStreaming: m.isStreaming,
    processingTool: m.processingTool
  })));
  
  let foundFunctionCall = false;
  let functionCallContent = "";
  let pendingContent = "";

  const makeRequest = async (messages: ChatMessage[], isFollowUp = false) => {
    console.log(`[streamCompletion] ${isFollowUp ? 'Follow-up' : 'Initial'} request messages:`, 
      messages.map(m => ({
        role: m.role,
        content: m.content,
        id: m.id,
        isStreaming: m.isStreaming,
        processingTool: m.processingTool
      }))
    );

    const config = await getProviderConfig(modelId);
    const defaultBaseUrls: Record<string, string> = {
      anthropic: "https://api.anthropic.com",
      openai: "https://api.openai.com",
    };
    
    const baseUrl = config.baseUrl || defaultBaseUrls[config.provider];
    
    return fetch(NASH_LLM_SERVER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        session_id: sessionId,
        api_key: config.key,
        api_base_url: baseUrl,
        model: config.model,
        provider: config.provider
      }),
      signal: abortSignal || undefined,
    });
  };

  try {
    // First request
    const response = await makeRequest(messages);
    console.log("[streamCompletion] Initial response:", response);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error text available");
      console.error("[streamCompletion] Error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No reader available");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const decodedChunk = decoder.decode(value, { stream: true });
      buffer += decodedChunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith("data: ")) {
          const data = line.slice(6); // Remove "data: " prefix
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);

            if (parsed.session_id) {
              onChunk("", parsed.session_id);
              continue;
            }

            if (!parsed.content) continue;

            if (foundFunctionCall) {
              functionCallContent += parsed.content;
              
              if (functionCallContent.includes("</function_call>")) {
                const functionCallMatch = functionCallContent.match(/<function_call>([^]*?)<\/function_call>/);
                if (functionCallMatch && onFunctionCall) {
                  try {
                    const functionCall = JSON.parse(functionCallMatch[1]) as FunctionCall[];
                    
                    if (functionCall.length > 0) {
                      const { name, arguments: args = {} } = functionCall[0].function;
                      
                      // Set tool processing state and mark message as complete
                      if (setMessages) {
                        setMessages((prev) => {
                          const newMessages = [...prev];
                          const lastMessage = newMessages[newMessages.length - 1];
                          if (lastMessage) {
                            lastMessage.isStreaming = false;
                            lastMessage.processingTool = {
                              name,
                              status: "preparing",
                              functionCall: JSON.stringify({ tool_name: name, arguments: args }, null, 2)
                            };
                            console.log("[streamCompletion] Updated initial message:", {
                              id: lastMessage.id,
                              content: lastMessage.content,
                              isStreaming: lastMessage.isStreaming,
                              processingTool: lastMessage.processingTool
                            });
                          }
                          return newMessages;
                        });
                      }

                      // Call the tool
                      const toolResult = await onFunctionCall(name, args);
                      
                      // Create a new assistant message for the follow-up response
                      const followUpMessage: ChatMessage = {
                        id: uuidv4(),
                        role: "assistant",
                        content: "",
                        timestamp: new Date(),
                        isStreaming: true,
                      };

                      console.log("[streamCompletion] Created follow-up message:", {
                        id: followUpMessage.id,
                        role: followUpMessage.role,
                        content: followUpMessage.content,
                        isStreaming: followUpMessage.isStreaming
                      });

                      // Add the follow-up message to the UI
                      if (setMessages) {
                        setMessages(prev => {
                          const newMessages = [...prev, followUpMessage];
                          console.log("[streamCompletion] Current messages after adding follow-up:", 
                            newMessages.map(m => ({
                              id: m.id,
                              role: m.role,
                              content: m.content,
                              isStreaming: m.isStreaming,
                              processingTool: m.processingTool
                            }))
                          );
                          return newMessages;
                        });
                      }

                      // Create the tool result message (not shown in UI)
                      const toolResultMessage: ChatMessage = {
                        id: uuidv4(),
                        role: "user",
                        content: `Tool result: ${JSON.stringify(toolResult)}`,
                        timestamp: new Date()
                      };

                      console.log("[streamCompletion] Tool result message:", {
                        role: toolResultMessage.role,
                        content: toolResultMessage.content,
                        id: toolResultMessage.id
                      });

                      // Close the current reader to ensure we're done with the first response
                      reader.cancel();

                      // Make a new request with the tool result
                      const followUpResponse = await makeRequest([...messages, toolResultMessage], true);
                      
                      if (!followUpResponse.ok) {
                        throw new Error(`Follow-up request failed: ${followUpResponse.statusText}`);
                      }

                      const followUpReader = followUpResponse.body?.getReader();
                      if (!followUpReader) {
                        throw new Error("No reader available for follow-up response");
                      }

                      // Process the follow-up response
                      let followUpBuffer = "";
                      while (true) {
                        const { done, value } = await followUpReader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        followUpBuffer += chunk;
                        const lines = followUpBuffer.split("\n");
                        followUpBuffer = lines.pop() || "";

                        for (const line of lines) {
                          if (!line.trim()) continue;
                          if (line.startsWith("data: ")) {
                            const data = line.slice(6);
                            if (data === "[DONE]") break;

                            try {
                              const parsed = JSON.parse(data);
                              console.log("[streamCompletion] Parsed data:", parsed);
                              if (parsed.content) {
                                console.log("[streamCompletion] Parsed content:", parsed.content);
                                if (setMessages) {
                                  setMessages((prev) => {
                                    const newMessages = [...prev];
                                    const lastMessage = newMessages[newMessages.length - 1];
                                    if (lastMessage?.isStreaming) {
                                      // Prevent duplicate content by checking if content already exists
                                      if (!lastMessage.content.endsWith(parsed.content)) {
                                        lastMessage.content += parsed.content;
                                        console.log("[streamCompletion] Updated follow-up message content:", {
                                          id: lastMessage.id,
                                          content: lastMessage.content,
                                          isStreaming: lastMessage.isStreaming
                                        });
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
                          }
                          return newMessages;
                        });
                      }

                      return;
                    }
                  } catch (e) {
                    console.error("[streamCompletion] Error parsing function call:", e, "\nContent:", functionCallContent);
                  }
                }
                foundFunctionCall = false;
                functionCallContent = "";
              }
              continue;
            }

            pendingContent += parsed.content;
            
            const functionCallIndex = pendingContent.indexOf("<function_call>");
            
            if (functionCallIndex !== -1) {
              foundFunctionCall = true;
              if (functionCallIndex > 0) {
                const contentBeforeCall = pendingContent.substring(0, functionCallIndex);
                console.log("[streamCompletion] Sending chunk to initial message:", contentBeforeCall);
                onChunk(contentBeforeCall);
              }
              functionCallContent = pendingContent.substring(functionCallIndex);
              pendingContent = "";
            } else {
              // Only send complete words and prevent duplication
              const words = pendingContent.split(" ");
              if (words.length > 1) {
                const completeContent = words.slice(0, -1).join(" ") + " ";
                console.log("[streamCompletion] Sending chunk to initial message:", completeContent);
                onChunk(completeContent);
                pendingContent = words[words.length - 1];
              }
            }
          } catch (e) {
            console.error("[streamCompletion] Error parsing SSE data:", e, "\nRaw data:", data);
          }
        }
      }
    }

    if (pendingContent && !foundFunctionCall) {
      onChunk(pendingContent);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    console.error("[streamCompletion] Error:", error);
    throw error;
  }
};

async function summarizeConversation(
  messages: ChatMessage[],
  sessionId: string | null = null
) {
  const endpoint = NASH_LLM_SUMMARIZE_ENDPOINT;

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

async function callTool(method: string, args: any) {
  const endpoint = `${NASH_MCP_ENDPOINT}/${method}`;
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error calling tool:", error);
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
        const response = await fetch(NASH_MCP_CALL_TOOL_ENDPOINT, {
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

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);
    setInput("");
    currentContentRef.current = "";

    try {
      await streamCompletion(
        [...messages, userMessage],
        sessionId,
        null,
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
          return prevMessages.map((msg) =>
            msg.id === lastMessage.id
              ? {
                  ...msg,
                  isStreaming: false,
                }
              : msg
          );
        }
        return prevMessages;
      });
    } catch (error) {
      console.error("Error in chat stream:", error);
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
