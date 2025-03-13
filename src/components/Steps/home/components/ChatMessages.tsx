import * as React from "react";
import { cn } from "../../../../lib/utils";
import { ChatMessage } from "../types";
import { Message, MessageContent } from "../../../ui/message";
import { Avatar } from "../../../ui/avatar";
import { Badge } from "../../../ui/badge";
import { User, ChevronRight, ChevronDown } from "lucide-react";
import nashLogoWhite from "../../../../../public/nash-logo-white.svg";

interface ChatMessagesProps {
  messages: ChatMessage[];
  expandedTools: Record<string, boolean>;
  onToggleToolExpand: (messageId: string) => void;
}

export function ChatMessages({
  messages,
  expandedTools,
  onToggleToolExpand,
}: ChatMessagesProps) {
  return (
    <>
      {messages.map((message) => (
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
            <MessageContent
              className={cn(
                "rounded-lg px-3 py-2 break-words max-w-max",
                message.role === "user"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-100"
              )}
            >
              {message.role === "assistant" && message.isStreaming && !message.content 
                ? "Thinking..." 
                : message.content}
            </MessageContent>
          </Message>
          {message.processingTool && (
            <div className="flex flex-col gap-2 pl-12">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    "max-w-max text-sm py-1.5 bg-purple-700 hover:bg-purple-800 text-white",
                    message.processingTool?.functionCall
                      ? "cursor-pointer"
                      : "cursor-default"
                  )}
                  onClick={() => {
                    if (message.processingTool?.functionCall) {
                      onToggleToolExpand(message.id);
                    }
                  }}
                >
                  <span className="flex items-center gap-1 font-mono">
                    {message.processingTool.status === "preparing" &&
                      `Preparing ${message.processingTool.name}...`}
                    {message.processingTool.status === "calling" &&
                      `Calling ${message.processingTool.name}...`}
                    {message.processingTool.status === "completed" &&
                      `Used ${message.processingTool.name}`}
                    {message.processingTool.status === "completed" &&
                      message.processingTool.functionCall &&
                      (expandedTools[message.id] ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      ))}
                  </span>
                </Badge>
              </div>
              {expandedTools[message.id] &&
                message.processingTool.functionCall && (
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
                        {message.processingTool.functionCall}
                      </pre>
                    </div>
                    {message.processingTool.response && (
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
    </>
  );
}
