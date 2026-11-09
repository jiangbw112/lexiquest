import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { DEFAULT_APPEARANCE } from "./appearance";
import { displayTitle, FOREST_REWARDS } from "./chapter-rewards";
import { GRADE_REQUIRED_NOTICE, canConfirmGrades, sampleWords, toggleGradeChoice, wordsForGrades } from "./catalog";
import {
  applyBattleOutcome,
  createSave,
  equipSkill,
  gradeGate,
  gradePauseNotice,
  learnedCountInGrade,
  learnWord,
  needsGradeChoice,
  practiceDuel,
  questLine,
  reviewWord,
  selectedCollected,
  selectionBattleNotice,
  setSelectedGrades,
  unequipSkill,
} from "./progress";
import { badgeTone, calendarDay } from "./review";
import { deserialize, serialize } from "./storage";
import { skillsForClass } from "./skills";
import { masteryDecision } from "./review";

const START = new Date("2026-03-01T02:00:00Z");

function newSave() {
  return createSave({
    name: "小林",
    classId: "explorer",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades: ["G3"],
  });
}

describe("saved progress", () => {
  it("gives a word card on learning without a mastery badge, and learning does not equip that word", () => {
    const save = learnWord(newSave(), "tree", START);
    expect(save.wordCards.tree).toMatchObject({ masteryBadge: false, collectedAt: START.getTime() });
    expect(save.memory.tree?.reviewInstants).toEqual([START.getTime()]);
    expect(save.equippedSkillIds).not.toContain("tree");
    expect(save.equippedSkillIds).toEqual([skillsForClass("explorer")[0]!.id]);
    expect(learnWord(save, "tree", START).wordCards).toBe(save.wordCards);
  });

  it("leaves memory and cards untouched when a battle is won or lost", () => {
    let save = newSave();
    for (const word of sampleWords().slice(0, 4)) save = learnWord(save, word.id, START);
    const won = applyBattleOutcome(save, "win", START.getTime());
    expect(won.memory).toBe(save.memory);
    expect(won.wordCards).toBe(save.wordCards);
    expect(won.battlesWon).toBe(1);
    expect(won.ownedOutfitIds).toContain("forest-cape");
    expect(won.xp).toBeGreaterThan(save.xp);
    const again = applyBattleOutcome(won, "win", START.getTime() + 1);
    expect(again.ownedOutfitIds.filter((id) => id === "forest-cape")).toHaveLength(1);

    const lost = applyBattleOutcome(save, "loss", START.getTime());
    expect(lost.memory).toBe(save.memory);
    expect(lost.wordCards).toBe(save.wordCards);
    expect(lost.battlesLost).toBe(1);
    expect(lost.ownedOutfitIds).toEqual(save.ownedOutfitIds);
    expect(lost.xp).toBe(save.xp);
  });

  it("adds a mastery badge across days without deleting the card", () => {
    let save = learnWord(newSave(), "tree", START);
    const collectedAt = save.wordCards.tree?.collectedAt;
    let guard = 0;
    while (!save.wordCards.tree?.masteryBadge && guard < 8) {
      const due = new Date(save.memory.tree!.fsrs.due);
      const before = masteryDecision(save.memory.tree!);
      save = reviewWord(save, "tree", Rating.Good, due);
      if (!save.wordCards.tree?.masteryBadge) {
        expect(before.award || masteryDecision(save.memory.tree!).award).toBe(false);
      }
      guard += 1;
    }
    expect(save.wordCards.tree?.masteryBadge).toBe(true);
    expect(save.wordCards.tree?.collectedAt).toBe(collectedAt);
    const dueMs = new Date(save.memory.tree!.fsrs.due).getTime();
    const heldCard = save.wordCards.tree;
    expect(badgeTone(heldCard, save.memory.tree, new Date(dueMs - 1_000))).toBe("bright");
    expect(badgeTone(heldCard, save.memory.tree, new Date(dueMs))).toBe("grey");
    expect(save.wordCards.tree).toBe(heldCard);

    const lapsed = reviewWord(save, "tree", Rating.Again, new Date(dueMs));
    expect(lapsed.wordCards.tree?.wordId).toBe("tree");
    expect(lapsed.wordCards.tree?.collectedAt).toBe(collectedAt);
    expect(lapsed.wordCards.tree?.masteryBadge).toBe(true);
    expect(badgeTone(lapsed.wordCards.tree, lapsed.memory.tree, new Date(dueMs))).toBe("grey");
    const restored = reviewWord(lapsed, "tree", Rating.Good, new Date(lapsed.memory.tree!.fsrs.due));
    expect(restored.wordCards.tree?.masteryBadge).toBe(true);
    expect(restored.wordCards.tree?.collectedAt).toBe(collectedAt);
    const restoredDue = new Date(restored.memory.tree!.fsrs.due).getTime();
    expect(badgeTone(restored.wordCards.tree, restored.memory.tree, new Date(restoredDue - 1_000))).toBe("bright");
    expect(calendarDay(restored.memory.tree!.reviewInstants[0]!, "Asia/Shanghai")).not.toBe(
      calendarDay(restored.memory.tree!.reviewInstants.at(-1)!, "Asia/Shanghai"),
    );
  });

  it("unlocks more skills over time but never equips a fourth", () => {
    let save = newSave();
    const skills = skillsForClass("explorer");
    expect(save.unlockedSkillIds).toEqual([skills[0]!.id]);
    for (const word of sampleWords().slice(0, 3)) save = learnWord(save, word.id, START);
    expect(save.unlockedSkillIds).toContain(skills[1]!.id);
    save = applyBattleOutcome(save, "win", START.getTime());
    expect(save.unlockedSkillIds).toContain(skills[2]!.id);
    expect(save.unlockedSkillIds).not.toContain(skills[3]!.id);
    save = learnWord(save, sampleWords()[3]!.id, START);
    expect(save.unlockedSkillIds).toContain(skills[3]!.id);

    save = unequipSkill(save, save.equippedSkillIds[0]!);
    for (const id of save.unlockedSkillIds) {
      const result = equipSkill(save, id);
      if (result.ok) save = result.save;
    }
    expect(save.equippedSkillIds.length).toBeLessThanOrEqual(3);
    const blocked = equipSkill(save, save.unlockedSkillIds.find((id) => !save.equippedSkillIds.includes(id))!);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("limit");
    expect(blocked.save.equippedSkillIds).toEqual(save.equippedSkillIds);
  });

  it("grants the earned sash when every sample card is collected", () => {
    let save = setSelectedGrades(newSave(), ["G3", "G4", "G5", "G6"]);
    for (const word of sampleWords()) save = learnWord(save, word.id, START);
    expect(Object.keys(save.wordCards)).toHaveLength(sampleWords().length);
    expect(save.ownedOutfitIds).toContain("star-sash");
    expect(Object.values(save.wordCards).every((card) => card.masteryBadge === false)).toBe(true);
  });

  it("keeps 1v1 practice from changing FSRS memory", () => {
    const save = learnWord(newSave(), "map", START);
    const result = practiceDuel(
      save,
      [{ correct: true, responseMs: 500 }, { correct: false, responseMs: 100 }],
      [{ correct: true, responseMs: 800 }],
    );
    expect(result.save).toBe(save);
    expect(result.save.memory).toBe(save.memory);
    expect(result.save.wordCards).toBe(save.wordCards);
    expect(result.comparison.winner).toBe("a");
  });

  it("round-trips a save through JSON", () => {
    const save = learnWord(newSave(), "fish", START);
    const loaded = deserialize(serialize(save));
    expect(loaded).toEqual(save);
    expect(deserialize("{")).toBeNull();
    const legacy = JSON.parse(serialize(save)) as {
      chapterCleared?: boolean;
      selectedGrades?: string[];
      stageWins?: unknown;
      titles?: unknown;
    };
    delete legacy.chapterCleared;
    delete legacy.selectedGrades;
    delete legacy.stageWins;
    delete legacy.titles;
    const restored = deserialize(JSON.stringify(legacy));
    expect(restored?.chapterCleared).toBe(false);
    expect(restored?.selectedGrades).toEqual([]);
    expect(needsGradeChoice(restored!)).toBe(true);
    expect(restored?.stageWins).toEqual({});
    expect(restored?.titles).toEqual([]);
  });

  it("states the forest quest and clears the chapter only after the boss", () => {
    let save = setSelectedGrades(newSave(), ["G3", "G4", "G5", "G6"]);
    expect(questLine(save)).toContain("林缘小径");
    expect(questLine(save)).toContain("掌握 0/28");
    for (const word of sampleWords().slice(0, 4)) save = learnWord(save, word.id, START);
    const earlyBoss = applyBattleOutcome(save, "win", START.getTime() + 1, "canopy");
    expect(earlyBoss.chapterCleared).toBe(false);
    expect(earlyBoss.memory).toBe(save.memory);
    expect(earlyBoss.wordCards).toBe(save.wordCards);

    for (const word of sampleWords()) save = learnWord(save, word.id, START);
    expect(questLine(save)).toContain("林缘小径");
    save = { ...save, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    const memory = save.memory;
    const cards = save.wordCards;
    const cleared = applyBattleOutcome(save, "win", START.getTime() + 2, "canopy");
    expect(cleared.chapterCleared).toBe(true);
    expect(cleared.memory).toBe(memory);
    expect(cleared.wordCards).toBe(cards);
    expect(cleared.clearRewardClaimed).toBe(true);
    expect(cleared.unlockedCosmeticIds).toContain("forest_leaf_cape");
    expect(cleared.unlockedTitleIds).toContain("title_forest_trekker");
    expect(cleared.titles).toContain(displayTitle(FOREST_REWARDS, FOREST_REWARDS.clear_reward.title_id).shownZh);
    expect(cleared.rewardQueue.filter((notice) => notice.title === "外观奖励")).toHaveLength(1);
    expect(questLine(cleared)).toContain("掌握 0/28");
    expect(questLine(cleared)).toContain("通关");
    const again = applyBattleOutcome(cleared, "win", START.getTime() + 3, "canopy");
    expect(again.rewardQueue.filter((notice) => notice.title === "外观奖励")).toHaveLength(1);
    expect(again.clearRewardClaimed).toBe(true);
    expect(again.titles).toEqual(cleared.titles);
  });

  it("starts a new save with nothing selected", () => {
    const save = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
    });
    expect(save.selectedGrades).toEqual([]);
    expect(canConfirmGrades(save.selectedGrades)).toBe(false);
  });

  it("leaves an empty selection when every grade is unchecked", () => {
    let grades = toggleGradeChoice([], "G3");
    grades = toggleGradeChoice(grades, "G5");
    expect(grades).toEqual(["G3", "G5"]);
    grades = toggleGradeChoice(grades, "G3");
    grades = toggleGradeChoice(grades, "G5");
    expect(grades).toEqual([]);
    expect(canConfirmGrades(grades)).toBe(false);
    const kept = newSave();
    expect(setSelectedGrades(kept, grades)).toBe(kept);
    expect(kept.selectedGrades).toEqual(["G3"]);
  });

  it("disables continue and shows 至少选一个年级 while the selection is empty", () => {
    expect(canConfirmGrades([])).toBe(false);
    expect(canConfirmGrades(["G4"])).toBe(true);
    expect(GRADE_REQUIRED_NOTICE).toBe("至少选一个年级");
    const picker = readFileSync(new URL("./../game/scenes/GradeScene.ts", import.meta.url), "utf8");
    expect(picker).toContain("GRADE_REQUIRED_NOTICE");
    expect(picker).toContain("disabled: !ready");
    expect(picker).not.toContain('["G3"]');
    const parent = readFileSync(new URL("./../game/scenes/GuideScene.ts", import.meta.url), "utf8");
    expect(parent).toContain("GRADE_REQUIRED_NOTICE");
    expect(parent).toContain("disabled: !canSave");
    expect(parent).toContain("grades:save:blocked");
    expect(parent).not.toContain('["G3"]');
    expect(parent).not.toContain("留下三年级");
  });

  it("leaves an older save with no grade unchosen, so learning stays closed until one is picked", () => {
    const current = newSave();
    expect(current.gradesConfirmed).toBe(true);
    const raw = JSON.parse(serialize(current)) as { selectedGrades?: string[]; gradesConfirmed?: boolean };
    delete raw.selectedGrades;
    delete raw.gradesConfirmed;
    const migrated = deserialize(JSON.stringify(raw));
    expect(migrated?.selectedGrades).toEqual([]);
    expect(migrated?.gradesConfirmed).toBe(false);
    expect(gradeGate(migrated!)).toBe("migrate");
    expect(needsGradeChoice(migrated!)).toBe(true);
    expect(learnWord(migrated!, "tree", START)).toBe(migrated);
    const kept = setSelectedGrades(current, []);
    expect(kept).toBe(current);
    expect(kept.selectedGrades).toEqual(["G3"]);
    expect(gradeGate(kept)).toBe("ready");
    const alreadyEmpty = deserialize(JSON.stringify({ ...JSON.parse(serialize(current)), selectedGrades: [], gradesConfirmed: true }));
    expect(alreadyEmpty?.selectedGrades).toEqual([]);
    expect(gradeGate(alreadyEmpty!)).toBe("migrate");
    const picked = setSelectedGrades(migrated!, ["G5", "G3"]);
    expect(picked.selectedGrades).toEqual(["G3", "G5"]);
    expect(picked.gradesConfirmed).toBe(true);
    expect(needsGradeChoice(picked)).toBe(false);
    expect(gradeGate(picked)).toBe("ready");
    expect(learnWord(picked, "tree", START).wordCards.tree).toBeTruthy();
    const fresh = createSave({
      name: "小林",
      classId: "explorer",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
    });
    expect(fresh.gradesConfirmed).toBe(false);
    expect(gradeGate(fresh)).toBe("migrate");
  });

  it("filters new learning to the selected grades and keeps a card that was already collected", () => {
    let save = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
      grades: ["G6", "G3", "nope"],
    });
    expect(save.selectedGrades).toEqual(["G3", "G6"]);
    expect(wordsForGrades(["G3"])).toHaveLength(228);
    expect(wordsForGrades([])).toHaveLength(0);
    expect(selectionBattleNotice(2)).toContain("再选一个年级");
    expect(selectionBattleNotice(wordsForGrades(["G6"]).length)).toBeNull();

    const empty = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
    });
    expect(setSelectedGrades(save, [])).toBe(save);
    expect(save.selectedGrades).toEqual(["G3", "G6"]);
    expect(needsGradeChoice(empty)).toBe(true);
    expect(learnWord(empty, "explore", START)).toBe(empty);
    expect(learnWord(empty, "tree", START)).toBe(empty);
    save = setSelectedGrades(empty, ["G3"]);
    expect(needsGradeChoice(save)).toBe(false);
    save = learnWord(save, "tree", START);
    expect(save.wordCards.tree?.masteryBadge).toBe(false);
    save = learnWord(save, "bridge", START);
    expect(save.wordCards.bridge?.wordId).toBe("bridge");
    expect(learnWord(save, "explore", START).wordCards.explore).toBeUndefined();
    save = setSelectedGrades(save, ["G6"]);
    expect(save.wordCards.tree).toBeTruthy();
    expect(learnedCountInGrade(save, "G3")).toBe(1);
    expect(gradePauseNotice("三年级", 1)).toBe(
      "取消三年级后，已学的1个单词卡会保留，但战斗里不会再考这些词，到期复习也会暂停；重新勾选即可恢复。",
    );
    const pausedMemory = save.memory.tree;
    const paused = reviewWord(save, "tree", Rating.Good, new Date(save.memory.tree!.fsrs.due));
    expect(paused).toBe(save);
    expect(paused.memory.tree).toBe(pausedMemory);
    save = setSelectedGrades(save, ["G3", "G6"]);
    expect(save.memory.tree).toBe(pausedMemory);
    const reviewed = reviewWord(save, "tree", Rating.Good, new Date(save.memory.tree!.fsrs.due));
    expect(reviewed.memory.tree).not.toBe(pausedMemory);
    expect(reviewed.wordCards.tree?.wordId).toBe("tree");
    save = setSelectedGrades(reviewed, ["G6"]);
    save = learnWord(save, "village", START);
    expect(save.wordCards.village).toBeTruthy();
    expect(save.wordCards.tree).toBeTruthy();
    expect(selectedCollected(save)).toBe(false);
  });
});
