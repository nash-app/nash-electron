export interface StreamChunk {
  type:
    | "content"
    | "tool_name"
    | "tool_args"
    | "tool_result"
    | "new_raw_llm_messages"
    | "finish_reason"
    | "sleep_seconds";
  content: string | null;
  tool_name: string | null;
  tool_args: string | null;
  tool_result: string | null;
  new_raw_llm_messages: LLMMessage[] | null;
  finish_reason: string | null;
  sleep_seconds: number | null;
}

export interface StreamSnapshot {
  type: string | null;
  content: string | null;
  tool_name: string | null;
  tool_args: Record<string, any> | null;
  tool_result: string | null;
  new_raw_llm_messages: LLMMessage[] | null;
}

export interface NashLLMMessage extends LLMMessage {
  timestamp: Date;
  isStreaming: boolean;
}

export interface LLMMessage {
  id?: string;
  role: "user" | "assistant";
  content: string | (ToolUse | ToolResult | TextContent)[];
}

export interface ToolInputOutput {
  type: "tool_use" | "tool_result" | "text";
  tool_use_id: string;
  name?: string;
  input?: Record<string, any>;
  content?: string;
}

export interface ToolUse extends Omit<ToolInputOutput, "content"> {
  type: "tool_use";
  name: string;
  input: Record<string, any>;
}

export interface ToolResult extends Omit<ToolInputOutput, "name" | "input"> {
  type: "tool_result";
  content: string;
}

export interface TextContent extends Omit<ToolInputOutput, "name" | "input"> {
  type: "text";
  content: string;
}

export interface ChatMessageUI extends LLMMessage {
  timestamp: Date;
  isStreaming?: boolean;
  processingTool?: {
    name: string;
    status: "preparing" | "calling" | "completed"; // computer later
    functionCall?: string; // done
    response?: string; // dont currently get back from server, now come from message.content of type tool_result & that ones content is the response
  };
}

export interface ChatProps {
  onNavigate: (page: Page) => void;
  chatState?: ChatState;
  selectedModel?: string;
  setSelectedModel?: React.Dispatch<React.SetStateAction<string>>;
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
  headers?: Record<string, string>;
}

export interface ProviderModel {
  id: string;
  name: string;
  provider: string;
}

export interface ConfigAlert {
  type: "error";
  message: string;
  link?: {
    text: string;
    page: Page;
  };
  id?: string;
  dismissible?: boolean;
  timeout?: number;
  action?: {
    text: string;
    onClick: () => void;
  };
}

export interface TokenInfo {
  max_tokens: number;
  used_tokens: number;
  remaining_tokens: number;
  model: string;
  error?: string;
}
export enum Page {
  Install = "install",
  Apps = "apps",
  Secrets = "secrets",
  Tasks = "tasks",
  Home = "home",
  Models = "models",
}

export interface App {
  name: string;
  added: boolean;
}

export interface SetupState {
  hasInstalledNash: boolean;
  currentPage: Page;
  apps: App[];
  apiKey?: string;
  secretToken?: string;
}

export interface Script {
  name: string;
  type: string;
  description: string;
  code: string;
}

export interface Task {
  prompt: string;
  scripts?: Script[];
}

export interface Tasks {
  [key: string]: Task;
}

export interface ChatState {
  messagesForUI: NashLLMMessage[];
  messagesForLLM: LLMMessage[];
  sessionId: string | null;
  expandedTools: Record<string, boolean>;
  currentStreamSnapshot: {
    content: string | null;
    toolName: string | null;
    toolArgs: string | null;
    toolResult: string | null;
  };
  currentAssistantMessageIdRef: React.MutableRefObject<string | null>;
  toolUseIdRef: React.MutableRefObject<string | null>;
  setMessagesForUI: (
    messages: NashLLMMessage[] | ((prev: NashLLMMessage[]) => NashLLMMessage[])
  ) => void;
  setMessagesForLLM: (
    messages: LLMMessage[] | ((prev: LLMMessage[]) => LLMMessage[])
  ) => void;
  setSessionId: (id: string | null) => void;
  setCurrentStreamSnapshot: (snapshot: any | ((prev: any) => any)) => void;
  toggleToolExpand: (messageId: string) => void;
  clearMessages: () => void;
}
