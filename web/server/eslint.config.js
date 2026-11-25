// @ts-check
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

/** @type {Record<string, "readonly" | "writable">} */
const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  module: "readonly",
  require: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
};

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: nodeGlobals,
    },
  },
  {
    files: ["eslint.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    ignores: ["dist/**", "src/generated/**"],
  },
);
