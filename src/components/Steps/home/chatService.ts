import { ChatMessage } from "./types";
import { 
  NASH_LOCAL_SERVER_CHAT_ENDPOINT,  
} from "../../../constants";
import { logMessageHistory, getProviderConfig } from "./utils";

/**
 * Stream completion from the local server
 * @param messages - Chat messages to send
 * @param sessionId - Session ID for continuing a conversation
 * @param signal - AbortController signal for cancellation
 * @param onChunk - Callback for handling each chunk received
 * @param modelId - Selected model ID
 * @param setMessages - Function to update message state
 */
export const streamCompletion = async (
  messages: ChatMessage[],
  sessionId: string | null,
  signal: AbortSignal,
  onChunk: (chunk: string, newSessionId?: string) => void,
  modelId: string,
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
) => {
  try {
    logMessageHistory(messages, "streamCompletion - start");
    
    // Get provider configuration for the selected model
    const providerConfig = await getProviderConfig(modelId);
    
    // Prepare messages for the API (strip internal properties)
    const preparedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Prepare request payload
    const payload = {
      messages: preparedMessages,
      model: modelId,
      api_key: providerConfig.key,
      api_base_url: providerConfig.baseUrl,
      provider: providerConfig.provider
    };
    
    // Add session ID if one exists
    if (sessionId) {
      Object.assign(payload, { session_id: sessionId });
    }
    
    console.log("[streamCompletion] Sending request to server with payload:", {
      ...payload,
      api_key: "[REDACTED]", // Don't log API key
    });
    
    // Make the request to the server
    const response = await fetch(NASH_LOCAL_SERVER_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response reader");
    }
    
    let partialLine = "";
    
    // Process the streaming response
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log("[streamCompletion] Stream complete");
        break;
      }
      
      // Decode the received data
      const chunk = new TextDecoder().decode(value);
      const lines = (partialLine + chunk).split("\n");
      partialLine = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) {
          continue;
        }
        
        const data = line.substring(6);
        
        // Check for the end of stream marker
        if (data === "[DONE]") {
          console.log("[streamCompletion] Received [DONE] marker");
          // Update UI to reflect end of streaming
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.isStreaming) {
              lastMessage.isStreaming = false;
            }
            return newMessages;
          });
          continue;
        }
        
        try {
          const event = JSON.parse(data);
          
          // Check for session ID
          if (event.session_id) {
            console.log("[streamCompletion] Received session ID:", event.session_id);
            onChunk("", event.session_id);
          }
          
          // Handle content chunks
          if (event.content) {
            onChunk(event.content);
          }
          
          // Handle tool calls by updating UI, but don't make API requests
          if (event.tool_calls && event.tool_calls.length > 0) {
            console.log("[streamCompletion] Received tool call:", event.tool_calls);
            
            const toolCall = event.tool_calls[0];
            
            // Update UI to show tool call
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              
              if (lastMessage) {
                lastMessage.processingTool = {
                  name: toolCall.function.name,
                  status: "completed", // We're not making the actual API call
                  functionCall: JSON.stringify(toolCall, null, 2),
                  response: JSON.stringify({ 
                    message: "Tool execution is handled by the server-side" 
                  }, null, 2)
                };
              }
              
              return newMessages;
            });
          }
          
          // Log other events for debugging
          if (event.executing_tool) {
            console.log("[streamCompletion] Executing tool:", event.executing_tool);
          }
          
          if (event.tool_result) {
            console.log("[streamCompletion] Tool result:", event.tool_result);
            
            // If we receive a tool result, update the UI to show it
            if (event.tool_result.name && event.tool_result.content) {
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                
                if (lastMessage?.processingTool) {
                  lastMessage.processingTool = {
                    ...lastMessage.processingTool,
                    status: "completed",
                    response: JSON.stringify(event.tool_result.content, null, 2)
                  };
                }
                
                return newMessages;
              });
            }
          }
        } catch (error) {
          console.error("[streamCompletion] Error parsing event data:", error, data);
        }
      }
    }
  } catch (error) {
    console.error("[streamCompletion] Stream error:", error);
    
    // Rethrow the error unless it's an abort error that was already handled
    if (error instanceof Error && error.name === "AbortError") {
      console.log("[streamCompletion] Request was aborted");
    } else {
      throw error;
    }
  }
}; 