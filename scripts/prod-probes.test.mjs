import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { probeMarkersIn, scanProdTree } from "./prod-probes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(root, "node_modules/vite/bin/vite.js");

describe("production probe scan", () => {
  it("flags the cover-spell fault markers and ignores ordinary source", () => {
    expect(probeMarkersIn('get("coverFail") === "1"; armProfileWriteFailures(1);')).toEqual([
      "coverFail",
      "armProfileWriteFailures",
    ]);
    expect(probeMarkersIn("profileWriteFailures consumeProfileWriteFailure")).toEqual([
      "profileWriteFailures",
      "consumeProfileWriteFailure",
    ]);
    expect(probeMarkersIn("盖住拼 devModeEnabled")).toEqual([]);
    const dir = mkdtempSync(path.join(tmpdir(), "lexi-probe-fixture-"));
    try {
      writeFileSync(path.join(dir, "app.js"), 'const q = "coverFail";');
      expect(scanProdTree(dir)).toEqual([{ file: path.join(dir, "app.js"), markers: ["coverFail"] }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops the cover-spell fault injection from the production bundle", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "lexi-prod-"));
    const readableDir = path.join(outDir, "readable");
    const shippedDir = path.join(outDir, "shipped");
    mkdirSync(readableDir);
    mkdirSync(shippedDir);
    try {
      viteBuild(readableDir, ["--minify", "false"]);
      viteBuild(shippedDir, []);
      const readable = scanProdTree(readableDir);
      const shipped = scanProdTree(shippedDir);
      expect(readable, JSON.stringify(readable)).toEqual([]);
      expect(shipped, JSON.stringify(shipped)).toEqual([]);
      const shippedJs = readJs(shippedDir);
      expect(shippedJs.length).toBeGreaterThan(100_000);
      expect(shippedJs).toContain("盖住拼");
      expect(shippedJs).not.toContain("coverFail");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 180_000);
});

function viteBuild(outDir, extra) {
  // Vitest sets NODE_ENV=test. Vite then leaves import.meta.env.DEV true, so this
  // child build must use the same production env as `vite build` / `npm run build`.
  const env = { ...process.env, NODE_ENV: "production" };
  execFileSync(process.execPath, [viteBin, "build", "--mode", "production", "--outDir", outDir, "--emptyOutDir", ...extra], {
    cwd: root,
    stdio: "inherit",
    env,
  });
}

function readJs(dir) {
  let text = "";
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) text += readJs(file);
    else if (name.endsWith(".js")) text += readFileSync(file, "utf8");
  }
  return text;
}
