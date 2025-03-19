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
import { streamCompletion  } from "./chatService";

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

// Custom hook for managing chat state
const useChatState = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );

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
    addMessage,
    updateLastMessage,
    toggleToolExpand,
    clearMessages,
  };
};

// Custom hook for managing chat interactions
const useChatInteraction = (
  selectedModel: string,
  chatState: ReturnType<typeof useChatState>
) => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentContentRef = useRef("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSubmitting(false);
    }
  }, []);

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim() || !selectedModel) {
        return;
      }

      setIsSubmitting(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

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
          chatState.setMessages
        );
      } catch (error) {
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
        }
      } finally {
        abortControllerRef.current = null;
        setIsSubmitting(false);
      }
    },
    [selectedModel, chatState]
  );

  return {
    handleSubmit,
    handleStop,
    isSubmitting,
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
  const { handleSubmit, handleStop, isSubmitting } =
    useChatInteraction(selectedModel, chatState);

  // Load configured providers on mount
  useEffect(() => {
    const loadConfiguredProviders = async () => {
      try {
        const keys = await window.electron.getKeys();
        const providers = new Set(keys.map((k) => k.provider));
        setConfiguredProviders(providers);

        if (!selectedModel) {
          if (providers.has("anthropic")) {
            setSelectedModel("claude-3-7-sonnet-latest");
          } else if (providers.has("openai")) {
            setSelectedModel("o3-mini");
          }
        }

        if (providers.size === 0) { 
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
      const model = ALL_MODELS.find((m) => m.id === selectedModel);
      if (model) {
        const provider = model.provider;
        if (!configuredProviders.has(provider)) {
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
