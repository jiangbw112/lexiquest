import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sources = JSON.parse(readFileSync(path.join(root, "tools/font-sources.json"), "utf8"));
const limit = sources.budgets.bootBytes;

function files(dir) {
  return readdirSync(dir).map((name) => path.join(dir, name));
}

const boot = [
  ...files(path.join(root, "public/assets/warm/atlas")).filter((file) => path.basename(file).startsWith("atlas_ui_core")),
  ...files(path.join(root, "public/fonts")).filter((file) => /core\.woff2$|ZCOOLKuaiLe-ui\.woff2$|Nunito-latin\.woff2$/.test(file)),
  path.join(root, "public/assets/warm/backgrounds/bg_forest_battle_2x.webp"),
  ...files(path.join(root, "public/assets/warrior/v0.1/atlas")),
  ...files(path.join(root, "dist/assets")).filter((file) => file.endsWith(".js") || file.endsWith(".css")),
];

let total = 0;
for (const file of boot) {
  const size = statSync(file).size;
  total += size;
  console.log(`${size}\t${path.relative(root, file)}`);
}
console.log(`boot total ${total} bytes, budget ${limit}`);
if (total > limit) {
  console.error(`boot package is over the ${limit} byte budget`);
  process.exit(1);
}
