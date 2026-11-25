const fs = require("fs");
const path = require("path");
const { CATALOG_WORDS } = require("../lib/domain.cjs.js");

const root = path.join(__dirname, "..");
const publicRoot = path.join(root, "..", "public");

function walk(dir, base = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, base, acc);
    else acc.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return acc;
}

const publicFiles = walk(publicRoot, publicRoot);
const fonts = publicFiles.filter((file) => file.endsWith(".woff2") || file.endsWith(".ttf") || file.endsWith(".woff") || file.endsWith(".otf"));
const imageExt = [".png", ".webp", ".jpg", ".jpeg"];
const publicImages = publicFiles.filter((file) => imageExt.some((ext) => file.endsWith(ext)));
const packedFiles = walk(root, root);
const packedImages = packedFiles.filter((file) => imageExt.some((ext) => file.endsWith(ext)));
const words = CATALOG_WORDS.map((word) => ({
  id: word.id,
  english: word.english,
  path: `assets/audio/words/${word.id}.mp3`,
  present: false,
}));
const packedAudio = walk(root).filter((file) => file.endsWith(".mp3"));
const report = {
  source: "Node filesystem plus domain CATALOG_WORDS. Not a WeChat package upload.",
  catalog: CATALOG_WORDS.length,
  wordAudioPresent: 0,
  packedMp3: packedAudio.length,
  pathTemplate: "assets/audio/words/<id>.mp3",
  speech: "wechat/platform/speech.ts records a missing-audio line. No mp3 bytes are generated.",
  fontsInPublic: fonts,
  fontsPacked: 0,
  fontApi: "wx.loadFontFace",
  fontDoc: "https://developers.weixin.qq.com/miniprogram/dev/api/ui/font/wx.loadFontFace.html",
  fontGap: "Public fonts are woff2 only. No TTF/WOFF was converted or packed. loadFontFace is not called.",
  publicImages: publicImages.length,
  packedImages: packedImages.length,
  packedImageFiles: packedImages,
  imageGap: "The only packed image is the P0.6 skeleton sheet. Warm atlas PNG and webp pixels stay in public/.",
  words,
};
const out = path.join(root, "evidence/w10-resource-gap.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`catalog ${report.catalog}`);
console.log(`word mp3 present ${report.wordAudioPresent}`);
console.log(`packed mp3 ${report.packedMp3}`);
console.log(`public images ${publicImages.length}`);
console.log(`packed images ${packedImages.length} ${packedImages.join(" ")}`);
console.log(`public fonts ${fonts.length}`);
for (const file of fonts) console.log(file);
console.log("font load: not called. wx.loadFontFace needs https or data, TTF/WOFF preferred.");
console.log("source: Node. Not WeChat.");
if (report.catalog !== 863 || packedAudio.length !== 0 || fonts.some((file) => file.endsWith(".ttf"))) process.exit(1);
