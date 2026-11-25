const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { attach } = require("../pages/game/port.js");

const page = fs.readFileSync(path.join(__dirname, "../pages/game/index.js"), "utf8");
assert(page.includes('require("./port.js")'), "the page loads port.js");
assert(!page.includes("EMPTY_IMPORT_META"), "page source is not a build log");

const canvas = {
  width: 844,
  height: 390,
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 844, height: 390 };
  },
  addEventListener() {},
};
const ctx = {
  fillStyle: "",
  font: "",
  textBaseline: "",
  textAlign: "",
  fillRect() {},
  fillText() {},
};

function pressLabel(port, view, text) {
  const now = port.paint(ctx, view);
  const label = now.texts.find((item) => item.text.includes(text));
  if (!label) return false;
  let best = null;
  let score = 1e9;
  for (const hit of now.hits) {
    const dist = Math.abs(hit.x + hit.w / 2 - (label.x + 12)) + Math.abs(hit.y + hit.h / 2 - (label.y + 8));
    if (dist < score) {
      score = dist;
      best = hit;
    }
  }
  if (!best || score > 500) return false;
  port.press(best.x + best.w / 2, best.y + best.h / 2, view);
  return true;
}

const views = [
  { w: 844, h: 390 },
  { w: 667, h: 375 },
  { w: 915, h: 412 },
  { w: 1024, h: 768 },
];
const view = { ...views[0], route: "practice" };
const port = attach(canvas, view);
assert.strictEqual(port.catalog, 863);
assert.strictEqual(port.screenFontPx(18), 16);
assert.ok(port.copy.includes("微信"));
assert.ok(!port.copy.includes("浏览器"));

for (const size of views) {
  const learn = port.paint(ctx, size);
  assert.ok(learn.texts.length > 0, `${size.w} learn texts`);
  assert.ok(learn.minFont >= 14, `${size.w} font ${learn.minFont}`);
  assert.ok(learn.hits.length === 0 || learn.minHit >= 44, `${size.w} hit ${learn.minHit}`);
  assert.ok(learn.minGap >= 8, `${size.w} gap ${learn.minGap}`);
  console.log(`learn ${size.w}x${size.h} texts ${learn.texts.length} font ${learn.minFont} hit ${learn.minHit} gap ${learn.minGap}`);
}

port.start("battle", { stageId: port.practice.stageId, chapterId: port.practice.chapterId });
const battle = port.paint(ctx, view);
assert.strictEqual(port.runtime.active().key, "battle");
assert.ok(battle.texts.length > 0, "battle texts");
assert.ok(battle.minFont >= 14 && battle.minHit >= 44 && battle.minGap >= 8, "battle metrics");
console.log(`battle texts ${battle.texts.length} hits ${battle.hits.length} font ${battle.minFont}`);

for (let step = 0; step < 40 && port.runtime.active().key === "battle"; step += 1) {
  let acted = false;
  for (const label of ["1 攻击", "再试一次", "回关卡", "看结局"]) {
    if (pressLabel(port, view, label)) acted = true;
  }
  if (!acted) {
    const hit = port.paint(ctx, view).hits.at(-1);
    assert.ok(hit, "a question choice is on screen");
    port.press(hit.x + 4, hit.y + 4, view);
  }
  port.step(700);
}

const results = port.paint(ctx, view);
assert.strictEqual(port.runtime.active().key, "battle-results");
assert.ok(results.texts.some((item) => item.text.includes("胜利") || item.text.includes("再试")), "results copy");
assert.ok(results.minFont >= 14 && results.minHit >= 44 && results.minGap >= 8, `results font ${results.minFont} hit ${results.minHit} gap ${results.minGap}`);
const save = port.save();
assert.ok(save && (save.battlesWon > 0 || save.battlesLost > 0), "the fight wrote the profile");
console.log(`results texts ${results.texts.length} font ${results.minFont} hit ${results.minHit} gap ${results.minGap} battles ${save.battlesWon}/${save.battlesLost}`);

const keys = ["profiles", "title", "grades", "create", "overworld", "learn", "stages", "collection", "review", "skills", "wardrobe", "ending", "duel", "guide", "exam-battle"];
const matrix = [];
port.start("create", { grades: ["G3"] });
{
  const scene = port.runtime.active();
  const plan = port.paint(ctx, view);
  matrix.push({ key: "create:grades", active: scene.key, nodes: scene.children.length, texts: plan.texts.length, font: plan.minFont });
  console.log(`scene create:grades active ${scene.key} nodes ${scene.children.length} texts ${plan.texts.length}`);
}
for (const key of keys) {
  try {
    port.start(key);
    const scene = port.runtime.active();
    const plan = port.paint(ctx, view);
    matrix.push({ key, active: scene.key, nodes: scene.children.length, texts: plan.texts.length, font: plan.minFont });
    console.log(`scene ${key} active ${scene.key} nodes ${scene.children.length} texts ${plan.texts.length}`);
  } catch (error) {
    matrix.push({ key, error: error.message });
    console.log(`scene ${key} ERR ${error.message}`);
  }
}
try {
  port.start("exam-battle", { examId: "exam_g3_s1_mid" });
  const scene = port.runtime.active();
  const plan = port.paint(ctx, view);
  matrix.push({ key: "exam-battle:exam_g3_s1_mid", active: scene.key, nodes: scene.children.length, texts: plan.texts.length, font: plan.minFont });
  console.log(`scene exam-battle:exam_g3_s1_mid active ${scene.key} nodes ${scene.children.length} texts ${plan.texts.length}`);
  assert.strictEqual(scene.key, "exam-battle");
  assert.ok(plan.texts.length > 0, "exam scene draws copy");
} catch (error) {
  matrix.push({ key: "exam-battle:exam_g3_s1_mid", error: error.message });
  console.log(`scene exam-battle:exam_g3_s1_mid ERR ${error.message}`);
  throw error;
}

port.start("boot");
setTimeout(() => {
  try {
    const scene = port.runtime.active();
    const plan = port.paint(ctx, view);
    matrix.push({ key: "boot", active: scene.key, nodes: scene.children.length, texts: plan.texts.length, font: plan.minFont });
    console.log(`scene boot active ${scene.key} nodes ${scene.children.length} texts ${plan.texts.length}`);
    assert.strictEqual(scene.key, "profiles", "page boot route reaches profiles");
    assert.ok(plan.texts.length > 0, "profiles has copy");
    const out = path.join(__dirname, "../evidence/w8-chain.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ source: "Node page port.js. Not WeChat DevTools or a phone.", matrix }, null, 2));
    console.log("check-page-chain: learn, battle, results, and the scene matrix");
    console.log("source: Node through wechat/pages/game/port.js. Not WeChat.");
    process.exit(0);
  } catch (error) {
    console.log(`scene boot ERR ${error.message}`);
    process.exit(1);
  }
}, 50);
