import * as React from "react";
import { cn } from "../../../lib/utils";
import { safeParseJSON } from "../../../utils/safeParseJSON";
import { NashLLMMessage, ToolUse, ToolResult, TextContent } from "../../../types";
import { Message } from "../../../components/ui/message";
import { Avatar } from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/badge";
import { User, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import nashLogoWhite from "../../../../public/nash-logo-white.svg";
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
  const [expandedResults, setExpandedResults] = React.useState<Record<string, boolean>>({});
  const contentRefs = React.useRef<Record<string, HTMLPreElement | null>>({});

  const toggleResultExpand = (messageId: string) => {
    setExpandedResults(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

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
      // Extract only text content items (exclude tool_use items which will be rendered separately)
      const textContents = message.content.filter(item => item.type === "text") as TextContent[];
      const toolUse = message.content.find(item => item.type === "tool_use") as ToolUse | undefined;
      const toolResult = message.content.find(item => item.type === "tool_result") as ToolResult | undefined;
      
      // Process toolResult content using the utility function
      const processedToolResult = toolResult && {
        ...toolResult,
        ...safeParseJSON(toolResult.content)
      };
      const formattedToolResult = processedToolResult?.formattedContent;
      
      // Tool result message (user message with tool result)
      if (message.role === "user" && toolResult) {
        const isExpanded = expandedResults[message.id || ""];
        const contentRef = contentRefs.current[message.id || ""];
        const shouldShowExpandButton = contentRef && contentRef.scrollHeight > 300;

        return (
          <div className="flex flex-col gap-3 bg-zinc-800/50 border border-zinc-700/50 p-4 rounded-lg overflow-x-auto min-h-[80px] min-w-[300px]">
            <div className="flex flex-col gap-2">
              <div className="text-sm text-green-400 font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
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
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Result
                </div>
                {shouldShowExpandButton && (
                  <button
                    onClick={() => toggleResultExpand(message.id || "")}
                    className="text-zinc-400 hover:text-zinc-300 transition-colors flex items-center gap-1"
                  >
                    {isExpanded ? (
                      <span className="flex items-center gap-1 justify-end">
                        <span className="w-[80px]">Show Less</span> <ChevronDown className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 justify-end">
                        <span className="w-[80px]">Show More</span> <ChevronRight className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                )}
              </div>
              <div className="relative">
                <pre 
                  ref={(el) => {
                    if (el) {
                      contentRefs.current[message.id || ""] = el;
                    }
                  }}
                  className={cn(
                    "text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800 whitespace-pre-wrap",
                    !isExpanded && "max-h-[300px] overflow-hidden"
                  )}
                >
                  {formattedToolResult}
                </pre>
                {shouldShowExpandButton && !isExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-900 via-zinc-900/80 to-transparent pointer-events-none" />
                )}
              </div>
            </div>
          </div>
        );
      }
      
      // If message only contains tool_use and no text, don't show any content
      // (the tool badge will be rendered separately)
      if (textContents.length === 0 && toolUse) {
        return null;
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
        {typeof message.content === 'object' 
          ? JSON.stringify(message.content)
          : String(message.content)
        }
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
              <pre className="text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800 whitespace-pre-wrap">
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
      {messages.map((message) => {
        const isToolResult = Array.isArray(message.content) && message.content.some(item => item.type === "tool_result");
        return (
          <div key={message.id} className="flex flex-col gap-2">
            {/* Message with background */}
            <Message>
            <Avatar className="h-[44px] w-[44px] rounded-lg">
              {(message.role === "assistant" || isToolResult) ? (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                  <img src={nashLogoWhite} alt="Nash" className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
              )}
            </Avatar>
           {
            !isToolResult? (
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
            ) : (
             <>
              {renderMessageContent(message)}
             </>
            )
            }
          </Message>
          
            {/* Tool Badge */}
            {renderToolBadge(message)}
        </div>
      ) })
    }
    </>
  );
}
