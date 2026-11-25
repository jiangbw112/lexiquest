const { SCENES, createGame } = require("../lib/game.cjs.js");
const canvas = {
  width: 844,
  height: 390,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 844, height: 390 }),
  addEventListener() {},
};
const game = createGame(canvas, { width: 844, height: 390 });
const lossView = {
  won: false,
  stars: null,
  stageId: 1,
  boss: false,
  bossName: "",
  firstChapterClear: false,
  practiceOnly: false,
  thirdReplayReward: false,
  newRecord: false,
  correct: 0,
  total: 1,
  words: [],
  extraWords: 0,
  anyUncorrected: false,
  xpBefore: 0,
  xpAfter: 0,
  card: null,
  items: [],
  equippedCosmeticIds: [],
  equippedOutfitId: "traveler",
  praise: "",
  learnMoreLine: null,
  repeatLine: null,
  bossGateLine: null,
  bossGateWords: [],
  bossStudy: [],
  bossBattleHint: null,
};
const rows = [];
for (const Scene of SCENES) {
  const key = new Scene().key;
  try {
    const scene = game.start(key);
    rows.push({ key, ok: true, nodes: scene.children.length, failures: game.failures.length, payload: "none" });
    console.log(`OK ${key} nodes ${scene.children.length}`);
  } catch (error) {
    if (key !== "battle-results") {
      rows.push({ key, ok: false, error: error.message, payload: "none" });
      console.log(`FAIL ${key} ${error.message}`);
      continue;
    }
    try {
      const scene = game.start(key, lossView);
      rows.push({
        key,
        ok: true,
        nodes: scene.children.length,
        failures: game.failures.length,
        payload: "node fixture, not a played battle",
        withoutPayload: error.message,
      });
      console.log(`OK ${key} nodes ${scene.children.length} with a loss fixture; without payload: ${error.message}`);
    } catch (again) {
      rows.push({ key, ok: false, error: again.message, withoutPayload: error.message, payload: "node fixture" });
      console.log(`FAIL ${key} ${again.message}`);
    }
  }
}
const fs = require("fs");
const path = require("path");
fs.writeFileSync(path.join(__dirname, "..", "evidence", "w7-scene-smoke.json"), JSON.stringify({
  source: "Node. Not WeChat DevTools, not a simulator, not a phone.",
  rows,
}, null, 2));
console.log(`scene-smoke ${rows.filter((row) => row.ok).length}/${rows.length}`);
process.exit(0);
