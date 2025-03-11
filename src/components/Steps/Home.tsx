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

const streamCompletion = async (
  messages: ChatMessage[],
  sessionId: string | null,
  abortSignal: AbortSignal | null,
  onChunk: (chunk: string, sessionId?: string) => void,
  onFunctionCall?: (name: string, args: Record<string, any>) => void,
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
) => {
  let foundFunctionCall = false;
  let functionCallContent = "";
  let pendingContent = "";

  console.log("[streamCompletion] Starting with session:", sessionId);

  try {
    console.log("[streamCompletion] Making request to:", NASH_LLM_SERVER_ENDPOINT);
    console.log("[streamCompletion] Request payload:", {
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      session_id: sessionId
    });
    
    const response = await fetch(NASH_LLM_SERVER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, session_id: sessionId }),
      signal: abortSignal || undefined,
    });

    console.log("[streamCompletion] Response status:", response.status);
    console.log("[streamCompletion] Response headers:", Object.fromEntries(response.headers.entries()));

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
          if (data === "[DONE]") {
            console.log("[streamCompletion] Stream complete");
            break;
          }

          try {
            const parsed = JSON.parse(data);
            console.log("[streamCompletion] Received chunk:", parsed);

            if (parsed.session_id) {
              console.log("[streamCompletion] New session ID:", parsed.session_id);
              onChunk("", parsed.session_id);
              continue;
            }

            if (!parsed.content) continue;

            if (foundFunctionCall) {
              functionCallContent += parsed.content;
              console.log("[streamCompletion] Accumulating function call content:", functionCallContent);
              
              if (functionCallContent.includes("</function_call>")) {
                console.log("[streamCompletion] Complete function call detected");
                // We have a complete function call, parse it
                const functionCallMatch = functionCallContent.match(/<function_call>([^]*?)<\/function_call>/);
                if (functionCallMatch && onFunctionCall) {
                  try {
                    const functionCall = JSON.parse(functionCallMatch[1]) as FunctionCall[];
                    console.log("[streamCompletion] Parsed function call:", functionCall);
                    
                    if (functionCall.length > 0) {
                      const { name, arguments: args = {} } = functionCall[0].function;
                      console.log("[streamCompletion] Executing function call:", name, args);
                      
                      // Update the last message to show we're preparing the tool call
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
            console.log("[streamCompletion] Current pending content:", pendingContent);
            
            const functionCallIndex = pendingContent.indexOf("<function_call>");
            
            if (functionCallIndex !== -1) {
              console.log("[streamCompletion] Function call start detected at index:", functionCallIndex);
              // We found the start of a function call
              foundFunctionCall = true;
              // Send any content before the function call to the UI
              if (functionCallIndex > 0) {
                const contentBeforeCall = pendingContent.substring(0, functionCallIndex);
                console.log("[streamCompletion] Sending content before function call:", contentBeforeCall);
                onChunk(contentBeforeCall);
              }
              functionCallContent = pendingContent.substring(functionCallIndex);
              pendingContent = "";
            } else {
              // No function call found, send complete words/phrases to the UI
              const lastSpaceIndex = pendingContent.lastIndexOf(" ");
              if (lastSpaceIndex !== -1) {
                const completeContent = pendingContent.substring(0, lastSpaceIndex + 1);
                console.log("[streamCompletion] Sending complete phrase:", completeContent);
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

    // Send any remaining content
    if (pendingContent && !foundFunctionCall) {
      console.log("[streamCompletion] Sending remaining content:", pendingContent);
      onChunk(pendingContent);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.log("[streamCompletion] Stream aborted");
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
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentContentRef = useRef("");

  const handleToolCall = useCallback(async (name: string, args: Record<string, any>) => {
    console.log("[handleToolCall] Starting tool call:", name, args);
    
    // Update the last message to show tool processing
    setMessages((prev) => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      if (lastMessage) {
        lastMessage.processingTool = {
          name,
          status: "calling",
          functionCall: JSON.stringify({ tool_name: name, arguments: args }, null, 2)
        };
        console.log("[handleToolCall] Updated message with tool status:", lastMessage);
      }
      return newMessages;
    });

    try {
      console.log("[handleToolCall] Making API request to:", NASH_MCP_CALL_TOOL_ENDPOINT);
      console.log("[handleToolCall] Request payload:", { tool_name: name, arguments: args });
      
      const response = await fetch(NASH_MCP_CALL_TOOL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tool_name: name, arguments: args }),
      });

      console.log("[handleToolCall] Response status:", response.status);
      console.log("[handleToolCall] Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text().catch(() => "No error text available");
        console.error("[handleToolCall] Error response body:", errorText);
        throw new Error(`Tool call failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("[handleToolCall] Received tool response:", result);
      
      // Feed the result back into streamCompletion
      const toolMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };

      console.log("[handleToolCall] Created new message for tool response:", toolMessage);
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
      console.log("[handleToolCall] Starting stream completion with messages:", messagesWithResult);
      
      await streamCompletion(
        messagesWithResult,
        sessionId,
        null,
        (chunk, newSessionId) => {
          if (newSessionId) {
            console.log("[handleToolCall] Received new session ID:", newSessionId);
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
              console.log("[handleToolCall] Updated message content:", chunk);
              return updatedMessages;
            }
            return prevMessages;
          });
        },
        handleToolCall,
        setMessages
      );
    } catch (error) {
      console.error("[handleToolCall] Error:", error);
    }
  }, [messages, sessionId, setSessionId, setMessages]);

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
        handleToolCall,
        setMessages
      );

      // Mark streaming as complete
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
  }, [input, isLoading, messages, sessionId, handleToolCall, setMessages]);

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
                    <div className="flex flex-col gap-2 bg-muted p-2 rounded-md overflow-x-auto">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm text-muted-foreground font-medium">Function Call:</div>
                        <pre className="text-sm bg-muted p-2 rounded-md overflow-x-auto">
                          {message.processingTool.functionCall}
                        </pre>
                      </div>
                      {message.processingTool.response && (
                        <div className="flex flex-col gap-1">
                          <div className="text-sm text-muted-foreground font-medium">Response:</div>
                          <pre className="text-sm bg-muted p-2 rounded-md overflow-x-auto">
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
