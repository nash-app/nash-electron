export enum SetupStep {
  Install = "install",
  Services = "services", // rename to "Apps"
  Secrets = "secrets",
  Tasks = "tasks",
  Home = "home",
  Models = "models",
}

export interface Service {
  name: string;
  added: boolean;
}

export interface SetupState {
  hasInstalledNash: boolean;
  currentStep: SetupStep;
  services: Service[];
  apiKey?: string;
  secretToken?: string;
}

export interface Script {
  name: string;
  type: string;
  description: string;
  code: string;
}

export interface Task {
  prompt: string;
  scripts?: Script[];
}

export interface Tasks {
  [key: string]: Task;
}
