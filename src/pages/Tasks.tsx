import * as React from "react";
import { Page, Task, Tasks, Script } from "../types";
import { Header } from "../components/Header";
import { Button } from "../components/ui/button";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  TrashIcon,
  ArrowLeftIcon,
  ShareIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { Textarea } from "../components/ui/textarea";

import { toast, Toaster } from "sonner";

interface HomePageProps {
  onNavigate: (page: Page) => void;
}

interface ShareModalProps {
  taskId: string;
  task: Task;
  onClose: () => void;
}

function ShareModal({ taskId, task, onClose }: ShareModalProps) {
  const taskJson = JSON.stringify({ [taskId]: task }, null, 2);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(taskJson);
      toast.success("Task copied to clipboard");
    } catch (error) {
      console.error("Failed to copy share text:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-nash-bg border border-nash-border rounded-lg p-6 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-nash-text-primary text-xl font-medium">
            Share Task
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="hover:bg-nash-bg/75"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <p className="text-nash-text-primary">
            To add this task to your Nash app, copy the text below and paste it
            into the "Add Task" form:
          </p>

          <Textarea
            value={taskJson}
            readOnly
            className="w-full h-80 font-mono bg-nash-bg/75"
          />

          <div className="flex justify-end">
            <Button
              className="bg-nash-bg-secondary text-nash-text border-nash-border hover:bg-nash-bg-secondary/80"
              onClick={copyToClipboard}
            >
              <CopyIcon className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskPage({ onNavigate }: HomePageProps): React.ReactElement {
  const [tasks, setTasks] = React.useState<Tasks>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(
    null
  );
  const [expandedScripts, setExpandedScripts] = React.useState<Set<number>>(
    new Set()
  );
  const [isAddingTask, setIsAddingTask] = React.useState(false);
  const [newTaskJson, setNewTaskJson] = React.useState("");
  const [addTaskError, setAddTaskError] = React.useState<string | null>(null);
  const [shareModalTask, setShareModalTask] = React.useState<{
    taskId: string;
    task: Task;
  } | null>(null);

  React.useEffect(() => {
    const readTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const content = await window.electron.getTasks();
        setTasks(content ? JSON.parse(content) : {});
      } catch (error) {
        console.error("Error reading tasks:", error);
        setError("Failed to load tasks. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    readTasks();
  }, []);

  const copyTaskToClipboard = async (taskId: string, task: Task) => {
    setShareModalTask({ taskId, task });
  };

  const deleteTask = async (taskId: string) => {
    if (
      !window.confirm(`Are you sure you want to delete the task "${taskId}"?`)
    ) {
      return;
    }

    try {
      const success = await window.electron.deleteTask(taskId);
      if (success) {
        const newTasks = { ...tasks };
        delete newTasks[taskId];
        setTasks(newTasks);

        // If we're in the detail view of the deleted task, go back to the list
        if (selectedTaskId === taskId) {
          setSelectedTaskId(null);
        }
      } else {
        console.error("Failed to delete task");
      }
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const copyScriptToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch (error) {
      console.error("Failed to copy script:", error);
    }
  };

  const toggleScript = (scriptIndex: number) => {
    const newExpanded = new Set(expandedScripts);
    if (newExpanded.has(scriptIndex)) {
      newExpanded.delete(scriptIndex);
    } else {
      newExpanded.add(scriptIndex);
    }
    setExpandedScripts(newExpanded);
  };

  const isScript = (script: any): script is Script => {
    return (
      typeof script === "object" &&
      typeof script.name === "string" &&
      typeof script.type === "string" &&
      typeof script.description === "string" &&
      typeof script.code === "string"
    );
  };

  const isTask = (task: any): task is Task => {
    return (
      typeof task === "object" &&
      typeof task.prompt === "string" &&
      (!task.scripts || // scripts is optional
        (Array.isArray(task.scripts) && task.scripts.every(isScript)))
    );
  };

  const handleAddTask = async () => {
    try {
      setAddTaskError(null);

      let taskData: any;
      try {
        taskData = JSON.parse(newTaskJson);
      } catch (e) {
        setAddTaskError("Invalid JSON format");
        return;
      }

      // Basic validation
      if (!taskData || typeof taskData !== "object") {
        setAddTaskError("Invalid task format");
        return;
      }

      const taskId = Object.keys(taskData)[0];
      if (!taskId) {
        setAddTaskError("Task ID is required");
        return;
      }

      const task = taskData[taskId];

      if (!isTask(task)) {
        setAddTaskError("Invalid task format");
        return;
      }

      const success = await window.electron.addTask(taskId, task);

      if (success) {
        setTasks({ ...tasks, [taskId]: task });
        setIsAddingTask(false);
        setNewTaskJson("");
      } else {
        setAddTaskError("Failed to add task. Task ID might already exist.");
      }
    } catch (error) {
      console.error("Error adding task:", error);
      setAddTaskError("Failed to add task");
    }
  };

  const renderTaskList = () => (
    <div className="space-y-4">
      {Object.entries(tasks).map(([taskId, task]) => (
        <div
          key={taskId}
          onClick={() => setSelectedTaskId(taskId)}
          className="bg-nash-bg/50 border border-nash-border rounded-lg overflow-hidden cursor-pointer hover:bg-nash-bg/75 transition-colors"
        >
          <div className="p-4 flex items-center justify-between">
            <div className="flex-1">
              <p className="text-nash-text-primary font-medium">{taskId}</p>
              <p className="text-nash-text-secondary text-sm mt-1">
                {task.scripts?.length || 0} script
                {task.scripts?.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 hover:bg-nash-bg/75"
                onClick={(e) => {
                  e.stopPropagation();
                  copyTaskToClipboard(taskId, task);
                }}
              >
                <ShareIcon className="h-4 w-4" />
                <span>Share</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-nash-bg/75"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTask(taskId);
                }}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderTaskDetail = () => {
    if (!selectedTaskId || !tasks[selectedTaskId]) return null;
    const task = tasks[selectedTaskId];

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedTaskId(null)}
            className="hover:bg-nash-bg/75"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Tasks
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-nash-bg/75"
            onClick={() => copyTaskToClipboard(selectedTaskId, task)}
          >
            <ShareIcon className="h-4 w-4" />
            <span>Share</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-nash-bg/75"
            onClick={() => deleteTask(selectedTaskId)}
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="bg-nash-bg/50 border border-nash-border rounded-lg overflow-hidden">
          <div className="p-6">
            <h2 className="text-nash-text-primary text-xl font-medium mb-6">
              {selectedTaskId.replace(/_/g, " ")}
            </h2>

            {/* Task Prompt Section */}
            <div className="mb-8">
              <div className="bg-nash-bg/50 p-4 rounded-md">
                <p className="text-nash-text-primary text-sm whitespace-pre-wrap">
                  {task.prompt}
                </p>
              </div>
            </div>

            {/* Scripts Section */}
            {task.scripts && (
              <div className="space-y-1">
                <h3 className="text-nash-text-primary font-medium text-lg mb-4">
                  Scripts
                </h3>
                <div className="space-y-4">
                  {task.scripts?.map((script, scriptIndex) => (
                    <div key={scriptIndex}>
                      <div className="bg-nash-bg/75 border border-nash-border rounded-lg overflow-hidden">
                        <div
                          className="border-b border-nash-border p-4 cursor-pointer hover:bg-nash-bg/50 transition-colors"
                          onClick={() => toggleScript(scriptIndex)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {expandedScripts.has(scriptIndex) ? (
                                  <ChevronUpIcon className="h-4 w-4 flex-shrink-0" />
                                ) : (
                                  <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
                                )}
                                <div>
                                  <p className="text-nash-text-primary font-medium">
                                    {script.name}
                                  </p>
                                  <p className="text-nash-text-secondary text-sm mt-1">
                                    {script.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="text-nash-text-secondary text-sm px-3 py-1 bg-nash-bg/50 rounded-full font-mono">
                              {script.type}
                            </div>
                          </div>
                        </div>
                        {expandedScripts.has(scriptIndex) && (
                          <div className="bg-[#1a1a1a] p-4">
                            <div className="flex justify-end mb-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyScriptToClipboard(script.code)
                                }
                                className="hover:bg-nash-bg/25"
                              >
                                <CopyIcon className="h-4 w-4" />
                              </Button>
                            </div>
                            <pre className="overflow-x-auto">
                              <code className="text-nash-text-primary text-sm">
                                {script.code}
                              </code>
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAddTaskForm = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-nash-bg border border-nash-border rounded-lg p-6 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-nash-text-primary text-xl font-medium">
            Add New Task
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsAddingTask(false);
              setNewTaskJson("");
              setAddTaskError(null);
            }}
            className="hover:bg-nash-bg/75"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-nash-text-primary text-sm font-medium mb-2">
              Task JSON
            </label>
            <Textarea
              value={newTaskJson}
              onChange={(e) => setNewTaskJson(e.target.value)}
              placeholder="Paste your task JSON here..."
              className="w-full h-96 font-mono bg-nash-bg/75"
            />
          </div>

          {addTaskError && (
            <div className="text-red-500 text-sm">{addTaskError}</div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              className="bg-nash-bg-secondary text-nash-text border-nash-border hover:bg-nash-bg-secondary/80"
              onClick={handleAddTask}
            >
              Add Task
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Header onNavigate={onNavigate} currentPage={Page.Tasks} />
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
          {!selectedTaskId && (
            <div className="mb-4 flex justify-end">
              <Button
                onClick={() => setIsAddingTask(true)}
                className="flex items-center gap-2 text-nash-text bg-nash-bg border border-nash-border hover:bg-nash-bg/75"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Add Task</span>
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="bg-nash-bg/50 border border-nash-border rounded-lg p-6 flex items-center justify-center">
              <p className="text-nash-text-secondary">Loading tasks...</p>
            </div>
          ) : error ? (
            <div className="bg-nash-bg/50 border border-nash-border rounded-lg p-6 flex items-center justify-center">
              <p className="text-red-500">{error}</p>
            </div>
          ) : Object.keys(tasks).length === 0 ? (
            <div className="bg-nash-bg/50 border border-nash-border rounded-lg p-6 flex items-center justify-center">
              <p className="text-nash-text-secondary italic">No tasks found</p>
            </div>
          ) : selectedTaskId ? (
            renderTaskDetail()
          ) : (
            renderTaskList()
          )}
        </div>
      </div>

      {isAddingTask && renderAddTaskForm()}
      {shareModalTask && (
        <ShareModal
          taskId={shareModalTask.taskId}
          task={shareModalTask.task}
          onClose={() => setShareModalTask(null)}
        />
      )}
    </div>
  );
}
