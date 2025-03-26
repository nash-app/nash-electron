// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

// For TypeScript support
declare global {
  interface Window {
    electronAPI: {
      runInstall: () => Promise<boolean>;
      checkNashInstalled: () => Promise<boolean>;
      fetchTerms: () => Promise<string>;
    };
    electron: {
      // App management
      checkInstalledApps: () => Promise<Array<{ name: string; added: boolean }>>;
      configureMcp: (appName: string) => Promise<boolean>;
      checkCursorInstalled: () => Promise<boolean>;

      // Secrets management
      getSecrets: () => Promise<any>;
      addSecret: (key: string, value: string, description: string) => Promise<boolean>;
      deleteSecret: (key: string) => Promise<boolean>;

      // Key management
      getKeys: () => Promise<Array<{ provider: string; value: string }>>;
      addKey: (provider: string, value: string) => Promise<boolean>;
      deleteKey: (provider: string) => Promise<boolean>;

      // Model configuration
      getModelConfigs: () => Promise<any>;
      saveModelConfig: (provider: string, config: any) => Promise<boolean>;
      deleteModelConfig: (provider: string, configKey: string) => Promise<boolean>;

      // Tasks management
      getTasks: () => Promise<string | null>;
      addTask: (taskId: string, task: any) => Promise<boolean>;
      deleteTask: (taskId: string) => Promise<boolean>;

      env: {
        NASH_LLM_SERVER_ENDPOINT: string;
      };
    };
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  runInstall: () => ipcRenderer.invoke("run-install"),
  checkNashInstalled: () => ipcRenderer.invoke("check-nash-installed"),
  fetchTerms: () => ipcRenderer.invoke("fetch-terms"),
});

contextBridge.exposeInMainWorld("electron", {
  env: {
    NASH_LLM_SERVER_ENDPOINT: process.env.NASH_LLM_SERVER_ENDPOINT,
  },

  // App management
  checkInstalledApps: () => ipcRenderer.invoke("check-installed-apps"),
  configureMcp: (appName: string) => ipcRenderer.invoke("configure-mcp", appName),
  checkCursorInstalled: () => ipcRenderer.invoke("check-cursor-installed"),

  // Secrets management
  getSecrets: () => ipcRenderer.invoke("get-secrets"),
  addSecret: (key: string, value: string, description: string) =>
    ipcRenderer.invoke("add-secret", key, value, description),
  deleteSecret: (key: string) => ipcRenderer.invoke("delete-secret", key),

  // Key management
  getKeys: () => ipcRenderer.invoke("getKeys"),
  addKey: (provider: string, value: string) => ipcRenderer.invoke("addKey", provider, value),
  deleteKey: (provider: string) => ipcRenderer.invoke("deleteKey", provider),

  // Model configuration
  getModelConfigs: () => ipcRenderer.invoke("getModelConfigs"),
  saveModelConfig: (provider: string, config: any) =>
    ipcRenderer.invoke("saveModelConfig", provider, config),
  deleteModelConfig: (provider: string, configKey: string) =>
    ipcRenderer.invoke("deleteModelConfig", provider, configKey),

  // Tasks management
  getTasks: () => ipcRenderer.invoke("get-tasks"),
  addTask: (taskId: string, task: any) => ipcRenderer.invoke("add-task", taskId, task),
  deleteTask: (taskId: string) => ipcRenderer.invoke("delete-task", taskId),
});
