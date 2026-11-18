import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import {
  activeChapter,
  chapterBossReady,
  gradeChapters,
  isChapterCleared,
  isChapterUnlocked,
  playStatuses,
  visibleChapters,
} from "./chapter-plan";
import {
  LEARN_BACK_VILLAGE,
  LEARN_FIGHT_BOSS,
  chapterLearnScope,
  confirmLearnSettlement,
  learnAdvance,
  learnBatchView,
  learnStageBatches,
  resumeChapterLearn,
} from "./learn-batch";
import { NEW_WORD_GOAL_NOTICE, learnDayMeter, setGoalPreset } from "./parent";
import { createSave, learnWord } from "./progress";
import { requiredWordIds } from "./stages";
import type { SaveData } from "./types";

const START = new Date("2026-03-01T02:00:00Z");

function fresh(grades: string[]): SaveData {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades,
  });
}

function learnIds(save: SaveData, ids: readonly string[]): SaveData {
  let next = save;
  for (const id of ids) next = learnWord(next, id, START);
  return next;
}

describe("academy batch settlement", () => {
  const chapter = gradeChapters("G3")[0]!;
  const standing = {
    ...fresh(["G3"]),
    chapterCleared: true,
    currentChapterId: chapter.id,
    learnSelection: { grade: "G3" as const, chapterId: chapter.id },
  };
  const batches = learnStageBatches(standing, chapter);

  it("uses this chapter's stage lists, not a fixed batch size", () => {
    expect(chapter.id).toBe("pep_g3_01");
    expect(batches.map((batch) => batch.length)).toEqual([6, 6, 6, 6, 4]);
    expect(batches.flat()).toEqual(chapter.wordIds);
    expect(batches.some((batch) => batch.length === 11)).toBe(false);
    expect(chapter.wordIds.length).not.toBe(11);
  });

  it("offers 继续学本章 on the same word pool when the batch is done and the chapter is not", () => {
    const done = learnIds(standing, batches[0]!);
    const view = learnBatchView(done, batches[0]!, batches[0]!, chapter);
    const nextChapter = visibleChapters(done.selectedGrades).find((item) => item.id !== chapter.id && item.grade === "G3");
    expect(view.kind).toBe("continue-chapter");
    expect(view.completed).toBe(batches[0]!.length);
    expect(view.remaining).toBe(chapter.wordIds.length - batches[0]!.length);
    expect(view.remainingLine).toBe(`本章还可学 ${view.remaining} 词`);
    expect(view.primaryLabel).toBeNull();
    expect(view.secondaryLabel).toBeNull();
    expect(view.message).toBeNull();
    expect(view.nextBatchIds).toEqual(batches[1]);
    expect(view.nextWordId).toBe(batches[1]![0]);
    expect(view.nextBatchIds.every((id) => chapter.wordIds.includes(id))).toBe(true);
    expect(view.scopeIds).toEqual(chapter.wordIds);
    expect(view.chapterCleared).toBe(false);
    expect(JSON.stringify(view)).not.toContain("通关");
    expect(JSON.stringify(view)).not.toContain("全章");
    expect(nextChapter && isChapterUnlocked(done, nextChapter)).toBe(false);
    expect(playStatuses(done, chapter)[0]).toBe("open");
    expect(done.stageWins).toEqual({});
    expect(done.chapterProgress?.[chapter.id]).toBeUndefined();
  });

  it("keeps 继续本次 while this batch still has words", () => {
    const learned = batches[0]!.slice(0, 3);
    const mid = learnIds(standing, learned);
    const view = learnBatchView(mid, batches[0]!, [...learned, ...learned], chapter);
    expect(view.kind).toBe("continue-batch");
    expect(view.completed).toBe(3);
    expect(view.primaryLabel).toBeNull();
    expect(view.nextWordId).toBe(batches[0]![3]);
    expect(view.nextBatchIds).toEqual(batches[0]);
    expect(view.remaining).toBe(chapter.wordIds.length - 3);
    expect(view.message).toBeNull();
  });

  it("drops the continue button after the last batch and does not record a clear", () => {
    const last = batches[batches.length - 1]!;
    const beforeLast = learnIds(standing, chapter.wordIds.slice(0, -1));
    const still = learnBatchView(beforeLast, last, last.slice(0, -1), chapter);
    expect(still.kind).toBe("continue-batch");
    expect(still.primaryLabel).toBeNull();
    const finished = learnWord(beforeLast, chapter.wordIds[chapter.wordIds.length - 1]!, START);
    const view = learnBatchView(finished, last, last, chapter);
    expect(view.kind).toBe("cards-done");
    expect(view.remaining).toBe(0);
    expect(view.completed).toBe(last.length);
    expect(view.primaryLabel).toBe(LEARN_FIGHT_BOSS);
    expect(view.secondaryLabel).toBe(LEARN_BACK_VILLAGE);
    expect(view.message).toBe("本章词都学会了！去对战挑战 Boss 吧");
    expect(view.nextWordId).toBeNull();
    expect(view.settlement?.focusBoss).toBe(true);
    expect(readFileSync(new URL("./learn-batch.ts", import.meta.url), "utf8")).not.toContain("继续本次");
    expect(readFileSync(new URL("./learn-batch.ts", import.meta.url), "utf8")).not.toContain("继续学本章");
    expect(isChapterCleared(finished, chapter)).toBe(false);
    expect(finished.chapterCleared).toBe(standing.chapterCleared);
    expect(finished.chapterProgress).toEqual(standing.chapterProgress);
    expect(finished.stageWins).toEqual(standing.stageWins);
    expect(playStatuses(finished, chapter)).toEqual(["open", "open", "open", "open", "open"]);
  });

  it("does not unlock the next chapter or invent exploration wins when every card exists", () => {
    const finished = learnIds(standing, chapter.wordIds);
    const next = visibleChapters(finished.selectedGrades)[visibleChapters(finished.selectedGrades).findIndex((item) => item.id === chapter.id) + 1];
    expect(next).toBeTruthy();
    expect(isChapterUnlocked(finished, next!)).toBe(false);
    expect(isChapterCleared(finished, chapter)).toBe(false);
    expect(chapterBossReady(finished, chapter.id)).toBe(true);
    expect(playStatuses(finished, chapter)).toEqual(["open", "open", "open", "open", "open"]);
    expect(finished.stageWins).toEqual({});
    expect(finished.chapterProgress?.[chapter.id]?.stageWins).toBeUndefined();
    const view = learnBatchView(finished, [], [], chapter);
    expect(view.kind).toBe("cards-done");
    expect(view.primaryLabel).toBe(LEARN_FIGHT_BOSS);
    expect(confirmLearnSettlement(finished)).toBe(finished);
  });

  it("restores this chapter and the real remaining count, and settlement does not add progress", () => {
    const learned = batches[0]!.slice(0, 2);
    const mid = learnIds(standing, learned);
    const first = resumeChapterLearn(mid);
    const second = resumeChapterLearn(mid);
    expect(first).toEqual(second);
    expect(first.chapterId).toBe(chapter.id);
    expect(first.chapterName).toBe(chapter.name);
    expect(first.remaining).toBe(chapter.wordIds.length - learned.length);
    expect(first.batchIds).toEqual(batches[0]);
    expect(first.nextWordId).toBe(batches[0]![2]);
    const xp = mid.xp;
    const cards = mid.wordCards;
    const wins = mid.stageWins;
    const progress = mid.chapterProgress;
    for (let time = 0; time < 4; time += 1) {
      expect(confirmLearnSettlement(mid)).toBe(mid);
      expect(learnBatchView(mid, batches[0]!, learned, chapter).completed).toBe(learned.length);
    }
    expect(mid.xp).toBe(xp);
    expect(mid.wordCards).toBe(cards);
    expect(mid.stageWins).toBe(wins);
    expect(mid.chapterProgress).toBe(progress);
    expect(learnWord(mid, learned[0]!, START)).toBe(mid);
    const done = learnIds(standing, chapter.wordIds);
    const back = resumeChapterLearn(done);
    expect(back.chapterId).toBe(chapter.id);
    expect(back.remaining).toBe(0);
    expect(back.batchIds).toEqual([]);
    expect(back.nextWordId).toBeNull();
    expect(confirmLearnSettlement(done)).toBe(done);
    expect(done.stageWins).toEqual(standing.stageWins);
    expect(isChapterCleared(done, chapter)).toBe(false);
  });

  it("counts a narrowed forest chapter from the selected grades, not every forest word", () => {
    const save = fresh(["G3"]);
    const forest = activeChapter(save);
    const scope = chapterLearnScope(save, forest);
    expect(forest.id).toBe("forest_adventure");
    expect(scope).toEqual(requiredWordIds(save));
    expect(scope.length).toBeLessThan(forest.wordIds.length);
    expect(scope.length).not.toBe(11);
    const stageBatches = learnStageBatches(save, forest);
    expect(stageBatches.flat().sort()).toEqual([...scope].sort());
    expect(stageBatches[0]!.length).toBeGreaterThan(0);
    expect(stageBatches[0]!.length).not.toBe(scope.length);
    const done = learnIds(save, stageBatches[0]!);
    const view = learnBatchView(done, stageBatches[0]!, stageBatches[0]!, forest);
    expect(view.kind).toBe("continue-chapter");
    expect(view.remaining).toBe(scope.length - stageBatches[0]!.length);
    expect(view.nextBatchIds.every((id) => scope.includes(id))).toBe(true);
    expect(view.chapterCleared).toBe(false);
  });

  it("goes to the next word without a confirm step, including across a batch", () => {
    const learned = batches[0]!.slice(0, 1);
    const mid = learnIds(standing, learned);
    const view = learnBatchView(mid, batches[0]!, learned, chapter);
    expect(learnAdvance(view)).toEqual({ kind: "next", batchIds: batches[0], resetBatch: false });
    expect(view.nextWordId).toBe(batches[0]![1]);
    const doneBatch = learnIds(standing, batches[0]!);
    expect(learnAdvance(learnBatchView(doneBatch, batches[0]!, batches[0]!, chapter))).toEqual({
      kind: "next",
      batchIds: batches[1],
      resetBatch: true,
    });
    const finished = learnIds(standing, chapter.wordIds);
    const last = batches[batches.length - 1]!;
    expect(learnAdvance(learnBatchView(finished, last, last, chapter)).kind).toBe("done");
  });

  it("keeps counting after the 3/5/8 target and still opens the next word", () => {
    let save = setGoalPreset(standing, "normal");
    const ids = batches[0]!;
    for (const id of ids.slice(0, 4)) save = learnWord(save, id, START);
    expect(learnDayMeter(save, START)).toMatchObject({ learned: 4, target: 5, label: "4/5", met: false, hint: null, ratio: 0.8 });
    save = learnWord(save, ids[4]!, START);
    expect(learnDayMeter(save, START)).toMatchObject({
      learned: 5,
      target: 5,
      label: "5/5",
      met: true,
      hint: NEW_WORD_GOAL_NOTICE,
      ratio: 1,
    });
    expect(learnAdvance(learnBatchView(save, ids, ids.slice(0, 5), chapter))).toEqual({
      kind: "next",
      batchIds: ids,
      resetBatch: false,
    });
    save = learnWord(save, ids[5]!, START);
    expect(save.wordCards[ids[5]!]).toBeTruthy();
    expect(learnDayMeter(save, START)).toMatchObject({ learned: 6, label: "6/5", met: true, ratio: 1 });
    expect(learnDayMeter(setGoalPreset(standing, "easy"), START).target).toBe(3);
    expect(learnDayMeter(setGoalPreset(standing, "more"), START).target).toBe(8);
  });
});

describe("learn scene settlement wiring", () => {
  const scene = readFileSync(new URL("../game/scenes/LearnScene.ts", import.meta.url), "utf8");

  it("goes straight to the next word and does not ask for confirmation", () => {
    const grant = scene.slice(scene.indexOf("private grant"), scene.indexOf("private backToVillage"));
    expect(grant).toContain("learnAdvance");
    expect(grant).toContain('this.phase = "study"');
    expect(grant.split("this.missed = false").length - 1).toBe(1);
    expect(grant).not.toContain('this.phase = "got"');
    expect(grant).not.toContain("warmButton");
    expect(grant).not.toContain("dailyNewWordTargetMet");
    expect(scene).not.toContain("继续本次");
    expect(scene).not.toContain("LEARN_CONTINUE_BATCH");
    expect(scene).not.toContain("LEARN_CONTINUE_CHAPTER");
    expect(scene).toContain("learnDayMeter");
    expect(scene).toContain("paintDayMeter");
    expect(scene).toContain("academyGradeChoices");
    expect(scene).toContain("LEARN_SWITCH");
    expect(scene).toContain("openAcademyForStage");
    expect(scene).toContain("forestStageId");
    expect(readFileSync(new URL("./chapter-route.ts", import.meta.url), "utf8")).toContain("换一章");
    const picker = scene.slice(scene.indexOf("private drawPicker"), scene.indexOf("private meaningRow"));
    expect(picker).toContain("academyGradeChoices");
    expect(picker).not.toContain('"mixed"');
    expect(picker).not.toContain("森林冒险");
  });

  it("keeps the finished-chapter screen off the learn path and sends the map through the existing scene", () => {
    const choose = scene.slice(scene.indexOf("private chooseSettlement"), scene.indexOf("private drawSettlement"));
    expect(choose).toContain("confirmLearnSettlement");
    expect(choose).toContain('this.scene.start("stages")');
    expect(choose).not.toContain("continue-batch");
    expect(choose).not.toContain("continue-chapter");
    expect(choose).not.toContain("learnWord");
    expect(choose).not.toContain("mutate");
    expect(choose).not.toContain("stageWins");
    expect(choose).not.toContain("chapterCleared");
    expect(scene).toContain("LEARN_GO_MAP");
    expect(scene).toContain("view.settlement");
    expect(scene).toContain("resumeChapterLearn");
    expect(scene).toContain("confirmLearnSelection");
    expect(scene).toContain("LEARN_RESELECT");
    expect(scene).toContain("LEARN_LOAD_FAILED");
    expect(scene).not.toContain("已开放章节");
    expect(scene).not.toContain("所选年级里没有这一章的词");
    expect(scene).not.toContain("所选年级没有这一章的词");
  });
});
