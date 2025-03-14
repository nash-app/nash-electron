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
  // Helper function to format function call content
  const formatFunctionCall = (rawContent: string | undefined): string => {
    if (!rawContent) return "";
    
    try {
      // Remove SSE data format and concatenate all chunks
      const cleanedContent = rawContent
        .replace(/<tool_call>|<\/tool_call>/g, "")
        .split("\n")
        .filter(line => line.trim())
        .map(line => {
          // Extract content from data: {"content": "..."} format
          const contentMatch = line.match(/data: {"content": "(.*)"}/);
          if (contentMatch && contentMatch[1]) {
            return contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
          }
          return line; // Keep the original line if it doesn't match the pattern
        })
        .join("");
      
      // Reconstruct the complete JSON object from chunks
      let reconstructedJson = "";
      
      // First, try to extract the complete JSON structure
      try {
        // Remove any non-JSON characters that might be at the beginning or end
        let jsonString = cleanedContent.trim();
        
        // Reconstruct the JSON object
        if (jsonString.includes('"function"')) {
          // This is likely a function call object
          reconstructedJson = '{"function": {';
          
          // Extract the name
          const nameMatch = jsonString.match(/"name":\s*"([^"]+)"/);
          if (nameMatch) {
            reconstructedJson += `"name": "${nameMatch[1]}"`;
          }
          
          // Extract arguments if present
          const argsMatch = jsonString.match(/"arguments":\s*(\{[^}]*\})/);
          if (argsMatch) {
            reconstructedJson += `, "arguments": ${argsMatch[1]}`;
          } else {
            reconstructedJson += ', "arguments": {}';
          }
          
          reconstructedJson += '}}';
          
          // Parse and stringify for formatting
          try {
            const jsonObj = JSON.parse(reconstructedJson);
            return JSON.stringify(jsonObj, null, 2);
          } catch (e) {
            console.warn("Failed to parse reconstructed JSON:", e);
            // If parsing fails, return the raw cleaned content
            return cleanedContent || jsonString;
          }
        }
        
        // If we couldn't reconstruct it with the approach above, try a more general approach
        if (!reconstructedJson) {
          // Look for key JSON patterns
          const functionMatch = jsonString.match(/"function"[\s\S]*?{[\s\S]*?}/);
          if (functionMatch) {
            reconstructedJson = `{${functionMatch[0]}}`;
            try {
              const jsonObj = JSON.parse(reconstructedJson);
              return JSON.stringify(jsonObj, null, 2);
            } catch (e) {
              console.warn("Failed to parse reconstructed JSON:", e);
              // If parsing fails, return the raw cleaned content
              return cleanedContent || jsonString;
            }
          }
        }
        
        // If all else fails, return the cleaned content
        return cleanedContent || "Function call content could not be parsed";
      } catch (e) {
        console.warn("Failed to reconstruct JSON:", e);
        // Return the raw cleaned content if reconstruction fails
        return cleanedContent || "Function call content could not be parsed";
      }
    } catch (e) {
      console.error("Error formatting function call:", e);
      // Return the raw content if all else fails
      return rawContent || "Function call content could not be displayed";
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge
          variant="secondary"
          className={cn(
            "max-w-max text-sm py-1.5 bg-purple-700 hover:bg-purple-800 text-white",
            tool.functionCall ? "cursor-pointer" : "cursor-default"
          )}
          onClick={() => {
            if (tool.functionCall) {
              onToggleExpand();
            }
          }}
        >
          <span className="flex items-center gap-1 font-mono">
            {tool.status === "preparing" && `Preparing ${tool.name} tool...`}
            {tool.status === "calling" && `Calling ${tool.name} tool...`}
            {tool.status === "completed" && `Used ${tool.name} tool`}
            {tool.status === "completed" && tool.functionCall && (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            )}
          </span>
        </Badge>
      </div>

      {isExpanded && tool.functionCall && (
        <div className="flex flex-col gap-3 bg-zinc-800/50 border border-zinc-700/50 p-4 rounded-lg overflow-x-auto">
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
              {formatFunctionCall(tool.functionCall) || "No function call content available"}
            </pre>
          </div>
          {tool.response && (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-emerald-300 font-medium flex items-center gap-2">
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
                Response
              </div>
              <pre className="text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800">
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
}: ChatMessagesProps) {
  // Log all messages for debugging
  

  // Filter out tool result messages that are hidden and messages marked as hidden
  const visibleMessages = messages.filter(
    (m) => !m.toolResult && !m.isHidden
  );

  return (
    <div className="flex flex-col gap-3">
      {visibleMessages.map((message) => {
 
        
        return (
          <div key={message.id} className="flex flex-col gap-3">
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
                      content={cleanToolCalls(message.content)}
                      className="prose prose-invert max-w-none"
                    />
                   
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
              </div>
            </Message>
            
            {message.processingTool && (
              <div className="flex flex-col gap-2 pl-14">
                <ToolResult
                  tool={message.processingTool}
                  isExpanded={expandedTools[message.id]}
                  onToggleExpand={() => onToggleToolExpand(message.id)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
