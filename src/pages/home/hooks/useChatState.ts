import { useState, useCallback, useRef } from "react";
import { LLMMessage, NashLLMMessage } from "../../../types";

export const useChatState = () => {
  const [messagesForUI, setMessagesForUI] = useState<NashLLMMessage[]>([]);
  const [messagesForLLM, setMessagesForLLM] = useState<LLMMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );
  const currentAssistantMessageIdRef = useRef<string | null>(null);
  const toolUseIdRef = useRef<string | null>(null);
  const [currentStreamSnapshot, setCurrentStreamSnapshot] = useState<{
    content: string | null;
    toolName: string | null;
    toolArgs: string | null;
    toolResult: string | null;
  }>({
    content: null,
    toolName: null,
    toolArgs: null,
    toolResult: null,
  });

  const toggleToolExpand = useCallback((messageId: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessagesForUI([]);
    setMessagesForLLM([]);
    setSessionId(null);
    currentAssistantMessageIdRef.current = null;
    toolUseIdRef.current = null;
    setCurrentStreamSnapshot({
      content: null,
      toolName: null,
      toolArgs: null,
      toolResult: null,
    });
  }, []);

  return {
    messagesForUI,
    setMessagesForUI,
    messagesForLLM,
    setMessagesForLLM,
    sessionId,
    setSessionId,
    expandedTools,
    currentStreamSnapshot,
    setCurrentStreamSnapshot,
    currentAssistantMessageIdRef,
    toolUseIdRef,
    toggleToolExpand,
    clearMessages,
  };
};
