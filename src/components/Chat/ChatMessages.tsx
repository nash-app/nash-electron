import * as React from "react";
import { NashLLMMessage } from "../Steps/home/types";
import { ChatMessage } from "./ChatMessage";

interface ChatMessagesProps {
  messages: NashLLMMessage[];
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({ messages }) => {
  return (
    <div className="flex flex-col space-y-4 max-w-4xl mx-auto py-4">
      {messages.map((message) => (
        <ChatMessage 
          key={message.id} 
          message={message} 
        />
      ))}
    </div>
  );
}; 