const { easeValue, Phaser, liveTimerCount } = require("../lib/game.cjs.js");
const assert = require("assert");

const samples = {
  "Sine.easeInOut": [0, 0.5, 1],
  "Quad.easeOut": [0, 0.75, 1],
  "Quad.easeIn": [0, 0.25, 1],
  Linear: [0, 0.5, 1],
};
for (const [name, expected] of Object.entries(samples)) {
  const actual = [0, 0.5, 1].map((t) => easeValue(name, t));
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9, `${name} ${value}`));
  console.log(name, actual.join(","));
}
const back = easeValue("Back.easeOut", 0.5);
const s = 1.70158;
const x = 0.5 - 1;
const expectBack = x * x * ((s + 1) * x + s) + 1;
assert.ok(Math.abs(back - expectBack) < 1e-9, String(back));
console.log("Back.easeOut", back);

const canvas = { width: 100, height: 100, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), addEventListener() {} };
class Timed extends Phaser.Scene {
  constructor() { super("timed"); }
  create() { this.time.addEvent({ delay: 10, loop: true, callback() {} }); }
}
const game = new Phaser.Game({ canvas, scene: [Timed] });
game.start("timed");
assert.strictEqual(liveTimerCount(game), 1);
for (let i = 0; i < 50; i += 1) game.start("timed");
assert.strictEqual(liveTimerCount(game), 1);
console.log("check-anims: curves and timer reset");
console.log("source: Node. Not WeChat.");
process.exit(0);
