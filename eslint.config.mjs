import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  URL: "readonly",
};

export default defineConfig(
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      "coverage/**",
      "**/.expo/**",
      "apps/mobile/android/**",
      "apps/mobile/ios/**",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
  },
  {
    // Node scripts (ES modules)
    files: ["scripts/**/*.mjs", "*.mjs"],
    languageOptions: { globals: nodeGlobals },
  },
  {
    // Expo config plugins are CommonJS and loaded by Node during prebuild.
    files: ["modules/*/app.plugin.js", "modules/*/plugin/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...nodeGlobals, require: "readonly", module: "writable" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
