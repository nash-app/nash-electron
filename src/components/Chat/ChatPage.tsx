import * as React from "react";
import { SetupStep } from "../types";
import { ChatMessages } from "./ChatMessages";
import { Button } from "../ui/button";
import { NashLLMMessage } from "../Steps/home/types";
import { Header } from "../Header";

interface ChatPageProps {
  onNavigate: (step: SetupStep) => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ onNavigate }) => {
  const [messages, setMessages] = React.useState<NashLLMMessage[]>([]);
  const [showMessages, setShowMessages] = React.useState(false);

  const loadFakeMessages = () => {
    const fakeMessages: NashLLMMessage[] = [
      {
        id: "5d853718-249b-4beb-930c-b163b5716cb0",
        role: "user",
        content: "what secrets do i have?",
        timestamp: new Date("2025-03-21T13:07:00.568Z"),
        isStreaming: false
      },
      {
        id: "aff6e870-1eaa-4302-9f87-c816e54990d4",
        role: "assistant",
        content: [
          {
            type: "text",
            tool_use_id: "toolu_01224E8zxDRFNDTZjt9ajYB5",
            content: "I'll check your secrets for you."
          },
          {
            type: "tool_use",
            tool_use_id: "toolu_01224E8zxDRFNDTZjt9ajYB5",
            name: "nash_secrets",
            input: {}
          }
        ],
        timestamp: new Date("2025-03-21T13:07:02.756Z"),
        isStreaming: true
      },
      {
        id: "b77e9c55-812d-48f1-9ab2-3298e4a4a1e7",
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_01224E8zxDRFNDTZjt9ajYB5",
            content: "{}\nNo secrets found in the environment."
          }
        ],
        timestamp: new Date("2025-03-21T13:07:03.756Z"),
        isStreaming: false
      },
      {
        id: "3c16a792-c145-4b7a-a541-6c98b4d811d2",
        role: "assistant",
        content: [
          {
            type: "text",
            tool_use_id: "toolu_01224E8zxDRFNDTZjt9ajYB5",
            content: "You currently don't have any secrets set up in your environment. Secrets are typically API keys, tokens, or other credentials that you might need for accessing various services."
          }
        ],
        timestamp: new Date("2025-03-21T13:07:04.756Z"),
        isStreaming: false
      },
      {
        id: "1c48f56e-8491-4311-b79c-6acc62e7c12a",
        role: "user",
        content: "thanks!",
        timestamp: new Date("2025-03-21T13:07:10.776Z"),
        isStreaming: false
      },
      {
        id: "d11d5023-4880-45bf-8221-acc21d4dd70d",
        role: "assistant",
        content: "You're welcome! If you need anything else, just let me know.",
        timestamp: new Date("2025-03-21T13:07:10.776Z"),
        isStreaming: true
      }
    ];

    setMessages(fakeMessages);
    setShowMessages(true);
  };

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentStep={SetupStep.Chat} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-screen-xl mx-auto px-6 py-6">
          <div className="space-y-6">
            {!showMessages ? (
              <div>
                <Button onClick={loadFakeMessages} size="lg">
                  Load Example Conversation
                </Button>
              </div>
            ) : (
                <ChatMessages messages={messages} /> 
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 