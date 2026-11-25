/**
 * 原来：班级和章节的图集 JSON 只在 public，游戏读 assets/atlas-json 时记 asset text missing。
 * 现在：把 public 里已有的这些 JSON 复制进 art-json 分包，主包只留路径表。
 * 为什么：主包再塞进约 1.2MB 文本会超过 2MB。文件仍是原来的 JSON，没有云地址，也不为了体积删掉。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wechat = path.join(here, "..");
const publicRoot = path.join(wechat, "..", "public");
const limit = Math.floor(1.9 * 1024 * 1024);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function rel(file) {
  return path.relative(publicRoot, file).split(path.sep).join("/");
}

const wanted = walk(publicRoot).filter((file) => {
  if (!file.endsWith(".json")) return false;
  const key = rel(file);
  return key.startsWith("assets/classes/") || key.startsWith("assets/chapter/") || key.includes("/chapter/");
});

const packagesDir = path.join(wechat, "packages");
for (const name of fs.readdirSync(packagesDir)) {
  if (name === "art-json" || name.startsWith("art-json-")) fs.rmSync(path.join(packagesDir, name), { recursive: true, force: true });
}

const pending = wanted
  .map((file) => ({ file, bytes: fs.statSync(file).size, key: rel(file) }))
  .sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key));

const buckets = [];
let current = { bytes: 0, files: [] };
for (const item of pending) {
  if (current.files.length && current.bytes + item.bytes > limit) {
    buckets.push(current);
    current = { bytes: 0, files: [] };
  }
  current.files.push(item);
  current.bytes += item.bytes;
}
if (current.files.length) buckets.push(current);

const hold = path.join(wechat, "packages/art-ui/pages/hold");
const index = {};
const made = [];
buckets.forEach((bucket, indexNumber) => {
  const name = buckets.length === 1 ? "art-json" : `art-json-${String(indexNumber + 1).padStart(2, "0")}`;
  const root = path.join(packagesDir, name);
  fs.mkdirSync(path.join(root, "pages/hold"), { recursive: true });
  for (const file of fs.readdirSync(hold)) fs.copyFileSync(path.join(hold, file), path.join(root, "pages/hold", file));
  for (const item of bucket.files) {
    const destName = item.key.split("/").join("__");
    fs.copyFileSync(item.file, path.join(root, destName));
    index[item.key] = `packages/${name}/${destName}`;
  }
  made.push({ name, bytes: bucket.bytes, files: bucket.files.length });
  console.log(`${name} files ${bucket.files.length} bytes ${bucket.bytes}`);
});

fs.writeFileSync(path.join(packagesDir, "art-json-index.js"), `module.exports = ${JSON.stringify(index, null, 2)};\n`);

const appPath = path.join(wechat, "app.json");
const app = JSON.parse(fs.readFileSync(appPath, "utf8"));
app.subpackages = (app.subpackages || []).filter((item) => {
  const root = String(item.root || "");
  return root !== "packages/art-json" && !root.startsWith("packages/art-json-");
});
for (const bucket of made) {
  app.subpackages.push({ root: `packages/${bucket.name}`, name: bucket.name, pages: ["pages/hold/index"] });
}
fs.writeFileSync(appPath, `${JSON.stringify(app, null, 2)}\n`);
const names = app.subpackages.map((item) => item.name);
fs.writeFileSync(path.join(packagesDir, "subpackage-names.js"), `module.exports = ${JSON.stringify(names, null, 2)};\n`);

const plan = {
  source: "filesystem copy of existing public class and chapter JSON. Not an IDE upload size. No file was dropped.",
  packages: made,
  files: pending.length,
  bytes: pending.reduce((sum, item) => sum + item.bytes, 0),
};
fs.writeFileSync(path.join(wechat, "evidence/w10-json-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
console.log(`json files ${plan.files} bytes ${plan.bytes}`);
console.log("source: copied existing public JSON into wechat/packages. Not WeChat DevTools.");
