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
import { ChatMessageUI, ChatProps, ConfigAlert, LLMMessage, StreamChunk, NashLLMMessage, ToolUse, ToolResult, TextContent } from "./types";
import { ModelSelector } from "./components/ModelSelector";
import { ChatMessages } from "./components/ChatMessages";
import { ConfigAlerts } from "./components/ConfigAlerts";
import { ALL_MODELS, DEFAULT_BASE_URLS } from "./constants";
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
    baseUrl: config?.baseUrl || DEFAULT_BASE_URLS[model.provider],
    model: modelId,
    provider: model.provider,
  };
};

interface ChatLifecycleState {
  contentRecentlyFinished: boolean,
  toolNameRecentlyFinished: boolean,
  toolArgsRecentlyFinished: boolean,
  toolResultRecentlyFinished: boolean,
  rawLLMMessagesRecentlyFinished: boolean,
}

// Add this outside of all components to ensure it persists between renders
let lastContentWasToolResult = false;
// Add this new module-level variable to track the current message ID
let currentAssistantMessageIdRef: string | null = null;

// Custom hook for managing chat state
const useChatState = () => {
  const [messagesForUI, setMessagesForUI] = useState<NashLLMMessage[]>([]);
  const [messagesForLLM, setMessagesForLLM] = useState<LLMMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [hasCreatedAssistantMessageAfterToolResult, setHasCreatedAssistantMessageAfterToolResult] = useState(false);
  const [toolResultReceived, setToolResultReceived] = useState(false);
  const [currentStreamSnapshot, setCurrentStreamSnapshot] = useState<{
    content: string | null;
    toolName: string | null;
    toolArgs: string | null;
    toolResult: string | null;
    toolUseId: string | null;
    lastToolUseId?: string;
    currentAssistantMessageId?: string;
  }>({
    content: null,
    toolName: null,
    toolArgs: null,
    toolResult: null,
    toolUseId: null,
  });

  const addUserMessage = useCallback((message: string) => {
    const userMessage: NashLLMMessage = {
      id: uuidv4(),
      role: "user",
      content: message,
      timestamp: new Date(),
      isStreaming: false,
    };

    // Add message to UI messages
    setMessagesForUI(prev => [...prev, userMessage]);
    
    // Add message to LLM messages
    setMessagesForLLM(prev => [...prev, {
      role: "user",
      content: message,
    }]);
  }, []);

  const addAssistantMessage = useCallback(() => {
    let assistantMessage: NashLLMMessage;
    
    // If we have a lastToolUseId from a previous tool interaction,
    // make sure the new assistant message is associated with it
    if (currentStreamSnapshot.lastToolUseId) {
      assistantMessage = {
        id: uuidv4(),
        role: "assistant",
        content: [{
          type: "text",
          tool_use_id: currentStreamSnapshot.lastToolUseId,
          content: ""
        }],
        timestamp: new Date(),
        isStreaming: true,
      };
    } else {
      // Default case - no previous tool interaction
      assistantMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };
    }

    setMessagesForUI(prev => [...prev, assistantMessage]);
    return assistantMessage.id;
  }, [currentStreamSnapshot.lastToolUseId]);

  const updateMessage = useCallback((messageId: string, updater: (message: NashLLMMessage) => NashLLMMessage) => {
    setMessagesForUI(prev => {
      return prev.map(msg => {
        if (msg.id === messageId) {
          return updater(msg);
        }
        return msg;
      });
    });
  }, []);

  const updateAssistantMessageWithStreamChunk = useCallback((messageId: string, chunk: StreamChunk, chatLifecycleState: ChatLifecycleState) => {
    // Handle content chunk
    if (chunk.content) {
      console.log("CONTENT CHUNK RECEIVED:", chunk.content, 
        "lastContentWasToolResult:", lastContentWasToolResult,
        "toolResultReceived:", toolResultReceived,
        "toolResultRecentlyFinished:", chatLifecycleState.toolResultRecentlyFinished,
        "currentAssistantMessageId:", currentStreamSnapshot.currentAssistantMessageId,
        "currentAssistantMessageIdRef:", currentAssistantMessageIdRef);
      
      // Store the message ID we'll actually use for this update
      let targetMessageId = messageId;
      
      // If we have a module-level reference to current message ID, use that first
      if (currentAssistantMessageIdRef) {
        console.log("USING MODULE-LEVEL MESSAGE ID REF:", currentAssistantMessageIdRef);
        targetMessageId = currentAssistantMessageIdRef;
      }
      // Check if we have a tool result and need to create a new assistant message
      // Now check our direct global flag first
      else if (lastContentWasToolResult) {
        console.log("CREATING NEW ASSISTANT MESSAGE after tool result - using lastContentWasToolResult flag");
        
        // Reset the global flag since we're handling it now
        lastContentWasToolResult = false;
        
        // Create a new ID for the assistant message
        const newAssistantMessageId = uuidv4();
        targetMessageId = newAssistantMessageId;
        
        // Set our module-level reference
        currentAssistantMessageIdRef = newAssistantMessageId;
        
        // Create a new assistant message
        const newAssistantMessage: NashLLMMessage = {
          id: newAssistantMessageId,
          role: "assistant",
          content: [{
            type: "text",
            tool_use_id: currentStreamSnapshot.lastToolUseId!,
            content: chunk.content
          }],
          timestamp: new Date(),
          isStreaming: true,
        };
        
        // Add the new message to UI
        setMessagesForUI(prev => [...prev, newAssistantMessage]);
        
        // Set current message ID and update content
        setCurrentStreamSnapshot(prev => ({
          ...prev,
          content: chunk.content,
          currentAssistantMessageId: newAssistantMessageId
        }));
        
        // Reset tool result flag since we've handled it
        setToolResultReceived(false);
        
        // Set flag to indicate we've created a new assistant message
        setHasCreatedAssistantMessageAfterToolResult(true);
        
        return; // Exit early as we've handled this chunk
      }
      // Fall back to the original logic if the direct flag is not set
      else if (chatLifecycleState.toolResultRecentlyFinished || 
        (currentStreamSnapshot.lastToolUseId && currentStreamSnapshot.lastToolUseId !== currentStreamSnapshot.toolUseId)) {
        console.log("CREATING NEW ASSISTANT MESSAGE after tool result", {
          toolResultRecentlyFinished: chatLifecycleState.toolResultRecentlyFinished,
          lastToolUseId: currentStreamSnapshot.lastToolUseId,
          toolUseId: currentStreamSnapshot.toolUseId
        });
        
        // Create a new ID for the assistant message
        const newAssistantMessageId = uuidv4();
        targetMessageId = newAssistantMessageId;
        
        // Set our module-level reference
        currentAssistantMessageIdRef = newAssistantMessageId;
        
        // Create a new assistant message
        const newAssistantMessage: NashLLMMessage = {
          id: newAssistantMessageId,
          role: "assistant",
          content: [{
            type: "text",
            tool_use_id: currentStreamSnapshot.lastToolUseId!,
            content: chunk.content
          }],
          timestamp: new Date(),
          isStreaming: true,
        };
        
        // Add the new message to UI
        setMessagesForUI(prev => [...prev, newAssistantMessage]);
        
        // Set current message ID and update content
        setCurrentStreamSnapshot(prev => ({
          ...prev,
          content: chunk.content,
          currentAssistantMessageId: newAssistantMessageId
        }));
        
        // Set flag to indicate we've created a new assistant message
        setHasCreatedAssistantMessageAfterToolResult(true);
        
        return; // Exit early as we've handled this chunk
      }
      // If we have a currentAssistantMessageId from a previous creation, use that instead
      else if (currentStreamSnapshot.currentAssistantMessageId) {
        targetMessageId = currentStreamSnapshot.currentAssistantMessageId;
        
        // Sync with our module-level reference
        if (!currentAssistantMessageIdRef) {
          currentAssistantMessageIdRef = currentStreamSnapshot.currentAssistantMessageId;
        }
      }
      
      setCurrentStreamSnapshot(prev => ({
        ...prev,
        content: (prev.content || "") + chunk.content,
      }));
      
      console.log("UPDATING EXISTING MESSAGE:", targetMessageId, 
        "Is different from original:", targetMessageId !== messageId,
        "Using module-level ref:", targetMessageId === currentAssistantMessageIdRef);
      
      updateMessage(targetMessageId, (msg) => {
        // If content is already an array
        if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map(item => {
              // If there's a text item associated with the current tool, update it
              if (item.type === "text") {
                return {
                  ...item,
                  content: item.content + (chunk.content || "")
                };
              }
              return item;
            })
          };
        }
        
        // If we have a lastToolUseId from a previous tool result,
        // create a proper structured content array with text content
        if (currentStreamSnapshot.lastToolUseId && typeof msg.content === 'string') {
          return {
            ...msg,
            content: [{
              type: "text",
              tool_use_id: currentStreamSnapshot.lastToolUseId,
              content: (msg.content || "") + (chunk.content || "")
            }]
          };
        }
        
        // Default case for string content (no tools involved)
        const currentContent = typeof msg.content === 'string' ? msg.content : "";
        return {
          ...msg,
          content: currentContent + chunk.content,
        };
      });
    }

    // Handle tool name chunk
    if (chunk.tool_name) {
      // Generate a tool use ID if we don't have one yet
      const toolUseId = currentStreamSnapshot.toolUseId || `toolu_${uuidv4()}`;
      
      setCurrentStreamSnapshot(prev => ({
        ...prev,
        toolName: chunk.tool_name,
        toolUseId: toolUseId,
      }));
      
      updateMessage(messageId, (msg) => {
        // Convert string content to array if needed
        const currentContent = Array.isArray(msg.content) 
          ? msg.content 
          : typeof msg.content === 'string' && msg.content
            ? [{ 
                type: "text" as const, 
                tool_use_id: toolUseId,
                content: msg.content 
              }] 
            : [];
        
        // Check if we're already building a tool use
        const hasToolUse = currentContent.some(item => 
          item.type === "tool_use" && item.tool_use_id === toolUseId
        );
        
        // If no tool use yet, add one
        if (!hasToolUse) {
          currentContent.push({
            type: "tool_use" as const,
            tool_use_id: toolUseId,
            name: chunk.tool_name,
            input: {},
          } as ToolUse);
        }
        
        return {
          ...msg,
          content: currentContent,
        };
      });
    }

    // Handle tool args chunk
    if (chunk.tool_args && currentStreamSnapshot.toolUseId) {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(chunk.tool_args);
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
      
      setCurrentStreamSnapshot(prev => ({
        ...prev,
        toolArgs: chunk.tool_args,
      }));
      
      updateMessage(messageId, (msg) => {
        if (!Array.isArray(msg.content)) return msg;
        
        return {
          ...msg,
          content: msg.content.map(item => {
            if (item.type === "tool_use" && item.tool_use_id === currentStreamSnapshot.toolUseId) {
              return {
                ...item,
                input: parsedArgs,
              };
            }
            return item;
          }),
        };
      });
    }

    // Handle tool result chunk
    if (chunk.tool_result && currentStreamSnapshot.toolUseId) {
      console.log("TOOL RESULT CHUNK RECEIVED:", chunk.tool_result);
      
      // Set the GLOBAL flag that the last content was a tool result
      lastContentWasToolResult = true;
      
      // Reset our module-level reference when we get a tool result
      // this ensures the next content chunk creates a new message
      currentAssistantMessageIdRef = null;
      
      console.log("SET lastContentWasToolResult = TRUE - should create new message on next content");
      console.log("RESET currentAssistantMessageIdRef = null");
      
      setCurrentStreamSnapshot(prev => ({
        ...prev,
        toolResult: chunk.tool_result,
        lastToolUseId: currentStreamSnapshot.toolUseId
      }));
      
      // For tool results, we typically create a new user message
      const toolResultMessage: NashLLMMessage = {
        id: uuidv4(),
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: currentStreamSnapshot.toolUseId!,
          content: chunk.tool_result,
        }],
        timestamp: new Date(),
        isStreaming: false,
      };
      
      setMessagesForUI(prev => [...prev, toolResultMessage]);
      console.log("ADDED TOOL RESULT MESSAGE, expecting next content to create new assistant message");
      
      // Still set React state flag to indicate we've just received a tool result
      setToolResultReceived(true);
    }

    // Handle new raw LLM messages
    if (chunk.new_raw_llm_messages) {
      console.log("chunk.new_raw_llm_messages", chunk.new_raw_llm_messages);
      // According to updated types, new_raw_llm_messages is now LLMMessage[] | null
      if (Array.isArray(chunk.new_raw_llm_messages) && chunk.new_raw_llm_messages.length > 0) {
        setMessagesForLLM(prev => [...prev, ...chunk.new_raw_llm_messages]);
      }
    }

    // Add debug logs for tracking chunk sequence
    console.log("CHUNK PROCESSING COMPLETE:", {
      event: JSON.stringify(chunk).substring(0, 100),
      lifecycleState: { ...chatLifecycleState }
    });
  }, [currentStreamSnapshot, updateMessage, setHasCreatedAssistantMessageAfterToolResult, toolResultReceived]);

  const toggleToolExpand = useCallback((messageId: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessagesForUI([]);
    setMessagesForLLM([]);
    setSessionId(null);
    setHasCreatedAssistantMessageAfterToolResult(false);
    setToolResultReceived(false);
    setCurrentStreamSnapshot({
      content: null,
      toolName: null,
      toolArgs: null,
      toolResult: null,
      toolUseId: null,
      lastToolUseId: undefined,
      currentAssistantMessageId: undefined,
    });
    // Reset module-level tracking variables
    lastContentWasToolResult = false;
    currentAssistantMessageIdRef = null;
  }, []);

  return {
    messagesForUI,
    setMessagesForUI,
    messagesForLLM,
    setMessagesForLLM,
    sessionId,
    setSessionId,
    expandedTools,
    currentStreamSnapshot,
    hasCreatedAssistantMessageAfterToolResult,
    setHasCreatedAssistantMessageAfterToolResult,
    toolResultReceived,
    setToolResultReceived,
    addUserMessage,
    addAssistantMessage,
    updateMessage,
    updateAssistantMessageWithStreamChunk,
    toggleToolExpand,
    clearMessages,
  };
};

// Custom hook for managing chat interactions
const useChatInteraction = (
  selectedModel: string,
  chatState: ReturnType<typeof useChatState>,
  onError: (message: string) => void
) => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chatLifecycleState, setChatLifecycleState] = useState<ChatLifecycleState>({
    contentRecentlyFinished: false,
    toolNameRecentlyFinished: false,
    toolArgsRecentlyFinished: false,
    toolResultRecentlyFinished: false,
    rawLLMMessagesRecentlyFinished: false,
  });

  // Update chat lifecycle state based on chunk
  const updateChatLifecycleState = useCallback((chunk: StreamChunk) => {
    console.log("INCOMING CHUNK FOR LIFECYCLE:", chunk, "Current state:", chatLifecycleState);
    setChatLifecycleState(prev => {
      const newState = { ...prev };
      
      // Track content completion
      if (chunk.content !== null) {
        newState.contentRecentlyFinished = true;
        
        // Only reset toolResultRecentlyFinished when we've created a new assistant message
        // and we receive another content chunk
        if (prev.toolResultRecentlyFinished && chatState.hasCreatedAssistantMessageAfterToolResult) {
          newState.toolResultRecentlyFinished = false;
          console.log("Reset toolResultRecentlyFinished to FALSE after creating new assistant message", chunk);
          // Reset the flag
          chatState.setHasCreatedAssistantMessageAfterToolResult(false);
        } else if (prev.toolResultRecentlyFinished) {
          // If we have a content chunk after a tool result but haven't created a new assistant message,
          // don't reset the toolResultRecentlyFinished flag yet
          console.log("Content after tool result but haven't created a new message yet - keeping toolResultRecentlyFinished TRUE", chunk);
        }
      } else if (prev.contentRecentlyFinished) {
        newState.contentRecentlyFinished = false;
      }
      
      // Track tool name completion
      if (chunk.tool_name !== null) {
        newState.toolNameRecentlyFinished = true;
      } else if (prev.toolNameRecentlyFinished) {
        newState.toolNameRecentlyFinished = false;
      }
      
      // Track tool args completion
      if (chunk.tool_args !== null) {
        newState.toolArgsRecentlyFinished = true;
      } else if (prev.toolArgsRecentlyFinished) {
        newState.toolArgsRecentlyFinished = false;
      }
      
      // Track tool result completion
      if (chunk.tool_result !== null) {
        newState.toolResultRecentlyFinished = true;
        console.log("TOOL RESULT RECEIVED - Setting toolResultRecentlyFinished to TRUE", chunk.tool_result);
      }
      
      // Track raw LLM messages completion
      if (chunk.new_raw_llm_messages !== null) {
        newState.rawLLMMessagesRecentlyFinished = true;
      } else if (prev.rawLLMMessagesRecentlyFinished) {
        newState.rawLLMMessagesRecentlyFinished = false;
      }
      
      // Log any changes to the lifecycle state
      if (JSON.stringify(prev) !== JSON.stringify(newState)) {
        console.log("LIFECYCLE STATE CHANGE from:", prev, "to:", newState, "for chunk:", chunk);
      }
      
      return newState;
    });
  }, [chatState.hasCreatedAssistantMessageAfterToolResult, chatState.setHasCreatedAssistantMessageAfterToolResult, chatLifecycleState]);

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
      console.log("selectedModel", selectedModel);
      setIsSubmitting(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Reset the global flag at the start of a new conversation
      lastContentWasToolResult = false;
      
      // Reset lifecycle state for new interaction
      setChatLifecycleState({
        contentRecentlyFinished: false,
        toolNameRecentlyFinished: false,
        toolArgsRecentlyFinished: false,
        toolResultRecentlyFinished: false,
        rawLLMMessagesRecentlyFinished: false,
      });
      
      // Reset message creation flag for new interaction
      chatState.setHasCreatedAssistantMessageAfterToolResult(false);

      console.log("user's message", input.trim());
      
      // Create the user message object
      const userMessage: LLMMessage = {
        role: "user",
        content: input.trim()
      };
      
      // Add user message to UI immediately
      chatState.addUserMessage(input.trim());
      
      // Create assistant message placeholder
      const assistantMessageId = chatState.addAssistantMessage();
      const providerConfig = await getProviderConfig(selectedModel);
      
      // Build messages array directly instead of relying on state update
      const messagesForRequest = [...chatState.messagesForLLM, userMessage];
      console.log("messagesForRequest", messagesForRequest);
      
      try {
        // Setup connection to stream from server
        const response = await fetch(NASH_LOCAL_SERVER_CHAT_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: messagesForRequest,
            model: selectedModel,
            api_key: providerConfig.key,
            api_base_url: providerConfig.baseUrl || DEFAULT_BASE_URLS[providerConfig.provider],
            provider: providerConfig.provider,
            session_id: chatState.sessionId || undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Failed to get response reader");
        }

        let partialLine = "";
        
        // Process streaming response
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          // Decode chunk and split into lines
          const chunk = new TextDecoder().decode(value);
          const lines = (partialLine + chunk).split("\n");
          partialLine = lines.pop() || "";
          
          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) {
              continue;
            }
            
            const data = line.substring(6);
            
            // Check for stream end
            if (data === "[DONE]") {
              // Mark message as no longer streaming
              chatState.updateMessage(assistantMessageId, msg => ({
                ...msg,
                isStreaming: false,
              }));
              continue;
            }
            
            try {
              const event = JSON.parse(data) as StreamChunk & { session_id?: string };
              
              // Handle session ID
              if ("session_id" in event && event.session_id) {
                chatState.setSessionId(event.session_id);
                continue;
              }
              
              // Update chat lifecycle state
              updateChatLifecycleState(event);
              
              // Process chunk and update UI
              chatState.updateAssistantMessageWithStreamChunk(assistantMessageId, event, chatLifecycleState);
              
              // Track tool result chunks to ensure we create a new message after receiving one
              if (event.tool_result) {
                lastContentWasToolResult = true;
                chatState.setToolResultReceived(true);
                console.log("SET GLOBAL FLAGS TO TRUE - lastContentWasToolResult:", lastContentWasToolResult);
              }
              
              // Add debug logs for tracking chunk sequence
              console.log("CHUNK PROCESSING COMPLETE:", {
                event: JSON.stringify(event).substring(0, 100),
                lifecycleState: { ...chatLifecycleState },
                toolResultReceived: chatState.toolResultReceived,
                lastContentWasToolResult: lastContentWasToolResult
              });
              
            } catch (error) {
              console.error("Error processing stream chunk:", error);
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          chatState.updateMessage(assistantMessageId, msg => ({
            ...msg,
            content: "Sorry, there was an error processing your request.",
            isStreaming: false,
          }));
          
          onError(error instanceof Error ? error.message : "An unexpected error occurred");
        } else {
          chatState.updateMessage(assistantMessageId, msg => ({
            ...msg,
            isStreaming: false,
          }));
        }
      } finally {
        abortControllerRef.current = null;
        setIsSubmitting(false);
      }
    },
    [selectedModel, chatState, onError, chatLifecycleState, updateChatLifecycleState]
  );

  return {
    handleSubmit,
    handleStop,
    isSubmitting,
    chatLifecycleState,
  };
};

export function Home({ onNavigate }: ChatProps): React.ReactElement {
  const [input, setInput] = useState("");
  const [configAlerts, setConfigAlerts] = useState<ConfigAlert[]>([]);
  const [generalErrors, setGeneralErrors] = useState<ConfigAlert[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(
    new Set()
  );
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Add a function to handle errors from chat interactions
  const addGeneralError = (message: string) => {
    const id = uuidv4();
    
    // Check if it's a critical error like connection issues
    const isCriticalError = message.includes("Connection error");
    
    setGeneralErrors((prev) => [
      ...prev,
      {
        id,
        type: "error",
        message,
        dismissible: true,
        // Only auto-dismiss non-critical errors
        timeout: isCriticalError ? undefined : 8000,
      },
    ]);
  };

  // Initialize chat state
  const chatState = useChatState();
  
  // Initialize chat interaction 
  const { handleSubmit, handleStop, isSubmitting, chatLifecycleState } = useChatInteraction(
    selectedModel, 
    chatState,
    addGeneralError
  );

  // Handle dismissing general errors
  const handleDismissError = (id: string) => {
    setGeneralErrors((prev) => prev.filter((error) => error.id !== id));
  };

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
      <ConfigAlerts alerts={generalErrors} onNavigate={onNavigate} onDismiss={handleDismissError} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatContainer
          ref={chatContainerRef}
          className="flex-1 space-y-2 px-4 pt-8 max-w-4xl mx-auto w-full"
          autoScroll={true}
        >
          <ChatMessages
            messages={chatState.messagesForUI}
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
