// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

// For TypeScript support
declare global {
  interface Window {
    electronAPI: {
      runInstall: () => Promise<boolean>;
      checkNashInstalled: () => Promise<boolean>;
      checkXcodeCommandLineTools: () => Promise<boolean>;
      checkHomebrewInstalled: () => Promise<boolean>;
      openTerminal: (command?: string) => Promise<boolean>;
      fetchTerms: () => Promise<string>;
    };
    electron: {
      checkInstalledServices: () => Promise<
        Array<{ name: string; added: boolean }>
      >;
      configureMcp: (serviceName: string) => Promise<boolean>;
      getSecrets: () => Promise<any>;
      addSecret: (
        key: string,
        value: string,
        description: string
      ) => Promise<boolean>;
      deleteSecret: (key: string) => Promise<boolean>;
      checkCursorInstalled: () => Promise<boolean>;
      // Key management
      getKeys: () => Promise<Array<{ provider: string; value: string }>>;
      addKey: (provider: string, value: string) => Promise<boolean>;
      deleteKey: (provider: string) => Promise<boolean>;
      // Tasks management
      getTasks: () => Promise<string | null>;
      addTask: (taskId: string, task: any) => Promise<boolean>;
      deleteTask: (taskId: string) => Promise<boolean>;
    };
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  runInstall: async () => {
    try {
      const result = await ipcRenderer.invoke("run-install");
      return result;
    } catch (error) {
      console.error("Error in runInstall:", error);
      throw error;
    }
  },
  checkNashInstalled: async () => {
    try {
      const result = await ipcRenderer.invoke("check-nash-installed");
      return result;
    } catch (error) {
      console.error("Error in checkNashInstalled:", error);
      throw error;
    }
  },
  checkXcodeCommandLineTools: async () => {
    try {
      const result = await ipcRenderer.invoke("check-xcode-command-line-tools");
      return result;
    } catch (error) {
      console.error("Error in checkXcodeCommandLineTools:", error);
      throw error;
    }
  },
  checkHomebrewInstalled: async () => {
    try {
      const result = await ipcRenderer.invoke("check-homebrew-installed");
      return result;
    } catch (error) {
      console.error("Error in checkHomebrewInstalled:", error);
      throw error;
    }
  },
  openTerminal: async (command?: string) => {
    try {
      const result = await ipcRenderer.invoke("open-terminal", command);
      return result;
    } catch (error) {
      console.error("Error in openTerminal:", error);
      throw error;
    }
  },
  fetchTerms: async () => {
    try {
      const result = await ipcRenderer.invoke("fetch-terms");
      return result;
    } catch (error) {
      console.error("Error in fetchTerms:", error);
      throw error;
    }
  },
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  env: {
    NASH_LLM_SERVER_ENDPOINT: process.env.NASH_LLM_SERVER_ENDPOINT,
  },
  checkInstalledServices: () => ipcRenderer.invoke("check-installed-services"),
  configureMcp: (serviceName: string) =>
    ipcRenderer.invoke("configure-mcp", serviceName),
  getSecrets: () => ipcRenderer.invoke("get-secrets"),
  addSecret: (key: string, value: string, description: string) =>
    ipcRenderer.invoke("add-secret", key, value, description),
  deleteSecret: (key: string) => ipcRenderer.invoke("delete-secret", key),
  checkCursorInstalled: () => ipcRenderer.invoke("check-cursor-installed"),

  // Key management
  getKeys: () => ipcRenderer.invoke("get-keys"),
  addKey: (provider: string, value: string) =>
    ipcRenderer.invoke("add-key", provider, value),
  deleteKey: (provider: string) => ipcRenderer.invoke("delete-key", provider),

  // Tasks management
  getTasks: () => ipcRenderer.invoke("get-tasks"),
  addTask: (taskId: string, task: any) =>
    ipcRenderer.invoke("add-task", taskId, task),
  deleteTask: (taskId: string) => ipcRenderer.invoke("delete-task", taskId),
});
