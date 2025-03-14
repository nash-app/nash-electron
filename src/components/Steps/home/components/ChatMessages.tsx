import * as React from "react";
import { cn } from "../../../../lib/utils";
import { ChatMessage } from "../types";
import { Message, MessageContent } from "../../../ui/message";
import { Avatar } from "../../../ui/avatar";
import { Badge } from "../../../ui/badge";
import { User, ChevronRight, ChevronDown } from "lucide-react";
import nashLogoWhite from "../../../../../public/nash-logo-white.svg";
import { MarkdownContent } from "./MarkdownContent";

interface ChatMessagesProps {
  messages: ChatMessage[];
  expandedTools: Record<string, boolean>;
  onToggleToolExpand: (messageId: string) => void;
  showRawMessages?: boolean;
}

interface ToolResultProps {
  tool: {
    name: string;
    status: "preparing" | "calling" | "completed";
    functionCall?: string;
    response?: string;
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
}

// Add the ToolResult component using Tailwind classes
function ToolResult({ tool, isExpanded, onToggleExpand }: ToolResultProps) {
  return (
    <div className="mt-4 border-t border-zinc-700 pt-4">
      <div className="flex items-center gap-2">
        <Badge
          variant={
            tool.status === "completed"
              ? "default"
              : tool.status === "calling"
              ? "secondary"
              : "outline"
          }
          className="text-xs"
        >
          {tool.name}
        </Badge>
        <span className="text-xs text-zinc-400">
          {tool.status === "preparing"
            ? "Preparing..."
            : tool.status === "calling"
            ? "Calling..."
            : "Completed"}
        </span>
        <button
          onClick={onToggleExpand}
          className="ml-auto text-zinc-400 hover:text-zinc-300"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {tool.functionCall && (
            <div>
              <p className="text-xs text-zinc-400 mb-1">Function Call:</p>
              <pre className="text-xs bg-zinc-900/50 p-2 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800">
                {tool.functionCall}
              </pre>
            </div>
          )}
          {tool.response && (
            <div>
              <p className="text-xs text-zinc-400 mb-1">Response:</p>
              <pre className="text-xs bg-zinc-900/50 p-2 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800">
                {tool.response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Improve the tool call handling function
const cleanToolCalls = (content: string): string => {
  if (!content || typeof content !== "string") return "";

  // If the content contains a tool call marker, only show content before it
  if (content.includes("<tool_call>")) {
    const parts = content.split("<tool_call>");

    // If there's content before the tool call, show it
    if (parts[0].trim()) {
      return parts[0].trim();
    }

    // If there's no content before the tool call, show a more informative message
    // Try to extract the tool name from the tool call if possible
    const toolCallContent = parts[1] || "";

    // First try to extract from function.name format (server logs format)
    const functionMatch = toolCallContent.match(
      /"function"[\s\S]*?"name"[\s\S]*?:[\s\S]*?"([^"]+)"/
    );
    if (functionMatch && functionMatch[1]) {
      const toolName = functionMatch[1];

      // Special handling for nash_secrets
      if (toolName === "nash_secrets") {
        return "I'm checking what secrets are available in your environment...";
      }

      return `I'm using the ${toolName} tool to get information for you...`;
    }

    // Fallback to simpler name extraction
    const simpleMatch = toolCallContent.match(/"name"\s*:\s*"([^"]+)"/);
    if (simpleMatch && simpleMatch[1]) {
      return `I'm using the ${simpleMatch[1]} tool to get information for you...`;
    }

    // Check for nash_secrets specifically
    if (toolCallContent.includes("nash_secrets")) {
      return "I'm checking what secrets are available in your environment...";
    }

    return "I'm using a tool to get information for you...";
  }

  return content;
};

// Helper to detect unprocessed tool calls
const hasUnprocessedToolCall = (message: ChatMessage): boolean => {
  if (!message.content || typeof message.content !== "string") return false;

  // Check if the message contains a tool call marker but doesn't have processingTool set
  return (
    message.content.includes("<tool_call>") &&
    !message.processingTool &&
    !message.isStreaming
  );
};

export function ChatMessages({
  messages,
  expandedTools,
  onToggleToolExpand,
  showRawMessages = false,
}: ChatMessagesProps) {
  // Filter out tool result messages that are hidden
  const visibleMessages = messages.filter(
    (m) => !m.toolResult || showRawMessages
  );

  return (
    <div className="flex flex-col gap-3">
      {visibleMessages.map((message) => {
        // Check if this message has an unprocessed tool call
        const unprocessedToolCall = hasUnprocessedToolCall(message);

        return (
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
              <div
                className={cn(
                  "rounded-lg px-3 py-2 break-words max-w-max",
                  message.role === "user"
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-900 text-zinc-100"
                )}
              >
                {message.role === "assistant" &&
                message.isStreaming &&
                !message.content ? (
                  <span className="text-zinc-400">Thinking...</span>
                ) : message.role === "assistant" &&
                  message.content &&
                  message.toolResult ? (
                  <div className="prose prose-invert max-w-none">
                    <p className="text-emerald-300">
                      Tool Result: {message.toolResult.toolName}
                    </p>
                    <pre className="text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800">
                      {message.toolResult.result}
                    </pre>
                  </div>
                ) : message.role === "assistant" && message.content ? (
                  <>
                    <MarkdownContent
                      content={
                        showRawMessages
                          ? message.content
                          : cleanToolCalls(message.content)
                      }
                      className="prose prose-invert max-w-none"
                    />
                    {/* Show raw message content when debug mode is enabled */}
                    {showRawMessages && message.role === "assistant" && (
                      <div className="mt-4 border-t border-zinc-700 pt-2">
                        <p className="text-xs text-zinc-500 mb-1">
                          Raw Message:
                        </p>
                        <pre className="text-xs bg-zinc-900/50 p-2 rounded-md overflow-x-auto font-mono text-zinc-400 border border-zinc-800 whitespace-pre-wrap">
                          {message.content}
                        </pre>
                        <div className="text-xs text-zinc-500 mt-2 flex flex-col gap-1">
                          <div>
                            Contains &lt;tool_call&gt;:{" "}
                            {message.content.includes("<tool_call>")
                              ? "✅"
                              : "❌"}
                          </div>
                          <div>
                            Contains &lt;/tool_call&gt;:{" "}
                            {message.content.includes("</tool_call>")
                              ? "✅"
                              : "❌"}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="prose prose-invert max-w-none">
                    <p>{message.content}</p>
                  </div>
                )}

                {message.isError && (
                  <div className="text-red-400 mt-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 inline-block mr-1"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                    {message.content}
                  </div>
                )}

                {message.processingTool && (
                  <ToolResult
                    tool={message.processingTool}
                    isExpanded={expandedTools[message.id]}
                    onToggleExpand={() => onToggleToolExpand(message.id)}
                  />
                )}
              </div>
            </Message>
          </div>
        );
      })}
    </div>
  );
}
