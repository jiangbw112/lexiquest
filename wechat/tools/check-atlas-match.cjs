/**
 * Field compare of skeleton-atlas.js and skeleton-atlas.json.
 * Node vm. Not a mini program require and not DevTools.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const json = JSON.parse(fs.readFileSync(path.join(root, "assets/atlas/skeleton-atlas.json"), "utf8"));
const jsPath = path.join(root, "assets/atlas/skeleton-atlas.js");
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(fs.readFileSync(jsPath, "utf8"), sandbox, { filename: jsPath });
const problems = [];

function walk(a, b, trail) {
  if (a === b) return;
  const aType = Object.prototype.toString.call(a);
  const bType = Object.prototype.toString.call(b);
  if (aType !== bType) {
    problems.push(`${trail}: type ${aType} vs ${bType}`);
    return;
  }
  if (aType !== "[object Object]" && aType !== "[object Array]") {
    problems.push(`${trail}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return;
  }
  for (const key of Object.keys(a)) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) problems.push(`${trail}.${key}: missing in js`);
    else walk(a[key], b[key], `${trail}.${key}`);
  }
  for (const key of Object.keys(b)) {
    if (!Object.prototype.hasOwnProperty.call(a, key)) problems.push(`${trail}.${key}: extra in js`);
  }
}

walk(json, sandbox.module.exports, "atlas");
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("check-atlas-match: js fields equal json fields");
console.log("source: Node");
