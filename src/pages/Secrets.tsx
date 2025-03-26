import * as React from "react";
import { useState, useEffect } from "react";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { Toaster, toast } from "sonner";
import { Page } from "../types";

interface Secret {
  key: string;
  value: string;
  description: string;
}

interface SecretsPageProps {
  onNavigate: (page: Page) => void;
}

export function SecretsPage({
  onNavigate,
}: SecretsPageProps): React.ReactElement {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toggleSecret = (index: number) => {
    const newVisible = new Set(visibleSecrets);
    if (newVisible.has(index)) {
      newVisible.delete(index);
    } else {
      newVisible.add(index);
    }
    setVisibleSecrets(newVisible);
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedIndex(null), 500); // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  const loadSecrets = async () => {
    try {
      const loadedSecrets = await window.electron.getSecrets();
      setSecrets(loadedSecrets || []);
      setError(null);
    } catch (err) {
      console.error("Error loading secrets:", err);
      setError("Failed to load secrets");
    }
  };

  const handleAddSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const success = await window.electron.addSecret(
        newKey,
        newValue,
        newDescription
      );
      if (success) {
        setNewKey("");
        setNewValue("");
        setNewDescription("");
        await loadSecrets();
      } else {
        setError("Failed to add secret");
      }
    } catch (err) {
      setError("Failed to add secret");
      console.error("Error adding secret:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (key: string) => {
    if (window.confirm("Are you sure you want to delete this secret?")) {
      try {
        setError(null);

        const success = await window.electron.deleteSecret(key);

        if (success) {
          await loadSecrets();
        } else {
          console.error("Failed to delete secret - operation returned false");
          setError("Failed to delete secret - please try again");
        }
      } catch (err) {
        console.error("Error in handleDelete:", err);
        setError("An error occurred while deleting the secret");
      }
    }
  };  

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentPage={Page.Secrets} />
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
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="border-nash-border bg-nash-bg/50">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="space-y-4">
                  <form
                    onSubmit={handleAddSecret}
                    className="flex items-center space-x-4"
                  >
                    <div className="flex-1">
                      <Input
                        id="key"
                        type="text"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        className="bg-nash-bg-secondary text-nash-text border-nash-border"
                        placeholder="Key"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        id="value"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        className="bg-nash-bg-secondary text-nash-text border-nash-border"
                        placeholder="Value"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        id="description"
                        type="text"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        className="bg-nash-bg-secondary text-nash-text border-nash-border"
                        placeholder="Description"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="bg-nash-bg-secondary text-nash-text border-nash-border hover:bg-nash-bg-secondary/80"
                    >
                      Add
                    </Button>
                  </form>
                  {error && (
                    <div className="text-red-500 text-sm mt-2">{error}</div>
                  )}
                </div>

                {secrets.length > 0 && (
                  <>
                    <Separator className="bg-nash-border" />
                    {/* Secrets List */}
                    <div className="space-y-4">
                      <div className="flex items-center">
                        <h3 className="text-sm font-medium uppercase tracking-wide text-nash-text-secondary">
                          Secrets
                        </h3>
                        <span className="text-nash-text-secondary/70 text-xs pl-1">
                          ({secrets.length})
                        </span>
                      </div>
                      <div className="space-y-4">
                        {secrets.map((secret, index) => (
                          <div
                            key={index}
                            className="p-4 bg-nash-bg-secondary rounded-lg border border-nash-border"
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col">
                                <div className="text-nash-text font-medium">
                                  {secret.key}
                                </div>
                                {secret.description && (
                                  <div className="text-sm text-nash-text-secondary">
                                    {secret.description}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center space-x-3">
                                <div className="text-nash-text-secondary">
                                  {visibleSecrets.has(index)
                                    ? secret.value
                                    : "•••••••••"}
                                </div>
                                <button
                                  onClick={() => toggleSecret(index)}
                                  className="text-nash-text-secondary hover:text-nash-text transition-colors"
                                  type="button"
                                  title={
                                    visibleSecrets.has(index)
                                      ? "Hide secret"
                                      : "Show secret"
                                  }
                                >
                                  {visibleSecrets.has(index) ? (
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
                                    copyToClipboard(secret.value, index)
                                  }
                                  className="text-nash-text-secondary hover:text-nash-text transition-colors"
                                  type="button"
                                  title="Copy secret value"
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
                                  onClick={() => handleDelete(secret.key)}
                                  className="text-nash-text-secondary hover:text-red-400 transition-colors"
                                  type="button"
                                  title="Delete secret"
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
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
