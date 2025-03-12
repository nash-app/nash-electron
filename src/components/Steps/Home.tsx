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
  { id: "claude-3.7-sonnet", name: "Claude 3.7 Sonnet", provider: "anthropic" },
  { id: "claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "anthropic" },
  { id: "claude-3.5-sonnet-v2", name: "Claude 3.5 Sonnet v2", provider: "anthropic" },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "claude-3-sonnet", name: "Claude 3 Sonnet", provider: "anthropic" },
  { id: "claude-3-haiku", name: "Claude 3 Haiku", provider: "anthropic" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai" },
  { id: "gpt-4", name: "GPT-4", provider: "openai" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai" },
  
];

const getProviderConfig = async (modelId: string) => {
  const keys = await window.electron.getKeys();
  const modelConfigs = await window.electron.getModelConfigs() as ModelConfig[];
  
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (!model) {
    throw new Error("Selected model not found.");
  }

  const key = keys.find(k => k.provider === model.provider)?.value;
  const config = modelConfigs.find(c => c.provider === model.provider);

  if (!key) {
    throw new Error(`${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} API key not found. Please add your API key in the Models section.`);
  }

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
  let foundFunctionCall = false;
  let functionCallContent = "";
  let pendingContent = "";

  try {
    const config = await getProviderConfig(modelId);
    const defaultBaseUrls: Record<string, string> = {
      anthropic: "https://api.anthropic.com",
      openai: "https://api.openai.com",
      google: "https://generativelanguage.googleapis.com",
    };
    
    const baseUrl = config.baseUrl || defaultBaseUrls[config.provider];
    
    const response = await fetch(NASH_LLM_SERVER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        session_id: sessionId,
        api_key: config.key,
        api_base_url: baseUrl,
        model: config.model,
        provider: config.provider
      }),
      signal: abortSignal || undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error text available");
      console.error("[streamCompletion] Error response body:", errorText);
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
                      
                      if (setMessages) {
                        setMessages((prev) => {
                          const newMessages = [...prev];
                          const lastMessage = newMessages[newMessages.length - 1];
                          if (lastMessage) {
                            lastMessage.processingTool = {
                              name,
                              status: "preparing",
                              functionCall: JSON.stringify({ tool_name: name, arguments: args }, null, 2)
                            };
                          }
                          return newMessages;
                        });
                      }
                      onFunctionCall(name, args);
                    }
                  } catch (e) {
                    console.error("[streamCompletion] Error parsing function call:", e, "\nContent:", functionCallContent);
                  }
                }
              }
              continue;
            }

            pendingContent += parsed.content;
            
            const functionCallIndex = pendingContent.indexOf("<function_call>");
            
            if (functionCallIndex !== -1) {
              foundFunctionCall = true;
              if (functionCallIndex > 0) {
                const contentBeforeCall = pendingContent.substring(0, functionCallIndex);
                onChunk(contentBeforeCall);
              }
              functionCallContent = pendingContent.substring(functionCallIndex);
              pendingContent = "";
            } else {
              const lastSpaceIndex = pendingContent.lastIndexOf(" ");
              if (lastSpaceIndex !== -1) {
                const completeContent = pendingContent.substring(0, lastSpaceIndex + 1);
                onChunk(completeContent);
                pendingContent = pendingContent.substring(lastSpaceIndex + 1);
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

  React.useEffect(() => {
    const checkConfigurations = async () => {
      const alerts: ConfigAlert[] = [];
      try {
        const keys = await window.electron.getKeys();
        const modelConfigs = await window.electron.getModelConfigs() as ModelConfig[];

        const configuredProviders = new Set(keys.map(k => k.provider));
        if (configuredProviders.size === 0) {
          alerts.push({
            type: "error",
            message: "No API keys configured. Please add at least one API key in the Models section."
          });
        }

        if (!selectedModel) {
          for (const config of modelConfigs) {
            if (config.selectedModel && configuredProviders.has(config.provider)) {
              setSelectedModel(config.selectedModel);
              break;
            }
          }
        }

      } catch (error) {
        console.error("Error checking configurations:", error);
        alerts.push({
          type: "error",
          message: "Error checking configurations. Please try again."
        });
      }
      setConfigAlerts(alerts);
    };

    checkConfigurations();
  }, [selectedModel]);

  React.useEffect(() => {
    const loadConfiguredProviders = async () => {
      try {
        const keys = await window.electron.getKeys();
        console.log("Loaded keys:", keys);
        setConfiguredProviders(new Set(keys.map(k => k.provider)));
      } catch (error) {
        console.error("Error loading configured providers:", error);
      }
    };
    loadConfiguredProviders();
  }, []);

  const handleToolCall = useCallback(async (name: string, args: Record<string, any>) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      if (lastMessage) {
        lastMessage.processingTool = {
          name,
          status: "calling",
          functionCall: JSON.stringify({ tool_name: name, arguments: args }, null, 2)
        };
      }
      return newMessages;
    });

    try {
      const response = await fetch(NASH_MCP_CALL_TOOL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tool_name: name, arguments: args }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "No error text available");
        console.error("[handleToolCall] Error response body:", errorText);
        throw new Error(`Tool call failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      const toolMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage?.processingTool) {
          lastMessage.processingTool = {
            ...lastMessage.processingTool,
            status: "completed",
            response: JSON.stringify(result, null, 2)
          };
        }
        return [...newMessages, toolMessage];
      });
      
      const messagesWithResult = [...messages, { ...toolMessage, content: JSON.stringify(result) }];
      
      await streamCompletion(
        messagesWithResult,
        sessionId,
        null,
        (chunk, newSessionId) => {
          if (newSessionId) {
            setSessionId(newSessionId);
            return;
          }
          setMessages((prevMessages) => {
            const lastMessage = prevMessages[prevMessages.length - 1];
            if (lastMessage?.isStreaming) {
              const updatedMessages = prevMessages.map((msg) =>
                msg.id === lastMessage.id
                  ? { ...msg, content: msg.content + chunk }
                  : msg
              );
              return updatedMessages;
            }
            return prevMessages;
          });
        },
        selectedModel,
        handleToolCall,
        setMessages
      );
    } catch (error) {
      console.error("[handleToolCall] Error:", error);
    }
  }, [messages, sessionId, setSessionId, setMessages, selectedModel]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
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
        handleToolCall,
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
  }, [input, isLoading, messages, sessionId, handleToolCall, setMessages, selectedModel]);

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
                placeholder="Ask me anything..."
                disabled={isLoading}
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
                      <SelectValue placeholder="Select a model" />
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
                            disabled={!configuredProviders.has("anthropic")}
                            className={cn(
                              !configuredProviders.has("anthropic") && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {model.name}
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
                            disabled={!configuredProviders.has("openai")}
                            className={cn(
                              !configuredProviders.has("openai") && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {model.name}
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
                      onClick={handleSubmit}
                      disabled={!input.trim() || isLoading}
                    >
                      {isLoading ? (
                        <Square className="h-5 w-5 fill-current" />
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
