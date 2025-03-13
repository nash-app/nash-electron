import { SetupStep } from "../../types";

export interface ChatMessage {
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

export interface ChatProps {
  onNavigate: (step: SetupStep) => void;
}

export interface FunctionCall {
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

export interface ModelConfig {
  provider: string;
  baseUrl?: string;
  selectedModel?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  provider: string;
}

export interface ConfigAlert {
  type: "error" | "warning";
  message: string;
  link?: {
    text: string;
    step: SetupStep;
  };
}
