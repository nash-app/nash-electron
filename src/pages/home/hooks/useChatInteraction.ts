import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  NASH_LOCAL_SERVER_CHAT_ENDPOINT,
  NASH_LOCAL_SERVER_TOKEN_INFO_ENDPOINT,
  ALL_MODELS,
  DEFAULT_BASE_URLS,
} from "../../../constants";

import {
  LLMMessage,
  StreamChunk,
  NashLLMMessage,
  ToolUse,
  TextContent,
  TokenInfo,
  ChatState,
} from "../../../types";

interface ModelConfig {
  provider: string;
  baseUrl?: string;
  selectedModel?: string;
  headers?: Record<string, string>;
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
    headers: config?.headers || undefined,
  };
};

// Helper function to detect and parse errors from stream content
const parseStreamError = (
  event: StreamChunk & { error?: unknown }
): { isError: boolean; errorMessage: string | null } => {
  // If there's no error field, it's not an error
  if (!event.error) {
    return { isError: false, errorMessage: null };
  }

  const error = event.error;

  // Handle string error content
  if (typeof error === "string") {
    // Check for rate limit errors
    if (
      error.includes("RateLimitError") ||
      error.includes("rate_limit_error")
    ) {
      const errorMatch = error.match(/RateLimitError: (.+?)(?:\n|$)/);
      if (errorMatch && errorMatch[1]) {
        return {
          isError: true,
          errorMessage: `Rate limit exceeded: ${errorMatch[1]}. Please wait a moment before trying again.`,
        };
      }
      return {
        isError: true,
        errorMessage:
          "Rate limit exceeded. Please wait a moment before trying again.",
      };
    }

    // Return the error string directly
    return {
      isError: true,
      errorMessage: error,
    };
  }

  // Handle object error content
  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;
    // If the error object has a message or description field, use that
    const errorMessage =
      errorObj.message || errorObj.description || JSON.stringify(error);
    return {
      isError: true,
      errorMessage:
        typeof errorMessage === "string"
          ? errorMessage
          : JSON.stringify(errorMessage),
    };
  }

  return { isError: false, errorMessage: null };
};

export const useChatInteraction = (
  selectedModel: string,
  chatState: ChatState,
  addGeneralError: (message: string) => void
) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const toolArgsAccumulatorRef = useRef<string>("");

  const fetchTokenInfo = useCallback(
    async (messages: LLMMessage[]) => {
      if (!selectedModel) {
        setTokenInfo(null);
        return;
      }

      try {
        const response = await fetch(NASH_LOCAL_SERVER_TOKEN_INFO_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages,
            model: selectedModel,
          }),
        });

        if (!response.ok) {
          throw new Error(`Token info request failed: ${response.status}`);
        }

        const info = await response.json();
        setTokenInfo(info);
      } catch (error) {
        console.error("Error fetching token info:", error);
        setTokenInfo(null);
      }
    },
    [selectedModel]
  );

  useEffect(() => {
    if (!selectedModel) {
      setTokenInfo(null);
      return;
    }

    if (chatState.messagesForLLM.length > 0) {
      fetchTokenInfo(chatState.messagesForLLM);
    } else {
      fetchTokenInfo([]);
    }
  }, [chatState.messagesForLLM, selectedModel, fetchTokenInfo]);

  const createUserMessageUI = useCallback(
    (input: string) => {
      const userMessageUI: NashLLMMessage = {
        id: uuidv4(),
        role: "user",
        content: input.trim(),
        timestamp: new Date(),
        isStreaming: false,
      };
      chatState.setMessagesForUI((prev) => [...prev, userMessageUI]);
      return userMessageUI;
    },
    [chatState]
  );

  const createUserMessageLLM = useCallback(
    (input: string) => {
      const userMessage: LLMMessage = {
        role: "user",
        content: input.trim(),
      };
      chatState.setMessagesForLLM((prev) => [...prev, userMessage]);
      return userMessage;
    },
    [chatState]
  );

  const createAssistantMessageUI = useCallback(() => {
    const assistantMessageId = uuidv4();
    const assistantMessageUI: NashLLMMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    chatState.setMessagesForUI((prev) => [...prev, assistantMessageUI]);
    return assistantMessageId;
  }, [chatState]);

  const createAssistantMessageUIWithContent = useCallback(
    (content: string) => {
      const assistantMessageId = uuidv4();
      const assistantMessageUI: NashLLMMessage = {
        id: assistantMessageId,
        role: "assistant",
        content,
        timestamp: new Date(),
        isStreaming: true,
      };
      chatState.setMessagesForUI((prev) => [...prev, assistantMessageUI]);
      return assistantMessageId;
    },
    [chatState]
  );

  const handleStreamEnd = useCallback(
    (assistantMessageId: string) => {
      // TODO: Make sure we clean up the assistant message properly
      chatState.setMessagesForUI((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
        )
      );
    },
    [chatState]
  );

  const handleContentChunk = useCallback(
    (event: StreamChunk, assistantMessageId: string) => {
      chatState.setCurrentStreamSnapshot(
        (prev: ChatState["currentStreamSnapshot"]) => ({
          ...prev,
          content: (prev.content || "") + event.content,
        })
      );

      chatState.setMessagesForUI((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantMessageId) return msg;

          if (Array.isArray(msg.content)) {
            const textItems = msg.content.filter(
              (item) => item.type === "text"
            ) as TextContent[];

            if (textItems.length === 0) {
              return {
                ...msg,
                content: [
                  ...msg.content,
                  {
                    type: "text" as const,
                    tool_use_id: chatState.toolUseIdRef.current || undefined,
                    content: event.content,
                  },
                ],
              };
            }

            return {
              ...msg,
              content: msg.content.map((item) => {
                if (item === textItems[textItems.length - 1]) {
                  return {
                    ...item,
                    content: item.content + event.content,
                  };
                }
                return item;
              }),
            };
          }

          const currentContent =
            typeof msg.content === "string" ? msg.content : "";
          return {
            ...msg,
            content: currentContent + event.content,
          };
        })
      );
    },
    [chatState]
  );

  const handleToolNameChunk = useCallback(
    (event: StreamChunk, assistantMessageId: string) => {
      const toolUseId = chatState.toolUseIdRef.current || `toolu_${uuidv4()}`;
      chatState.toolUseIdRef.current = toolUseId;

      chatState.setCurrentStreamSnapshot(
        (prev: ChatState["currentStreamSnapshot"]) => ({
          ...prev,
          toolName: event.tool_name,
        })
      );

      chatState.setMessagesForUI((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantMessageId) return msg;

          if (typeof msg.content === "string" && msg.content.trim() === "") {
            return {
              ...msg,
              content: [
                {
                  type: "text" as const,
                  tool_use_id: toolUseId,
                  content: "",
                },
              ],
            };
          }

          const currentContent = Array.isArray(msg.content)
            ? msg.content
            : typeof msg.content === "string" && msg.content
            ? [
                {
                  type: "text" as const,
                  tool_use_id: toolUseId,
                  content: msg.content,
                },
              ]
            : [];

          const hasToolUse = currentContent.some(
            (item) => item.type === "tool_use" && item.tool_use_id === toolUseId
          );

          if (!hasToolUse) {
            currentContent.push({
              type: "tool_use" as const,
              tool_use_id: toolUseId,
              name: event.tool_name,
              input: {},
            } as ToolUse);
          }

          return {
            ...msg,
            content: currentContent,
          };
        })
      );
    },
    [chatState]
  );

  const handleToolArgsChunk = useCallback(
    (event: StreamChunk, assistantMessageId: string) => {
      // Accumulate the chunk
      toolArgsAccumulatorRef.current += event.tool_args;

      chatState.setCurrentStreamSnapshot(
        (prev: ChatState["currentStreamSnapshot"]) => ({
          ...prev,
          toolArgs: event.tool_args,
        })
      );

      // Try to parse the accumulated args
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolArgsAccumulatorRef.current);
        // If we successfully parsed, clear the accumulator
        toolArgsAccumulatorRef.current = "";
      } catch (e) {
        // If parsing fails, it means we don't have the complete JSON yet
        // Just continue accumulating chunks
        console.debug("Incomplete JSON chunk, continuing to accumulate");
      }

      chatState.setMessagesForUI((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantMessageId || !Array.isArray(msg.content))
            return msg;

          return {
            ...msg,
            content: msg.content.map((item) => {
              if (
                item.type === "tool_use" &&
                item.tool_use_id === chatState.toolUseIdRef.current
              ) {
                return {
                  ...item,
                  input: parsedArgs,
                };
              }
              return item;
            }),
          };
        })
      );
    },
    [chatState]
  );

  const handleToolResultChunk = useCallback(
    (event: StreamChunk) => {
      const currentAssistantMessageId =
        chatState.currentAssistantMessageIdRef.current;
      if (!currentAssistantMessageId) {
        console.warn("No current assistant message ID found for tool result");
        return;
      }

      // Format the tool result as a string
      const toolResultContent =
        typeof event.tool_result === "object"
          ? JSON.stringify(event.tool_result, null, 2)
          : String(event.tool_result);

      const toolResultMessage: NashLLMMessage = {
        id: uuidv4(),
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: chatState.toolUseIdRef.current!,
            content: toolResultContent,
          },
        ],
        timestamp: new Date(),
        isStreaming: false,
      };

      chatState.setMessagesForUI((prev) => [...prev, toolResultMessage]);
      chatState.setCurrentStreamSnapshot(
        (prev: ChatState["currentStreamSnapshot"]) => ({
          ...prev,
          toolResult: event.tool_result,
        })
      );

      // Don't clear the assistant message ID here since we need it for subsequent content
      chatState.toolUseIdRef.current = null;
      // Clear the accumulator when we're done with this tool use
      toolArgsAccumulatorRef.current = "";
    },
    [chatState]
  );

  const handleFinishReasonChunk = useCallback(
    (event: StreamChunk) => {
      if (!event.finish_reason || event.finish_reason !== "length") return;

      const finishReasonMessage: NashLLMMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "Output limit exceeded.",
        timestamp: new Date(),
        isStreaming: false,
      };

      chatState.setMessagesForUI((prev) => [...prev, finishReasonMessage]);
    },
    [chatState]
  );

  const handleSleepSecondsChunk = useCallback(
    (event: StreamChunk) => {
      if (!event.sleep_seconds) return;

      const roundedSeconds = Math.round(event.sleep_seconds);
      const sleepMessage: NashLLMMessage = {
        id: uuidv4(),
        role: "assistant",
        content: `Sleeping for ${roundedSeconds} seconds...`,
        timestamp: new Date(),
        isStreaming: false,
      };

      chatState.setMessagesForUI((prev) => [...prev, sleepMessage]);
    },
    [chatState]
  );

  const handleStreamChunk = useCallback(
    (event: StreamChunk & { session_id?: string }) => {
      let lastChunkType: string | null = null;
      if ("session_id" in event && event.session_id) {
        chatState.setSessionId(event.session_id);
        return;
      }

      const currentAssistantMessageId =
        chatState.currentAssistantMessageIdRef.current;
      if (!currentAssistantMessageId) {
        console.error("No current assistant message ID found for stream chunk");
        return;
      }

      if (event.content !== null) lastChunkType = "content";
      else if (event.tool_name !== null) lastChunkType = "tool_name";
      else if (event.tool_args !== null) lastChunkType = "tool_args";
      else if (event.tool_result !== null) lastChunkType = "tool_result";
      else if (event.new_raw_llm_messages !== null)
        lastChunkType = "new_raw_llm_messages";
      else if (event.finish_reason !== null) lastChunkType = "finish_reason";
      else if (event.sleep_seconds !== null) lastChunkType = "sleep_seconds";

      if (event.content) {
        handleContentChunk(event, currentAssistantMessageId!);
      }

      if (event.tool_name) {
        handleToolNameChunk(event, currentAssistantMessageId!);
      }

      if (event.tool_args && chatState.toolUseIdRef.current) {
        handleToolArgsChunk(event, currentAssistantMessageId!);
      }

      if (event.tool_result && chatState.toolUseIdRef.current) {
        handleToolResultChunk(event);
      }

      if (event.new_raw_llm_messages) {
        if (
          Array.isArray(event.new_raw_llm_messages) &&
          event.new_raw_llm_messages.length > 0
        ) {
          chatState.setMessagesForLLM((prev) => [
            ...prev,
            ...event.new_raw_llm_messages,
          ]);
        }
      }

      if (event.finish_reason) {
        handleFinishReasonChunk(event);
      }

      if (event.sleep_seconds) {
        handleSleepSecondsChunk(event);
      }
    },
    [
      chatState,
      handleContentChunk,
      handleToolNameChunk,
      handleToolArgsChunk,
      handleToolResultChunk,
      handleFinishReasonChunk,
      handleSleepSecondsChunk,
    ]
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim() || !selectedModel) {
        return;
      }

      setIsSubmitting(true);

      chatState.currentAssistantMessageIdRef.current = null;
      chatState.setCurrentStreamSnapshot(
        (prev: ChatState["currentStreamSnapshot"]) => ({
          ...prev,
        })
      );

      const userMessage = createUserMessageLLM(input);
      createUserMessageUI(input);

      const assistantMessageId = createAssistantMessageUI();

      chatState.currentAssistantMessageIdRef.current = assistantMessageId;
      chatState.setCurrentStreamSnapshot(
        (prev: ChatState["currentStreamSnapshot"]) => ({
          ...prev,
        })
      );

      try {
        const providerConfig = await getProviderConfig(selectedModel);
        const messagesForRequest = [...chatState.messagesForLLM, userMessage];

        const response = await fetch(NASH_LOCAL_SERVER_CHAT_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: messagesForRequest,
            model: selectedModel,
            api_key: providerConfig.key,
            api_base_url:
              providerConfig.baseUrl ||
              DEFAULT_BASE_URLS[providerConfig.provider],
            provider: providerConfig.provider,
            session_id: chatState.sessionId || undefined,
            headers: providerConfig.headers,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Failed to get response reader");
        }

        let partialLine = "";
        let isAfterToolResult = false;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const lines = (partialLine + chunk).split("\n");
          partialLine = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;

            const data = line.substring(6);
            if (data === "[DONE]") {
              handleStreamEnd(chatState.currentAssistantMessageIdRef.current!);
              continue;
            }

            try {
              const event = JSON.parse(data) as StreamChunk & {
                session_id?: string;
                error?: unknown;
              };

              // Check for errors in the event
              const { isError, errorMessage } = parseStreamError(event);
              if (isError && errorMessage) {
                console.error("[Stream Error] Full error:", event.error);
                addGeneralError(errorMessage);
                handleStreamEnd(
                  chatState.currentAssistantMessageIdRef.current!
                );
                return;
              }

              // If we're processing content after a tool result, we need to create a new assistant message
              if (event.content && isAfterToolResult) {
                const newAssistantMessageId =
                  createAssistantMessageUIWithContent(event.content);
                chatState.currentAssistantMessageIdRef.current =
                  newAssistantMessageId;
                chatState.setCurrentStreamSnapshot(
                  (prev: ChatState["currentStreamSnapshot"]) => ({
                    ...prev,
                    content: event.content,
                  })
                );
                isAfterToolResult = false;
                continue;
              }

              handleStreamChunk(event);

              // Update the tool result state for the next chunk
              isAfterToolResult = event.tool_result !== null;
            } catch (error) {
              console.error("Error processing stream chunk:", error);
            }
          }
        }
      } catch (error) {
        console.error("[Chat Error] Full error state:", error);

        if (error instanceof Error) {
          const errorMessage = error.message || String(error);
          // Handle other errors
          chatState.setMessagesForUI((prev) =>
            prev.map((msg) =>
              msg.id === chatState.currentAssistantMessageIdRef.current
                ? {
                    ...msg,
                    content:
                      "Sorry, there was an error processing your request.",
                    isStreaming: false,
                  }
                : msg
            )
          );
          addGeneralError(errorMessage);
        } else {
          handleStreamEnd(chatState.currentAssistantMessageIdRef.current!);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      selectedModel,
      chatState,
      addGeneralError,
      createUserMessageUI,
      createUserMessageLLM,
      createAssistantMessageUI,
      handleStreamEnd,
      handleStreamChunk,
    ]
  );

  return {
    handleSubmit,
    isSubmitting,
    tokenInfo,
  };
};
