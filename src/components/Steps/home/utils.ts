import { ChatMessage, ModelConfig } from "./types";
import { ALL_MODELS, DEFAULT_BASE_URLS } from "./constants";

export const getProviderConfig = async (modelId: string) => {
  const keys = await window.electron.getKeys();
  const modelConfigs =
    (await window.electron.getModelConfigs()) as ModelConfig[];

  const model = ALL_MODELS.find((m) => m.id === modelId);
  if (!model) {
    console.error("[getProviderConfig] Model not found:", modelId);
    throw new Error("Selected model not found.");
  }

  const key = keys.find((k) => k.provider === model.provider)?.value;
  const config = modelConfigs.find((c) => c.provider === model.provider);

  if (!key) {
    console.error(
      "[getProviderConfig] API key not found for provider:",
      model.provider
    );
    throw new Error(
      `${
        model.provider.charAt(0).toUpperCase() + model.provider.slice(1)
      } API key not found. Please add your API key in the Models section.`
    );
  }

  return {
    key,
    baseUrl: config?.baseUrl || DEFAULT_BASE_URLS[model.provider],
    model: modelId,
    provider: model.provider,
  };
};

export const logMessageHistory = (messages: ChatMessage[], context: string) => {
  console.log("\n");
  console.log("🔍 ================================");
  console.log(`📝 MESSAGE HISTORY [${context}]`);
  console.log("================================");
  console.log("Total messages:", messages.length);
  messages.forEach((msg, i) => {
    console.log("\n-------------------");
    console.log(`📨 Message ${i + 1}:`);
    console.log("👤 Role:", msg.role);
    console.log("🆔 ID:", msg.id);
    console.log("📄 Content:", msg.content);
    console.log("🔄 Is Streaming:", msg.isStreaming);
    if (msg.processingTool) {
      console.log("🛠  Tool:", {
        name: msg.processingTool.name,
        status: msg.processingTool.status,
        functionCall: msg.processingTool.functionCall,
        response: msg.processingTool.response,
      });
    }
  });
  console.log("\n================================\n");
};
