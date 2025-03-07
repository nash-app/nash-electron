"use client";

import * as React from "react";
import { SetupStep } from "../types";
import { Header } from "../Header";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { toast, Toaster } from "sonner";
import openAIIcon from "../../../public/models/openai.png";
import anthropicIcon from "../../../public/models/anthropic.png";
import googleIcon from "../../../public/models/google.png";

interface ModelsProps {
  onNavigate: (step: SetupStep) => void;
}

interface ModelInfo {
  id: string;
  name: string;
}

interface ApiSection {
  name: string;
  models: ModelInfo[];
  inputValue: string;
  savedKey?: string;
  isSaving?: boolean;
  image?: string;
}

const OPENAI_MODELS: ModelInfo[] = [
  { id: "o3-mini", name: "o3-mini" },
  { id: "o1", name: "o1" },
  { id: "o1-mini", name: "o1-mini" },
  { id: "gpt-4.5-preview", name: "GPT-4.5 Preview" },
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4o-mini", name: "GPT-4o mini" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
];

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: "claude-3.7-sonnet", name: "Claude 3.7 Sonnet" },
  { id: "claude-3.5-haiku", name: "Claude 3.5 Haiku" },
  { id: "claude-3.5-sonnet-v2", name: "Claude 3.5 Sonnet v2" },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
  { id: "claude-3-haiku", name: "Claude 3 Haiku" },
];

const GOOGLE_MODELS: ModelInfo[] = [
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
  { id: "gemini-1.5-pro-002", name: "Gemini 1.5 Pro 002" },
];

export function Models({ onNavigate }: ModelsProps): React.ReactElement {
  const [sections, setSections] = React.useState<ApiSection[]>([
    {
      name: "OpenAI",
      models: OPENAI_MODELS,
      inputValue: "",
      image: openAIIcon,
    },
    {
      name: "Anthropic",
      models: ANTHROPIC_MODELS,
      inputValue: "",
      image: anthropicIcon,
    },
    {
      name: "Google",
      models: GOOGLE_MODELS,
      inputValue: "",
      image: googleIcon,
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

  // Load saved keys on mount
  React.useEffect(() => {
    loadSavedKeys();
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
      <Header onNavigate={onNavigate} currentStep={SetupStep.Models} />

      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {sections.map((section, index) => (
              <Card
                key={section.name}
                className="border-nash-border bg-nash-bg/50"
              >
                <CardHeader>
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
                            <div className="flex justify-between items-center">
                              <div className="text-nash-text-secondary">
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

                    {/* <Separator className="bg-nash-border" /> */}
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <h3 className="text-sm font-medium uppercase tracking-wide text-nash-text-secondary">
                          Models
                        </h3>
                        <span className="text-nash-text-secondary/70 text-xs pl-1">
                          ({section.models.length})
                        </span>
                      </div>
                      {section.models.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1">
                          {section.models.map((model) => (
                            <p
                              key={model.id}
                              className="text-sm text-nash-text py-1 truncate"
                              title={model.name}
                            >
                              {model.name}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div className="py-4 text-center">
                          <p className="text-sm text-nash-text-secondary">
                            No models available
                          </p>
                          <p className="text-xs text-nash-text-secondary mt-1">
                            Add your API key to use models from this provider
                          </p>
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
