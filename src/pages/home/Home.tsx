import * as React from "react";
import { Header } from "../../components/Header";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "../../components/ui/prompt-input";
import { Button } from "../../components/ui/button";
import { ArrowUp, Edit, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ChatContainer } from "../../components/ui/chat-container";
import { v4 as uuidv4 } from "uuid";
import { ModelSelector } from "./components/ModelSelector";
import { ChatMessages } from "./components/ChatMessages";
import { ConfigAlerts } from "./components/ConfigAlerts";
import { ALL_MODELS } from "../../constants";
import { useChatInteraction } from "./hooks/useChatInteraction";
import { ChatState, ChatProps, ConfigAlert, Page } from "../../types";

export function Home({
  onNavigate,
  chatState,
  selectedModel,
  setSelectedModel,
}: ChatProps): React.ReactElement {
  const [input, setInput] = useState("");
  const [configAlerts, setConfigAlerts] = useState<ConfigAlert[]>([]);
  const [generalErrors, setGeneralErrors] = useState<ConfigAlert[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(
    new Set()
  );
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Add a function to handle errors from chat interactions
  const addGeneralError = (message: string) => {
    const id = uuidv4();

    // Check if it's a critical error like connection issues
    const isCriticalError = message.includes("Connection error");

    setGeneralErrors((prev) => [
      ...prev,
      {
        id,
        type: "error",
        message,
        dismissible: true,
        // Only auto-dismiss non-critical errors
        timeout: isCriticalError ? undefined : 8000,
      },
    ]);
  };

  // Initialize chat interaction with the provided chat state
  const { handleSubmit, isSubmitting, tokenInfo } =
    useChatInteraction(
      selectedModel || "",
      chatState as ChatState,
      addGeneralError
    );

  // Handle dismissing general errors
  const handleDismissError = (id: string) => {
    setGeneralErrors((prev) => prev.filter((error) => error.id !== id));
  };

  // Create a more robust focus function
  const focusTextarea = React.useCallback(() => {
    // Use requestAnimationFrame to ensure focus happens after browser paint
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    });
  }, []);

  // Focus textarea on initial load and component mounting
  useEffect(() => {
    // First attempt: after component mounts
    focusTextarea();

    // Second attempt: with a delay to ensure rendering is complete
    const timer = setTimeout(focusTextarea, 200);

    // Third attempt: with a longer delay as fallback
    const longTimer = setTimeout(focusTextarea, 500);

    // Add window focus event listener to handle focus when returning to tab
    const handleWindowFocus = () => {
      focusTextarea();
    };

    window.addEventListener("focus", handleWindowFocus);

    // Setup a MutationObserver to detect when the textarea is added to the DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // If any nodes were added, try to focus the textarea
          focusTextarea();
        }
      }
    });

    // Start observing the document body for added nodes
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      clearTimeout(longTimer);
      window.removeEventListener("focus", handleWindowFocus);
      observer.disconnect();
    };
  }, [focusTextarea]);

  // Focus textarea when isSubmitting changes from true to false
  useEffect(() => {
    if (!isSubmitting && textareaRef.current) {
      focusTextarea();
    }
  }, [isSubmitting, focusTextarea]);

  // Load configured providers on mount
  useEffect(() => {
    const loadConfiguredProviders = async () => {
      try {
        const keys = await window.electron.getKeys();
        const providers = new Set(keys.map((k) => k.provider));
        setConfiguredProviders(providers);

        if (!selectedModel) {
          if (providers.has("anthropic")) {
            setSelectedModel("claude-3-7-sonnet-latest");
          } else if (providers.has("openai")) {
            setSelectedModel("o3-mini");
          }
        }

        if (providers.size === 0) {
          setConfigAlerts([
            {
              type: "error",
              message: "",
              link: {
                text: "Add API key",
                page: Page.Models,
              },
            },
          ]);
        }
      } catch (error) {
        console.error("[loadConfiguredProviders] Error:", error);
        setConfigAlerts([
          {
            type: "error",
            message: "Error checking configurations. Please try again.",
          },
        ]);
      }
    };
    loadConfiguredProviders();
  }, []);

  // Monitor selected model changes
  useEffect(() => {
    if (selectedModel) {
      const model = ALL_MODELS.find((m) => m.id === selectedModel);
      if (model) {
        const provider = model.provider;
        if (!configuredProviders.has(provider)) {
          setConfigAlerts([
            {
              type: "error",
              message: `${
                provider.charAt(0).toUpperCase() + provider.slice(1)
              } API key required. Please add your API key in the`,
              link: {
                text: "Models section",
                page: Page.Models,
              },
            },
          ]);
        } else {
          setConfigAlerts([]);
        }
      }
    }
  }, [selectedModel, configuredProviders]);

  // Handle new chat reset
  const handleNewChat = () => {
    chatState.clearMessages();
    setInput("");
    setGeneralErrors([]);

    // Focus the textarea after creating a new chat
    setTimeout(() => {
      focusTextarea();
    }, 0);
  };

  const handleSubmitAndClear = (input: string) => {
    if (input.trim()) {
      handleSubmit(input);
      setInput("");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentPage={Page.Home} />

      <ConfigAlerts alerts={configAlerts} onNavigate={onNavigate} />
      <ConfigAlerts
        alerts={generalErrors}
        onNavigate={onNavigate}
        onDismiss={handleDismissError}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="relative max-w-4xl mx-auto w-full pt-4 px-4">
          <div className="flex justify-between items-center pb-2">
            <div className="flex items-center space-x-2">
            </div>
            <Button
              variant="outline"
              onClick={handleNewChat}
              className="h-8 rounded-lg bg-transparent transition-all duration-300 disabled:text-gray-500 disabled:opacity-50 text-[13px] font-normal tracking-normal font-work-sans text-nash-text-secondary hover:text-nash-text"
              disabled={isSubmitting || chatState.messagesForUI.length === 0}
            >
              <Edit className="h-3.5 w-3.5 mr-1 opacity-70" />
              New chat
            </Button>
          </div>
        </div>
        <ChatContainer
          ref={chatContainerRef}
          className="flex-1 space-y-2 px-4 pt-4 max-w-4xl mx-auto w-full"
          autoScroll={true}
        >
          <ChatMessages
            messages={chatState.messagesForUI}
            expandedTools={chatState.expandedTools}
            onToggleToolExpand={chatState.toggleToolExpand}
          />
        </ChatContainer>

        <div className="p-4">
          <div className="max-w-4xl mx-auto">
            <PromptInput
              value={input}
              onValueChange={setInput}
              isLoading={isSubmitting}
              onSubmit={() => handleSubmitAndClear(input)}
            >
              <PromptInputTextarea
                ref={textareaRef}
                autoFocus={true}
                placeholder={
                  configuredProviders.size === 0
                    ? "Please add an API key to start chatting..."
                    : "Ask me anything..."
                }
                disabled={isSubmitting || configuredProviders.size === 0}
                className="!h-[100px] !rounded-md"
              />
              <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <ModelSelector
                    selectedModel={selectedModel}
                    onModelChange={setSelectedModel}
                    configuredProviders={configuredProviders}
                    onNavigate={onNavigate}
                  />
                </div>
                <div className="flex items-center gap-4">
                  {tokenInfo && (
                    <div className="text-sm text-gray-400 flex items-center">
                      <a 
                        href="https://docs.anthropic.com/en/api/rate-limits#rate-limit" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="ml-1 text-gray-400 hover:text-gray-600 leading-normal"
                      >
                     <span>{tokenInfo.used_tokens.toLocaleString()} token{tokenInfo.used_tokens === 1 ? "" : "s"}</span>
                        
                      </a>
                    </div>
                  )}

                  <PromptInputAction
                    tooltip={isSubmitting ? "Generating..." : "Send message"}
                  >
                    <Button
                      variant="default"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => handleSubmitAndClear(input)}
                      disabled={
                        (!input.trim() && !isSubmitting) ||
                        configuredProviders.size === 0 ||
                        !selectedModel ||
                        isSubmitting
                      }
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ArrowUp className="h-5 w-5" />
                      )}
                    </Button>
                  </PromptInputAction>
                </div>
              </PromptInputActions>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
