import { SetupStep } from "../../types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isError?: boolean;
  isToolResult?: boolean;
  isHidden?: boolean;
  toolResult?: {
    toolName: string;
    result: string;
  };
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

// Python-style tool call for compatibility with python server
export interface ToolCall {
  tool_name: string;
  arguments: Record<string, any>;
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

// Response from local server for summarizing conversations
export interface SummarizeResponse {
  success: boolean;
  summary?: string;
  session_id?: string;
  error?: string;
  token_reduction?: {
    before: number;
    after: number;
  };
}
