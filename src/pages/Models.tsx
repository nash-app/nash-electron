"use client";

import * as React from "react";
import { Page } from "../types";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { toast, Toaster } from "sonner";
import anthropicIcon from "../../public/models/anthropic.png"
// import openAIIcon from "../../public/models/openai.png";

interface ModelsProps {
  onNavigate: (page: Page) => void;
}

interface ApiSection {
  name: string;
  inputValue: string;
  savedKey?: string;
  isSaving?: boolean;
  image?: string;
  baseUrl?: string;
  savedBaseUrl?: string;
  isEditingBaseUrl?: boolean;
  isBaseUrlExpanded?: boolean;
  headers?: string;
  savedHeaders?: string;
  isEditingHeaders?: boolean;
}

export function Models({ onNavigate }: ModelsProps): React.ReactElement {
  const [sections, setSections] = React.useState<ApiSection[]>([
    // {
    //   name: "OpenAI",
    //   inputValue: "",
    //   image: openAIIcon,
    //   baseUrl: "",
    //   savedBaseUrl: "",
    //   isEditingBaseUrl: false,
    //   isBaseUrlExpanded: false,
    // },
    {
      name: "Anthropic",
      inputValue: "",
      image: anthropicIcon,
      baseUrl: "",
      savedBaseUrl: "",
      isEditingBaseUrl: false,
      isBaseUrlExpanded: false,
      headers: "",
      savedHeaders: "",
      isEditingHeaders: false,
    },
  ]);
  const [visibleKeys, setVisibleKeys] = React.useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const handleInputChange = (index: number, value: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, inputValue: value } : s))
    );
  };

  const toggleKeyVisibility = (index: number) => {
    const newVisible = new Set(visibleKeys);
    if (newVisible.has(index)) {
      newVisible.delete(index);
    } else {
      newVisible.add(index);
    }
    setVisibleKeys(newVisible);
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 500);
      toast.success("API key copied to clipboard");
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDelete = async (provider: string) => {
    if (window.confirm("Are you sure you want to delete this API key?")) {
      try {
        const success = await window.electron.deleteKey(provider);
        if (success) {
          setSections((prev) =>
            prev.map((section) =>
              section.name.toLowerCase() === provider
                ? { ...section, inputValue: "", savedKey: undefined }
                : section
            )
          );
          toast.success("API key deleted successfully");
        } else {
          toast.error("Failed to delete API key");
        }
      } catch (error) {
        toast.error("Error deleting API key");
      }
    }
  };

  const handleDeleteBaseUrl = async (index: number) => {
    const section = sections[index];
    if (window.confirm("Are you sure you want to delete this base URL?")) {
      try {
        const success = await window.electron.saveModelConfig(
          section.name.toLowerCase(),
          {
            baseUrl: "",
          }
        );

        if (success) {
          setSections((prev) =>
            prev.map((s, i) =>
              i === index
                ? { ...s, baseUrl: "", savedBaseUrl: "", isEditingBaseUrl: false }
                : s
            )
          );
          toast.success(`${section.name} base URL deleted successfully`);
        } else {
          toast.error(`Failed to delete ${section.name} base URL`);
        }
      } catch (error) {
        toast.error(`Error deleting ${section.name} base URL`);
      }
    }
  };

  const handleSave = async (index: number) => {
    const section = sections[index];
    if (!section.inputValue) {
      toast.error("Please enter an API key");
      return;
    }

    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, isSaving: true } : s))
    );

    try {
      const success = await window.electron.addKey(
        section.name.toLowerCase(),
        section.inputValue
      );

      if (success) {
        toast.success(`${section.name} API key saved successfully`);
        setSections((prev) =>
          prev.map((s, i) =>
            i === index ? { ...s, isSaving: false, inputValue: "" } : s
          )
        );
        loadSavedKeys();
      } else {
        toast.error(`Failed to save ${section.name} API key`);
        setSections((prev) =>
          prev.map((s, i) => (i === index ? { ...s, isSaving: false } : s))
        );
      }
    } catch (error) {
      toast.error(`Error saving ${section.name} API key`);
      setSections((prev) =>
        prev.map((s, i) => (i === index ? { ...s, isSaving: false } : s))
      );
    }
  };

  const loadSavedKeys = async () => {
    try {
      const keys = await window.electron.getKeys();
      setSections((prev) =>
        prev.map((section) => {
          const key = keys.find(
            (k: any) => k.provider === section.name.toLowerCase()
          );
          return key ? { ...section, savedKey: key.value } : section;
        })
      );
    } catch (error) {
      console.error("Error loading saved API keys:", error);
    }
  };

  const handleBaseUrlChange = (index: number, value: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, baseUrl: value } : s))
    );
  };

  const handleHeadersChange = (index: number, value: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, headers: value } : s))
    );
  };

  const saveBaseUrl = async (index: number) => {
    const section = sections[index];
    try {
      const success = await window.electron.saveModelConfig(
        section.name.toLowerCase(),
        {
          baseUrl: section.baseUrl,
        }
      );

      if (success) {
        setSections((prev) =>
          prev.map((s, i) =>
            i === index
              ? {
                  ...s,
                  savedBaseUrl: section.baseUrl,
                  isEditingBaseUrl: false,
                }
              : s
          )
        );
        toast.success(`${section.name} base URL saved successfully`);
      } else {
        toast.error(`Failed to save ${section.name} base URL`);
      }
    } catch (error) {
      toast.error(`Error saving ${section.name} base URL`);
    }
  };

  const saveHeaders = async (index: number) => {
    const section = sections[index];
    try {
      // Attempt to parse the headers to validate JSON
      let parsedHeaders;
      try {
        parsedHeaders = JSON.parse(section.headers || "{}");
      } catch (parseError) {
        toast.error("Invalid JSON format for headers");
        return;
      }
      
      const success = await window.electron.saveModelConfig(
        section.name.toLowerCase(),
        {
          headers: parsedHeaders,
        }
      );

      if (success) {
        setSections((prev) =>
          prev.map((s, i) =>
            i === index
              ? {
                  ...s,
                  savedHeaders: section.headers,
                  isEditingHeaders: false,
                }
              : s
          )
        );
        toast.success(`${section.name} headers saved successfully`);
      } else {
        toast.error(`Failed to save ${section.name} headers`);
      }
    } catch (error) {
      toast.error(`Error saving ${section.name} headers`);
    }
  };

  const handleDeleteHeaders = async (index: number) => {
    const section = sections[index];
    if (window.confirm("Are you sure you want to delete these headers?")) {
      try {
        const success = await window.electron.saveModelConfig(
          section.name.toLowerCase(),
          {
            headers: null,
          }
        );

        if (success) {
          setSections((prev) =>
            prev.map((s, i) =>
              i === index
                ? { ...s, headers: "", savedHeaders: "", isEditingHeaders: false }
                : s
            )
          );
          toast.success(`${section.name} headers deleted successfully`);
        } else {
          toast.error(`Failed to delete ${section.name} headers`);
        }
      } catch (error) {
        toast.error(`Error deleting ${section.name} headers`);
      }
    }
  };

  const toggleBaseUrlExpanded = (index: number) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, isBaseUrlExpanded: !s.isBaseUrlExpanded } : s
      )
    );
  };

  // Load saved keys and model configs on mount
  React.useEffect(() => {
    loadSavedKeys();
    const loadModelConfigs = async () => {
      try {
        const configs = await window.electron.getModelConfigs();
        setSections((prev) =>
          prev.map((section) => {
            const config = configs.find(
              (c: any) => c.provider === section.name.toLowerCase()
            );
            return config
              ? {
                  ...section,
                  baseUrl: config.baseUrl || "",
                  savedBaseUrl: config.baseUrl || "",
                  headers: config.headers ? JSON.stringify(config.headers, null, 2) : "",
                  savedHeaders: config.headers ? JSON.stringify(config.headers, null, 2) : "",
                }
              : section;
          })
        );
      } catch (error) {
        console.error("Error loading model configurations:", error);
      }
    };

    loadModelConfigs();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Toaster
        theme="dark"
        position="bottom-right"
        duration={1000}
        className="!bg-nash-bg !border-nash-border"
        toastOptions={{
          className:
            "!bg-nash-bg-secondary !text-nash-text !border-nash-border",
        }}
      />
      <Header onNavigate={onNavigate} currentPage={Page.Models} />

      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {sections.map((section, index) => (
              <Card
                key={section.name}
                className="border-nash-border bg-nash-bg/50"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                        {section.image ? (
                          <img
                            src={section.image}
                            alt={`${section.name} Logo`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-medium text-nash-text">
                            {section.name[0]}
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-nash-text">
                        {section.name}
                      </CardTitle>
                    </div>
                    {section.name === "Anthropic" && (
                      <a
                        href="https://console.anthropic.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-nash-text-secondary hover:text-nash-text transition-colors"
                      >
                        Get an API key →
                      </a>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium uppercase tracking-wide text-nash-text-secondary">
                        API Key
                      </h3>
                      <div className="flex space-x-4">
                        {section.savedKey ? (
                          <div className="flex-1 p-2 bg-nash-bg-secondary rounded-lg border border-nash-border">
                            <div className="flex justify-between gap-2 items-center">
                              <div className="text-nash-text-secondary break-all">
                                {visibleKeys.has(index)
                                  ? section.savedKey
                                  : "•••••••••"}
                              </div>
                              <div className="flex items-center space-x-3">
                                <button
                                  onClick={() => toggleKeyVisibility(index)}
                                  className="text-nash-text-secondary hover:text-nash-text transition-colors"
                                  type="button"
                                  title={
                                    visibleKeys.has(index)
                                      ? "Hide API key"
                                      : "Show API key"
                                  }
                                >
                                  {visibleKeys.has(index) ? (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      strokeWidth={1.5}
                                      stroke="currentColor"
                                      className="w-5 h-5"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      strokeWidth={1.5}
                                      stroke="currentColor"
                                      className="w-5 h-5"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                                      />
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                      />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  onClick={() =>
                                    copyToClipboard(section.savedKey!, index)
                                  }
                                  className="text-nash-text-secondary hover:text-nash-text transition-colors"
                                  type="button"
                                  title="Copy API key"
                                >
                                  {copiedIndex === index ? (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      strokeWidth={1.5}
                                      stroke="currentColor"
                                      className="w-5 h-5"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      strokeWidth={1.5}
                                      stroke="currentColor"
                                      className="w-5 h-5"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                                      />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  onClick={() =>
                                    handleDelete(section.name.toLowerCase())
                                  }
                                  className="text-nash-text-secondary hover:text-red-400 transition-colors"
                                  type="button"
                                  title="Delete API key"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.5}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Input
                              placeholder={`Enter ${section.name} API Key`}
                              value={section.inputValue}
                              onChange={(e) =>
                                handleInputChange(index, e.target.value)
                              }
                              className="flex-1 bg-nash-bg-secondary text-nash-text border-nash-border"
                            />
                            <Button
                              onClick={() => handleSave(index)}
                              disabled={section.isSaving || !section.inputValue}
                              className="bg-nash-button hover:bg-nash-button-hover text-nash-button-text"
                            >
                              {section.isSaving ? "Saving..." : "Save"}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div 
                        onClick={() => toggleBaseUrlExpanded(index)}
                        className="flex items-center space-x-2 cursor-pointer group"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-nash-text-secondary group-hover:text-nash-text">
                          {section.savedBaseUrl || section.savedHeaders ? "Additional Configuration" : "Additional Configuration"}
                        </p>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className={`w-4 h-4 text-nash-text-secondary group-hover:text-nash-text transition-transform ${
                            section.isBaseUrlExpanded ? "rotate-90" : ""
                          }`}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 4.5l7.5 7.5-7.5 7.5"
                          />
                        </svg>
                      </div>
                      {section.isBaseUrlExpanded && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <h3 className="text-sm font-medium text-nash-text-secondary">Base URL</h3>
                            <div className="flex space-x-4">
                              {section.savedBaseUrl && !section.isEditingBaseUrl ? (
                                <div className="flex-1 p-2 bg-nash-bg-secondary rounded-lg border border-nash-border">
                                  <div className="flex justify-between items-center">
                                    <div className="text-nash-text-secondary">
                                      {section.savedBaseUrl}
                                    </div>
                                    <div className="flex items-center space-x-3">
                                      <button
                                        onClick={() => copyToClipboard(section.savedBaseUrl!, index)}
                                        className="text-nash-text-secondary hover:text-nash-text transition-colors"
                                        type="button"
                                        title="Copy base URL"
                                      >
                                        {copiedIndex === index ? (
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={1.5}
                                            stroke="currentColor"
                                            className="w-5 h-5"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                          </svg>
                                        ) : (
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={1.5}
                                            stroke="currentColor"
                                            className="w-5 h-5"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                                            />
                                          </svg>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSections(prev =>
                                            prev.map((s, i) =>
                                              i === index ? { ...s, baseUrl: section.savedBaseUrl, isEditingBaseUrl: true } : s
                                            )
                                          );
                                        }}
                                        className="text-nash-text-secondary hover:text-nash-text transition-colors"
                                        type="button"
                                        title="Edit base URL"
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          strokeWidth={1.5}
                                          stroke="currentColor"
                                          className="w-5 h-5"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                          />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteBaseUrl(index)}
                                        className="text-nash-text-secondary hover:text-red-400 transition-colors"
                                        type="button"
                                        title="Delete base URL"
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          strokeWidth={1.5}
                                          stroke="currentColor"
                                          className="w-5 h-5"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <Input
                                    value={section.baseUrl}
                                    onChange={(e) =>
                                      handleBaseUrlChange(index, e.target.value)
                                    }
                                    className="flex-1 bg-nash-bg-secondary text-nash-text border-nash-border"
                                  />
                                  <div className="flex space-x-2">
                                    <Button
                                      onClick={() => saveBaseUrl(index)}
                                      className="bg-nash-button hover:bg-nash-button-hover text-nash-button-text"
                                    >
                                      Save
                                    </Button>
                                    {section.isEditingBaseUrl && (
                                      <Button
                                        onClick={() => {
                                          setSections(prev =>
                                            prev.map((s, i) =>
                                              i === index ? { ...s, baseUrl: s.savedBaseUrl, isEditingBaseUrl: false } : s
                                            )
                                          );
                                        }}
                                        className="bg-nash-bg-secondary hover:bg-nash-bg text-nash-text border-nash-border"
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h3 className="text-sm font-medium text-nash-text-secondary">Headers (JSON)</h3>
                            <div className="flex space-x-4">
                              {section.savedHeaders && !section.isEditingHeaders ? (
                                <div className="flex-1 p-2 bg-nash-bg-secondary rounded-lg border border-nash-border">
                                  <div className="flex justify-between items-start">
                                    <pre className="text-nash-text-secondary whitespace-pre-wrap text-sm overflow-auto max-h-32">
                                      {section.savedHeaders}
                                    </pre>
                                    <div className="flex items-center space-x-3 ml-2 flex-shrink-0">
                                      <button
                                        onClick={() => copyToClipboard(section.savedHeaders!, index)}
                                        className="text-nash-text-secondary hover:text-nash-text transition-colors"
                                        type="button"
                                        title="Copy headers"
                                      >
                                        {copiedIndex === index ? (
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={1.5}
                                            stroke="currentColor"
                                            className="w-5 h-5"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                          </svg>
                                        ) : (
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={1.5}
                                            stroke="currentColor"
                                            className="w-5 h-5"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                                            />
                                          </svg>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSections(prev =>
                                            prev.map((s, i) =>
                                              i === index ? { ...s, headers: section.savedHeaders, isEditingHeaders: true } : s
                                            )
                                          );
                                        }}
                                        className="text-nash-text-secondary hover:text-nash-text transition-colors"
                                        type="button"
                                        title="Edit headers"
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          strokeWidth={1.5}
                                          stroke="currentColor"
                                          className="w-5 h-5"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                          />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteHeaders(index)}
                                        className="text-nash-text-secondary hover:text-red-400 transition-colors"
                                        type="button"
                                        title="Delete headers"
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          strokeWidth={1.5}
                                          stroke="currentColor"
                                          className="w-5 h-5"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex-1 flex flex-col">
                                    <textarea
                                      value={section.headers}
                                      onChange={(e) =>
                                        handleHeadersChange(index, e.target.value)
                                      }
                                      className="h-32 p-2 rounded-lg bg-nash-bg-secondary text-nash-text border-nash-border resize-none font-mono text-sm"
                                    />
                                  </div>
                                  <div className="flex space-x-2">
                                    <Button
                                      onClick={() => saveHeaders(index)}
                                      className="bg-nash-button hover:bg-nash-button-hover text-nash-button-text"
                                    >
                                      Save
                                    </Button>
                                    {section.isEditingHeaders && (
                                      <Button
                                        onClick={() => {
                                          setSections(prev =>
                                            prev.map((s, i) =>
                                              i === index ? { ...s, headers: s.savedHeaders, isEditingHeaders: false } : s
                                            )
                                          );
                                        }}
                                        className="bg-nash-bg-secondary hover:bg-nash-bg text-nash-text border-nash-border"
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

