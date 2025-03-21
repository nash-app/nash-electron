import { SetupStep } from "../../types";

export interface StreamChunk {
  type: string; // may kill
  content: string;
  tool_name: string;
  tool_args: string;
  tool_result: string;
  new_raw_llm_messages: string; // "[role: user, "
}

export interface StreamSnapshot {
  // -------TO CHECK FOR AND RENDER -----------
  type: string | null; // may kill
  content: string | null;
  tool_name: string | null; // if {some state} then i know can render?
  tool_args: Record<string, any> | null; 
  tool_result: string | null;
  // -------- TO SEND TO SERVER --------------
  new_raw_llm_messages: LLMMessage[] | null;
}

// setMessagesForUi 
// setMessagesForServer 

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
  input?: Record<string, any>; // only when tool_use not tool_result
  content?: string; // only when tool_result
}

export interface ToolUse extends Omit<ToolInputOutput, 'content'> {
  type: "tool_use";
  name: string;
  input: Record<string, any>;
}

export interface ToolResult extends Omit<ToolInputOutput, 'name' | 'input'> {
  type: "tool_result";
  content: string;
}

export interface TextContent extends Omit<ToolInputOutput, 'name' | 'input'> {
  type: "text";
  content: string;
}

// 2 types: tool use & tool result
// tool use:
// {
//   "type": "tool_use",
//   "name": "nash_secrets",
//   "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
//   "input": "{}"
// }  

// tool result:
// {
//   "type": "tool_result",
//   "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
//   "content": "15 degrees"
// }


//* when tool_result is called it wont have a name

// pure react component <ChatMessages messages={messages} /> & .map(message => <ChatMessage message={message} />)
// 

// ONE MESSAGE WITH MULITPLE (2) CONTENT ARRAY OBJECTS
// 1) "im going to use this tool...." === message.content of type "text" 
// 2) next wil be message.content of type tool_use & that (look below)

// message.processingTool.functionCall example:
// {
//   "id": "toolu_016YNtyfZyPYzj8x7wKXzLiG", // becomes tool_use_id
//   "function": {
//     "name": "nash_secrets",
//     "arguments": "{}" // becomes input
//   }
// }

// when i get a result itll always be 1: 
// {
//   "role": "user",
//   "content": [
//     {
//       "type": "tool_result",
//       "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
//       "content": "15 degrees"
//     }
//   ]
// }

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
