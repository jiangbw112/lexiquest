/**
 * showsDebugLine unit check. Not a release package.
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
console.log("source: Node pure function. A release package was not built.");
if (failed) process.exit(1);
console.log(`check-debug-line: ${cases.length} inputs, 0 failed`);
