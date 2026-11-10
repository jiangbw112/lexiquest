import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = JSON.parse(readFileSync(path.join(root, "tools/font-sources.json"), "utf8"));

/** Decimal bytes, as specified. Not 3.8 × 1,048,576. */
export const BOOT_WARN_BYTES = sources.budgets.bootWarnBytes;
/** 4 × 1,048,576. A package over this fails the build. */
export const BOOT_LIMIT_BYTES = sources.budgets.bootBytes;

export function evaluateBootBudget(total, warnBytes = BOOT_WARN_BYTES, limitBytes = BOOT_LIMIT_BYTES) {
  if (total > limitBytes) {
    return { level: "fail", message: `boot package is ${total} bytes, over the ${limitBytes} byte limit` };
  }
  if (total > warnBytes) {
    return { level: "warn", message: `boot package is ${total} bytes, over the ${warnBytes} byte warning line` };
  }
  return { level: "ok", message: `boot package is ${total} bytes, under the ${warnBytes} byte warning line` };
}

function files(dir) {
  return readdirSync(dir).map((name) => path.join(dir, name));
}

function main() {
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
  const result = evaluateBootBudget(total);
  console.log(`boot total ${total} bytes, warning ${BOOT_WARN_BYTES}, budget ${BOOT_LIMIT_BYTES}`);
  if (result.level === "warn") {
    console.warn(`::warning title=Boot package::${result.message}`);
  }
  if (result.level === "fail") {
    console.error(result.message);
    process.exit(1);
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
