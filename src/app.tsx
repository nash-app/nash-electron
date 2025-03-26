// # src/app.tsx
import "./index.css"; // import css
import * as React from "react";
import { createRoot } from "react-dom/client";
import { InstallPage } from "./pages/Install";
import { AppsPage } from "./pages/Apps";
import { SecretsPage } from "./pages/Secrets";
import { TaskPage } from "./pages/Tasks";
import { Home } from "./pages/home/Home";
import { Models } from "./pages/Models";
import { ChatState, Page, LLMMessage, NashLLMMessage } from "./types";
import { DragHandle } from "./components/DragHandle";
import { useCallback, useRef } from "react";



const App: React.FC = () => {
  const [hasInstalledNash, setHasInstalledNash] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(Page.Install);
  const [apps, setApps] = React.useState<
    Array<{ name: string; added: boolean }>
  >([]);
  
  // Chat state that needs to persist across tabs
  const [messagesForUI, setMessagesForUI] = React.useState<NashLLMMessage[]>([]);
  const [messagesForLLM, setMessagesForLLM] = React.useState<LLMMessage[]>([]);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [expandedTools, setExpandedTools] = React.useState<Record<string, boolean>>({});
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const currentAssistantMessageIdRef = useRef<string | null>(null);
  const toolUseIdRef = useRef<string | null>(null);
  const [currentStreamSnapshot, setCurrentStreamSnapshot] = React.useState<{
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

  // Create chat state object to pass down
  const chatState: ChatState = {
    messagesForUI,
    messagesForLLM,
    sessionId,
    expandedTools,
    currentStreamSnapshot,
    currentAssistantMessageIdRef,
    toolUseIdRef,
    setMessagesForUI,
    setMessagesForLLM,
    setSessionId,
    setCurrentStreamSnapshot,
    toggleToolExpand,
    clearMessages,
  };

  React.useEffect(() => {
    const checkInitialState = async () => {
      try {
        const isInstalled = await window.electronAPI.checkNashInstalled();

        if (isInstalled) {
          setHasInstalledNash(true);
          setCurrentPage(Page.Home);
        }
      } catch (error) {
        console.error("Error checking Nash installation:", error);
      }
      const installedApps = await window.electron.checkInstalledApps();
      setApps(installedApps);
    };
    checkInitialState();
  }, []);

  const handleAddApp = async (index: number) => {
    try {
      const app = apps[index];
      const success = await window.electron.configureMcp(app.name);
      if (success) {
        const updatedApps = [...apps];
        updatedApps[index].added = true;
        setApps(updatedApps);
        // Navigate to home if this is the first app added
        if (!updatedApps.some((s) => s.added)) {
          setCurrentPage(Page.Home);
        }
      } else {
        console.error("Failed to configure MCP server");
      }
    } catch (error) {
      console.error("Error configuring app:", error);
    }
  };

  const handleHasInstalledNash = () => {
    setHasInstalledNash(true);
  };

  const handleContinue = () => {
    setCurrentPage(Page.Apps);
  };

  const handleNavigate = (page: Page) => {
    setCurrentPage(page);
  };

  const renderPage = () => {
    // If Nash is not installed, show the install page
    if (!hasInstalledNash) {
      return (
        <InstallPage
          onNext={handleHasInstalledNash}
          onContinue={handleContinue}
        />
      );
    }

    // If Nash is installed, proceed with the setup flow
    switch (currentPage) {
      case Page.Apps:
        return (
          <AppsPage
            apps={apps}
            onAddApp={handleAddApp}
            onNavigate={handleNavigate}
          />
        );

      case Page.Secrets:
        return <SecretsPage onNavigate={handleNavigate} />;

      case Page.Tasks:
        return <TaskPage onNavigate={handleNavigate} />;

      case Page.Home:
        return (
          <Home 
            onNavigate={handleNavigate} 
            chatState={chatState} 
            selectedModel={selectedModel} 
            setSelectedModel={setSelectedModel} 
          />
        );

      case Page.Models:
        return <Models onNavigate={handleNavigate} />;

      default:
        return (
          <Home 
            onNavigate={handleNavigate} 
            chatState={chatState} 
            selectedModel={selectedModel} 
            setSelectedModel={setSelectedModel} 
          />
        );
    }
  };

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <DragHandle />
      <div className="flex-1 overflow-auto">{renderPage()}</div>
    </div>
  );
};

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
