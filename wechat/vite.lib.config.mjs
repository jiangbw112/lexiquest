import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { aliasPlatform } from "./tools/alias-platform.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 原来：根 vite 配置打网页包。
 * 现在：只从 wechat 配置打两份 CJS，不改根 package.json。
 * 为什么：catalog.ts 的 import.meta.glob 和 chapter-plan 的 import.meta.url 要由 Vite 处理，tsc 单独编不过，也不能改那两个源文件。
 */
const which = process.env.WECHAT_ENTRY === "game" ? "game" : "domain";
const entry = which === "game"
  ? { "game.cjs": path.join(root, "wechat/src/entry-game.ts") }
  : { "domain.cjs": path.join(root, "wechat/src/entry-domain.ts") };

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      phaser: path.join(root, "wechat/engine/phaser-shim.ts"),
    },
  },
  plugins: [aliasPlatform(root)],
  build: {
    lib: {
      entry,
      formats: ["cjs"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    outDir: path.join(root, "wechat/lib"),
    emptyOutDir: which === "domain",
    copyPublicDir: false,
    sourcemap: false,
    // 原来：任务写 minify esbuild。现在：仓库没有单独安装 esbuild，Vite 8 默认用 oxc。
    // 为什么：不能新增依赖。web 的 npm run build 同样不经过独立的 esbuild 包。
    minify: true,
    target: "es2019",
    assetsInlineLimit: 100_000_000,
    rolldownOptions: {
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
