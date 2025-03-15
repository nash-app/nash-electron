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
  // Enhanced function to format function call content
  const formatFunctionCall = (rawContent: string | undefined): string => {
    if (!rawContent) return "";
    
    console.log("Raw function call in UI:", rawContent);
    
    try {
      // First remove any tool call markers
      const contentWithoutMarkers = rawContent.replace(/<tool_call>|<\/tool_call>/g, "").trim();
      
      // Check if this is a streaming format with data: markers
      if (contentWithoutMarkers.includes("data:")) {
        console.log("Handling streaming format in UI");
        
        // Extract all content from data: {"content": "..."} format
        let combinedContent = "";
        
        // Process line by line
        const lines = contentWithoutMarkers.split('\n');
        for (const line of lines) {
          // Look for data: {"content": "..."} pattern
          const match = line.match(/data:\s*{"content":\s*"(.*)"\}/);
          if (match && match[1]) {
            // Extract just the content and unescape it
            let extracted = match[1]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            combinedContent += extracted;
          } else if (!line.includes('data: [DONE]')) {
            // Include non-data lines (but skip [DONE] markers)
            combinedContent += line;
          }
        }
        
        console.log("Extracted combined content:", combinedContent);
        
        // Clean up and manually reconstruct the function call JSON if needed
        if (combinedContent.includes('"function"') && combinedContent.includes('"name"')) {
          // Try to directly parse it first
          try {
            const parsed = JSON.parse(combinedContent);
            return JSON.stringify(parsed, null, 2);
          } catch (e) {
            console.log("Parsing combined content failed, trying to reconstruct function call");
            
            // Handle any case where we have name, whether function is present or not
            // This is more general and will work even if function key is completely missing
            const nameMatch = combinedContent.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch && nameMatch[1]) {
              console.log("Found tool name for reconstruction:", nameMatch[1]);
              
              // Try to extract arguments
              let toolArgs = {};
              
              try {
                // Try different regex patterns for arguments
                const argsPatterns = [
                  /"arguments"\s*:\s*(\{[^}]*\})/,  // Standard format
                  /"arguments"\s*:\s*(\{[\s\S]*?\}(?=\s*\}))/,  // Multi-line format
                  /"cmd"\s*:\s*"([^"]+)"/  // Direct cmd extraction
                ];
                
                for (const pattern of argsPatterns) {
                  const argsMatch = combinedContent.match(pattern);
                  if (argsMatch && argsMatch[1]) {
                    if (pattern.toString().includes("cmd")) {
                      // For direct cmd extraction, create the arguments object
                      toolArgs = { cmd: argsMatch[1] };
                      console.log("Extracted cmd directly:", argsMatch[1]);
                      break;
                    } else {
                      // For JSON objects, parse them
                      try {
                        toolArgs = JSON.parse(argsMatch[1]);
                        console.log("Parsed arguments:", toolArgs);
                        break;
                      } catch (e) {
                        console.log("Failed to parse args match:", argsMatch[1]);
                      }
                    }
                  }
                }
              } catch (e) {
                console.log("Error extracting arguments:", e);
              }
              
              // Build a complete function call object
              const functionObj = {
                function: {
                  name: nameMatch[1],
                  arguments: toolArgs
                }
              };
              
              console.log("Reconstructed function object:", functionObj);
              return JSON.stringify(functionObj, null, 2);
            }
            
            // If we failed to reconstruct, fallback to what we have
            return combinedContent;
          }
        }
        
        // If no function key detected, try to detect JSON and pretty print
        try {
          // Find JSON start
          const jsonStart = combinedContent.indexOf('{');
          if (jsonStart >= 0) {
            // Try to clean the JSON by starting from the first {
            const cleanedJson = combinedContent.substring(jsonStart);
            const parsed = JSON.parse(cleanedJson);
            return JSON.stringify(parsed, null, 2);
          }
        } catch (e) {
          // Not valid JSON, return as-is
          return combinedContent;
        }
        
        // Return combined content if nothing else worked
        return combinedContent;
      } else {
        // For non-streaming format, clean and try to format as JSON
        const cleaned = contentWithoutMarkers
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .trim();
        
        try {
          // Handle any content that contains a name attribute (more general)
          if (cleaned.includes('"name"')) {
            const nameMatch = cleaned.match(/"name"\s*:\s*"([^"]+)"/);
            
            if (nameMatch && nameMatch[1]) {
              console.log("Found tool name in non-streaming content:", nameMatch[1]);
              
              // Try to extract arguments using multiple patterns
              let toolArgs = {};
              
              try {
                // Try different regex patterns for arguments
                const argsPatterns = [
                  /"arguments"\s*:\s*(\{[^}]*\})/,  // Standard format
                  /"arguments"\s*:\s*(\{[\s\S]*?\}(?=\s*\}))/,  // Multi-line format
                  /"cmd"\s*:\s*"([^"]+)"/  // Direct cmd extraction
                ];
                
                for (const pattern of argsPatterns) {
                  const argsMatch = cleaned.match(pattern);
                  if (argsMatch && argsMatch[1]) {
                    if (pattern.toString().includes("cmd")) {
                      // For direct cmd extraction, create the arguments object
                      toolArgs = { cmd: argsMatch[1] };
                      console.log("Extracted cmd directly from non-streaming:", argsMatch[1]);
                      break;
                    } else {
                      // For JSON objects, parse them
                      try {
                        toolArgs = JSON.parse(argsMatch[1]);
                        console.log("Parsed arguments from non-streaming:", toolArgs);
                        break;
                      } catch (e) {
                        console.log("Failed to parse args match in non-streaming:", argsMatch[1]);
                      }
                    }
                  }
                }
              } catch (e) {
                console.log("Error extracting arguments from non-streaming:", e);
              }
              
              // Only reconstruct if function key is missing
              if (!cleaned.includes('"function"')) {
                // Reconstruct a proper function call object
                const functionObj = {
                  function: {
                    name: nameMatch[1],
                    arguments: toolArgs
                  }
                };
                
                console.log("Reconstructed function object for non-streaming:", functionObj);
                return JSON.stringify(functionObj, null, 2);
              }
            }
          }
          
          // Try standard JSON parsing
          const parsed = JSON.parse(cleaned);
          return JSON.stringify(parsed, null, 2);
        } catch (e) {
          console.log("Error parsing cleaned content:", e);
          
          // Try to find and extract any JSON-like structure
          const jsonStart = cleaned.indexOf('{');
          if (jsonStart >= 0) {
            try {
              // Extract everything from the first { to end
              const jsonPart = cleaned.substring(jsonStart);
              const parsed = JSON.parse(jsonPart);
              return JSON.stringify(parsed, null, 2);
            } catch (jsonError) {
              // If all parsing fails, return as-is
              return cleaned;
            }
          }
          
          return cleaned;
        }
      }
    } catch (e) {
      console.error("Error formatting function call:", e);
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
              {(() => {
                // Extract text content from the response if it's in the expected format
                try {
                  if (tool.response) {
                    const responseObj = JSON.parse(tool.response);
                    if (responseObj.result?.content?.[0]?.type === "text" && 
                        responseObj.result.content[0].text) {
                      // If we have the expected format, display the text with preserved newlines
                      return (
                        <div className="text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto text-zinc-300 border border-zinc-800 whitespace-pre-wrap font-mono">
                          {responseObj.result.content[0].text}
                        </div>
                      );
                    }
                  }
                } catch (e) {
                  console.warn("Failed to parse tool response:", e);
                }
                
                // Fallback to displaying the raw response if parsing fails
                return (
                  <pre className="text-sm bg-zinc-900/50 p-3 rounded-md overflow-x-auto font-mono text-zinc-300 border border-zinc-800">
                    {tool.response}
                  </pre>
                );
              })()}
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
      return `I'm using the ${toolName} tool to get information for you...`;
    }

    // Fallback to simpler name extraction
    const simpleMatch = toolCallContent.match(/"name"\s*:\s*"([^"]+)"/);
    if (simpleMatch && simpleMatch[1]) {
      return `I'm using the ${simpleMatch[1]} tool to get information for you...`;
    }

    // Generic message when we can't extract a specific tool name
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
  // Use effect for logging to avoid JSX issues
  
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
