import type { ModuleOptions } from "webpack";

interface PathData {
  filename: string;
  directory: string;
  query: string;
  base: string;
  ext: string;
  name: string;
  path: string;
  [key: string]: any;
}

export const rules: Required<ModuleOptions>["rules"] = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: "node-loader",
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: "@vercel/webpack-asset-relocator-loader",
      options: {
        outputAssetBase: "native_modules",
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: "ts-loader",
      options: {
        transpileOnly: true,
      },
    },
  },
  // Asset handling for images
  {
    test: /\.(png|jpe?g|gif|svg)$/i,
    type: "asset/resource",
    generator: {
      filename: (pathData: PathData) => {
        // For files in the public directory, maintain their full path
        if (pathData.filename.includes("public/")) {
          return pathData.filename.replace("public/", "");
        }
        // For other assets, put them in the public directory
        return `public/[name][ext]`;
      },
    },
  },
];
