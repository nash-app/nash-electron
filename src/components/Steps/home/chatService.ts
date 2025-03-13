import { ChatMessage, FunctionCall } from "./types";
import { getProviderConfig, logMessageHistory } from "./utils";
import {
  NASH_LOCAL_SERVER_CHAT_ENDPOINT,
  NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT,
} from "../../../constants";

export const streamCompletion = async (
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

  const makeRequest = async (messages: ChatMessage[], isFollowUp = false) => {
    const completedMessages = messages.filter((m) => {
      if (m.role === "assistant") {
        return !m.isStreaming && m.content;
      }
      return m.role === "user";
    });

    const messageHistory = completedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    console.log(
      `[streamCompletion] ${
        isFollowUp ? "Follow-up" : "Initial"
      } request messages:`,
      messageHistory.map((m, i) => ({
        index: i,
        role: m.role,
        contentPreview:
          m.content.substring(0, 100) + (m.content.length > 100 ? "..." : ""),
      }))
    );

    const config = await getProviderConfig(modelId);

    return fetch(NASH_LOCAL_SERVER_CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messageHistory,
        session_id: sessionId,
        api_key: config.key,
        api_base_url: config.baseUrl,
        model: config.model,
        provider: config.provider,
      }),
      signal: abortSignal || undefined,
    });
  };

  try {
    const response = await makeRequest(messages);
    if (!response.ok) {
      const errorText = await response
        .text()
        .catch(() => "No error text available");
      console.error("[streamCompletion] Error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No reader available");

    const decoder = new TextDecoder();
    let buffer = "";
    let shouldContinue = true;

    while (shouldContinue && !abortSignal?.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        shouldContinue = false;
        break;
      }

      const decodedChunk = decoder.decode(value, { stream: true });
      buffer += decodedChunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") {
          shouldContinue = false;
          break;
        }

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
              const functionCallMatch = functionCallContent.match(
                /<function_call>([^]*?)<\/function_call>/
              );
              if (functionCallMatch && onFunctionCall) {
                try {
                  const functionCall = JSON.parse(
                    functionCallMatch[1]
                  ) as FunctionCall[];

                  if (functionCall.length > 0) {
                    const { name, arguments: args = {} } =
                      functionCall[0].function;

                    if (setMessages) {
                      setMessages((prev) => {
                        const newMessages = [...prev];
                        const lastMessage = newMessages[newMessages.length - 1];
                        if (lastMessage) {
                          lastMessage.isStreaming = false;
                          lastMessage.content =
                            lastMessage.content + pendingContent;
                          lastMessage.processingTool = {
                            name,
                            status: "preparing",
                            functionCall: JSON.stringify(
                              { tool_name: name, arguments: args },
                              null,
                              2
                            ),
                          };
                        }
                        logMessageHistory(newMessages, "Before Tool Call");
                        return newMessages;
                      });
                    }

                    const result = await onFunctionCall(name, args);
                    return handleToolResult(
                      result,
                      messages,
                      setMessages,
                      onChunk,
                      modelId,
                      abortSignal
                    );
                  }
                } catch (e) {
                  console.error(
                    "[streamCompletion] Error in tool handling:",
                    e
                  );
                  foundFunctionCall = false;
                  functionCallContent = "";
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
              const contentBeforeCall = pendingContent.substring(
                0,
                functionCallIndex
              );
              onChunk(contentBeforeCall);
            }
            functionCallContent = pendingContent.substring(functionCallIndex);
            pendingContent = "";
          } else {
            const words = pendingContent.split(" ");
            if (words.length > 1) {
              const completeContent = words.slice(0, -1).join(" ") + " ";
              onChunk(completeContent);
              pendingContent = words[words.length - 1];
            }
          }
        } catch (e) {
          console.error(
            "[streamCompletion] Error parsing SSE data:",
            e,
            "\nRaw data:",
            data
          );
        }
      }
    }

    if (pendingContent && !foundFunctionCall) {
      onChunk(pendingContent);
      if (setMessages) {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.isStreaming) {
            lastMessage.isStreaming = false;
            logMessageHistory(newMessages, "Initial Message Complete");
          }
          return newMessages;
        });
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message === "AbortError")
    ) {
      console.log("[streamCompletion] Request aborted");
      return;
    }
    console.error("[streamCompletion] Error:", error);
    throw error;
  }
};

const handleToolResult = async (
  result: any,
  messages: ChatMessage[],
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
  onChunk?: (chunk: string, sessionId?: string) => void,
  modelId?: string,
  abortSignal?: AbortSignal | null
) => {
  if (!setMessages || !onChunk || !modelId) return;

  const toolResultMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: `Tool result: ${JSON.stringify(result)}`,
    timestamp: new Date(),
  };

  const followUpMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    timestamp: new Date(),
    isStreaming: true,
  };

  setMessages((prev) => {
    const newMessages = [...prev, followUpMessage];
    logMessageHistory(newMessages, "Before Follow-up Request");
    return newMessages;
  });

  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter(
    (m) => m.role === "assistant" && !m.isStreaming && m.content
  );
  const messagesForRequest = [
    ...userMessages,
    ...assistantMessages,
    toolResultMessage,
  ];

  await streamCompletion(
    messagesForRequest,
    null,
    abortSignal,
    onChunk,
    modelId,
    undefined,
    setMessages
  );
};

export const summarizeConversation = async (
  messages: ChatMessage[],
  sessionId: string | null = null
) => {
  try {
    const response = await fetch(NASH_LOCAL_SERVER_SUMMARIZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    return await response.json();
  } catch (error) {
    console.error("Error in summarize:", error);
    throw error;
  }
};
