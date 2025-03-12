import * as React from "react";
import { SetupStep } from "./types";
import { NashLogo } from "./NashLogo";

interface HeaderProps {
  onNavigate: (step: SetupStep) => void;
  currentStep: SetupStep;
}

export function Header({
  onNavigate,
  currentStep,
}: HeaderProps): React.ReactElement {
  return (
    <nav className="sticky top-0 z-50 bg-nash-bg border-b border-nash-border px-6 py-4 pt-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <button onClick={() => onNavigate(SetupStep.Tasks)}>
            <NashLogo
              size={16}
              variant="clipped"
              className="translate-y-[4px]"
            />
          </button>
          <div className="flex items-center space-x-4">
            {/* <button
              onClick={() => onNavigate(SetupStep.Home)}
              className={`transition-colors pt-1 border-b-2 ${
                currentStep === SetupStep.Home
                  ? "text-white border-white"
                  : "text-nash-text-secondary hover:text-nash-text border-transparent"
              }`}
            >
              Home
            </button> */}
            <button
              onClick={() => onNavigate(SetupStep.Tasks)}
              className={`transition-colors pt-1 border-b-2 ${
                currentStep === SetupStep.Tasks
                  ? "text-white border-white"
                  : "text-nash-text-secondary hover:text-nash-text border-transparent"
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => onNavigate(SetupStep.Secrets)}
              className={`transition-colors pt-1 border-b-2 ${
                currentStep === SetupStep.Secrets
                  ? "text-white border-white"
                  : "text-nash-text-secondary hover:text-nash-text border-transparent"
              }`}
            >
              Secrets
            </button>
            <button
              onClick={() => onNavigate(SetupStep.Services)}
              className={`transition-colors pt-1 border-b-2 ${
                currentStep === SetupStep.Services
                  ? "text-white border-white"
                  : "text-nash-text-secondary hover:text-nash-text border-transparent"
              }`}
            >
              Apps
            </button>
            {/* <button
              onClick={() => onNavigate(SetupStep.Models)}
              className={`transition-colors pt-1 border-b-2 ${
                currentStep === SetupStep.Models
                  ? "text-white border-white"
                  : "text-nash-text-secondary hover:text-nash-text border-transparent"
              }`}
            >
              Models
            </button> */}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Header;
