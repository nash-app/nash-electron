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
  MessageAvatar,
  MessageContent,
  MessageActions,
} from "../ui/message";
import { Button } from "../ui/button";
import { Square, ArrowUp, FileText } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import nashLogoChat from "../../../public/nash-logo-chat.png";
import { cn } from "../../lib/utils";
import { ChatContainer } from "../ui/chat-container";
import {
  NASH_LLM_SERVER_ENDPOINT,
  NASH_LLM_SUMMARIZE_ENDPOINT,
  NASH_MCP_ENDPOINT,
  FUNCTION_CALL_MARKER,
} from "../../constants";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatProps {
  onNavigate: (step: SetupStep) => void;
}

async function streamCompletion(
  messages: ChatMessage[],
  sessionId: string | null = null,
  model: string | null = null,
  onChunk: (chunk: string, sessionId?: string) => void,
  onMessageUpdate?: (content: string) => void
) {
  const endpoint = NASH_LLM_SERVER_ENDPOINT;

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
      model,
    }),
    mode: "cors",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[streamCompletion] Error response:", errorText);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentMessage = "";
  let foundFunctionCall = false;
  let pendingContent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const decodedChunk = decoder.decode(value, { stream: true });
      buffer += decodedChunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            if (parsed.session_id) {
              onChunk("", parsed.session_id);
            } else if (parsed.content) {
              // Check if we've already found a function call
              if (foundFunctionCall) continue;

              // Add new content to pending buffer
              pendingContent += parsed.content;

              // Check for complete function call marker
              if (pendingContent.includes("<function_call")) {
                foundFunctionCall = true;
                const markerIndex = pendingContent.indexOf("<function_call");
                
                // Get all content before the marker
                const finalContent = currentMessage + pendingContent.substring(0, markerIndex).trim();
                
                if (finalContent) {
                  onChunk(finalContent, undefined);
                }
                return;
              }

              // If we have a complete word/phrase (ends with space or punctuation)
              if (/[.!?, ]$/.test(pendingContent)) {
                currentMessage += pendingContent;
                onChunk(pendingContent, undefined);
                pendingContent = "";
              }
            }
          } catch (e) {
            console.error("[Stream] Error parsing SSE data:", e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

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
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentContentRef = useRef("");

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
        async (chunk, newSessionId) => {
          if (newSessionId) {
            setSessionId(newSessionId);
            return;
          }

          currentContentRef.current += chunk;
          
          // Update messages state
          setMessages((prevMessages) => {
            const lastMessage = prevMessages[prevMessages.length - 1];
            if (lastMessage?.role === "assistant" && lastMessage.isStreaming) {
              return prevMessages.map((msg) =>
                msg.id === lastMessage.id
                  ? { ...msg, content: currentContentRef.current }
                  : msg
              );
            }
            return prevMessages;
          });
        }
      );

      // Mark streaming as complete
      setMessages((prevMessages) => {
        const lastMessage = prevMessages[prevMessages.length - 1];
        if (lastMessage?.role === "assistant" && lastMessage.isStreaming) {
          return prevMessages.map((msg) =>
            msg.id === lastMessage.id
              ? {
                  ...msg,
                  content: currentContentRef.current,
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
  }, [input, isLoading, messages, sessionId]);

  const handleSummarize = useCallback(async () => {
    if (isLoading || messages.length === 0) return;

    setIsLoading(true);
    try {
      const result = await summarizeConversation(messages, sessionId);

      if (result.success) {
        // Create a summary message from the result
        const summaryMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: "**Conversation Summary:**\n\n" + result.summary,
          timestamp: new Date(),
        };

        // Keep only the summary message
        setMessages([summaryMessage]);

        // Update session ID if provided while maintaining the existing session
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatContainer
          ref={chatContainerRef}
          className="flex-1 space-y-4 p-8"
          autoScroll={true}
        >
          {messages.map((message) => (
            <Message
              key={message.id}
              className={
                message.role === "user" ? "justify-end" : "justify-start"
              }
            >
              {message.role === "assistant" && (
                <MessageAvatar src={nashLogoChat} alt="Nash" fallback="N" />
              )}
              <div className="flex-1 max-w-[80%]">
                <MessageContent
                  markdown
                  className={cn(
                    message.role === "user" && "bg-transparent p-0 text-right",
                    message.role === "assistant" && "bg-nash-bg-secondary/50 p-4 rounded-lg"
                  )}
                >
                  {message.content || (message.isStreaming ? "..." : "")}
                </MessageContent>
                <MessageActions className="mt-1">
                  <span className="text-xs text-nash-text-secondary">
                    {message.timestamp.toLocaleTimeString()}
                    {message.isStreaming && " (typing...)"}
                  </span>
                </MessageActions>
              </div>
            </Message>
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
              />
              <PromptInputActions className="flex items-center justify-end gap-2 pt-2">
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
              </PromptInputActions>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
