import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import {
  buildResultsView,
  LOSS_ENCOURAGEMENT,
  MAP_PRACTICE_NOTE,
  PRACTICE_LINE_1,
  PRACTICE_LINE_2,
  mapResultsFramesReady,
  mapStarCenter,
  moreBadgeLabel,
  resultsLowerShift,
  resultsStackNudge,
  RESULTS_LAYOUT,
  starsFor,
  visibleItems,
  wordsForResults,
  xpBarSegments,
} from "./battle-results";
import { deviceTimeZone, localDayKey } from "./local-day";
import { mapPanel } from "./map-panel";
import { applyBattleOutcome, createSave, levelFromXp } from "./progress";
import { deserialize, serialize } from "./storage";
import { stageById, stageEncounterId } from "./stages";
import type { SaveData } from "./types";

const NOW = Date.parse("2026-08-12T03:00:00.000Z");

function fresh(): SaveData {
  return createSave({ name: "小林", classId: "warrior", appearance: DEFAULT_APPEARANCE, now: NOW });
}

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("battle results stars and words", () => {
  it("BR-A9 gives stars only for a win, using the integer thresholds", () => {
    expect(starsFor(4, 4, true)).toBe(3);
    expect(starsFor(3, 4, true)).toBe(3);
    expect(starsFor(4, 5, true)).toBe(3);
    expect(starsFor(4, 6, true)).toBe(2);
    expect(starsFor(8, 10, true)).toBe(3);
    expect(starsFor(10, 13, true)).toBe(2);
    expect(starsFor(6, 10, true)).toBe(2);
    expect(starsFor(5, 10, true)).toBe(1);
    expect(starsFor(20, 20, true)).toBe(3);
    expect(starsFor(0, 0, true)).toBe(3);
    expect(starsFor(4, 4, false)).toBeNull();
  });

  it("BR-A14 and BR-A32 keep a mixed word as correct, cap the chips, and hide the miss mark", () => {
    const many = ["tree", "bird", "fish", "sun", "map", "run", "big", "red", "river"];
    const answers = [
      ...many.map((wordId) => ({ wordId, correct: false, kind: "meaning" })),
      { wordId: "tree", correct: true, kind: "meaning" },
    ];
    const words = wordsForResults(answers);
    expect(words.words[0]?.wordId).toBe("tree");
    expect(words.words[0]?.correct).toBe(true);
    expect(words.words).toHaveLength(8);
    expect(words.extra).toBe(1);
    expect(words.correct).toBe(1);
    expect(words.total).toBe(10);
    expect(words.words.filter((word) => !word.correct).every((word) => word.gloss.length > 0)).toBe(true);
  });

  it("BR-A2 BR-A10 and BR-A28 keep a loss from changing rewards or the record", () => {
    const save = { ...fresh(), bestStars: { "1": 2 as const }, xp: 40, stageWins: { "1": 1 } };
    const lost = applyBattleOutcome(save, "loss", NOW, stageEncounterId(1), 3, 1);
    expect(lost.xp).toBe(40);
    expect(lost.bestStars).toEqual({ "1": 2 });
    expect(lost.replayWinsByDay).toBeUndefined();
    expect(lost.battlesLost).toBe(1);
    expect(lost.battlesWon).toBe(0);
    expect(lost.rewardQueue).toEqual(save.rewardQueue);
  });

  it("BR-A25 through BR-A31 stores the best stars and the practice card without a village notice", () => {
    let save = fresh();
    const encounter = stageEncounterId(1);
    save = applyBattleOutcome(save, "win", NOW, encounter, 2, 1);
    expect(save.bestStars?.["1"]).toBe(2);
    expect(save.xp).toBeGreaterThan(0);
    expect(save.rewardQueue.every((notice) => notice.title !== "对战胜利")).toBe(true);
    const again = applyBattleOutcome(save, "win", NOW, encounter, 2, 1);
    expect(again.bestStars?.["1"]).toBe(2);
    const raised = applyBattleOutcome(again, "win", NOW, encounter, 3, 1);
    expect(raised.bestStars?.["1"]).toBe(3);
    const kept = applyBattleOutcome(raised, "win", NOW, encounter, 1, 1);
    expect(kept.bestStars?.["1"]).toBe(3);
    const day = localDayKey(new Date(NOW), deviceTimeZone());
    const practiced = { ...kept, replayWinsByDay: { [day]: 3 } };
    const beforeXp = practiced.xp;
    const fourth = applyBattleOutcome(practiced, "win", NOW, encounter, 3, 1);
    expect(fourth.xp).toBe(beforeXp);
    expect(fourth.bestStars?.["1"]).toBe(3);
    const view = buildResultsView({
      before: practiced,
      after: fourth,
      answers: [
        { wordId: "tree", correct: true, kind: "meaning" },
        { wordId: "bird", correct: false, kind: "meaning" },
      ],
      stageId: 1,
      boss: false,
      now: NOW,
    });
    expect(view.practiceOnly).toBe(true);
    expect(view.stars).toBe(3);
    expect(view.card).toBeNull();
    expect(view.words.find((word) => word.wordId === "bird")?.correct).toBe(false);
    const first = buildResultsView({
      before: { ...fresh(), bestStars: {} },
      after: { ...save, bestStars: { "1": 2 } },
      answers: [{ wordId: "tree", correct: true, kind: "meaning" }],
      stageId: 1,
      boss: false,
      now: NOW,
    });
    expect(first.newRecord).toBe(false);
    const record = buildResultsView({
      before: save,
      after: raised,
      answers: [{ wordId: "tree", correct: true, kind: "meaning" }],
      stageId: 1,
      boss: false,
      now: NOW,
    });
    expect(record.newRecord).toBe(true);
    expect(record.thirdReplayReward).toBe(false);
    const third = buildResultsView({
      before: raised,
      after: kept,
      answers: [{ wordId: "tree", correct: true, kind: "meaning" }],
      stageId: 1,
      boss: false,
      now: NOW,
    });
    expect(third.thirdReplayReward).toBe(true);
    expect(third.newRecord).toBe(false);
  });

  it("BR-A13 keeps the review path's cosmetic notice and the battle path silent", () => {
    const before = fresh();
    const after = {
      ...before,
      battlesWon: 1,
      ownedOutfitIds: [...before.ownedOutfitIds, "forest-cape"],
      unlockedSkillIds: [...before.unlockedSkillIds, "warrior-shout"],
      xp: before.xp + 20,
    };
    const view = buildResultsView({
      before,
      after,
      answers: [],
      stageId: 1,
      boss: false,
      now: NOW,
    });
    expect(view.items.map((item) => item.id)).toEqual(["forest-cape", "warrior-shout"]);
    expect(view.items[0]?.line).toContain("已经穿上啦");
    expect(visibleItems(view.items, false).extra).toBe(0);
    const overflow = visibleItems([...view.items, ...view.items], false);
    expect(overflow.shown).toHaveLength(3);
    expect(overflow.extra).toBe(1);
    expect(moreBadgeLabel(overflow.extra)).toBe("+1 件");
    expect(moreBadgeLabel(2)).toBe("+2 件");
    expect(moreBadgeLabel(overflow.extra)).not.toMatch(/衣柜|卡册/);
    expect(PRACTICE_LINE_1).toContain("再战");
    expect(PRACTICE_LINE_2).toBe("练习也很棒！");
    expect(LOSS_ENCOURAGEMENT).toContain("不会丢东西");
  });

  it("BR-A20 uses the real level progress for the bar", () => {
    const progress = levelFromXp(55);
    expect(progress.into / progress.span).toBe(15 / 40);
  });

  it("grows the XP bar in one segment, and fills then resets when a level is crossed", () => {
    expect(xpBarSegments(55, 70)).toEqual([{ from: 15 / 40, to: 30 / 40 }]);
    expect(xpBarSegments(0, 0)).toEqual([{ from: 0, to: 0 }]);
    expect(xpBarSegments(220, 240)).toEqual([{ from: 20 / 40, to: 1 }, { from: 0, to: 0 }]);
    expect(xpBarSegments(10, 90)).toEqual([{ from: 10 / 40, to: 1 }, { from: 0, to: 10 / 40 }]);
  });

  it("grants the forest cape on a practice win after the daily quota is full", () => {
    const day = localDayKey(new Date(NOW), deviceTimeZone());
    const before: SaveData = {
      ...fresh(),
      stageWins: { "1": 1 },
      xp: 80,
      battlesWon: 2,
      skillLevels: { "warrior-bash": 3 },
      replayWinsByDay: { [day]: 3 },
      ownedOutfitIds: ["traveler"],
      equippedOutfitId: "traveler",
    };
    const after = applyBattleOutcome(before, "win", NOW, stageEncounterId(1), 2, 1);
    expect(after.xp).toBe(80);
    expect(after.skillLevels["warrior-bash"]).toBe(3);
    expect(after.ownedOutfitIds).toContain("forest-cape");
    expect(after.equippedOutfitId).toBe("forest-cape");
    const view = buildResultsView({
      before,
      after,
      answers: [{ wordId: "tree", correct: true, kind: "meaning" }],
      stageId: 1,
      boss: false,
      now: NOW,
    });
    expect(view.practiceOnly).toBe(true);
    expect(view.card).toBeNull();
    expect(view.items.map((item) => item.id)).toContain("forest-cape");
    expect(view.items.find((item) => item.id === "forest-cape")?.heading).toContain("林间斗篷");
  });

  it("does not grant the forest cape again once it is owned", () => {
    const day = localDayKey(new Date(NOW), deviceTimeZone());
    const before: SaveData = {
      ...fresh(),
      stageWins: { "1": 1 },
      xp: 80,
      battlesWon: 3,
      skillLevels: { "warrior-bash": 3 },
      replayWinsByDay: { [day]: 4 },
      ownedOutfitIds: ["traveler", "forest-cape"],
      equippedOutfitId: "forest-cape",
    };
    const after = applyBattleOutcome(before, "win", NOW, stageEncounterId(1), 2, 1);
    expect(after.xp).toBe(80);
    expect(after.ownedOutfitIds.filter((id) => id === "forest-cape")).toHaveLength(1);
    const view = buildResultsView({
      before,
      after,
      answers: [{ wordId: "tree", correct: true, kind: "meaning" }],
      stageId: 1,
      boss: false,
      now: NOW,
    });
    expect(view.practiceOnly).toBe(true);
    expect(view.items.some((item) => item.id === "forest-cape")).toBe(false);
  });

  it("BR-A26 reads an old save and drops a bad star", () => {
    const save = fresh();
    const raw = JSON.parse(serialize(save)) as Record<string, unknown>;
    delete raw.bestStars;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.version).toBe(1);
    expect(loaded?.bestStars).toEqual({});
    raw.bestStars = { "1": 4, "2": 2, "3": "3" };
    expect(deserialize(JSON.stringify(raw))?.bestStars).toEqual({ "2": 2 });
    raw.version = 2;
    expect(deserialize(JSON.stringify(raw))).toBeNull();
  });

  it("BR-A15 shows the practice note on a cleared stage once today's quota is full", () => {
    const day = localDayKey(new Date(), deviceTimeZone());
    const save = { ...fresh(), stageWins: { "1": 1 }, replayWinsByDay: { [day]: 3 }, bestStars: { "1": 2 as const } };
    const panel = mapPanel(save, stageById(1)!, "cleared");
    expect(panel.note).toBe(MAP_PRACTICE_NOTE);
    expect(panel.bestStars).toBe(2);
    expect(panel.buttons.find((button) => button.id === "fight")?.enabled).toBe(true);
    const boss = mapPanel(save, stageById(5)!, "cleared");
    expect(boss.note).toBeNull();
    expect(boss.bestStars).toBeNull();
  });

  it("BR-A1 BR-A22 and BR-A34 keep the forbidden words off the results page", () => {
    const scene = source("../game/scenes/BattleResultsScene.ts");
    const model = source("./battle-results.ts");
    const battle = source("../game/scenes/BattleScene.ts");
    const boot = source("../game/scenes/BootScene.ts");
    const main = source("../main.ts");
    const map = source("../game/scenes/StageMapScene.ts");
    const marks = [0x2713, 0x2714, 0x2611, 0x221a].map((code) => String.fromCodePoint(code));
    // Built from code points so the assertion itself is not a font-subset source.
    const phrases = [
      [0x590d, 0x4e60, 0x8bb0, 0x5fc6],
      [0x8bb0, 0x5fc6, 0x66f2, 0x7ebf],
      [0x7a33, 0x5b9a, 0x5ea6],
      [0x96be, 0x5ea6, 0x503c],
      [0x4fdd, 0x6301, 0x7387],
      [0x95f4, 0x9694, 0x91cd, 0x590d],
      [0x6539, 0x52a8, 0x4efb, 0x4f55, 0x8bcd, 0x5361],
      [0x590d, 0x4e60, 0x6218],
    ].map((codes) => String.fromCodePoint(...codes));
    const banned = ["FSRS", ...phrases, ...marks];
    for (const word of banned) {
      expect(scene.includes(word), word).toBe(false);
      expect(model.includes(word), word).toBe(false);
    }
    expect(scene).toContain("battle:results:open");
    expect(scene).toContain("battle:results:final");
    expect(scene).toContain("battle:results:retry");
    expect(scene).toContain("battle:results:continue");
    expect(scene).not.toContain("再试一次 Esc");
    expect(scene).not.toContain("回地图 Esc");
    expect(scene).not.toContain("mutate");
    expect(scene).not.toContain("saveGame");
    expect(scene).not.toContain("atlas_wardrobe");
    expect(battle).toContain('scene.launch("battle-results"');
    expect(battle).toContain("atlas_results");
    expect(battle).not.toContain("atlas_wardrobe");
    expect(boot).not.toContain("atlas_results");
    expect(main).toContain("BattleResultsScene");
    expect(map).toContain("retryStageId");
    expect(RESULTS_LAYOUT.continueButton.y).toBe(744);
    expect(RESULTS_LAYOUT.practiceItems.y + RESULTS_LAYOUT.practiceItems.h / 2 + 30)
      .toBeLessThanOrEqual(RESULTS_LAYOUT.continueButton.y - RESULTS_LAYOUT.continueButton.h / 2);
    expect(mapStarCenter(0)).toEqual({ x: 294, y: 711 });
    expect(mapStarCenter(1)).toEqual({ x: 430, y: 581 });
    expect(mapStarCenter(2)).toEqual({ x: 250, y: 441 });
    expect(mapStarCenter(3)).toEqual({ x: 470, y: 311 });
    expect(mapStarCenter(4)).toEqual({ x: 690, y: 512 });
    expect(scene).not.toContain("还有 ${extra} 样");
    expect(scene).toContain("moreBadgeLabel");
    expect(scene).toContain("xpBarSegments");
    expect(scene).toContain("this.finishing.push(plate)");
    expect(scene.indexOf("this.finishing.push(plate, label)")).toBeGreaterThan(scene.indexOf("新纪录！"));
    expect(scene).toContain("skillIconFrame");
    expect(scene).toContain("resultsLowerShift");
    expect(scene).toContain("resultsStackNudge");
    expect(battle.indexOf("this.concealBattleActors()")).toBeLessThan(battle.indexOf('scene.launch("battle-results"'));
  });

  it("moves the reward block up for a one-row word list and leaves two rows in place", () => {
    expect(resultsLowerShift(1, 0)).toBe(76);
    expect(resultsLowerShift(4, 0)).toBe(76);
    expect(resultsLowerShift(5, 0)).toBe(0);
    expect(resultsLowerShift(8, 2)).toBe(0);
    expect(resultsLowerShift(0, 0)).toBe(174);
  });

  it("centers a short practice or XP stack and leaves a filled reward block where it is", () => {
    expect(resultsStackNudge(1, 0, "tall")).toBe(0);
    expect(resultsStackNudge(5, 0, "tall")).toBe(0);
    expect(resultsStackNudge(5, 0, "practice")).toBe(57);
    expect(resultsStackNudge(1, 0, "xp")).toBe(125);
    expect(resultsStackNudge(4, 0, "xp")).toBe(125);
    const shift = resultsLowerShift(1, 0);
    const nudge = resultsStackNudge(1, 0, "xp");
    const wordBottom = 220 + 64 + nudge;
    const xp = 430 - shift + nudge;
    expect(xp - wordBottom).toBe(70);
  });

  it("refuses to paint map nodes until the results atlas frames are loaded", () => {
    expect(mapResultsFramesReady(() => false)).toBe(false);
    expect(mapResultsFramesReady((frame) => frame !== "map_star_on")).toBe(false);
    expect(mapResultsFramesReady((frame) => frame !== "map_star_off")).toBe(false);
    expect(mapResultsFramesReady((frame) => frame !== "map_node_boss_cleared")).toBe(false);
    expect(mapResultsFramesReady(() => true)).toBe(true);
    const map = source("../game/scenes/StageMapScene.ts");
    const boot = source("../game/scenes/BootScene.ts");
    const guard = map.indexOf("if (!this.mapArtReady())");
    const paint = map.indexOf('warmBackground(this, "bg_map")');
    expect(boot).not.toContain("atlas_map_results");
    expect(map).toContain('queueWarm(this, ["atlas_ui_core", "atlas_map", "atlas_map_results"');
    expect(map).toContain("mapResultsFramesReady");
    expect(guard).toBeGreaterThan(0);
    expect(paint).toBeGreaterThan(guard);
  });
});
