import * as React from "react";
import { cn } from "../../../../lib/utils";
import { ChatMessageUI, NashLLMMessage, ToolUse, ToolResult, TextContent } from "../types";
import { Message, MessageContent } from "../../../ui/message";
import { Avatar } from "../../../ui/avatar";
import { Badge } from "../../../ui/badge";
import { User, ChevronRight, ChevronDown } from "lucide-react";
import nashLogoWhite from "../../../../../public/nash-logo-white.svg";
import { MarkdownContent } from "./MarkdownContent";

interface ChatMessagesProps {
  messages: NashLLMMessage[];
  expandedTools: Record<string, boolean>;
  onToggleToolExpand: (messageId: string) => void;
}

export function ChatMessages({
  messages,
  expandedTools,
  onToggleToolExpand,
}: ChatMessagesProps) {

  // Helper function to render message content based on its type
  const renderMessageContent = (message: NashLLMMessage) => {
    // Thinking state
    if (message.role === "assistant" && message.isStreaming && !message.content) {
      return <span className="text-zinc-400">Thinking...</span>;
    }

    // Empty content
    if (!message.content) {
      return null;
    }

    // Plain text content (string)
    if (typeof message.content === 'string') {
      return (
        <div className="prose prose-invert max-w-none">
          <MarkdownContent content={message.content} className="prose prose-invert max-w-none" />
        </div>
      );
    }

    // Array content - could be text content, tool use, or tool result
    if (Array.isArray(message.content)) {
      const textContents = message.content.filter(item => item.type === "text") as TextContent[];
      const toolResult = message.content.find(item => item.type === "tool_result") as ToolResult | undefined;
      
      // Tool result message (user message with tool result)
      if (message.role === "user" && toolResult) {
        return (
          <div className="bg-zinc-800 p-2 rounded text-xs font-mono">
            <div className="text-green-400 font-semibold mb-1">Result:</div>
            <pre className="whitespace-pre-wrap overflow-auto max-h-32">
              {toolResult.content}
            </pre>
          </div>
        );
      }
      
      // Text content
      if (textContents.length > 0) {
        return (
          <div className="prose prose-invert max-w-none">
            {textContents.map((item, index) => (
              <div key={index}>
                <MarkdownContent content={item.content} className="prose prose-invert max-w-none" />
              </div>
            ))}
          </div>
        );
      }
    }
    
    // Fallback for any other content type
    return (
      <div className="prose prose-invert max-w-none">
        {String(message.content)}
      </div>
    );
  };

  // Helper function to render tool badge if message has tool use
  const renderToolBadge = (message: NashLLMMessage) => {
    if (!Array.isArray(message.content)) return null;
    
    const toolUse = message.content.find(item => item.type === "tool_use") as ToolUse | undefined;
    if (!toolUse) return null;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-[44px] w-[44px] rounded-lg">
            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
              <img src={nashLogoWhite} alt="Nash" className="w-5 h-5" />
            </div>
          </Avatar>
          <Badge
            variant="secondary"
            className={cn(
              "max-w-max text-sm py-1.5 bg-purple-700 hover:bg-purple-800 text-white cursor-pointer"
            )}
            onClick={() => onToggleToolExpand(message.id || "")}
          >
            <span className="flex items-center gap-1 font-mono">
              {`Using ${toolUse.name}`}
              {expandedTools[message.id || ""] ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          </Badge>
        </div>
        
        {expandedTools[message.id || ""] && (
          <div className="flex flex-col gap-3 bg-zinc-800/50 border border-zinc-700/50 p-4 rounded-lg overflow-x-auto ml-14">
            <div className="flex flex-col gap-2">
              <div className="text-sm text-purple-300 font-medium flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
                  />
                </svg>
                Function Call
              </div>
              <pre className="text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800">
                {JSON.stringify({
                  id: toolUse.tool_use_id,
                  function: {
                    name: toolUse.name,
                    arguments: JSON.stringify(toolUse.input)
                  }
                }, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {messages.map((message) => (
        <div key={message.id} className="flex flex-col gap-2">
         
        

          {/* Message with background */}
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
              {renderMessageContent(message)}
            </div>
          </Message>
          
 {/* Tool Badge */}
            {renderToolBadge(message)}
        </div>
      ))}
    </>
  );
}
