import * as React from "react";
import { Service, SetupStep } from "../types";
import { Header } from "../Header";
import defaultIcon from "../../../public/services/default.png";
import claudeIcon from "../../../public/services/claude.png";
import cursorIcon from "../../../public/services/cursor.jpg";
import windsurfIcon from "../../../public/services/windsurf.png";

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
  const [services, setServices] = React.useState(initialServices);

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
          </div>
        </div>
      </div>
    </div>
  );
}
