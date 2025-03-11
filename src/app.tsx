// # src/app.tsx
import "./index.css"; // import css
import * as React from "react";
import { createRoot } from "react-dom/client";
import { InstallStep } from "./components/Steps/InstallStep";
import { ServicesStep } from "./components/Steps/ServicesStep";
import { SecretsStep } from "./components/Steps/SecretsStep";
import { TaskPage } from "./components/Steps/TaskPage";
import { Home } from "./components/Steps/Home";
import { Models } from "./components/Steps/Models";
import { Tools } from "./components/Steps/Tools";
import { SetupStep } from "./components/types";
import { DragHandle } from "./components/DragHandle";

const App: React.FC = () => {
  const [hasInstalledNash, setHasInstalledNash] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(SetupStep.Install);
  const [services, setServices] = React.useState<
    Array<{ name: string; added: boolean }>
  >([]);

  React.useEffect(() => {
    const checkInitialState = async () => {
      try {
        const isInstalled = await window.electronAPI.checkNashInstalled();

        if (isInstalled) {
          setHasInstalledNash(true);
          setCurrentStep(SetupStep.Home);
        }
      } catch (error) {
        console.error("Error checking Nash installation:", error);
      }
      const installedServices = await window.electron.checkInstalledServices();
      setServices(installedServices);
    };
    checkInitialState();
  }, []);

  const handleAddService = async (index: number) => {
    try {
      const service = services[index];
      const success = await window.electron.configureMcp(service.name);
      if (success) {
        const updatedServices = [...services];
        updatedServices[index].added = true;
        setServices(updatedServices);
        // Navigate to home if this is the first service added
        if (!updatedServices.some((s) => s.added)) {
          setCurrentStep(SetupStep.Home);
        }
      } else {
        console.error("Failed to configure MCP server");
      }
    } catch (error) {
      console.error("Error configuring service:", error);
    }
  };

  const handleHasInstalledNash = () => {
    setHasInstalledNash(true);
  };

  const handleContinue = () => {
    setCurrentStep(SetupStep.Services);
  };

  const handleNavigate = (step: SetupStep) => {
    setCurrentStep(step);
  };

  const renderStep = () => {
    // If Nash is not installed, show the install step
    if (!hasInstalledNash) {
      return (
        <InstallStep
          onNext={handleHasInstalledNash}
          onContinue={handleContinue}
        />
      );
    }

    // If Nash is installed, proceed with the setup flow
    switch (currentStep) {
      case SetupStep.Services:
        return (
          <ServicesStep
            services={services}
            onAddService={handleAddService}
            onNavigate={handleNavigate}
          />
        );

      case SetupStep.Secrets:
        return <SecretsStep onNavigate={handleNavigate} />;

      case SetupStep.Tasks:
        return <TaskPage onNavigate={handleNavigate} />;

      case SetupStep.Home:
        return <Home onNavigate={handleNavigate} />;

      case SetupStep.Models:
        return <Models onNavigate={handleNavigate} />;

      case SetupStep.Tools:
        return <Tools onNavigate={handleNavigate} />;

      default:
        return <Home onNavigate={handleNavigate} />;
    }
  };

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <DragHandle />
      <div className="flex-1 overflow-auto">{renderStep()}</div>
    </div>
  );
};

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

