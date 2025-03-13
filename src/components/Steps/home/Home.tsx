import * as React from "react";
import { SetupStep } from "../../types";
import { Header } from "../../Header";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "../../ui/prompt-input";
import { Message, MessageContent, MessageActions } from "../../ui/message";
import { Avatar } from "../../ui/avatar";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import {
  Square,
  ArrowUp,
  FileText,
  ChevronRight,
  ChevronDown,
  User,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import nashLogoWhite from "../../../../public/nash-logo-white.svg";
import { cn } from "../../../lib/utils";
import { ChatContainer } from "../../ui/chat-container";
import {
  NASH_LOCAL_SERVER_CHAT_ENDPOINT,
  NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT,
  NASH_LOCAL_SERVER_MCP_CALL_TOOL_ENDPOINT,
} from "../../../constants";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
} from "../../ui/select";
import anthropicIcon from "../../../../public/models/anthropic.png";
import openAIIcon from "../../../../public/models/openai.png";
import { v4 as uuidv4 } from "uuid";
import { ChatMessage, ChatProps, ConfigAlert } from "./types";
import { ModelSelector } from "./components/ModelSelector";
import { ChatMessages } from "./components/ChatMessages";
import { ConfigAlerts } from "./components/ConfigAlerts";
import { ALL_MODELS } from "./constants";
import { streamCompletion, summarizeConversation } from "./chatService";

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

const getProviderConfig = async (modelId: string) => {
  const keys = await window.electron.getKeys();
  const modelConfigs =
    (await window.electron.getModelConfigs()) as ModelConfig[];

  const model = ALL_MODELS.find((m) => m.id === modelId);
  if (!model) {
    console.error("[getProviderConfig] Model not found:", modelId);
    throw new Error("Selected model not found.");
  }

  const key = keys.find((k) => k.provider === model.provider)?.value;
  const config = modelConfigs.find((c) => c.provider === model.provider);

  if (!key) {
    console.error(
      "[getProviderConfig] API key not found for provider:",
      model.provider
    );
    throw new Error(
      `${
        model.provider.charAt(0).toUpperCase() + model.provider.slice(1)
      } API key not found. Please add your API key in the Models section.`
    );
  }

  return {
    key,
    baseUrl: config?.baseUrl,
    model: modelId,
    provider: model.provider,
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
        response: msg.processingTool.response,
      });
    }
  });
  console.log("\n================================\n");
};

// Custom hook for managing chat state
const useChatState = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );
  const [isProcessingToolRef] = useState<{ current: boolean }>({
    current: false,
  });

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateLastMessage = useCallback(
    (updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage) {
          newMessages[newMessages.length - 1] = updater(lastMessage);
        }
        return newMessages;
      });
    },
    []
  );

  const toggleToolExpand = useCallback((messageId: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
  }, []);

  return {
    messages,
    setMessages,
    sessionId,
    setSessionId,
    expandedTools,
    isProcessingToolRef,
    addMessage,
    updateLastMessage,
    toggleToolExpand,
    clearMessages,
  };
};

// Custom hook for managing tool calls
const useToolHandler = (
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
  isProcessingToolRef: { current: boolean }
) => {
  const handleToolCall = useCallback(
    async (name: string, args: Record<string, any>) => {
      if (isProcessingToolRef.current) {
        console.log("[handleToolCall] Tool call already in progress, skipping");
        return;
      }
      isProcessingToolRef.current = true;

      console.log("[handleToolCall] Starting tool call:", { name, args });

      try {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage) {
            console.log(
              "[handleToolCall] Setting tool calling state for message:",
              lastMessage.id
            );
            lastMessage.processingTool = {
              name,
              status: "calling",
              functionCall: JSON.stringify(
                { tool_name: name, arguments: args },
                null,
                2
              ),
            };
          }
          return newMessages;
        });

        // Add a delay to make the "calling" state visible
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log("[handleToolCall] Making request to tool endpoint");
        const response = await fetch(NASH_LOCAL_SERVER_MCP_CALL_TOOL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool_name: name, arguments: args }),
        });

        if (!response.ok) {
          throw new Error(`Tool call failed: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("[handleToolCall] Tool call successful, result:", result);
        
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.processingTool) {
            console.log(
              "[handleToolCall] Setting tool completed state for message:",
              lastMessage.id
            );
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
        
        // Check if this is an abort error
        const isAbortError = error instanceof Error && 
          (error.name === "AbortError" || error.message === "AbortError");
        
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.processingTool) {
            lastMessage.processingTool = {
              ...lastMessage.processingTool,
              status: "completed",
              response: isAbortError 
                ? JSON.stringify({ error: "Tool call was cancelled" }, null, 2)
                : JSON.stringify({ error: error.message }, null, 2)
            };
          }
          return newMessages;
        });
        
        throw error;
      } finally {
        isProcessingToolRef.current = false;
      }
    },
    [setMessages, isProcessingToolRef]
  );

  return handleToolCall;
};

// Custom hook for managing chat interactions
const useChatInteraction = (
  selectedModel: string,
  chatState: ReturnType<typeof useChatState>
) => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentContentRef = useRef("");
  const handleToolCall = useToolHandler(
    chatState.setMessages,
    chatState.isProcessingToolRef
  );

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      console.log("[handleStop] Aborting current stream");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      
      // Ensure the UI is updated to reflect the abort
      chatState.updateLastMessage((msg) => ({
        ...msg,
        isStreaming: false,
      }));
    }
    
    // Always reset the tool processing flag to ensure we can start new requests
    chatState.isProcessingToolRef.current = false;
    
    console.log("[handleStop] Stream aborted and state reset");
  }, [chatState]);

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim() || !selectedModel) {
        console.log("[handleSubmit] Submission blocked:", {
          hasInput: !!input.trim(),
          hasModel: !!selectedModel,
        });
        return;
      }

      console.log(
        "[handleSubmit] Starting submission with model:",
        selectedModel
      );

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

      chatState.addMessage(userMessage);
      chatState.addMessage(assistantMessage);
      currentContentRef.current = "";

      const controller = new AbortController();
      abortControllerRef.current = controller;
      console.log("[handleSubmit] Created new AbortController");

      try {
        await streamCompletion(
          [...chatState.messages, userMessage, assistantMessage],
          chatState.sessionId,
          controller.signal,
          (chunk, newSessionId) => {
            if (newSessionId) {
              chatState.setSessionId(newSessionId);
              return;
            }
            chatState.updateLastMessage((msg) => ({
              ...msg,
              content: (msg.content || "") + chunk,
            }));
          },
          selectedModel,
          handleToolCall,
          chatState.setMessages
        );
      } catch (error) {
        console.error("[handleSubmit] Error in chat stream:", error);

        if (error instanceof Error && error.name !== "AbortError") {
          chatState.updateLastMessage((msg) => ({
            ...msg,
            content: "Sorry, there was an error processing your request.",
            isStreaming: false,
          }));
        } else {
          chatState.updateLastMessage((msg) => ({
            ...msg,
            isStreaming: false,
          }));
          console.log("[handleSubmit] Request was aborted");
        }
      } finally {
        abortControllerRef.current = null;
      }
    },
    [selectedModel, chatState, handleToolCall]
  );

  const handleSummarize = useCallback(async () => {
    if (chatState.messages.length === 0) return;

    try {
      const result = await summarizeConversation(
        chatState.messages,
        chatState.sessionId
      );

      if (result.success) {
        const summaryMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: "**Conversation Summary:**\n\n" + result.summary,
          timestamp: new Date(),
        };

        chatState.setMessages([summaryMessage]);

        if (result.session_id) {
          chatState.setSessionId(result.session_id);
        }
      }
    } catch (error) {
      console.error("[handleSummarize] Error:", error);
    }
  }, [chatState]);

  return {
    handleSubmit,
    handleStop,
    handleSummarize,
    isSubmitting: !!abortControllerRef.current,
  };
};

export function Home({ onNavigate }: ChatProps): React.ReactElement {
  const [input, setInput] = useState("");
  const [configAlerts, setConfigAlerts] = useState<ConfigAlert[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(
    new Set()
  );
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const chatState = useChatState();
  const { handleSubmit, handleStop, handleSummarize, isSubmitting } =
    useChatInteraction(selectedModel, chatState);

  // Load configured providers on mount
  useEffect(() => {
    const loadConfiguredProviders = async () => {
      console.log(
        "[loadConfiguredProviders] Loading provider configurations..."
      );
      try {
        const keys = await window.electron.getKeys();
        const providers = new Set(keys.map((k) => k.provider));
        console.log(
          "[loadConfiguredProviders] Found providers:",
          Array.from(providers)
        );
        setConfiguredProviders(providers);

        if (!selectedModel) {
          console.log(
            "[loadConfiguredProviders] No model selected, selecting default..."
          );
          if (providers.has("anthropic")) {
            console.log(
              "[loadConfiguredProviders] Setting default to Claude 3.7"
            );
            setSelectedModel("claude-3-7-sonnet-latest");
          } else if (providers.has("openai")) {
            console.log("[loadConfiguredProviders] Setting default to O3 Mini");
            setSelectedModel("o3-mini");
          }
        }

        if (providers.size === 0) {
          console.log("[loadConfiguredProviders] No providers configured");
          setConfigAlerts([
            {
              type: "error",
              message: "",
              link: {
                text: "Add API key",
                step: SetupStep.Models,
              },
            },
          ]);
        }
      } catch (error) {
        console.error("[loadConfiguredProviders] Error:", error);
        setConfigAlerts([
          {
            type: "error",
            message: "Error checking configurations. Please try again.",
          },
        ]);
      }
    };
    loadConfiguredProviders();
  }, []);

  // Monitor selected model changes
  useEffect(() => {
    if (selectedModel) {
      console.log("[modelChangeMonitor] Model changed to:", selectedModel);
      const model = ALL_MODELS.find((m) => m.id === selectedModel);
      if (model) {
        const provider = model.provider;
        console.log(
          "[modelChangeMonitor] Checking provider configuration:",
          provider
        );
        if (!configuredProviders.has(provider)) {
          console.log(
            "[modelChangeMonitor] Provider not configured:",
            provider
          );
          setConfigAlerts([
            {
              type: "error",
              message: `${
                provider.charAt(0).toUpperCase() + provider.slice(1)
              } API key required. Please add your API key in the`,
              link: {
                text: "Models section",
                step: SetupStep.Models,
              },
            },
          ]);
        } else {
          console.log(
            "[modelChangeMonitor] Provider properly configured:",
            provider
          );
          setConfigAlerts([]);
        }
      }
    }
  }, [selectedModel, configuredProviders]);

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentStep={SetupStep.Home} />

      <ConfigAlerts alerts={configAlerts} onNavigate={onNavigate} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatContainer
          ref={chatContainerRef}
          className="flex-1 space-y-2 px-4 pt-8 max-w-4xl mx-auto w-full"
          autoScroll={true}
        >
          <ChatMessages
            messages={chatState.messages}
            expandedTools={chatState.expandedTools}
            onToggleToolExpand={chatState.toggleToolExpand}
          />
        </ChatContainer>

        <div className="p-4">
          <div className="max-w-4xl mx-auto">
            <PromptInput
              value={input}
              onValueChange={setInput}
              isLoading={isSubmitting}
              onSubmit={() => {
                handleSubmit(input);
                setInput("");
              }}
            >
              <PromptInputTextarea
                placeholder={
                  configuredProviders.size === 0
                    ? "Please add an API key to start chatting..."
                    : "Ask me anything..."
                }
                disabled={isSubmitting || configuredProviders.size === 0}
                className="!h-[100px] !rounded-md"
              />
              <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <ModelSelector
                    selectedModel={selectedModel}
                    onModelChange={setSelectedModel}
                    configuredProviders={configuredProviders}
                    onNavigate={onNavigate}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {chatState.messages.length > 0 && (
                    <PromptInputAction tooltip="Summarize conversation">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={handleSummarize}
                        disabled={
                          isSubmitting || chatState.messages.length === 0
                        }
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </PromptInputAction>
                  )}
                  <PromptInputAction
                    tooltip={isSubmitting ? "Stop generation" : "Send message"}
                  >
                    <Button
                      variant="default"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={
                        isSubmitting ? handleStop : () => handleSubmit(input)
                      }
                      disabled={
                        (!input.trim() && !isSubmitting) ||
                        configuredProviders.size === 0 ||
                        !selectedModel
                      }
                    >
                      {isSubmitting ? (
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
