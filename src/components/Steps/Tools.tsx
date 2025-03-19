import * as React from "react";
import { useState } from "react";
import { SetupStep } from "../types";
import { Header } from "../Header";
import { Button } from "../ui/button";
import { NASH_MCP_ENDPOINT } from "../../constants";

interface ToolsProps {
  onNavigate: (step: SetupStep) => void;
}

interface ToolResponse {
  result?: any;
  error?: string;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

interface SchemaProperty {
  title: string;
  type: string;
  description?: string;
}

interface FormValues {
  [key: string]: string | number | readonly string[];
}

function SchemaForm({ 
  schema, 
  onSubmit 
}: { 
  schema: any; 
  onSubmit: (values: any) => void;
}) {
  const [formValues, setFormValues] = useState<FormValues>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formValues);
  };

  const handleInputChange = (name: string, value: string) => {
    setFormValues(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (!schema.properties) {
    return <div className="text-nash-text-secondary">No input required</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {Object.entries(schema.properties).map(([name, property]: [string, any]) => (
        <div key={name} className="space-y-2">
          <label className="block text-sm font-medium text-white">
            {property.title || name}
            {schema.required?.includes(name) && <span className="text-red-500 ml-1">*</span>}
          </label>
          {property.description && (
            <p className="text-xs text-nash-text-secondary">{property.description}</p>
          )}
          <input
            type={property.type === 'number' ? 'number' : 'text'}
            value={formValues[name] || ''}
            onChange={(e) => handleInputChange(name, e.target.value)}
            required={schema.required?.includes(name)}
            placeholder={`Enter ${property.title || name}...`}
            className="w-full bg-nash-bg-darker text-white border border-nash-border rounded-md px-3 py-2 text-sm"
          />
        </div>
      ))}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={
            schema.required?.some((name: string) => !formValues[name]) ||
            Object.keys(formValues).length === 0
          }
          className="min-w-[120px]"
        >
          Call Tool
        </Button>
      </div>
    </form>
  );
}

export function Tools({ onNavigate }: ToolsProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [toolsData, setToolsData] = useState<ToolResponse | null>(null);
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [toolResult, setToolResult] = useState<string | null>(null);

  const fetchTools = async () => {
    setIsLoading(true);
    try {
    
      const response = await fetch(`${NASH_MCP_ENDPOINT}/list_tools`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setToolsData({ result: data.result });
      setSelectedTool("");
      setToolResult(null);
    } catch (error) {
      console.error("Error fetching tools:", error);
      setToolsData({ error: "Failed to fetch tools" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setToolsData(null);
    setSelectedTool("");
    setToolResult(null);
  };

  const callTool = async (args: any) => {
    if (!selectedTool) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${NASH_MCP_ENDPOINT}/call_tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tool_name: selectedTool,
          arguments: args,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setToolResult(JSON.stringify(data.result, null, 2));
    } catch (error) {
      console.error("Error calling tool:", error);
      setToolResult(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Extract tools from the result
  const tools = React.useMemo(() => {
    if (!toolsData?.result?.tools) return [];
    return toolsData.result.tools as Tool[];
  }, [toolsData?.result]);

  const selectedToolData = React.useMemo(() => {
    return tools.find(t => t.name === selectedTool);
  }, [tools, selectedTool]);

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentStep={SetupStep.Tools} />

      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Action Row */}
          <div className="flex items-center gap-4">
            <Button
              onClick={fetchTools}
              disabled={isLoading}
              className="min-w-[120px]"
            >
              {isLoading ? "Loading..." : "Get all tools"}
            </Button>

            <select
              value={selectedTool}
              onChange={(e) => {
                setSelectedTool(e.target.value);
                setToolResult(null);
              }}
              className="bg-nash-bg-secondary text-white border border-nash-border rounded-md px-3 py-2 flex-1"
            >
              <option value="">Select a tool...</option>
              {tools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
            </select>

            <Button
              onClick={handleReset}
              disabled={isLoading || (!toolsData && !selectedTool)}
              variant="outline"
              className="min-w-[80px]"
            >
              Reset
            </Button>
          </div>

          {/* Tools Display Section */}
          <div>
            {isLoading ? (
              <div className="text-nash-text-secondary">Loading...</div>
            ) : toolsData?.error ? (
              <div className="text-red-500">{toolsData.error}</div>
            ) : !selectedTool && toolsData?.result ? (
              <pre className="bg-nash-bg-secondary p-4 rounded-lg overflow-auto max-h-[600px] text-sm whitespace-pre-wrap break-words">
                {JSON.stringify(toolsData.result, null, 2)}
              </pre>
            ) : selectedToolData && (
              <div className="space-y-4">
                <div className="bg-nash-bg-secondary p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {selectedToolData.name}
                  </h3>
                  <p className="text-nash-text-secondary whitespace-pre-wrap">
                    {selectedToolData.description}
                  </p>
                </div>

                <div className="bg-nash-bg-secondary p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-white mb-4">Call Tool</h4>
                  <SchemaForm 
                    schema={selectedToolData.inputSchema} 
                    onSubmit={callTool}
                  />
                </div>

                {toolResult && (
                  <div className="bg-nash-bg-secondary p-4 rounded-lg">
                    <h4 className="text-md font-semibold text-white mb-2">Result</h4>
                    <pre className="bg-nash-bg-darker p-4 rounded-lg overflow-auto max-h-[400px] text-sm whitespace-pre-wrap break-words">
                      {toolResult}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Tools; 