const { Phaser, TEXT_CACHE_FIELDS, nineSliceParts, hitContains, orderByDepth } = require("../lib/game.cjs.js");
const assert = require("assert");

const required = ["text", "fontFamily", "fontSize", "fontStyle", "color", "stroke", "strokeThickness", "align", "wrapWidth", "lineSpacing", "maxLines", "origin"];
assert.deepStrictEqual([...TEXT_CACHE_FIELDS], required);

const canvas = { width: 844, height: 390, getBoundingClientRect: () => ({ left: 0, top: 0, width: 844, height: 390 }), addEventListener() {} };
const game = new Phaser.Game({ canvas, scene: [class Probe extends Phaser.Scene { constructor() { super("probe"); } }] });
const scene = game.start("probe");
const text = scene.add.text(0, 0, "词", { fontFamily: "sans-serif", fontSize: "16px", fontStyle: "700", color: "#111", stroke: "#fff", strokeThickness: 2, align: "center", wordWrap: { width: 40 }, lineSpacing: 4, maxLines: 2 });
text.setOrigin(0.5, 0.5);
const key = JSON.parse(text.cacheKey());
for (const field of required) assert.ok(Object.prototype.hasOwnProperty.call(key, field), field);

const parts = nineSliceParts(40, 30, { left: 4, right: 6, top: 5, bottom: 7 });
assert.strictEqual(parts.length, 9);
assert.strictEqual(parts[4].dw, 30);
assert.strictEqual(parts[4].dh, 18);

const zone = scene.add.zone(100, 100, 40, 20).setOrigin(0.5, 0.5).setInteractive();
assert.strictEqual(hitContains(zone, 100, 100), true);
assert.strictEqual(hitContains(zone, 100, 120), false);

const low = scene.add.rectangle(0, 0, 4, 4).setDepth(1);
const high = scene.add.rectangle(0, 0, 4, 4).setDepth(2);
const ordered = orderByDepth([high, low]);
assert.strictEqual(ordered[0], low);
assert.strictEqual(ordered[1], high);

console.log("check-engine: cache fields, 9 slices, origin hit, stable depth");
console.log("source: Node. Not WeChat.");
process.exit(0);
