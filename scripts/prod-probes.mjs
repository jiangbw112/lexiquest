import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Strings that only exist for the dev/test write-failure probe. */
export const PROD_PROBE_MARKERS = [
  "coverFail",
  "armProfileWriteFailures",
  "profileWriteFailures",
  "consumeProfileWriteFailure",
];

export function probeMarkersIn(source) {
  return PROD_PROBE_MARKERS.filter((marker) => source.includes(marker));
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    const info = statSync(file);
    if (info.isDirectory()) walk(file, out);
    else if (/\.(?:js|mjs|cjs|html|map)$/.test(name)) out.push(file);
  }
  return out;
}

/** Scans built files. A hit means the production bundle still contains the probe. */
export function scanProdTree(dir) {
  const hits = [];
  for (const file of walk(dir, [])) {
    const markers = probeMarkersIn(readFileSync(file, "utf8"));
    if (markers.length > 0) hits.push({ file, markers });
  }
  return hits;
}

function main() {
  const dir = path.resolve(process.argv[2] ?? "dist");
  const hits = scanProdTree(dir);
  if (hits.length === 0) {
    console.log(`prod probes: none in ${dir}`);
    return;
  }
  for (const hit of hits) console.error(`${hit.file}: ${hit.markers.join(", ")}`);
  process.exit(1);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
