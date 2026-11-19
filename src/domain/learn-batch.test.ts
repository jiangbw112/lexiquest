import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { sampleWords } from "./catalog";
import {
  activeChapter,
  chapterBossReady,
  gradeChapters,
  isChapterCleared,
  isChapterUnlocked,
  playStatuses,
  visibleChapters,
} from "./chapter-plan";
import { academyForestChapter } from "./chapter-route";
import {
  LEARN_BACK_VILLAGE,
  LEARN_CARDS_DONE_CLEARED,
  LEARN_FIGHT_BOSS,
  LEARN_RETURN_CHAPTERS,
  chapterLearnScope,
  chapterWordsRemaining,
  confirmLearnSettlement,
  learnAdvance,
  learnBatchView,
  learnCardsDoneCopy,
  learnChapterFinishRoute,
  learnStageBatches,
  resumeChapterLearn,
} from "./learn-batch";
import { NEW_WORD_GOAL_NOTICE, learnDayMeter, setGoalPreset } from "./parent";
import { LEARN_XP, createSave, learnWord } from "./progress";
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

  it("returns a just-finished chapter to the picker and keeps the battle map on the other buttons", () => {
    const grant = scene.slice(scene.indexOf("private grant"), scene.indexOf("private backToVillage"));
    const learnAt = grant.indexOf("learnWord(current, id, studyNow(current))");
    const routeAt = grant.indexOf("learnChapterFinishRoute");
    const openAt = grant.indexOf("openChapterSelect");
    expect(learnAt).toBeGreaterThan(-1);
    expect(routeAt).toBeGreaterThan(learnAt);
    expect(openAt).toBeGreaterThan(routeAt);
    expect(grant).toContain("committed.saved");
    expect(grant).not.toContain('this.scene.start("stages")');
    const choose = scene.slice(scene.indexOf("private chooseSettlement"), scene.indexOf("private openChapterSelect"));
    expect(choose).toContain("activateSettlement");
    expect(choose).not.toContain("learnWord");
    expect(choose).not.toContain('this.scene.start("stages")');
    const activate = scene.slice(scene.indexOf("private activateSettlement"), scene.indexOf("private drawSettlement"));
    expect(activate).toContain("confirmLearnSettlement");
    expect(activate).toContain('settlement?.primary === "chapters"');
    expect(activate).toContain("openChapterSelect");
    expect(activate).toContain("goToChapterMap");
    expect(activate).not.toContain("learnWord");
    expect(activate).not.toContain("mutate");
    expect(activate).not.toContain("chapterCleared");
    const opener = scene.slice(scene.indexOf("private openChapterSelect"), scene.indexOf("private armChapterHint"));
    expect(opener).toContain("this.picking = true");
    expect(opener).not.toContain('this.scene.start("stages")');
    expect(opener).not.toContain("learnWord");
    expect(opener).not.toContain("mutate");
    const confirm = scene.slice(scene.indexOf("private confirmPick"), scene.indexOf("private drawLearnGate"));
    expect(confirm).not.toContain("openChapterSelect");
    expect(confirm).not.toContain("learnChapterFinishRoute");
    expect(confirm).toContain("this.batchIds.some");
    const draw = scene.slice(scene.indexOf("  private draw():"), scene.indexOf("  private lessonChapter"));
    expect(draw).not.toContain("openChapterSelect");
    expect(draw).not.toContain("learnChapterFinishRoute");
    expect(scene).toContain("LEARN_RETURN_CHAPTERS");
    expect(scene).toContain("LEARN_GO_MAP");
    expect(scene).toContain('this.scene.start("stages"');
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

describe("chapter finish returns to the academy picker", () => {
  it("sends a finished forest lesson and a finished grade chapter to chapter select", () => {
    const forest = academyForestChapter("G3");
    let forestSave = fresh(["G3"]);
    forestSave = { ...forestSave, learnSelection: { grade: "G3", chapterId: forest.id } };
    const forestIds = chapterLearnScope(forestSave, forest);
    const forestLast = forestIds[forestIds.length - 1]!;
    const forestBefore = learnIds(forestSave, forestIds.filter((id) => id !== forestLast));
    expect(chapterWordsRemaining(forestBefore, forest)).toBe(1);
    const forestXp = forestBefore.xp;
    const forestWins = forestBefore.stageWins;
    const forestAfter = learnWord(forestBefore, forestLast, START);
    expect(chapterWordsRemaining(forestAfter, forest)).toBe(0);
    expect(forestAfter.wordCards[forestLast]?.wordId).toBe(forestLast);
    expect(forestAfter.xp).toBe(forestXp + LEARN_XP);
    expect(forestAfter.stageWins).toEqual(forestWins);
    expect(forestAfter.chapterCleared).toBe(false);
    expect(isChapterCleared(forestAfter, forest)).toBe(false);
    expect(isChapterUnlocked(forestAfter, gradeChapters("G3")[0]!)).toBe(false);
    expect(learnWord(forestAfter, forestLast, START)).toBe(forestAfter);
    expect(learnChapterFinishRoute({
      saved: true,
      cardAdded: true,
      remainingBefore: 1,
      remainingAfter: 0,
    })).toEqual({ kind: "chapter-select", hint: LEARN_CARDS_DONE_CLEARED });
    expect(learnChapterFinishRoute({
      saved: false,
      cardAdded: true,
      remainingBefore: 1,
      remainingAfter: 0,
    })).toEqual({ kind: "stay" });
    expect(learnChapterFinishRoute({
      saved: true,
      cardAdded: false,
      remainingBefore: 0,
      remainingAfter: 0,
    })).toEqual({ kind: "stay" });
    expect(learnCardsDoneCopy(forestAfter, forest).primaryLabel).toBe(LEARN_FIGHT_BOSS);
    const forestCleared = learnCardsDoneCopy({ ...forestAfter, chapterCleared: true }, forest);
    expect(forestCleared).toMatchObject({
      message: LEARN_CARDS_DONE_CLEARED,
      primaryLabel: LEARN_RETURN_CHAPTERS,
      secondaryLabel: LEARN_BACK_VILLAGE,
      primary: "chapters",
    });
    expect(forestCleared.mapChapterId).toBeUndefined();

    const chapter = gradeChapters("G3")[0]!;
    const next = gradeChapters("G3")[1]!;
    let gradeSave = fresh(["G3"]);
    gradeSave = { ...gradeSave, learnSelection: { grade: "G3", chapterId: chapter.id }, currentChapterId: chapter.id };
    const gradeLast = chapter.wordIds[chapter.wordIds.length - 1]!;
    const gradeBefore = learnIds(gradeSave, chapter.wordIds.filter((id) => id !== gradeLast));
    expect(chapterWordsRemaining(gradeBefore, chapter)).toBe(1);
    const gradeAfter = learnWord(gradeBefore, gradeLast, START);
    expect(chapterWordsRemaining(gradeAfter, chapter)).toBe(0);
    expect(gradeAfter.xp).toBe(gradeBefore.xp + LEARN_XP);
    expect(gradeAfter.stageWins).toEqual(gradeBefore.stageWins);
    expect(gradeAfter.chapterProgress).toEqual(gradeBefore.chapterProgress);
    expect(isChapterCleared(gradeAfter, chapter)).toBe(false);
    expect(isChapterUnlocked(gradeAfter, next)).toBe(false);
    expect(learnWord(gradeAfter, gradeLast, START)).toBe(gradeAfter);
    expect(learnCardsDoneCopy(gradeAfter, chapter).primaryLabel).toBe("去对战");
    expect(learnCardsDoneCopy(gradeAfter, chapter).primary).toBe("map");
    const gradeCleared = learnCardsDoneCopy({
      ...gradeAfter,
      chapterProgress: { [chapter.id]: { cleared: true, stageWins: {} } },
    }, chapter);
    expect(gradeCleared).toMatchObject({
      message: LEARN_CARDS_DONE_CLEARED,
      primaryLabel: LEARN_RETURN_CHAPTERS,
      secondaryLabel: LEARN_BACK_VILLAGE,
      primary: "chapters",
    });
    expect(gradeCleared.mapChapterId).toBeUndefined();
  });

  it("keeps the other grade, the sash, and the unlock rules when several grades are open", () => {
    let paired = fresh(["G4", "G6"]);
    const fourth = academyForestChapter("G4");
    const sixth = academyForestChapter("G6");
    const ids = chapterLearnScope(paired, fourth);
    const last = ids[ids.length - 1]!;
    paired = learnIds(paired, ids.filter((id) => id !== last));
    const sixthBefore = chapterWordsRemaining(paired, sixth);
    const unlocked = isChapterUnlocked(paired, gradeChapters("G4")[0]!);
    const after = learnWord(paired, last, START);
    expect(chapterWordsRemaining(after, fourth)).toBe(0);
    const shared = chapterLearnScope(paired, sixth).includes(last) ? 1 : 0;
    expect(chapterWordsRemaining(after, sixth)).toBe(sixthBefore - shared);
    expect(sixthBefore).toBeGreaterThan(shared);
    for (const id of chapterLearnScope(paired, sixth)) {
      if (id === last) expect(after.wordCards[id]?.wordId).toBe(id);
      else expect(after.wordCards[id]).toBe(paired.wordCards[id]);
    }
    expect(isChapterUnlocked(after, gradeChapters("G4")[0]!)).toBe(unlocked);
    expect(isChapterCleared(after, fourth)).toBe(false);
    expect(after.ownedOutfitIds).not.toContain("star-sash");
    expect(after.rewardQueue).toEqual(paired.rewardQueue);
    expect(learnWord(after, last, START)).toBe(after);
    expect(learnChapterFinishRoute({
      saved: true,
      cardAdded: true,
      remainingBefore: 1,
      remainingAfter: chapterWordsRemaining(after, fourth),
    }).kind).toBe("chapter-select");
    const handoff = learnCardsDoneCopy(after, fourth);
    expect(handoff.primary).toBe("grade");
    expect(handoff.primaryLabel).toBe("去六年级学");
    expect(handoff.secondaryLabel).toBe(LEARN_BACK_VILLAGE);

    const words = sampleWords();
    const sashWord = words[words.length - 1]!;
    let all = fresh(["G3", "G4", "G5", "G6"]);
    all = learnIds(all, words.map((word) => word.id).filter((id) => id !== sashWord.id));
    const sashChapter = academyForestChapter(sashWord.grade);
    expect(sashChapter.wordIds).toContain(sashWord.id);
    expect(chapterWordsRemaining(all, sashChapter)).toBe(1);
    expect(all.ownedOutfitIds).not.toContain("star-sash");
    const rewarded = learnWord(all, sashWord.id, START);
    expect(rewarded.xp).toBe(all.xp + LEARN_XP);
    expect(rewarded.ownedOutfitIds.filter((id) => id === "star-sash")).toEqual(["star-sash"]);
    expect(rewarded.rewardQueue.filter((notice) => notice.title === "得到星光绶带")).toHaveLength(1);
    expect(learnWord(rewarded, sashWord.id, START)).toBe(rewarded);
    expect(isChapterCleared(rewarded, sashChapter)).toBe(false);
    expect(learnChapterFinishRoute({
      saved: true,
      cardAdded: true,
      remainingBefore: chapterWordsRemaining(all, sashChapter),
      remainingAfter: chapterWordsRemaining(rewarded, sashChapter),
    })).toEqual({ kind: "chapter-select", hint: LEARN_CARDS_DONE_CLEARED });
  });
});
