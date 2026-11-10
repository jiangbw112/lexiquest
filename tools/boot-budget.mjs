import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sources = JSON.parse(readFileSync(path.join(root, "tools/font-sources.json"), "utf8"));
const limit = sources.budgets.bootBytes;

function files(dir) {
  return readdirSync(dir).map((name) => path.join(dir, name));
}

const boot = [
  // BootScene preload, in the same order the scene queues them.
  // The forest manifest is imported by the JS bundle, so it is not counted again.
  path.join(root, "public/assets/atlases/actors.png"),
  path.join(root, "public/assets/atlases/actors.json"),
  ...files(path.join(root, "public/assets/warrior/v0.1/atlas")),
  ...files(path.join(root, "public/assets/chapter/forest/v0.1/atlas")),
  ...files(path.join(root, "public/assets/warm/atlas")).filter((file) => path.basename(file).startsWith("atlas_ui_core")),
  ...files(path.join(root, "public/assets/warm/atlas")).filter((file) => path.basename(file).startsWith("atlas_village")),
  path.join(root, "public/assets/warm/backgrounds/bg_home_2x.webp"),
  path.join(root, "public/assets/warm/backgrounds/bg_village_2x.webp"),
  path.join(root, "public/assets/warm/logo/logo_title_2x.webp"),
  path.join(root, "public/fonts/fonts.css"),
  ...files(path.join(root, "public/fonts")).filter((file) => /core\.woff2$|ZCOOLKuaiLe-ui\.woff2$|Nunito-latin\.woff2$/.test(file)),
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
