/**
 * Pure-function checks for showsDebugLine.
 * Not a release-package test. The task text says cli preview is trial; this file does not check that claim.
 * Not a replacement for tools/p06-adversarial.cjs or tools/p06-probe-smoke.cjs.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const filename = path.join(__dirname, "..", "pages/game/layout.js");
const sandbox = { module: { exports: {} }, exports: {}, console, Math, Number, String };
vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
const shows = sandbox.module.exports.showsDebugLine;
const cases = [
  ["develop", true],
  ["trial", true],
  ["release", false],
  [undefined, true],
  ["", true],
];
let failed = 0;
for (const pair of cases) {
  const actual = shows(pair[0]);
  const ok = actual === pair[1];
  if (!ok) failed += 1;
  console.log(`${JSON.stringify(pair[0])} -> ${actual} expected ${pair[1]} ${ok ? "ok" : "FAIL"}`);
}
console.log("layer: Node pure function. A real release package was not built or opened.");
if (failed) process.exit(1);
console.log(`p061-debug-line: ${cases.length} inputs, 0 failed`);
