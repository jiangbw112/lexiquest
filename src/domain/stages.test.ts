import { describe, expect, it } from "vitest";
import { State } from "ts-fsrs";
import { DEFAULT_APPEARANCE } from "./appearance";
import { applyBattleOutcome, createSave, learnWord, questLine, setSelectedGrades } from "./progress";
import { chapterExtraWords, isChapterExtra, sampleWords } from "./catalog";
import { PROVISIONAL } from "./provisional";
import { startBattle } from "./battle";
import { battleWordIds, gradeChapters } from "./chapter-plan";
import { skillQuestionPool } from "./skill-cast";
import { badgeTone } from "./review";
import {
  bossReady,
  bossUnlockLine,
  chapterLearnedCount,
  clearedStageCount,
  FOREST_CHAPTER,
  FOREST_WORD_COUNT,
  litMasteryCount,
  masteryLabel,
  explorationCleared,
  initialMapStageId,
  learnedRequiredCount,
  requiredWordIds,
  stageById,
  stageCleared,
  stageCombat,
  stageStatuses,
  stageWordIds,
  wordsUntilBoss,
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
  return learnIds(save, sampleWords().map((word) => word.id));
}

/** The daily new-word cap is real, so a fixture walks forward a local day when it fills. */
function learnIds(save: ReturnType<typeof newSave>, ids: readonly string[], start = START) {
  let next = save;
  let at = start.getTime();
  for (const id of ids) {
    let learned = learnWord(next, id, new Date(at));
    if (!learned.wordCards[id]) {
      at += 86_400_000;
      learned = learnWord(next, id, new Date(at));
    }
    next = learned;
  }
  return next;
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
    expect(FOREST_CHAPTER.stages.map((stage) => stage.goal_zh)).toEqual([
      "进入森林，学会认路与常见动植物",
      "沿河前进，描述景物与天气",
      "过桥登山，动作与地形容词",
      "探村护友，抽象与进阶词",
      "夺回宝藏，通关本章",
    ]);
    expect(FOREST_CHAPTER.stages[1]?.unlock).toEqual({ after_stage: 1 });
    expect(FOREST_CHAPTER.stages[4]?.unlock).toEqual({ stages_cleared: [1, 2, 3, 4], all_words_learned: true });
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
    save = learnWord(save, first.new_words[5]!, new Date(START.getTime() + 86_400_000));
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

  it("counts selected-grade chapter words plus every extra, and clears an empty stage after one win", () => {
    const extras = chapterExtraWords().map((word) => word.id);
    expect(extras).toHaveLength(8);

    const grade3 = newSave(["G3"]);
    const required3 = requiredWordIds(grade3);
    expect(required3).toHaveLength(16);
    for (const id of extras) expect(required3).toContain(id);
    expect(required3).not.toContain("run");
    expect(required3).not.toContain("cloud");
    expect(stageWordIds(grade3, FOREST_CHAPTER.stages[2]!)).toEqual(["bridge", "path"]);
    expect(stageStatuses(grade3)).toEqual(["open", "locked", "locked", "locked", "locked"]);
    expect(wordsUntilBoss(grade3)).toBe(16);
    expect(bossUnlockLine(grade3)).toBe("通过前 4 关并学完 16 个词");
    expect(bossReady(grade3)).toBe(false);

    let ready = grade3;
    ready = learnIds(ready, required3);
    ready = { ...ready, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    expect(chapterLearnedCount(ready)).toBe(16);
    expect(wordsUntilBoss(ready)).toBe(0);
    expect(bossReady(ready)).toBe(true);
    expect(masteryLabel(ready, START)).toBe("0/28");

    const several = newSave(["G3", "G4", "G5"]);
    expect(requiredWordIds(several)).toHaveLength(25);
    expect(bossUnlockLine(several)).toBe("通过前 4 关并学完 25 个词");
    expect(requiredWordIds(newSave())).toHaveLength(28);
    expect(bossUnlockLine(newSave())).toBe("通过前 4 关并学完 28 个词");

    const grade5 = newSave(["G5"]);
    const first = FOREST_CHAPTER.stages[0]!;
    expect(stageWordIds(grade5, first)).toEqual([]);
    expect(stageCleared(grade5, first)).toBe(false);
    expect(stageStatuses(grade5)).toEqual(["open", "locked", "locked", "locked", "locked"]);
    expect(learnedRequiredCount(grade5)).toBe(0);
    expect(requiredWordIds(grade5)).toHaveLength(14);
    for (const id of extras) expect(requiredWordIds(grade5)).toContain(id);
    const onlySecond = { ...grade5, stageWins: { "2": 1 } };
    expect(stageStatuses(onlySecond)[0]).toBe("open");
    expect(stageStatuses(onlySecond)[2]).toBe("locked");
    expect(explorationCleared(onlySecond)).toBe(false);
    expect(questLine(grade5)).toContain("林缘小径");
    expect(questLine(grade5)).toContain("赢 1 场小战斗");
    expect(questLine(grade5)).not.toContain("0/0");
    const wonFirst = { ...grade5, stageWins: { "1": 1 } as Record<string, number> };
    expect(stageCleared(wonFirst, first)).toBe(true);
    expect(stageStatuses(wonFirst)).toEqual(["cleared", "open", "locked", "locked", "locked"]);
    const second = FOREST_CHAPTER.stages[1]!;
    let opened = wonFirst;
    opened = learnIds(opened, stageWordIds(grade5, second));
    opened = { ...opened, stageWins: { ...opened.stageWins, "2": 1 } };
    expect(stageStatuses(opened)[2]).toBe("open");
    expect(learnedRequiredCount(opened)).toBe(stageWordIds(grade5, second).length);

    const grade6 = newSave(["G6"]);
    const empty = FOREST_CHAPTER.stages
      .filter((stage) => stage.type !== "boss" && stageWordIds(grade6, stage).length === 0)
      .map((stage) => stage.name_zh);
    expect(empty).toEqual(["林缘小径", "河岸花径"]);
    expect(stageStatuses(grade6)).toEqual(["open", "locked", "locked", "locked", "locked"]);
    expect(questLine(grade6)).not.toContain("0/0");
    const wonSixthFirst = { ...grade6, stageWins: { "1": 1 } };
    expect(stageStatuses(wonSixthFirst)).toEqual(["cleared", "open", "locked", "locked", "locked"]);
    expect(questLine(wonSixthFirst)).toContain("河岸花径");
    expect(questLine(wonSixthFirst)).not.toContain("0/0");
    const wonBoth = { ...grade6, stageWins: { "1": 1, "2": 1 } };
    expect(stageStatuses(wonBoth)[2]).toBe("open");
    const onlyLater = { ...grade6, stageWins: { "2": 1 } };
    expect(stageStatuses(onlyLater)[0]).toBe("open");
    expect(stageStatuses(onlyLater)[2]).toBe("locked");

    const pairs: string[] = [];
    for (const grade of ["G3", "G4", "G5", "G6"]) {
      const save = newSave([grade]);
      for (const stage of FOREST_CHAPTER.stages) {
        if (stage.type === "boss") continue;
        if (stageWordIds(save, stage).length === 0) pairs.push(`${grade} ${stage.id} ${stage.name_zh}`);
      }
    }
    expect(pairs).toEqual(["G5 1 林缘小径", "G6 1 林缘小径", "G6 2 河岸花径"]);
  });

  it("drops a cancelled grade from the boss count and can open the boss", () => {
    let save = newSave();
    save = learnIds(save, requiredWordIds(save).filter((id) => id !== "weather"));
    save = { ...save, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    expect(requiredWordIds(save)).toHaveLength(28);
    expect(wordsUntilBoss(save)).toBe(1);
    expect(bossReady(save)).toBe(false);
    expect(bossUnlockLine(save)).toBe("通过前 4 关并学完 28 个词");

    save = setSelectedGrades(save, ["G3", "G5", "G6"]);
    const left = requiredWordIds(save);
    expect(left).toHaveLength(25);
    expect(left).not.toContain("weather");
    expect(left).not.toContain("run");
    expect(left).not.toContain("rain");
    for (const extra of chapterExtraWords()) expect(left).toContain(extra.id);
    expect(wordsUntilBoss(save)).toBe(0);
    expect(bossReady(save)).toBe(true);
    expect(bossUnlockLine(save)).toBe("通过前 4 关并学完 25 个词");
  });

  it("keeps the boss locked when no grade is selected, even if the extras are collected", () => {
    let save = newSave([]);
    expect(save.selectedGrades).toEqual([]);
    const extras = chapterExtraWords().map((word) => word.id);
    expect(requiredWordIds(save)).toEqual(expect.arrayContaining(extras));
    expect(requiredWordIds(save)).toHaveLength(8);
    expect(requiredWordIds(save).every((id) => isChapterExtra(id))).toBe(true);
    expect(bossUnlockLine(save)).toBe("通过前 4 关并学完 8 个词");
    expect(bossReady(save)).toBe(false);
    for (const id of requiredWordIds(save)) {
      save = {
        ...save,
        wordCards: {
          ...save.wordCards,
          [id]: { wordId: id, collectedAt: START.getTime(), masteryBadge: false },
        },
      };
    }
    save = { ...save, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    expect(wordsUntilBoss(save)).toBe(0);
    expect(bossReady(save)).toBe(false);
    expect(stageStatuses(save)[4]).toBe("locked");
  });

  it("uses the round-3 exploration and boss tables", () => {
    expect(PROVISIONAL.chapterBattle.explorationEnemyHpByStage).toEqual([40, 42, 44, 46]);
    expect(PROVISIONAL.chapterBattle.explorationEnemyHpByStageHealer).toEqual([26, 28, 28, 30]);
    expect(PROVISIONAL.chapterBattle.explorationEnemyAttack).toBe(5);
    expect(PROVISIONAL.chapterEnding.bossAttack).toBe(4);
    expect(PROVISIONAL.chapterEnding.bossSpellingMax).toBe(4);
    expect(PROVISIONAL.chapterEnding.shakenAfterQuestions).toBe(11);
    expect(PROVISIONAL.chapterEnding.bossPhaseHpByClass).toEqual({
      warrior: 75,
      mage: 90,
      ranger: 75,
      healer: 30,
      inventor: 65,
      explorer: 65,
    });
    expect(stageCombat(stageById(1)!, "warrior").enemyHp).toBe(40);
    expect(stageCombat(stageById(1)!, "healer").enemyHp).toBe(26);
    expect(stageCombat(stageById(4)!, "warrior").enemyAttack).toBe(5);
    const mage = stageCombat(stageById(5)!, "mage");
    expect(mage.enemyHp).toBe(90);
    expect(mage.phases?.map((phase) => phase.hp)).toEqual([90, 90]);
    expect(mage.enemyAttack).toBe(4);
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

  it("keeps the boss locked after only the grade-3 library words and two small battles", () => {
    let save = setSelectedGrades(
      createSave({
        name: "小林",
        classId: "warrior",
        appearance: DEFAULT_APPEARANCE,
        now: START.getTime(),
      }),
      ["G3"],
    );
    save = learnIds(save, ["tree", "bird", "fish", "sun", "map", "big", "red", "flower"]);
    save = { ...save, stageWins: { "1": 1, "2": 1 } };
    expect(requiredWordIds(save)).toHaveLength(16);
    expect(wordsUntilBoss(save)).toBe(8);
    expect(bossUnlockLine(save)).toBe("通过前 4 关并学完 16 个词");
    expect(explorationCleared(save)).toBe(false);
    expect(bossReady(save)).toBe(false);
    const statuses = stageStatuses(save);
    expect(statuses[0]).toBe("cleared");
    expect(statuses[1]).toBe("cleared");
    expect(statuses[2]).toBe("open");
    expect(statuses[3]).toBe("locked");
    expect(statuses[4]).toBe("locked");
    expect(initialMapStageId(statuses)).toBe(3);
    expect(FOREST_CHAPTER.boss_unlock.stages_1_to_4_cleared).toBe(true);
  });

  it("asks a later official word only in the chapter that contains it", () => {
    const grade3 = newSave(["G3"]);
    const allowed = battleWordIds(grade3);
    expect(allowed).toContain("tree");
    expect(allowed).not.toContain("about");
    expect(allowed).not.toContain("explore");
    expect(skillQuestionPool([], ["tree"], { allowedIds: allowed })).toEqual(["tree"]);
    expect(skillQuestionPool([], ["tree", "about"], { allowedIds: allowed })).toEqual(["tree"]);
    const next = gradeChapters("G3").find((chapter) => chapter.wordIds.includes("about"));
    expect(next).toBeTruthy();
    const standing = { ...grade3, currentChapterId: next!.id, chapterCleared: true };
    const chapterAllowed = battleWordIds(standing);
    expect(chapterAllowed).toContain("about");
    expect(chapterAllowed).not.toContain("tree");
    expect(skillQuestionPool([], ["about"], { allowedIds: chapterAllowed })).toEqual(["about"]);
    expect(skillQuestionPool([], ["tree"], { allowedIds: chapterAllowed })).toEqual([]);
    const allGrades = battleWordIds(newSave());
    expect(allGrades).not.toContain("about");
    expect(allGrades).toContain("explore");
    expect(allGrades).toContain("tree");
  });

  it("selects the next open stage after stage 1 is cleared", () => {
    let save = setSelectedGrades(
      createSave({
        name: "小林",
        classId: "warrior",
        appearance: DEFAULT_APPEARANCE,
        now: START.getTime(),
      }),
      ["G3"],
    );
    for (const id of ["tree", "bird", "fish", "sun", "map"]) save = learnWord(save, id, START);
    save = { ...save, stageWins: { "1": 1 } };
    const statuses = stageStatuses(save);
    expect(statuses[0]).toBe("cleared");
    expect(statuses[1]).toBe("open");
    expect(initialMapStageId(statuses)).toBe(2);
  });
});
