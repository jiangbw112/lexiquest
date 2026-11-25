/**
 * 原来：pack-art 只复制 public/assets/warm，其余 276 张图留在小程序外面。
 * 现在：按真实文件把还没进包的图切进 art-extra 分包，每包尽量不超过 1.9MB。单张更大的原画单独成包，不删。
 * 为什么：不能为了 2MB/20MB 丢掉原画。超限的分项写进清单，体积门禁仍按实测数字判，不在这里假装通过。
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const wechat = path.join(here, "..");
const publicRoot = path.join(wechat, "..", "public");
const limit = Math.floor(1.9 * 1024 * 1024);
const indexPath = path.join(wechat, "packages/art-index.js");

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

const index = require(indexPath);
for (const name of fs.readdirSync(path.join(wechat, "packages"))) {
  if (!name.startsWith("art-extra-")) continue;
  fs.rmSync(path.join(wechat, "packages", name), { recursive: true, force: true });
}
for (const key of Object.keys(index)) {
  if (String(index[key]).startsWith("packages/art-extra-")) delete index[key];
}

const images = walk(publicRoot).filter((file) => /\.(png|webp|jpg|jpeg|gif)$/i.test(file));
const pending = images
  .filter((file) => !Object.prototype.hasOwnProperty.call(index, rel(file)))
  .map((file) => ({ file, bytes: fs.statSync(file).size, key: rel(file) }))
  .sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key));

const buckets = [];
let current = { bytes: 0, files: [], oversize: false };
for (const item of pending) {
  if (item.bytes > limit) {
    buckets.push({ bytes: item.bytes, files: [item], oversize: true });
    continue;
  }
  if (current.files.length && current.bytes + item.bytes > limit) {
    buckets.push(current);
    current = { bytes: 0, files: [], oversize: false };
  }
  current.files.push(item);
  current.bytes += item.bytes;
}
if (current.files.length) buckets.push(current);

const hold = path.join(wechat, "packages/art-ui/pages/hold");
const made = [];
buckets.forEach((bucket, indexNumber) => {
  const name = `art-extra-${String(indexNumber + 1).padStart(2, "0")}`;
  const root = path.join(wechat, "packages", name);
  fs.mkdirSync(path.join(root, "pages/hold"), { recursive: true });
  for (const file of fs.readdirSync(hold)) fs.copyFileSync(path.join(hold, file), path.join(root, "pages/hold", file));
  for (const item of bucket.files) {
    const destName = item.key.split("/").join("__");
    fs.copyFileSync(item.file, path.join(root, destName));
    index[item.key] = `packages/${name}/${destName}`;
  }
  made.push({ name, bytes: bucket.bytes, files: bucket.files.length, oversize: bucket.oversize, keys: bucket.files.map((item) => item.key) });
  console.log(`${name} files ${bucket.files.length} bytes ${bucket.bytes}${bucket.oversize ? " OVERSIZE" : ""}`);
});

fs.writeFileSync(indexPath, `module.exports = ${JSON.stringify(index, null, 2)};\n`);

const appPath = path.join(wechat, "app.json");
const app = JSON.parse(fs.readFileSync(appPath, "utf8"));
app.subpackages = (app.subpackages || []).filter((item) => !String(item.root || "").startsWith("packages/art-extra-"));
for (const bucket of made) {
  app.subpackages.push({ root: `packages/${bucket.name}`, name: bucket.name, pages: ["pages/hold/index"] });
}
fs.writeFileSync(appPath, `${JSON.stringify(app, null, 2)}\n`);
const names = app.subpackages.map((item) => item.name);
fs.writeFileSync(path.join(wechat, "packages/subpackage-names.js"), `module.exports = ${JSON.stringify(names, null, 2)};\n`);

const classes = images.filter((file) => rel(file).startsWith("assets/classes/"));
const chapters = images.filter((file) => /assets\/chapters?\//.test(rel(file)) || rel(file).includes("/chapter"));
const plan = {
  source: "filesystem copy of existing public images. Not an IDE upload size. No file was dropped to fit 2MB or 20MB.",
  addedPackages: made.map((item) => ({ name: item.name, bytes: item.bytes, files: item.files, oversize: item.oversize })),
  addedImages: pending.length,
  addedBytes: pending.reduce((sum, item) => sum + item.bytes, 0),
  classImages: classes.length,
  classBytes: classes.reduce((sum, file) => sum + fs.statSync(file).size, 0),
  chapterImages: chapters.length,
  chapterBytes: chapters.reduce((sum, file) => sum + fs.statSync(file).size, 0),
  publicWordMp3: walk(publicRoot).filter((file) => file.includes(`${path.sep}audio${path.sep}words${path.sep}`) && file.endsWith(".mp3")).length,
};
fs.mkdirSync(path.join(wechat, "evidence"), { recursive: true });
fs.writeFileSync(path.join(wechat, "evidence/w10-pack-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
console.log(`added images ${plan.addedImages} bytes ${plan.addedBytes}`);
console.log(`class images ${plan.classImages} bytes ${plan.classBytes}`);
console.log(`chapter-like images ${plan.chapterImages} bytes ${plan.chapterBytes}`);
console.log(`public word mp3 ${plan.publicWordMp3}`);
console.log("source: copied existing public files into wechat/packages. Not WeChat DevTools.");
