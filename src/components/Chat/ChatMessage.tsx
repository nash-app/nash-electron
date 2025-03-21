import * as React from "react";
import { User, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { NashLLMMessage, ToolUse, ToolResult, TextContent } from "../Steps/home/types";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { MarkdownContent } from "../Steps/home/components/MarkdownContent";

interface ChatMessageProps {
  message: NashLLMMessage;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [expandedTools, setExpandedTools] = React.useState<Record<string, boolean>>({});

  // Find tool_use in the content array if it exists
  const findToolUse = (): ToolUse | undefined => {
    if (!Array.isArray(message.content)) return undefined;
    return message.content.find(item => item.type === "tool_use") as ToolUse | undefined;
  };

  // Find text content in the content array
  const findTextContent = (): TextContent[] => {
    if (!Array.isArray(message.content)) return [];
    return message.content.filter(item => item.type === "text") as TextContent[];
  };

  // Find tool result in the content array
  const findToolResult = (): ToolResult | undefined => {
    if (!Array.isArray(message.content)) return undefined;
    return message.content.find(item => item.type === "tool_result") as ToolResult | undefined;
  };

  const toolUse = findToolUse();
  const textContents = findTextContent();
  const toolResult = findToolResult();

  const toggleToolExpand = (id: string) => {
    setExpandedTools(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Helper function to render different content types
  const renderContent = () => {
    // Thinking state
    if (message.role === "assistant" && message.isStreaming && !message.content) {
      return <span className="text-zinc-400">Thinking...</span>;
    }

    // Empty content
    if (!message.content) {
      return null;
    }

    // String content (plain text messages)
    if (typeof message.content === 'string') {
      return (
        <div className="prose prose-invert max-w-none">
          {message.content}
        </div>
      );
    }

    // Tool result message
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

    // Regular text message with potential tool content
    return (
      <div className="prose prose-invert max-w-none">
        {textContents.map((item, index) => (
          <div key={index}>
            <MarkdownContent content={item.content} className="prose prose-invert max-w-none" />
          </div>
        ))}
      </div>
    );
  };

  // Render tool badge if this message has a tool_use
  const renderToolBadge = () => {
    if (!toolUse) return null;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-[44px] w-[44px] rounded-lg">
            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
              <img src="/nash-logo-white.svg" alt="Nash" className="w-5 h-5" />
            </div>
          </Avatar>
          <Badge
            variant="secondary"
            className={cn(
              "max-w-max text-sm py-1.5 bg-purple-700 hover:bg-purple-800 text-white cursor-pointer"
            )}
            onClick={() => toggleToolExpand(message.id || "")}
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
    <div className="flex flex-col gap-3">
      {/* Main message */}
      <div className="flex items-start gap-3 py-2">
        <Avatar className="h-[44px] w-[44px] rounded-lg">
          {message.role === "assistant" ? (
            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
              <img src="/nash-logo-white.svg" alt="Nash" className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
        </Avatar>
        <div
          className={cn(
            "rounded-lg px-3 py-2 break-words max-w-xl w-full",
            message.role === "user"
              ? "bg-zinc-700 text-white"
              : "bg-zinc-900 text-zinc-100"
          )}
        >
          {renderContent()}
        </div>
      </div>

      {/* Tool Badge (if present) */}
      {toolUse && renderToolBadge()}
    </div>
  );
}; 