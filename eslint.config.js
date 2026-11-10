import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "dist-desktop", "node_modules", "public", "scripts", "playwright-report", "test-results"] },
  { files: ["src/**/*.ts"], extends: [js.configs.recommended, ...tseslint.configs.recommended], languageOptions: { ecmaVersion: 2022, globals: globals.browser } },
  { files: ["desktop/**/*.mjs"], ignores: ["desktop/smoke.mjs"], extends: [js.configs.recommended], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: globals.node } },
  { files: ["desktop/smoke.mjs"], extends: [js.configs.recommended], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node, ...globals.browser } } },
);
