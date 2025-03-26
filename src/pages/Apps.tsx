import * as React from "react";
import { App, Page } from "../types";
import { Header } from "../components/Header";
import defaultIcon from "../../public/apps/default.png";
import claudeIcon from "../../public/apps/claude.png";
import cursorIcon from "../../public/apps/cursor.jpg";
import windsurfIcon from "../../public/apps/windsurf.png";

const iconMap = {
  Claude: claudeIcon,
  Cursor: cursorIcon,
  Windsurf: windsurfIcon,
};

interface AppsPageProps {
  apps: App[];
  onAddApp: (index: number) => void;
  onNavigate: (page: Page) => void;
}

export function AppsPage({
  apps: initialApps,
  onAddApp,
  onNavigate,
}: AppsPageProps): React.ReactElement {
  const [apps, setApps] = React.useState(initialApps);

  // Add polling for installed apps
  React.useEffect(() => {
    const pollApps = async () => {
      try {
        const updatedApps = await window.electron.checkInstalledApps();
        setApps(updatedApps);
      } catch (error) {
        console.error("Error polling apps:", error);
      }
    };

    // Initial check
    pollApps();

    // Set up polling interval
    const intervalId = setInterval(pollApps, 2000);

    // Cleanup on unmount
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentPage={Page.Apps} />

      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-3">
            {apps.map((app, index) => (
              <div
                key={app.name}
                className="flex items-center justify-between p-4 rounded-lg border border-nash-border bg-nash-bg/50 hover:bg-nash-bg transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-nash-bg-secondary rounded-xl flex items-center justify-center overflow-hidden">
                    <img
                      src={
                        iconMap[app.name as keyof typeof iconMap] ||
                        defaultIcon
                      }
                      alt={`${app.name} icon`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xl font-medium text-nash-text">
                    {app.name}
                  </span>
                </div>
                <div className="flex items-center">
                  {app.added ? (
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
                      onClick={() => onAddApp(index)}
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 