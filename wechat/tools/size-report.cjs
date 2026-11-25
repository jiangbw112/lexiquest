const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else acc.push({ file: path.relative(root, full).split(path.sep).join("/"), bytes: stat.size });
  }
  return acc;
}

function ignored(file, rules) {
  return rules.some((rule) => {
    if (!rule || !rule.value) return false;
    if (rule.type === "file") return file === rule.value;
    if (rule.type === "folder") return file === rule.value || file.startsWith(`${rule.value}/`);
    if (rule.type === "suffix") return file.endsWith(rule.value);
    return false;
  });
}

const project = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const rules = project.packOptions && project.packOptions.ignore ? project.packOptions.ignore : [];
const files = walk(root);
const packed = files.filter((item) => !ignored(item.file, rules));
const sum = (list) => list.reduce((total, item) => total + item.bytes, 0);
const lib = packed.filter((item) => item.file.startsWith("lib/"));
const publicRoot = path.join(root, "..", "public");
const publicFiles = walk(publicRoot);
const publicAudio = publicFiles.filter((item) => item.file.includes("/audio/words/") && item.file.endsWith(".mp3"));
const packedAudio = packed.filter((item) => item.file.endsWith(".mp3"));
const packedFonts = packed.filter((item) => item.file.endsWith(".ttf") || item.file.endsWith(".woff2") || item.file.endsWith(".otf"));
const mainLimit = 2 * 1024 * 1024;
console.log(`packed bytes ${sum(packed)}`);
console.log(`lib bytes ${sum(lib)}`);
for (const item of lib) console.log(`${item.bytes}\t${item.file}`);
console.log(`packed mp3 ${packedAudio.length}`);
console.log(`packed font files ${packedFonts.length}`);
console.log(`public bytes ${sum(publicFiles)} excluded from the mini program`);
console.log(`public word mp3 ${publicAudio.length}`);
console.log("no subpackage was added. The packed tree is one main package on disk.");
console.log("source: filesystem, after project.config.json packOptions.ignore. Not a DevTools upload size.");
console.log("https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages");
if (sum(packed) > mainLimit) {
  console.log("FAIL packed disk bytes are over 2MB. This is still not an IDE measurement.");
  process.exit(2);
}
console.log("packed disk bytes are within 2MB. IDE package size is 未验证.");
process.exit(0);
