import * as React from "react";
import ReactMarkdown from "react-markdown";
import { NashLogo } from "../components/NashLogo";

interface InstallPageProps {
  onNext: () => void;
  onContinue: () => void;
}

function LoadingSpinner() {
  return (
    <div className="animate-spin rounded-full h-5 w-5 border-2 border-zinc-500 border-t-zinc-200" />
  );
}

export function InstallPage({
  onNext,
  onContinue,
}: InstallPageProps): React.ReactElement {
  const [isInstalling, setIsInstalling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = React.useState(false);
  const [canAcceptTerms, setCanAcceptTerms] = React.useState(false);
  const [termsContent, setTermsContent] = React.useState<string>('Loading terms and conditions...');
  const [isLoadingTerms, setIsLoadingTerms] = React.useState(true);
  const termsRef = React.useRef<HTMLDivElement>(null);

  // Fetch terms and conditions
  React.useEffect(() => {
    async function fetchTerms() {
      try {
        if (!window.electronAPI) {
          throw new Error('Electron API not available');
        }
        const text = await window.electronAPI.fetchTerms();
        setTermsContent(text);
      } catch (err) {
        console.error('Error fetching terms:', err);
        setError('Failed to load terms and conditions. Please try again later.');
      } finally {
        setIsLoadingTerms(false);
      }
    }

    fetchTerms();
  }, []);

  // Function to handle terms scroll
  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.target as HTMLDivElement;
    const isAtBottom =
      Math.abs(
        element.scrollHeight - element.clientHeight - element.scrollTop
      ) < 1;
    setCanAcceptTerms(isAtBottom);
  };

  // Function to check installation status
  const checkInstallation = React.useCallback(async () => {
    try {
      if (!window.electronAPI) {
        throw new Error("Electron API not available");
      }

      const isNashInstalled = await window.electronAPI.checkNashInstalled();

      if (isNashInstalled) {
        onNext(); // Move to next page if Nash is already installed
      }
    } catch (err) {
      console.error("Failed to check Nash installation:", err);
      setError(
        err instanceof Error ? err.message : "Failed to check Nash installation"
      );
    }
  }, [onNext]);

  // Initial check
  React.useEffect(() => {
    checkInstallation();
  }, [checkInstallation]);

  const handleInstall = async () => {
    try {
      setIsInstalling(true);
      setError(null);

      if (!window.electronAPI) {
        throw new Error("Electron API not available");
      }

      const result = await window.electronAPI.runInstall();

      if (result) {
        setIsSuccess(true);
      }
    } catch (err) {
      console.error("Installation failed:", err);
      setError(err instanceof Error ? err.message : "Installation failed");
    } finally {
      setIsInstalling(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-24 h-full">
        <div className="flex flex-col items-center justify-center gap-6">
          <h1 className="text-4xl font-bold text-zinc-200 text-center">
            Error occurred
          </h1>
          <p className="text-zinc-400 text-center max-w-md">
            Please try again. If the problem persists, please contact support.
          </p>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-24 h-full">
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-zinc-200 text-center">
            Installation Complete!
          </h1>
          <p className="text-zinc-400 text-center max-w-md">
            Nash MCP has been successfully installed on your system. You can now
            proceed to configure your apps.
          </p>
        </div>

        <button
          onClick={onContinue}
          className="px-4 py-2 text-zinc-200 border border-zinc-700 rounded-md hover:bg-zinc-800 hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900 h-[42px] whitespace-nowrap transition-colors"
        >
          Continue
        </button>
      </div>
    );
  }

  if (!hasAcceptedTerms) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 h-full max-w-3xl mx-auto px-4">
        <NashLogo className="animate-float" size={200} />
        <h2 className="text-2xl font-bold text-zinc-200 text-center">
          Terms and Conditions
        </h2>
        <div
          ref={termsRef}
          onScroll={handleTermsScroll}
          className="w-full h-[250px] overflow-y-auto bg-zinc-900/50 rounded-lg p-6 border border-zinc-800 text-zinc-300 text-sm prose prose-invert prose-sm max-w-none"
        >
          {isLoadingTerms ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : (
            <ReactMarkdown>{termsContent}</ReactMarkdown>
          )}
        </div>
        <div className="flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-500 text-xs text-center">
          {canAcceptTerms
            ? "By clicking 'Accept Terms & Continue', you agree to our Terms and Conditions"
            : "Please scroll to the bottom to accept the terms and conditions"}
        </p>
        <button
          onClick={() => setHasAcceptedTerms(true)}
          disabled={!canAcceptTerms}
          className={`px-6 py-3 text-nash-button-text justify-center flex items-center gap-3 rounded-md transition-colors ${
            canAcceptTerms
              ? "bg-nash-button hover:bg-nash-button-hover"
              : "bg-zinc-700 cursor-not-allowed opacity-50"
          }`}
          title={
            canAcceptTerms
              ? "Accept terms and conditions"
              : "Please read the entire terms and conditions"
          }
        >
          Accept Terms & Continue
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 h-full">
      <div className="flex flex-col items-center justify-center gap-3">
        <NashLogo className="animate-float" size={400} />
      </div>



      <button
        className={`px-6 py-3 text-nash-button-text justify-center flex items-center gap-3 bg-nash-button hover:bg-nash-button-hover rounded-md transition-colors ${
          isInstalling 
            ? "opacity-50 cursor-not-allowed"
            : ""
        }`}
        onClick={handleInstall}
        disabled={isInstalling}
      >
        {isInstalling ? (
          <>
            <LoadingSpinner />
            <span>Installing...</span>
          </>
        ) : (
          "Install Nash MCP"
        )}
      </button>
    </div>
  );
}
