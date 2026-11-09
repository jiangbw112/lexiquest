import { readFileSync } from "node:fs";
import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { chapterCosmeticLayers, COSMETIC_Z, slotDepth } from "../game/art/chapter-cosmetics";
import { WARRIOR_LAYERS } from "../game/art/warrior-pack";
import { sampleWords } from "./catalog";
import {
  applyChapterRewards,
  badgeLitMin,
  CHAPTER_ART_LIMITS,
  displayTitle,
    equipTitle,
  FOREST_REWARDS,
  unequipCosmetic,
  visibilityForCosmetics,
  type ChapterRewardConfig,
} from "./chapter-rewards";
import { notePracticeAnswer, parentView } from "./parent";
import { applyBattleOutcome, createSave, learnWord, reviewWord } from "./progress";
import { DEFAULT_APPEARANCE } from "./appearance";
import { chapterWordIds, litMasteryCount } from "./stages";
import { deserialize, serialize } from "./storage";
import type { SaveData } from "./types";

const START = new Date("2026-03-01T02:00:00Z");

function newSave(): SaveData {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades: ["G3", "G4", "G5", "G6"],
  });
}

function learnAll(save: SaveData): SaveData {
  let next = save;
  for (const word of sampleWords()) next = learnWord(next, word.id, START);
  return next;
}

function bright(save: SaveData, ids: readonly string[]): SaveData {
  const wordCards = { ...save.wordCards };
  const memory = { ...save.memory };
  for (const id of ids) {
    const card = wordCards[id];
    const record = memory[id];
    if (!card || !record) throw new Error(`missing ${id}`);
    wordCards[id] = { ...card, masteryBadge: true, masteredAt: START.getTime() };
    memory[id] = {
      ...record,
      fsrs: {
        ...record.fsrs,
        due: new Date(START.getTime() + 30 * 86_400_000).toISOString(),
        state: State.Review,
      },
    };
  }
  return { ...save, wordCards, memory };
}

function fixtureConfig(): ChapterRewardConfig {
  const title = (zh: string, en: string): ChapterRewardConfig["titles"][string] => ({
    zh,
    en,
    candidates_zh: [zh, "备用"],
    candidates_en: [en, "Spare"],
    default_candidate_index: 0,
    final_name_selected_by_pm: false,
  });
  return {
    chapter_id: "fixture",
    word_count_source: "chapter_word_list.length",
    mastery_milestone_ratios: [0.5, 1],
    clear_reward: { cosmetic_ids: ["fixture_cape"], title_id: "title_fixture_clear", grant_once: true },
    mastery_milestones: [
      {
        id: "fixture_50",
        ratio: 0.5,
        badge_lit_min: 1,
        badge_lit_min_formula: "ceil(total * ratio)",
        cosmetic_ids: ["fixture_pin"],
        title_id: "title_fixture_50",
        grant_once: true,
      },
      {
        id: "fixture_100",
        ratio: 1,
        badge_lit_min: 99,
        badge_lit_min_formula: "ceil(total * ratio)",
        cosmetic_ids: ["fixture_wreath"],
        title_id: "title_fixture_100",
        grant_once: true,
      },
    ],
    replay: { unique_cosmetics: false, extra_token_every_n_wins: null },
    titles: {
      title_fixture_clear: title("甲称号", "Clear"),
      title_fixture_50: title("乙称号", "Half"),
      title_fixture_100: title("丙称号", "All"),
    },
    slot_map: {
      fixture_cape: "cosmetic_back",
      fixture_pin: "cosmetic_chest",
      fixture_wreath: "cosmetic_head",
    },
    hide_rules: FOREST_REWARDS.hide_rules,
    art_priority: "after_canopy_boss_remaining",
  };
}

describe("forest chapter rewards", () => {
  it("reads the confirmed config and shows candidate 1 with the name still open", () => {
    expect(FOREST_REWARDS.chapter_id).toBe("forest_adventure");
    expect(FOREST_REWARDS.mastery_milestone_ratios).toEqual([0.5, 1]);
    expect(FOREST_REWARDS.clear_reward).toEqual({
      cosmetic_ids: ["forest_leaf_cape"],
      title_id: "title_forest_trekker",
      grant_once: true,
    });
    expect(FOREST_REWARDS.replay).toEqual({ unique_cosmetics: false, extra_token_every_n_wins: null });
    expect(FOREST_REWARDS.slot_map.acorn_pin).toBe("cosmetic_chest");
    for (const entry of Object.values(FOREST_REWARDS.titles)) {
      expect(entry.final_name_selected_by_pm).toBe(false);
      expect(entry.default_candidate_index).toBe(0);
      expect(entry.zh).toBe(entry.candidates_zh[0]);
      expect(entry.en).toBe(entry.candidates_en[0]);
    }
    const shown = displayTitle(FOREST_REWARDS, FOREST_REWARDS.clear_reward.title_id);
    expect(shown.shownZh).toBe(shown.candidates_zh[0]);
    expect(shown.final_name_selected_by_pm).toBe(false);
  });

  it("keeps thresholds, ids, and title strings out of the grant module", () => {
    const source = readFileSync("src/domain/chapter-rewards.ts", "utf8");
    expect(source).not.toMatch(/林间|半林|森语|林心探索者/);
    expect(source).not.toMatch(/\b14\b|\b28\b/);
    const progress = readFileSync("src/domain/progress.ts", "utf8");
    expect(progress).not.toMatch(/林间小旅人|半林识词伴|森语小达人|林心探索者/);
  });

  it("grants the clear reward once and leaves a second clear unchanged", () => {
    const ready = { ...learnAll(newSave()), stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    const beforeXp = ready.xp;
    const cleared = applyBattleOutcome(ready, "win", START.getTime() + 2, "canopy");
    const ordinary = applyBattleOutcome(ready, "win", START.getTime() + 2, "forest-stage-1");
    expect(cleared.chapterCleared).toBe(true);
    expect(cleared.clearRewardClaimed).toBe(true);
    expect(cleared.unlockedCosmeticIds).toEqual(["forest_leaf_cape"]);
    expect(cleared.equippedCosmeticIds).toEqual(["forest_leaf_cape"]);
    expect(cleared.unlockedTitleIds).toEqual([FOREST_REWARDS.clear_reward.title_id]);
    expect(cleared.equippedTitleId).toBe(FOREST_REWARDS.clear_reward.title_id);
    expect(cleared.xp - beforeXp).toBe(ordinary.xp - beforeXp);
    expect(cleared.memory).toBe(ready.memory);
    expect(cleared.wordCards).toBe(ready.wordCards);
    expect(cleared.cosmeticTokens).toBe(ready.cosmeticTokens);
    const again = applyBattleOutcome(cleared, "win", START.getTime() + 3, "canopy");
    expect(again.unlockedCosmeticIds).toEqual(cleared.unlockedCosmeticIds);
    expect(again.unlockedTitleIds).toEqual(cleared.unlockedTitleIds);
    expect(again.clearRewardClaimed).toBe(true);
    expect(again.cosmeticTokens).toBe(cleared.cosmeticTokens);
    expect(FOREST_REWARDS.replay.unique_cosmetics).toBe(false);
    expect(FOREST_REWARDS.replay.extra_token_every_n_wins).toBeNull();
  });

  it("uses ceil for any chapter length and ignores a cached badge_lit_min", () => {
    expect(badgeLitMin(28, 0.5)).toBe(14);
    expect(badgeLitMin(28, 1)).toBe(28);
    expect(badgeLitMin(27, 0.5)).toBe(14);
    expect(badgeLitMin(27, 1)).toBe(27);
    expect(badgeLitMin(10, 0.5)).toBe(5);
    expect(badgeLitMin(1, 0.5)).toBe(1);
    expect(badgeLitMin(1, 1)).toBe(1);
    const config = fixtureConfig();
    const save = newSave();
    expect(applyChapterRewards(save, 13, 27, config).unlockedCosmeticIds).toEqual([]);
    const half = applyChapterRewards(save, 14, 27, config);
    expect(half.unlockedCosmeticIds).toEqual(["fixture_pin"]);
    expect(half.masteryMilestonesClaimed).toEqual(["fixture_50"]);
    expect(half.titles).toEqual([displayTitle(config, "title_fixture_50").shownZh]);
    const full = applyChapterRewards(half, 27, 27, config);
    expect(full.unlockedCosmeticIds).toEqual(["fixture_pin", "fixture_wreath"]);
    expect(full.masteryMilestonesClaimed).toEqual(["fixture_50", "fixture_100"]);
    const both = applyChapterRewards(save, 1, 1, config);
    expect(both.masteryMilestonesClaimed).toEqual(["fixture_50", "fixture_100"]);
  });

  it("does not grant a claimed milestone again and does not revoke it when the count drops", () => {
    const ids = chapterWordIds();
    const halfIds = ids.slice(0, 14);
    const save = bright(learnAll(newSave()), halfIds);
    expect(litMasteryCount(save, START)).toBe(14);
    const reviewed = reviewWord(save, ids[14] ?? "tree", Rating.Good, START);
    expect(reviewed.masteryMilestonesClaimed).toEqual(["forest_mastery_50"]);
    expect(reviewed.unlockedCosmeticIds).toEqual(["acorn_pin"]);
    expect(reviewed.xp).toBe(save.xp);
    expect(reviewed.skillLevels).toEqual(save.skillLevels);
    expect(reviewed.battlesWon).toBe(save.battlesWon);
    expect(reviewed.cosmeticTokens).toBe(save.cosmeticTokens);
    const grey = {
      ...reviewed,
      memory: Object.fromEntries(
        Object.entries(reviewed.memory).map(([id, record]) => [
          id,
          { ...record, fsrs: { ...record.fsrs, due: new Date(START.getTime() - 1000).toISOString(), state: State.Relearning } },
        ]),
      ),
    };
    expect(litMasteryCount(grey, START)).toBe(0);
    const kept = applyChapterRewards(grey, litMasteryCount(grey, START), ids.length);
    expect(kept.unlockedCosmeticIds).toEqual(reviewed.unlockedCosmeticIds);
    expect(kept.unlockedTitleIds).toEqual(reviewed.unlockedTitleIds);
    expect(kept.masteryMilestonesClaimed).toEqual(reviewed.masteryMilestonesClaimed);
    const relit = applyChapterRewards(kept, ids.length, ids.length);
    expect(relit.unlockedCosmeticIds.filter((id) => id === "acorn_pin")).toEqual(["acorn_pin"]);
    expect(relit.masteryMilestonesClaimed.filter((id) => id === "forest_mastery_50")).toEqual(["forest_mastery_50"]);
    const loaded = deserialize(serialize(kept));
    expect(loaded?.unlockedCosmeticIds).toEqual(kept.unlockedCosmeticIds);
    expect(loaded?.unlockedTitleIds).toEqual(kept.unlockedTitleIds);
    expect(loaded?.masteryMilestonesClaimed).toEqual(kept.masteryMilestonesClaimed);
    expect(loaded?.clearRewardClaimed).toBe(false);
  });

  it("changes only cosmetics and titles", () => {
    const save = learnAll(newSave());
    const granted = applyChapterRewards({ ...save, chapterCleared: true }, 28, 28);
    expect(granted.xp).toBe(save.xp);
    expect(granted.skillLevels).toEqual(save.skillLevels);
    expect(granted.memory).toBe(save.memory);
    expect(granted.wordCards).toBe(save.wordCards);
    expect(granted.cosmeticTokens).toBe(save.cosmeticTokens);
    expect(granted.battlesWon).toBe(save.battlesWon);
    expect(granted.unlockedCosmeticIds).toEqual(["forest_leaf_cape", "acorn_pin", "forest_wreath"]);
    const practiced = notePracticeAnswer(
      {
        ...granted,
        cosmeticTokens: 2,
        dailyGoal: {
          dayKey: "2026-03-01",
          snapshotDue: 0,
          mode: "practice_fallback",
          targetReview: 0,
          targetLearn: 0,
          targetPractice: 1,
          progressReview: 0,
          progressLearn: 0,
          progressPractice: 0,
          completed: false,
          rewardClaimed: false,
        },
      },
      "tree",
      START,
    );
    expect(practiced.cosmeticTokens).toBe(3);
    expect(practiced.unlockedCosmeticIds).toEqual(granted.unlockedCosmeticIds);
  });

  it("equips one title at a time and can take it off", () => {
    const save = applyChapterRewards({ ...newSave(), chapterCleared: true }, 28, 28);
    expect(save.equippedTitleId).toBe(FOREST_REWARDS.clear_reward.title_id);
    const next = equipTitle(save, "title_forest_word_star");
    expect(next.equippedTitleId).toBe("title_forest_word_star");
    expect(next.unlockedTitleIds).toEqual(save.unlockedTitleIds);
    const cleared = equipTitle(next, null);
    expect(cleared.equippedTitleId).toBeNull();
    expect(cleared.unlockedTitleIds).toEqual(save.unlockedTitleIds);
    expect(equipTitle(cleared, "missing")).toBe(cleared);
    const facing = parentView(save, START).masteredLine;
    expect(facing).toContain("已通关森林");
    expect(facing).toContain(`徽章亮起 0 / ${chapterWordIds().length}`);
    expect(facing).not.toMatch(/最强|排行|稀有/);
  });

  it("hides the whole helmet with the wreath, and the back slot with the cape", () => {
    expect(FOREST_REWARDS.hide_rules).toEqual([
      { when_equipped: "forest_leaf_cape", hide_slots: ["back"] },
      { when_equipped: "forest_wreath", hide_slots: ["outfit_head"] },
    ]);
    const slots = WARRIOR_LAYERS.map((layer) => layer.slot);
    expect(slots).toContain("outfit_head");
    expect(slots).not.toContain("back");
    const both = visibilityForCosmetics(FOREST_REWARDS, ["forest_leaf_cape", "forest_wreath"], {
      slots,
      parts: ["helmet_plume"],
    });
    expect(both.hiddenSlots).toEqual(["outfit_head"]);
    expect(both.hiddenParts).toEqual([]);
    expect(both.unmet).toEqual(["back"]);
    const wreath = visibilityForCosmetics(FOREST_REWARDS, ["forest_wreath"], {
      slots: ["outfit_head", "hair", "body", "back"],
      parts: [],
    });
    expect(wreath.hiddenSlots).toEqual(["outfit_head"]);
    expect(wreath.hiddenSlots).not.toContain("hair");
    expect(wreath.hiddenSlots).not.toContain("body");
    const cape = visibilityForCosmetics(FOREST_REWARDS, ["forest_leaf_cape"], { slots, parts: [] });
    expect(cape.hiddenSlots).toEqual([]);
    expect(cape.unmet).toEqual(["back"]);
    expect(CHAPTER_ART_LIMITS.join("\n")).toMatch(/back/);
    expect(CHAPTER_ART_LIMITS.join("\n")).toMatch(/整顶头盔/);
    expect(CHAPTER_ART_LIMITS.join("\n")).not.toMatch(/不藏整顶头盔/);
  });

  it("places the pin on cosmetic_chest and keeps the other slots", () => {
    const layers = chapterCosmeticLayers();
    expect(layers.find((layer) => layer.id === "acorn_pin")).toMatchObject({ id: "acorn_pin", slot: "cosmetic_chest", z: 47 });
    expect(COSMETIC_Z.cosmetic_chest).toBe(47);
    expect(slotDepth("cosmetic_back")).toBe(6);
    expect(slotDepth("cosmetic_head")).toBe(65);
    expect(slotDepth("cosmetic_chest")).toBeGreaterThan(slotDepth("outfit_body"));
    expect(slotDepth("cosmetic_chest")).toBeLessThan(slotDepth("hair"));
    expect(slotDepth("cosmetic_head")).toBeGreaterThan(slotDepth("outfit_head"));
    expect(slotDepth("cosmetic_head")).toBeLessThan(slotDepth("body_front"));
    const granted = applyChapterRewards({ ...newSave(), chapterCleared: true }, 0, 28);
    const taken = unequipCosmetic(granted, "forest_leaf_cape");
    expect(taken.equippedCosmeticIds).not.toContain("forest_leaf_cape");
    expect(taken.unlockedCosmeticIds).toContain("forest_leaf_cape");
  });
});
