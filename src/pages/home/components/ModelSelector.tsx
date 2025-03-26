import * as React from "react";
import { cn } from "../../../lib/utils";
import { ALL_MODELS } from "../../../constants";
import { Page } from "../../../types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
} from "../../../components/ui/select";
import anthropicIcon from "../../../../public/models/anthropic.png";
// import openAIIcon from "../../../../../public/models/openai.png";

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  configuredProviders: Set<string>;
  onNavigate: (page: Page) => void;
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  configuredProviders,
  onNavigate,
}: ModelSelectorProps) {
  return (
    <Select value={selectedModel} onValueChange={onModelChange}>
      <SelectTrigger className="w-[200px] h-8 text-gray-400 text-sm font-mono">
        <SelectValue>
          {selectedModel
            ? ALL_MODELS.find((m) => m.id === selectedModel)?.name
            : "Select a model"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup className="mb-2">
          <SelectLabel className="flex items-center justify-between pr-2 text-sm font-semibold">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-md w-5 h-5 flex items-center justify-center overflow-hidden">
                <img src={anthropicIcon} alt="Anthropic" className="w-4 h-4" />
              </div>
              Anthropic
            </div>
            {!configuredProviders.has("anthropic") && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onNavigate(Page.Models);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-3 h-3"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                    clipRule="evenodd"
                  />
                </svg>
                Add key
              </button>
            )}
          </SelectLabel>
          {ALL_MODELS.filter((m) => m.provider === "anthropic").map((model) => (
            <SelectItem
              key={model.id}
              value={model.id}
              disabled={
                !configuredProviders.has("anthropic") ||
                model.id === selectedModel
              }
              className={cn(
                !configuredProviders.has("anthropic") &&
                  "opacity-50 cursor-not-allowed",
                model.id === selectedModel && "bg-zinc-700/50"
              )}
            >
              <div className="flex items-center justify-between w-full gap-2">
                <span>{model.name}</span>
                {model.id === selectedModel ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-green-500 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <div className="w-4 shrink-0" />
                )}
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
        {/* <SelectGroup>
          <SelectLabel className="flex items-center justify-between pr-2">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-md w-5 h-5 flex items-center justify-center overflow-hidden">
                <img src={openAIIcon} alt="OpenAI" className="w-4 h-4" />
              </div>
              OpenAI
            </div>
            {!configuredProviders.has("openai") && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onNavigate(Page.Models);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-3 h-3"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                    clipRule="evenodd"
                  />
                </svg>
                Add key
              </button>
            )}
          </SelectLabel>
          {ALL_MODELS.filter((m) => m.provider === "openai").map((model) => (
            <SelectItem
              key={model.id}
              value={model.id}
              disabled={
                !configuredProviders.has("openai") || model.id === selectedModel
              }
              className={cn(
                !configuredProviders.has("openai") &&
                  "opacity-50 cursor-not-allowed",
                model.id === selectedModel && "bg-zinc-700/50"
              )}
            >
              <div className="flex items-center justify-between w-full gap-4">
                <span>{model.name}</span>
                {model.id === selectedModel ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-green-500 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <div className="w-4 shrink-0" />
                )}
              </div>
            </SelectItem>
          ))}
        </SelectGroup> */}
      </SelectContent>
    </Select>
  );
}
