const { worldScale, worldToScreen, screenToWorld, uiRect, logicalBodySize, UI_BODY_PX, UI_HIT, UI_GAP } = require("../lib/game.cjs.js");
const assert = require("assert");
const views = [
  { w: 844, h: 390 },
  { w: 667, h: 375 },
  { w: 915, h: 412 },
  { w: 1024, h: 768 },
];
for (const view of views) {
  const scale = worldScale(view);
  const screen = worldToScreen({ x: 0, y: 0 }, view);
  const back = screenToWorld(screen, view);
  assert.ok(Math.abs(back.x) < 1e-6 && Math.abs(back.y) < 1e-6);
  const hit = uiRect(12, 20, UI_HIT, UI_HIT);
  assert.ok(hit.w >= 44 && hit.h >= 44);
  assert.ok(UI_BODY_PX >= 14 && UI_GAP >= 8);
  const shrunk = logicalBodySize(18, view);
  console.log(`${view.w}x${view.h} scale ${scale} design18 logical ${shrunk.toFixed(2)} uiBody ${UI_BODY_PX}`);
  assert.ok(shrunk < 14 || view.h > 700);
}
const phone = logicalBodySize(18, { w: 844, h: 390 });
const { screenFontPx } = require("../lib/game.cjs.js");
assert.strictEqual(screenFontPx(18), 16);
assert.ok(screenFontPx(13) >= 14);
console.log(`world layer design 18 scales to ${phone.toFixed(2)}; UI map is ${screenFontPx(18)}`);
console.log("check-layout: world scale stays fit. UI text uses the logical map, not that scale.");
console.log("source: Node. Painted scenes are check-page-chain.cjs. Not WeChat getWindowInfo.");
process.exit(0);
