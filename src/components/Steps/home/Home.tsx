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
  NASH_LOCAL_SERVER_MCP_LIST_TOOLS_ENDPOINT,
  TOOL_CALL_START_MARKER,
  TOOL_CALL_END_MARKER,
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
import { ChatMessage, ChatProps, ConfigAlert, ToolCall } from "./types";
import { ModelSelector } from "./components/ModelSelector";
import { ChatMessages } from "./components/ChatMessages";
import { ConfigAlerts } from "./components/ConfigAlerts";
import { ALL_MODELS } from "./constants";
import { streamCompletion, summarizeConversation } from "./chatService";
import { getProviderConfig, logMessageHistory } from "./utils";

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

// Custom hook for handling tool calls
const useToolHandler = (
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
  isProcessingToolRef: { current: boolean }
) => {
  const handleToolCall = useCallback(
    async (name: string, args: Record<string, any>) => {
      if (isProcessingToolRef.current) {
        console.log("[handleToolCall] Tool call already in progress, skipping");
        return Promise.reject(new Error("Tool call already in progress"));
      }

      console.log("[handleToolCall] Starting tool call:", { name, args });
      isProcessingToolRef.current = true;

      try {
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

        isProcessingToolRef.current = false;
        return result;
      } catch (error) {
        console.error("[handleToolCall] Error:", error);
        isProcessingToolRef.current = false;
        throw error;
      }
    },
    [setMessages, isProcessingToolRef]
  );

  return handleToolCall;
};

// Return type for the chat interaction hook
type ChatInteractionHookResult = {
  handleSubmit: (input: string) => Promise<void>;
  handleStop: () => void;
  handleSummarize: () => Promise<void>;
  isSending: boolean;
  setIsSending: React.Dispatch<React.SetStateAction<boolean>>;
  isSubmitting: boolean;
};

// Custom hook for managing chat interactions
const useChatInteraction = (
  selectedModel: string,
  chatState: ReturnType<typeof useChatState>
): ChatInteractionHookResult => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isSending, setIsSending] = useState(false);
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
    setIsSending(false);

    console.log("[handleStop] Stream aborted and state reset");
  }, [chatState]);

  const handleSubmit = useCallback(
    async (input: string) => {
      if (isSending) {
        console.log("[handleSubmit] Already sending a message, ignoring...");
        return;
      }

      // Ignore empty submissions
      if (!input.trim()) {
        console.log("[handleSubmit] Empty message, ignoring...");
        return;
      }

      console.log("[handleSubmit] Starting message submission flow");
      setIsSending(true);

      try {
        // Ensure chatState.messages is an array
        if (!chatState.messages || !Array.isArray(chatState.messages)) {
          console.error(
            "[handleSubmit] Messages is not an array:",
            chatState.messages
          );
          setIsSending(false);
          return;
        }

        // Create a new user message
        const userMessage: ChatMessage = {
          id: uuidv4(),
          role: "user",
          content: input,
          timestamp: new Date(),
        };

        // Create a new array with existing messages plus the new user message
        // We do this instead of relying on the state update which is asynchronous
        const messagesWithCurrentInput = [...chatState.messages, userMessage];

        // Verify we have at least one message in the conversation
        if (messagesWithCurrentInput.length === 0) {
          const errorMessage = "Please type a message first before submitting.";
          console.error("[handleSubmit]", errorMessage);
          chatState.addMessage({
            id: uuidv4(),
            role: "assistant",
            content: `Error: ${errorMessage}`,
            timestamp: new Date(),
          });
          setIsSending(false);
          return;
        }

        // Verify the first message is from a user
        if (messagesWithCurrentInput[0].role !== "user") {
          const errorMessage =
            "The conversation must start with a user message. This is required by the AI provider. Please start a new conversation.";
          console.error("[handleSubmit]", errorMessage);
          chatState.addMessage({
            id: uuidv4(),
            role: "assistant",
            content: `Error: ${errorMessage}`,
            timestamp: new Date(),
          });
          setIsSending(false);
          return;
        }

        // Now add the user message to the UI first
        chatState.addMessage(userMessage);

        // Create assistant message placeholder
        const assistantMessage: ChatMessage = {
          id: uuidv4(),
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isStreaming: true,
        };
        chatState.addMessage(assistantMessage);

        // Cancel any existing request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        // Create a new abort controller for this request
        const controller = new AbortController();
        abortControllerRef.current = controller;

        // Create handlers object for streamCompletion
        const handlers = {
          onChunk: (chunk: string, sessionId?: string) => {
            if (chunk) {
              console.log("[handleSubmit] Received chunk:", chunk);

              // Update the content of the latest message
              chatState.updateLastMessage((msg) => {
                // Only add unique content
                if (msg.content && msg.content.endsWith(chunk)) {
                  console.log(
                    "[handleSubmit] Preventing duplicate chunk from being added"
                  );
                  return msg; // Don't modify message if chunk is already there
                }
                return {
                  ...msg,
                  content: (msg.content || "") + chunk,
                };
              });
            }

            // If we get a new session ID, update it
            if (sessionId) {
              chatState.setSessionId(sessionId);
            }
          },
          onContent: (content: string) => {
            if (content) {
              console.log("[handleSubmit] Received content:", content);

              // Update the content of the latest message
              chatState.updateLastMessage((msg) => {
                // Only add unique content
                if (msg.content && msg.content.endsWith(content)) {
                  console.log(
                    "[handleSubmit] Preventing duplicate content from being added"
                  );
                  return msg; // Don't modify message if content is already there
                }
                return {
                  ...msg,
                  content: (msg.content || "") + content,
                };
              });
            }
          },
          onToolCall: handleToolCall,
          setMessages: chatState.setMessages,
        };

        const result = await streamCompletion(
          messagesWithCurrentInput,
          handlers,
          selectedModel,
          controller.signal,
          chatState.sessionId
        );

        // Update session ID if a new one was returned
        if (result.sessionId && result.sessionId !== chatState.sessionId) {
          console.log("[handleSubmit] Updating session ID:", result.sessionId);
          chatState.setSessionId(result.sessionId);
        }

        // At this point, the entire conversation flow (including any tool calls)
        // should be complete, and the UI should be updated
        console.log("[handleSubmit] Conversation flow completed");
      } catch (error) {
        console.error("[handleSubmit] Error in chat stream:", error);

        if (error instanceof Error) {
          const errorMessage =
            error.name === "AbortError"
              ? "Request was cancelled."
              : `Error: ${
                  error.message || "There was an error processing your request."
                }`;

          // Make sure we add an error message if no assistant message exists
          const assistantIndex = chatState.messages.findIndex(
            (msg) => msg.role === "assistant" && msg.isStreaming
          );
          const hasAssistantMessage = assistantIndex !== -1;

          if (hasAssistantMessage) {
            // Update the existing assistant message
            chatState.updateLastMessage((msg) => ({
              ...msg,
              content: errorMessage,
              isStreaming: false,
            }));
          } else {
            // Add a new assistant message with the error
            chatState.addMessage({
              id: uuidv4(),
              role: "assistant",
              content: errorMessage,
              timestamp: new Date(),
            });
          }

          if (error.name !== "AbortError") {
            console.error("[handleSubmit] Non-abort error:", error);
          } else {
            console.log("[handleSubmit] Request was aborted");
          }
        } else {
          // Same pattern for unknown errors
          const assistantIndex = chatState.messages.findIndex(
            (msg) => msg.role === "assistant" && msg.isStreaming
          );
          const hasAssistantMessage = assistantIndex !== -1;

          if (hasAssistantMessage) {
            chatState.updateLastMessage((msg) => ({
              ...msg,
              content:
                "Sorry, there was an unknown error processing your request.",
              isStreaming: false,
            }));
          } else {
            chatState.addMessage({
              id: uuidv4(),
              role: "assistant",
              content:
                "Sorry, there was an unknown error processing your request.",
              timestamp: new Date(),
            });
          }
        }
      } finally {
        abortControllerRef.current = null;
        setIsSending(false);
      }
    },
    [chatState, selectedModel, handleToolCall, isSending]
  );

  const handleSummarize = useCallback(async () => {
    if (
      !chatState.messages ||
      !Array.isArray(chatState.messages) ||
      chatState.messages.length === 0
    ) {
      console.log("[handleSummarize] No messages to summarize");
      return;
    }

    try {
      setIsSending(true);
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
    } finally {
      setIsSending(false);
    }
  }, [chatState, setIsSending]);

  return {
    handleSubmit,
    handleStop,
    handleSummarize,
    isSending,
    setIsSending,
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
  const [showRawMessages, setShowRawMessages] = useState(false);

  const chatState = useChatState();

  // Get the tool handler directly
  const toolHandler = useToolHandler(
    chatState.setMessages,
    chatState.isProcessingToolRef
  );

  const { handleSubmit, handleStop, handleSummarize, isSending, setIsSending } =
    useChatInteraction(selectedModel, chatState);

  // Toggle function for raw messages
  const toggleRawMessages = () => setShowRawMessages(!showRawMessages);

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
    <div className="flex h-full flex-col">
      <Header onNavigate={onNavigate} currentStep={SetupStep.Home} />
      <div className="flex-1 overflow-hidden relative flex flex-col">
        <ChatContainer className="max-w-4xl mx-auto w-full flex-1">
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto w-full p-4 pb-[180px]">
              <ConfigAlerts alerts={configAlerts} onNavigate={onNavigate} />
              <ChatMessages
                messages={chatState.messages}
                expandedTools={chatState.expandedTools}
                onToggleToolExpand={chatState.toggleToolExpand}
                showRawMessages={showRawMessages}
              />
            </div>
          </div>
        </ChatContainer>
        {/* Fixed input area at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-background border-t border-zinc-800 z-10">
          <div className="max-w-4xl mx-auto p-4">
            <PromptInput
              value={input}
              onValueChange={setInput}
              isLoading={isSending}
              onSubmit={() => {
                handleSubmit(input);
                setInput("");
              }}
              className="mt-2"
            >
              <PromptInputTextarea
                placeholder={
                  configuredProviders.size === 0
                    ? "Please add an API key to start chatting..."
                    : "Ask me anything..."
                }
                disabled={isSending || configuredProviders.size === 0}
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

                  {/* Debug button to toggle raw messages */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={toggleRawMessages}
                  >
                    {showRawMessages ? "Hide Raw" : "Show Raw"}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {chatState.messages && chatState.messages.length > 0 && (
                    <PromptInputAction tooltip="Summarize conversation">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={handleSummarize}
                        disabled={
                          isSending ||
                          !chatState.messages ||
                          chatState.messages.length === 0
                        }
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </PromptInputAction>
                  )}
                  <PromptInputAction
                    tooltip={isSending ? "Stop generation" : "Send message"}
                  >
                    <Button
                      variant="default"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={
                        isSending ? handleStop : () => handleSubmit(input)
                      }
                      disabled={
                        (!input.trim() && !isSending) ||
                        configuredProviders.size === 0 ||
                        !selectedModel
                      }
                    >
                      {isSending ? (
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
