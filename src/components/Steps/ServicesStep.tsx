import * as React from "react";
import { Service, SetupStep } from "../types";
import { Header } from "../Header";
import defaultIcon from "../../../public/services/default.png";
import claudeIcon from "../../../public/services/claude.png";
import cursorIcon from "../../../public/services/cursor.jpg";
import windsurfIcon from "../../../public/services/windsurf.png";
import cursorMCP from "../../../public/cursor-mcp.png";

const iconMap = {
  Claude: claudeIcon,
  Cursor: cursorIcon,
  Windsurf: windsurfIcon,
};

interface ServicesStepProps {
  services: Service[];
  onAddService: (index: number) => void;
  onNavigate: (step: SetupStep) => void;
}

export function ServicesStep({
  services: initialServices,
  onAddService,
  onNavigate,
}: ServicesStepProps): React.ReactElement {
  const [showCursorCommand, setShowCursorCommand] = React.useState(false);
  const [hasCursor, setHasCursor] = React.useState(false);
  const [hasCopied, setHasCopied] = React.useState(false);
  const [services, setServices] = React.useState(initialServices);

  React.useEffect(() => {
    // Check if Cursor is installed
    const checkCursor = async () => {
      try {
        const result = await window.electron.checkCursorInstalled();
        setHasCursor(result);
      } catch (error) {
        console.error("Error checking Cursor installation:", error);
        setHasCursor(false);
      }
    };
    checkCursor();
  }, []);

  // Add polling for installed services
  React.useEffect(() => {
    const pollServices = async () => {
      try {
        const updatedServices = await window.electron.checkInstalledServices();
        setServices(updatedServices);
      } catch (error) {
        console.error("Error polling services:", error);
      }
    };

    // Initial check
    pollServices();

    // Set up polling interval
    const intervalId = setInterval(pollServices, 2000);

    // Cleanup on unmount
    return () => clearInterval(intervalId);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText("~/.nash/run_mcp.sh");
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 500);
  };

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentStep={SetupStep.Services} />

      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-3">
            {services.map((service, index) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-4 rounded-lg border border-nash-border bg-nash-bg/50 hover:bg-nash-bg transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-nash-bg-secondary rounded-xl flex items-center justify-center overflow-hidden">
                    <img
                      src={
                        iconMap[service.name as keyof typeof iconMap] ||
                        defaultIcon
                      }
                      alt={`${service.name} icon`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xl font-medium text-nash-text">
                    {service.name}
                  </span>
                </div>
                <div className="flex items-center">
                  {service.added ? (
                    <div className="flex items-center text-nash-text-secondary text-base">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 mr-2 text-nash-text-secondary"
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
                      <span className="font-medium">Added</span>
                    </div>
                  ) : (
                    <button
                      className="px-3 py-1.5 text-sm font-medium rounded-md
                        bg-nash-bg-secondary text-nash-text hover:bg-nash-bg-hover
                        transition-colors border border-nash-border/50"
                      onClick={() => onAddService(index)}
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Cursor Integration */}
            {hasCursor && (
              <div className="flex flex-col p-4 rounded-lg border border-nash-border bg-nash-bg/50 hover:bg-nash-bg transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 bg-nash-bg-secondary rounded-xl flex items-center justify-center overflow-hidden">
                      <img
                        src={cursorIcon}
                        alt="Cursor icon"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-xl font-medium text-nash-text">
                      Cursor
                    </span>
                  </div>
                  <button
                    className="px-3 py-1.5 text-sm font-medium rounded-md
                      bg-nash-bg-secondary text-nash-text hover:bg-nash-bg-hover
                      transition-colors border border-nash-border/50"
                    onClick={() => setShowCursorCommand(!showCursorCommand)}
                  >
                    {showCursorCommand ? "Hide" : "Add"}
                  </button>
                </div>

                {showCursorCommand && (
                  <div className="mt-4 p-4 bg-nash-bg-secondary rounded-md flex flex-col gap-4">
                    <div className="flex gap-2">
                      <ol className="list-decimal list-inside space-y-2 text-nash-text-secondary w-1/2">
                        <li>
                          Menu bar: Cursor → Settings... → Cursor Settings
                        </li>
                        <li>Navigate to the &quot;MCP&quot; tab</li>
                        <li>Click &quot;+ Add new MCP server&quot;</li>
                        <li>Enter &quot;Nash&quot; as the server name</li>
                        <li>Select &quot;Command&quot; as the type</li>
                        <li>Copy and paste the command below</li>

                        <div className="max-w-md">
                          <code className="flex items-center justify-between w-full font-mono rounded-md text-sm text-emerald-400 bg-nash-bg p-2">
                            <span>~/.nash/run_mcp.sh</span>
                            <button
                              className="ml-2 p-1 text-nash-text-secondary hover:text-nash-text transition-colors"
                              onClick={handleCopy}
                              title={
                                hasCopied ? "Copied!" : "Copy to clipboard"
                              }
                            >
                              {hasCopied ? (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4 text-emerald-500"
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
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                                  />
                                </svg>
                              )}
                            </button>
                          </code>
                        </div>

                        <li>Click &quot;Add&quot; to save</li>
                      </ol>

                      <div className="w-1/2">
                        <img
                          src={cursorMCP}
                          alt="Cursor MCP"
                          className="w-full max-w-md"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
