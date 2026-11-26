// Copies original bytes from public/assets/warm into art-ui and art-world.
// Do not run this over a tree that compress-packed.py has already rewritten:
// it would put the large originals back into those two packages.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wechat = path.join(here, "..");
const publicRoot = path.join(wechat, "..", "public");
const warm = path.join(publicRoot, "assets/warm");
const limit = Math.floor(1.9 * 1024 * 1024);

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const images = walk(warm).filter((file) => file.endsWith(".png") || file.endsWith(".webp"));
const buckets = [
  { root: "packages/art-ui", bytes: 0, files: [] },
  { root: "packages/art-world", bytes: 0, files: [] },
];
const index = {};
for (const file of images.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)) {
  const size = fs.statSync(file).size;
  const bucket = buckets.find((item) => item.bytes + size <= limit) ?? buckets[buckets.length - 1];
  if (bucket.bytes + size > limit) throw new Error(`no subpackage room for ${file}`);
  const destName = path.relative(warm, file).split(path.sep).join("__");
  const dest = path.join(wechat, bucket.root, destName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
  bucket.bytes += size;
  bucket.files.push(destName);
  index[path.relative(publicRoot, file).split(path.sep).join("/")] = `${bucket.root}/${destName}`;
}
fs.writeFileSync(path.join(wechat, "packages/art-index.js"), `module.exports = ${JSON.stringify(index, null, 2)};\n`);
for (const bucket of buckets) console.log(`${bucket.root} files ${bucket.files.length} bytes ${bucket.bytes}`);
console.log(`mapped ${Object.keys(index).length}`);
