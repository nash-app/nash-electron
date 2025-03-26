import type { Configuration } from "webpack";
import { mainConfig } from "./webpack.main.config";

// Create a modified version of the main config for direct use
const directConfig: Configuration = {
  ...mainConfig,
  mode: "development",
  target: "electron-main",
  node: {
    __dirname: false,
    __filename: false,
  },
  resolve: {
    ...mainConfig.resolve,
    fallback: {
      path: false,
      fs: false,
      child_process: false,
    },
  },
};

// Export the modified config as default for direct webpack usage
export default directConfig;
