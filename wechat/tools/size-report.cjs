const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else acc.push({ file: path.relative(root, full), bytes: stat.size });
  }
  return acc;
}

const files = walk(root).filter((item) => !item.file.startsWith("evidence" + path.sep) && item.file !== "evidence");
const sum = (list) => list.reduce((total, item) => total + item.bytes, 0);
const lib = files.filter((item) => item.file.startsWith("lib" + path.sep));
const page = files.filter((item) => item.file.startsWith("pages" + path.sep) || item.file.startsWith("engine" + path.sep) || item.file.startsWith("platform" + path.sep) || item.file.startsWith("src" + path.sep) || item.file === "app.js" || item.file === "app.json" || item.file === "app.wxss");
const publicRoot = path.join(root, "..", "public");
const publicFiles = walk(publicRoot);
const wordAudio = publicFiles.filter((item) => item.file.includes(`${path.sep}audio${path.sep}words${path.sep}`) && item.file.endsWith(".mp3"));
const fonts = publicFiles.filter((item) => item.file.endsWith(".woff2") || item.file.endsWith(".ttf") || item.file.endsWith(".woff"));
const bytes = sum(files);
console.log(`wechat tree bytes ${bytes}`);
console.log(`lib bytes ${sum(lib)}`);
console.log(`engine and page source bytes ${sum(page)}`);
for (const item of lib) console.log(`${item.bytes}\t${item.file}`);
console.log(`public bytes ${sum(publicFiles)}`);
console.log(`word mp3 count ${wordAudio.length}`);
console.log(`font files ${fonts.length}`);
for (const item of fonts) console.log(`${item.bytes}\tpublic/${item.file}`);
console.log("source: filesystem byte count. Not a WeChat DevTools package size.");
console.log("main package limit was not measured by the IDE. Official single package limit is 2MB.");
console.log("https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages");
const diskTotal = bytes + sum(publicFiles);
const mainLimit = 2 * 1024 * 1024;
const totalLimit = 20 * 1024 * 1024;
if (sum(lib) > mainLimit) console.log("lib js alone is over 2MB on disk");
console.log(`disk wechat plus public ${diskTotal}`);
if (diskTotal > totalLimit) {
  console.log("FAIL disk total is over 20MB. IDE package size is 未验证. This is not a submitted package measurement.");
  process.exit(2);
}
console.log("disk total is under 20MB. IDE package size is still 未验证.");
process.exit(0);
