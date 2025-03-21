import * as React from "react";
import { SetupStep } from "./types";
import { NashLogo } from "./NashLogo";

interface HeaderProps {
  onNavigate: (step: SetupStep) => void;
  currentStep: SetupStep;
}

interface NavButtonProps {
  step: SetupStep;
  label: string;
  currentStep: SetupStep;
  onNavigate: (step: SetupStep) => void;
}

const NavButton: React.FC<NavButtonProps> = ({ step, label, currentStep, onNavigate }) => (
  <button
    onClick={() => onNavigate(step)}
    className={`transition-colors pt-1 border-b-2 ${
      currentStep === step
        ? "text-white border-white"
        : "text-nash-text-secondary hover:text-nash-text border-transparent"
    }`}
  >
    {label}
  </button>
);

const NAV_ITEMS: Array<{ step: SetupStep; label: string }> = [
  { step: SetupStep.Home, label: "Home" },
  { step: SetupStep.Tasks, label: "Tasks" },
  // { step: SetupStep.Tools, label: "Tool" },
  { step: SetupStep.Secrets, label: "Secrets" },
  { step: SetupStep.Services, label: "Apps" },
  { step: SetupStep.Models, label: "Models" },
  { step: SetupStep.Chat, label: "Chat" },
];

export function Header({
  onNavigate,
  currentStep,
}: HeaderProps): React.ReactElement {
  return (
    <nav className="sticky top-0 z-50 bg-nash-bg border-b border-nash-border px-6 py-4 pt-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <button onClick={() => onNavigate(SetupStep.Home)}>
            <NashLogo
              size={16}
              variant="clipped"
              className="translate-y-[4px]"
            />
          </button>
          <div className="flex items-center space-x-4">
            {NAV_ITEMS.map(({ step, label }) => (
              <NavButton
                key={step}
                step={step}
                label={label}
                currentStep={currentStep}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Header;
