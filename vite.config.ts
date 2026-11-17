import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "desktop/**/*.test.ts", "scripts/**/*.test.mjs"],
    setupFiles: ["src/test-setup.ts"],
    alias: [
      {
        find: /^phaser$/,
        replacement: fileURLToPath(new URL("./src/game/art/phaser-default.mjs", import.meta.url)),
      },
    ],
  },
});
