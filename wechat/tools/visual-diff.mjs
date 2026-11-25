import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../evidence/w7");
fs.mkdirSync(out, { recursive: true });
const note = {
  source: "not captured",
  wechat: "未验证。云端没有开发者工具，没有生成小程序截图。",
  web: "本脚本没有启动网页，也没有把 Node 图写成截图。",
  pixelDiff: "未完成",
};
fs.writeFileSync(path.join(out, "NOT-CAPTURED.json"), JSON.stringify(note, null, 2));
console.log("visual-diff: no screenshot written");
console.log("source: none. Not a simulator image and not a phone image.");
process.exit(2);
