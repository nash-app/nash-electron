import type IForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import type { WebpackPluginInstance } from "webpack";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

// Temporarily disable the plugin to see if it resolves the EPIPE error
export const plugins: WebpackPluginInstance[] = [
  // Commented out to troubleshoot EPIPE error
  // new ForkTsCheckerWebpackPlugin({
  //   logger: "webpack-infrastructure",
  //   async: true,
  //   typescript: {
  //     diagnosticOptions: {
  //       semantic: true,
  //       syntactic: true,
  //     },
  //   },
  // }),
];
