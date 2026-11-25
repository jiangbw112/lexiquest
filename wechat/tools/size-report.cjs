/**
 * 原来：把 ignore 之后的整个 wechat 目录当成一个主包，1084640 是那时还没有图和字体的磁盘数。
 * 现在：主包和每个分包分开数。public 里没打进来的图继续单列，不删掉它们来换一个更小的数字。
 * 为什么：主包和分包各自有 2MB，总包有 20MB（服务商代开发）或 30MB。磁盘数不是开发者工具的上传体积。
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const mainLimit = 2 * 1024 * 1024;
const totalLimit = 20 * 1024 * 1024;
const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const subRoots = (app.subpackages || []).map((item) => item.root);

function walk(dir, base = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, base, acc);
    else acc.push({ file: path.relative(base, full).split(path.sep).join("/"), bytes: stat.size });
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

function sum(list) {
  return list.reduce((total, item) => total + item.bytes, 0);
}

const project = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const rules = project.packOptions && project.packOptions.ignore ? project.packOptions.ignore : [];
const kept = walk(root, root).filter((item) => !ignored(item.file, rules));
const subs = {};
for (const sub of subRoots) subs[sub] = kept.filter((item) => item.file === sub || item.file.startsWith(`${sub}/`));
const subFiles = new Set(Object.values(subs).flat().map((item) => item.file));
const main = kept.filter((item) => !subFiles.has(item.file));
const publicRoot = path.join(root, "..", "public");
const publicFiles = walk(publicRoot, publicRoot);
const publicImages = publicFiles.filter((item) => /\.(png|webp|jpg|jpeg|gif)$/i.test(item.file));
const publicAudio = publicFiles.filter((item) => item.file.includes("/audio/words/") && item.file.endsWith(".mp3"));
const packedImages = kept.filter((item) => /\.(png|webp|jpg|jpeg|gif)$/i.test(item.file));
const packedAudio = kept.filter((item) => item.file.endsWith(".mp3"));
const packedFonts = kept.filter((item) => /\.(ttf|woff2|otf|woff)$/i.test(item.file));
const artIndex = require(path.join(root, "packages/art-index.js"));
const packedPublic = new Set(Object.keys(artIndex));
const unpackedImages = publicImages.filter((item) => !packedPublic.has(item.file));

console.log(`main bytes ${sum(main)} files ${main.length}`);
for (const sub of subRoots) console.log(`${sub} bytes ${sum(subs[sub])} files ${subs[sub].length}`);
console.log(`importable bytes ${sum(kept)} files ${kept.length}`);
console.log(`packed images ${packedImages.length} bytes ${sum(packedImages)}`);
console.log(`packed fonts ${packedFonts.length} bytes ${sum(packedFonts)}`);
console.log(`packed mp3 ${packedAudio.length}`);
console.log(`public bytes ${sum(publicFiles)} excluded from the mini program`);
console.log(`public images ${publicImages.length} bytes ${sum(publicImages)}`);
console.log(`art-index images ${packedPublic.size}`);
console.log(`required-but-not-packed images ${unpackedImages.length} bytes ${sum(unpackedImages)}`);
const gap = {
  source: "filesystem. Not an IDE upload size.",
  mainBytes: sum(main),
  subpackages: Object.fromEntries(subRoots.map((sub) => [sub, sum(subs[sub])])),
  importableBytes: sum(kept),
  packedFontBytes: sum(packedFonts),
  packedFontFiles: packedFonts.length,
  packedMp3: packedAudio.length,
  publicBytes: sum(publicFiles),
  publicImages: publicImages.length,
  artIndexImages: packedPublic.size,
  requiredButNotPackedImages: unpackedImages.length,
  requiredButNotPackedBytes: sum(unpackedImages),
  publicWordMp3: publicAudio.length,
};
const outName = process.argv[2] || "w10-resource-r4.json";
fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
fs.writeFileSync(path.join(root, "evidence", outName), JSON.stringify(gap, null, 2));
console.log(`wrote evidence/${outName}`);
let running = sum(main);
console.log(`budget running main ${running}`);
for (const sub of subRoots) {
  running += sum(subs[sub]);
  console.log(`budget running ${sub} cumulative ${running}${running > totalLimit ? " OVER_20MB" : ""}`);
}
console.log(`public word mp3 ${publicAudio.length}`);
console.log("source: filesystem after project.config.json packOptions.ignore, split by app.json subpackage roots.");
console.log("https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages");
console.log("limits used here: each package 2MB, all packages 20MB for 服务商代开发. The ordinary all-package limit is 30MB.");
console.log("IDE upload size is 未验证. A git archive is not this package.");

const failures = [];
if (sum(main) > mainLimit) failures.push(`main ${sum(main)} exceeds ${mainLimit}`);
for (const sub of subRoots) if (sum(subs[sub]) > mainLimit) failures.push(`${sub} ${sum(subs[sub])} exceeds ${mainLimit}`);
if (sum(kept) > totalLimit) failures.push(`importable ${sum(kept)} exceeds ${totalLimit}`);
if (packedAudio.length !== 0) failures.push("word mp3 appeared without a source");
if (failures.length) {
  for (const failure of failures) console.log(`FAIL ${failure}`);
  process.exit(2);
}
console.log("main and each subpackage are within 2MB, and the importable total is within 20MB. IDE package size is 未验证.");
process.exit(0);
