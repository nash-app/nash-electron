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

// Define StreamHandlers interface locally
interface StreamHandlers {
  onChunk: (chunk: string, sessionId?: string) => void;
  onToolCall?: (name: string, args: Record<string, any>) => Promise<any>;
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onContent?: (content: string) => void;
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
    
    setMessages((prev) => {
      const newMessages = [...prev, message];
      
      return newMessages;
    });
  }, []);

  const updateLastMessage = useCallback(
    (updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
       
        
        const newMessages = [...prev];
        
        // Find the last assistant message that is streaming
        const lastAssistantIndex = newMessages.findIndex(
          m => m.role === "assistant" && m.isStreaming === true
        );
        
        if (lastAssistantIndex >= 0) {
         
          const updatedMessage = updater(newMessages[lastAssistantIndex]);
         
          newMessages[lastAssistantIndex] = updatedMessage;
        } else {
          // Fallback to updating the last message
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage) {
         
            newMessages[newMessages.length - 1] = updater(lastMessage);
          } else {
            console.warn("[useChatState] No message to update");
          }
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

// Custom hook for managing chat interactions
const useChatInteraction = (
  selectedModel: string,
  chatState: ReturnType<typeof useChatState>
) => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentContentRef = useRef("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleToolCall = useToolHandler(
    chatState.setMessages,
    chatState.isProcessingToolRef
  );

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      console.log("[handleStop] Aborting current stream");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    chatState.isProcessingToolRef.current = false;
    setIsSubmitting(false);
  }, [chatState.isProcessingToolRef]);

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim() || !selectedModel) {
        console.log("[handleSubmit] Submission blocked:", {
          hasInput: !!input.trim(),
          hasModel: !!selectedModel,
        });
        return;
      }

      setIsSubmitting(true);
      
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

      // Log the state before adding messages
      console.log("[handleSubmit] Messages BEFORE adding user message:");
      logMessageHistory(chatState.messages, "BEFORE_ADDING");

      // Add the user message to the state
      console.log("[handleSubmit] Adding user message:", userMessage.id);
      chatState.addMessage(userMessage);
      
      // Create a new array with the user message added
      // This ensures we have the updated messages immediately without waiting for state update
      const updatedMessages = [...chatState.messages, userMessage];
      
      // Create an assistant message
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };
      
      // Add the assistant message to the state
      console.log("[handleSubmit] Adding assistant message:", assistantMessage.id);
      chatState.addMessage(assistantMessage);
      
      // Add the assistant message to our local array as well
      updatedMessages.push(assistantMessage);
      
      // Log the updated messages array
      console.log("[handleSubmit] Updated messages array:");
      logMessageHistory(updatedMessages, "UPDATED_MESSAGES");
      
      currentContentRef.current = "";

      const controller = new AbortController();
      abortControllerRef.current = controller;
      console.log("[handleSubmit] Created new AbortController");

      try {
        console.log("[handleSubmit] Starting streamCompletion with messages:", 
          updatedMessages.map(m => ({ id: m.id, role: m.role }))
        );
        
        // Create handlers object for streamCompletion
        const handlers: StreamHandlers = {
          onChunk: (chunk: string, newSessionId?: string) => {
            if (newSessionId) {
              console.log("[handleSubmit] Received session ID:", newSessionId);
              chatState.setSessionId(newSessionId);
              return;
            }
            
            console.log("[handleSubmit] Received chunk:", chunk);
            
            if (!chunk) {
              console.log("[handleSubmit] Empty chunk received, skipping");
              return;
            }
            
            // Directly update the messages state
            chatState.setMessages((prevMessages) => {
              console.log("[handleSubmit] Updating messages state with chunk:", chunk);
              console.log("[handleSubmit] Current messages:", 
                prevMessages.map(m => ({ 
                  id: m.id, 
                  role: m.role, 
                  content: m.content?.substring(0, 20),
                  isStreaming: m.isStreaming
                }))
              );
              
              // Create a new array to avoid mutating the previous state
              const newMessages = [...prevMessages];
              
              // Find the assistant message that is streaming
              const assistantIndex = newMessages.findIndex(
                m => m.role === "assistant" && m.isStreaming === true
              );
              
              if (assistantIndex >= 0) {
                // Get the assistant message
                const assistantMessage = newMessages[assistantIndex];
                console.log("[handleSubmit] Found assistant message to update:", assistantMessage.id);
                console.log("[handleSubmit] Current content:", assistantMessage.content);
                
                // Create a new message object with the updated content
                const updatedContent = (assistantMessage.content || "") + chunk;
                newMessages[assistantIndex] = {
                  ...assistantMessage,
                  content: updatedContent
                };
                
                console.log("[handleSubmit] Updated assistant message content:", updatedContent);
              } else {
                console.warn("[handleSubmit] No assistant message found to update");
                console.log("[handleSubmit] Messages:", newMessages);
              }
              
              return newMessages;
            });
          },
          onToolCall: handleToolCall,
          setMessages: chatState.setMessages
        };
        
        // Use the updatedMessages array instead of chatState.messages
        await streamCompletion(
          updatedMessages,
          handlers,
          selectedModel,
          controller.signal,
          chatState.sessionId
        );
        
        // Mark the assistant message as not streaming when the stream is complete
        chatState.setMessages((prevMessages) => {
        
          
          // Create a new array to avoid mutating the previous state
          const newMessages = [...prevMessages];
          
          // Find the assistant message that is streaming
          const assistantIndex = newMessages.findIndex(
            m => m.role === "assistant" && m.isStreaming === true
          );
          
          if (assistantIndex >= 0) {
            // Get the assistant message
            const assistantMessage = newMessages[assistantIndex];
         
            
            // Create a new message object with isStreaming set to false
            newMessages[assistantIndex] = {
              ...assistantMessage,
              isStreaming: false
            };
            
          }
          
          return newMessages;
        });
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
         
        }
      } finally {
        abortControllerRef.current = null;
        setIsSubmitting(false);
        
        // Log the final state after completion
       
        logMessageHistory(chatState.messages, "AFTER_COMPLETION");
      }
    },
    [selectedModel, chatState, handleToolCall]
  );

  const handleSummarize = useCallback(async () => {
    if (chatState.messages.length === 0) return;

    try {
      setIsSubmitting(true);
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
      setIsSubmitting(false);
    }
  }, [chatState]);

  return {
    handleSubmit,
    handleStop,
    handleSummarize,
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
  const { handleSubmit, handleStop, handleSummarize, isSubmitting } =
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
