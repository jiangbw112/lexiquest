/**
 * Equivalent of the task's npm run wechat:build:lib.
 * That script was not added to the root package.json.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const vite = path.join(root, "node_modules/vite/bin/vite.js");

function run(entry) {
  return spawnSync(process.execPath, [vite, "build", "--config", "wechat/vite.lib.config.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, WECHAT_ENTRY: entry },
  });
}

// 原来：一个配置里两个入口会抽出第三份共享 chunk。
// 现在：domain 和 game 各打一次，各自一份文件。
// 为什么：任务要求 lib 下只有这两个 js。不能开 inlineDynamicImports，也不能改 src 里的动态 import（源码里没有）。
const first = run("domain");
if (first.status) process.exit(first.status);
const second = run("game");
process.exit(second.status ?? 1);
