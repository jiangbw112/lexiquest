import { describe, expect, it } from "vitest";
import { State } from "ts-fsrs";
import { DEFAULT_APPEARANCE } from "./appearance";
import { applyBattleOutcome, createSave, learnWord, questLine, setSelectedGrades } from "./progress";
import { sampleWords } from "./catalog";
import { classById } from "./classes";
import { PROVISIONAL } from "./provisional";
import { skillById, skillMagnitude } from "./skills";
import { startBattle } from "./battle";
import { badgeTone } from "./review";
import {
  bossReady,
  chapterLearnedCount,
  clearedStageCount,
  FOREST_CHAPTER,
  FOREST_WORD_COUNT,
  litMasteryCount,
  masteryLabel,
  requiredWordIds,
  stageCleared,
  stageStatuses,
  stageWordIds,
} from "./stages";

const START = new Date("2026-03-01T02:00:00Z");

function newSave(grades: string[] = ["G3", "G4", "G5", "G6"]) {
  return setSelectedGrades(
    createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
    }),
    grades,
  );
}

function learnAll(save: ReturnType<typeof newSave>) {
  let next = save;
  for (const word of sampleWords()) next = learnWord(next, word.id, START);
  return next;
}

function hits(skillId: string, hp: number): number {
  const skill = skillById(skillId);
  if (!skill) throw new Error(skillId);
  return Math.ceil(hp / skillMagnitude(skill, classById("warrior"), 1));
}

describe("forest chapter", () => {
  it("splits the 28 words 6/6/6/6/4 and clears by defeating the boss", () => {
    expect(FOREST_CHAPTER.clear_rule).toBe("defeat_boss");
    expect(FOREST_CHAPTER.mastery_blocks_clear).toBe(false);
    expect(FOREST_CHAPTER.stages.map((stage) => stage.new_words.length)).toEqual([6, 6, 6, 6, 4]);
    expect(FOREST_CHAPTER.stages.map((stage) => stage.name_zh)).toEqual([
      "林缘小径",
      "河岸花径",
      "云桥山道",
      "迷雾村庄",
      "林心守护",
    ]);
    expect(FOREST_CHAPTER.stages[4]?.type).toBe("boss");
    expect(FOREST_CHAPTER.stages[4]?.learn_before_fight).toBe(true);
    expect(FOREST_WORD_COUNT).toBe(28);
    expect(new Set(FOREST_CHAPTER.stages.flatMap((stage) => stage.new_words))).toEqual(
      new Set(sampleWords().map((word) => word.id)),
    );
  });

  it("clears a stage only after its new words are learned and one small battle is won", () => {
    let save = newSave();
    const first = FOREST_CHAPTER.stages[0]!;
    expect(stageCleared(save, first)).toBe(false);
    for (const id of first.new_words.slice(0, 5)) save = learnWord(save, id, START);
    save = applyBattleOutcome(save, "win", START.getTime(), "forest-stage-1");
    expect(stageCleared(save, first)).toBe(false);
    expect(stageStatuses(save)[1]).toBe("locked");
    save = learnWord(save, first.new_words[5]!, START);
    expect(stageCleared(save, first)).toBe(true);
    expect(stageStatuses(save)[0]).toBe("cleared");
    expect(stageStatuses(save)[1]).toBe("open");
    const lost = applyBattleOutcome(save, "loss", START.getTime() + 1, "forest-stage-2");
    expect(lost.stageWins["2"] ?? 0).toBe(0);
    expect(stageCleared(lost, FOREST_CHAPTER.stages[1]!)).toBe(false);
  });

  it("unlocks the stages in order and keeps the boss shut until then", () => {
    let save = newSave();
    expect(stageStatuses(save)).toEqual(["open", "locked", "locked", "locked", "locked"]);
    expect(bossReady(save)).toBe(false);
    save = learnAll(save);
    expect(bossReady(save)).toBe(false);
    save = { ...save, stageWins: { "1": 1, "2": 1, "3": 1 } };
    expect(stageStatuses(save)[3]).toBe("open");
    expect(bossReady(save)).toBe(false);
    save = { ...save, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    expect(bossReady(save)).toBe(true);
    expect(stageStatuses(save)[4]).toBe("open");
    const early = applyBattleOutcome(learnAll(newSave()), "win", START.getTime(), "canopy");
    expect(early.chapterCleared).toBe(false);
  });

  it("skips an empty grade filter without blocking, and the boss ignores words that grade cannot learn", () => {
    const grade3 = newSave(["G3"]);
    expect(stageWordIds(grade3, FOREST_CHAPTER.stages[2]!).length).toBe(0);
    expect(stageStatuses(grade3)).toEqual(["open", "locked", "skipped", "skipped", "locked"]);
    let ready = grade3;
    for (const id of requiredWordIds(grade3)) ready = learnWord(ready, id, START);
    ready = { ...ready, stageWins: { "1": 1, "2": 1 } };
    expect(requiredWordIds(ready)).toHaveLength(8);
    expect(bossReady(ready)).toBe(true);
    expect(chapterLearnedCount(ready)).toBe(8);
    expect(masteryLabel(ready, START)).toBe("0/28");

    const grade5 = newSave(["G5"]);
    expect(stageStatuses(grade5)).toEqual(["skipped", "open", "locked", "locked", "locked"]);
    const second = FOREST_CHAPTER.stages[1]!;
    let opened = grade5;
    for (const id of stageWordIds(grade5, second)) opened = learnWord(opened, id, START);
    opened = { ...opened, stageWins: { "2": 1 } };
    expect(stageStatuses(opened)[2]).toBe("open");
  });

  it("tunes exploration fights to 3–5 warrior damage casts and the boss near 8–12", () => {
    const small = PROVISIONAL.chapterBattle.explorationEnemyHp;
    expect(hits("warrior-bash", small)).toBeGreaterThanOrEqual(3);
    expect(hits("warrior-bash", small)).toBeLessThanOrEqual(5);
    expect(hits("warrior-shout", small)).toBeGreaterThanOrEqual(3);
    expect(hits("warrior-shout", small)).toBeLessThanOrEqual(5);
    expect(hits("warrior-spin", small)).toBeGreaterThanOrEqual(3);
    expect(hits("warrior-spin", small)).toBeLessThanOrEqual(5);
    const boss = PROVISIONAL.chapterEnding.phases.reduce((sum, phase) => sum + phase.hp, 0);
    expect(PROVISIONAL.chapterEnding.phases).toHaveLength(2);
    expect(hits("warrior-bash", boss)).toBeGreaterThanOrEqual(8);
    expect(hits("warrior-bash", boss)).toBeLessThanOrEqual(12);
    expect(hits("warrior-shout", boss)).toBeGreaterThanOrEqual(8);
    expect(hits("warrior-shout", boss)).toBeLessThanOrEqual(12);
    expect(hits("warrior-spin", boss)).toBe(7);
  });

  it("leaves cards, badges, and FSRS untouched when the boss is lost, and the fight can start again", () => {
    const save = { ...learnAll(newSave()), stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    expect(bossReady(save)).toBe(true);
    const memory = save.memory;
    const cards = save.wordCards;
    const lost = applyBattleOutcome(save, "loss", START.getTime(), "canopy");
    expect(lost.memory).toBe(memory);
    expect(lost.wordCards).toBe(cards);
    expect(lost.chapterCleared).toBe(false);
    expect(lost.stageWins).toEqual(save.stageWins);
    expect(lost.battlesLost).toBe(1);
    expect(bossReady(lost)).toBe(true);
    expect(questLine(lost)).toContain("林心守护者");
    const retry = startBattle({
      encounterId: "canopy",
      classId: "warrior",
      learnedIds: Object.keys(lost.wordCards),
      equippedSkillIds: [],
      skillLevels: {},
      seed: 1,
    });
    expect(retry.phase).toBe("choose");
    expect(retry.phases).toHaveLength(2);
  });

  it("counts lit badges out of 28, and a grey badge does not count", () => {
    let save = learnAll(newSave());
    expect(litMasteryCount(save, START)).toBe(0);
    expect(masteryLabel(save, START)).toBe("0/28");
    const tree = save.memory.tree;
    if (!tree || !save.wordCards.tree) throw new Error("tree missing");
    save = {
      ...save,
      wordCards: {
        ...save.wordCards,
        tree: { ...save.wordCards.tree, masteryBadge: true, masteredAt: START.getTime() },
      },
      memory: {
        ...save.memory,
        tree: {
          ...tree,
          fsrs: {
            ...tree.fsrs,
            due: new Date(START.getTime() + 30 * 86400000).toISOString(),
            state: State.Review,
          },
        },
      },
    };
    expect(badgeTone(save.wordCards.tree, save.memory.tree, START)).toBe("bright");
    expect(litMasteryCount(save, START)).toBe(1);
    expect(masteryLabel(save, START)).toBe("1/28");
    expect(clearedStageCount(save)).toBe(0);
    const grey = {
      ...save,
      memory: {
        ...save.memory,
        tree: { ...save.memory.tree!, fsrs: { ...save.memory.tree!.fsrs, due: new Date(START.getTime() - 1000).toISOString() } },
      },
    };
    expect(badgeTone(grey.wordCards.tree, grey.memory.tree, START)).toBe("grey");
    expect(litMasteryCount(grey, START)).toBe(0);
    const won = applyBattleOutcome(save, "win", START.getTime(), "canopy");
    expect(won.chapterCleared).toBe(false);
  });
});
