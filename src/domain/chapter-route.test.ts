import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import {
  LEARN_CARDS_DONE,
  chapterLearnScope,
  learnBatchView,
  resumeChapterLearn,
} from "./learn-batch";
import {
  BATTLE_NONE,
  BATTLE_RETURN_PROGRESS,
  LEARN_LOAD_FAILED as LOAD_FAILED,
  LEARN_RESELECT,
  advanceBattleAnchor,
  assessLearnSelection,
  battleReturn,
  changeLearnDraftGrade,
  chooseBattleSpot,
  commitBattleEntry,
  confirmLearnSelection,
  forestGradeLabel,
  initialLearnDraft,
  LEARN_GRADE_EMPTY,
  LEARN_GRADE_LOCKED,
  learnChipLabel,
  learnDraftLine,
  learnGradeEmptyLine,
  learnHeading,
  learnSceneTitle,
  legalLearnChapters,
  selectBattleGrade,
} from "./chapter-route";
import { forestPlayChapter, gradeChapters, isChapterCleared, isChapterUnlocked } from "./chapter-plan";
import { applyBattleOutcome, createSave, learnWord } from "./progress";
import { deserialize, serialize } from "./storage";
import type { GradeBand, SaveData } from "./types";

const START = new Date("2026-03-01T02:00:00Z");
const FORBIDDEN = "所选年级没有这一章的词";

function fresh(grades: readonly string[]): SaveData {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades,
  });
}

function cleared(ids: readonly string[]): SaveData["chapterProgress"] {
  const wins = { "1": 1, "2": 1, "3": 1, "4": 1, "5": 1 };
  return Object.fromEntries(ids.map((id) => [id, { cleared: true, stageWins: wins }]));
}

function battleSnapshot(save: SaveData) {
  return {
    currentChapterId: save.currentChapterId,
    battleGrade: save.battleGrade,
    battleChapterByGrade: save.battleChapterByGrade,
    chapterProgress: save.chapterProgress,
    stageWins: save.stageWins,
    chapterCleared: save.chapterCleared,
    battlesWon: save.battlesWon,
  };
}

describe("academy lesson L", () => {
  const g3 = gradeChapters("G3");
  const g5 = gradeChapters("G5");

  function standing(): SaveData {
    return {
      ...fresh(["G3", "G5"]),
      chapterCleared: true,
      currentChapterId: g5[2]!.id,
      battleGrade: "G5",
      battleChapterByGrade: { G5: g5[2]!.id },
      chapterProgress: cleared([g5[0]!.id, g5[1]!.id]),
      learnSelection: { grade: "G3", chapterId: g3[0]!.id },
    };
  }

  it("changes the title and the word pool together and leaves P where it was", () => {
    const before = standing();
    const nextChapter = g5[0]!;
    const next = confirmLearnSelection(before, "G5", nextChapter.id);
    expect(next).not.toBe(before);
    expect(next.learnSelection).toEqual({ grade: "G5", chapterId: nextChapter.id });
    expect(learnHeading("G5", nextChapter.name)).toBe(`学堂 · 五年级 · ${nextChapter.name}`);
    expect(chapterLearnScope(next, nextChapter)).toEqual(nextChapter.wordIds);
    expect(resumeChapterLearn(next).chapterId).toBe(nextChapter.id);
    expect(resumeChapterLearn(next).batchIds.flat()).not.toEqual(resumeChapterLearn(before).batchIds);
    expect(battleSnapshot(next)).toEqual(battleSnapshot(before));
    expect(battleReturn(next)).toMatchObject({
      kind: "ready",
      grade: "G5",
      spot: { chapter: expect.objectContaining({ id: g5[2]!.id }), step: "progress" },
    });
    expect(next.chapterProgress).toEqual(before.chapterProgress);
  });

  it("offers the forest lesson before any grade chapter is open, and does not preselect a later chapter", () => {
    const early = fresh(["G3"]);
    expect(legalLearnChapters(early, "G3")).toEqual([]);
    expect(initialLearnDraft(early)).toEqual({ grade: "mixed", chapterId: "forest_adventure" });
    const opened = { ...fresh(["G3", "G5"]), chapterCleared: true };
    expect(initialLearnDraft(opened)).toEqual({ grade: "G3", chapterId: null });
    expect(confirmLearnSelection(opened, "G5", g3[0]!.id)).toBe(opened);
  });

  it("drops the drafted chapter when the grade changes and checks the pair again on confirm", () => {
    const before = standing();
    const draft = initialLearnDraft(before);
    expect(draft).toEqual({ grade: "G3", chapterId: g3[0]!.id });
    const switched = changeLearnDraftGrade(draft, "G5");
    expect(switched).toEqual({ grade: "G5", chapterId: null });
    expect(draft.chapterId).toBe(g3[0]!.id);
    const rejected = confirmLearnSelection(before, "G5", g3[0]!.id);
    expect(rejected).toBe(before);
    expect(rejected.learnSelection).toEqual(before.learnSelection);
    expect(`${switched.grade}:${switched.chapterId ?? ""}`).not.toBe(`G5:${g3[0]!.id}`);
  });

  it("refuses a paused lower grade and a locked chapter, then asks for a new lesson without the old pool", () => {
    const before = standing();
    const locked = g3[1]!;
    expect(isChapterUnlocked(before, locked)).toBe(false);
    expect(confirmLearnSelection(before, "G3", locked.id)).toBe(before);
    expect(legalLearnChapters(before, "G4")).toEqual([]);
    expect(confirmLearnSelection(before, "G4", gradeChapters("G4")[0]!.id)).toBe(before);
    const paused = { ...before, selectedGrades: ["G5"] as GradeBand[] };
    expect(assessLearnSelection(paused)).toEqual({
      status: "reselect",
      remembered: { grade: "G3", name: g3[0]!.name },
    });
    expect(paused.learnSelection).toEqual(before.learnSelection);
    const resume = resumeChapterLearn(paused);
    expect(resume.batchIds).toEqual([]);
    expect(resume.nextWordId).toBeNull();
    expect(resume.chapterName).toBe("");
    expect(LEARN_RESELECT).toBe("请重新选章");
    expect(LEARN_RESELECT).not.toContain(FORBIDDEN);
  });

  it("keeps a finished pool and a missing chapter on different messages and does not skip ahead", () => {
    const chapter = g3[0]!;
    let done = standing();
    for (const id of chapter.wordIds) done = learnWord(done, id, START);
    const view = learnBatchView(done, [], [], chapter);
    expect(view.kind).toBe("cards-done");
    expect(view.message).toBe(LEARN_CARDS_DONE);
    expect(view.message).not.toBe(LOAD_FAILED);
    expect(view.message).not.toContain(FORBIDDEN);
    expect(done.learnSelection).toEqual({ grade: "G3", chapterId: chapter.id });
    expect(isChapterUnlocked(done, g3[1]!)).toBe(false);
    expect(battleSnapshot(done)).toEqual(battleSnapshot(standing()));
    const missing = { ...standing(), learnSelection: { grade: "G3" as const, chapterId: "missing_chapter" } };
    expect(assessLearnSelection(missing).status).toBe("load-failed");
    expect(resumeChapterLearn(missing).batchIds).toEqual([]);
    expect(missing.learnSelection?.chapterId).toBe("missing_chapter");
    expect(LOAD_FAILED).toBe("本章没有载入。");
    expect(LOAD_FAILED).not.toBe(LEARN_CARDS_DONE);
    expect(LOAD_FAILED).not.toBe(LEARN_RESELECT);
    const joined = [LEARN_RESELECT, LOAD_FAILED, LEARN_CARDS_DONE, BATTLE_RETURN_PROGRESS].join("");
    expect(joined).not.toContain(String.fromCodePoint(0x5269));
    expect(joined).not.toContain(String.fromCodePoint(0x5c1a));
    expect(joined).not.toContain(String.fromCodePoint(0x5f80));
  });
});

describe("forest grade label", () => {
  it("puts the selected grades on the forest title, chip, and draft line", () => {
    const only = fresh(["G3"]);
    expect(forestGradeLabel(only)).toBe("三年级");
    expect(learnSceneTitle(only, "mixed", "森林冒险")).toBe("学堂 · 三年级 · 森林冒险");
    expect(learnChipLabel("mixed", only)).toBe("森林冒险（三年级）");
    expect(learnDraftLine("mixed", only, "森林冒险")).toBe("三年级 · 森林冒险");
    expect(learnSceneTitle(only, "mixed", "森林冒险")).not.toContain("· 森林 ·");
    expect(learnChipLabel("mixed", only)).not.toBe("森林");
    expect(learnChipLabel("G3", only)).toBe("三年级");
    const many = fresh(["G5", "G3", "G6"]);
    expect(forestGradeLabel(many)).toBe("三年级、五年级、六年级");
    expect(learnSceneTitle(many, "mixed", "森林冒险")).toBe("学堂 · 三年级、五年级、六年级 · 森林冒险");
    expect(learnChipLabel("mixed", many)).toBe("森林冒险（三年级、五年级、六年级）");
    expect(learnDraftLine("mixed", many, null)).toBe("三年级、五年级、六年级 · 请选章");
  });

  it("explains that a locked grade opens after the forest adventure, and keeps the lock", () => {
    const early = fresh(["G3"]);
    const first = gradeChapters("G3")[0]!;
    expect(early.chapterCleared).toBe(false);
    expect(isChapterUnlocked(early, first)).toBe(false);
    expect(legalLearnChapters(early, "G3")).toEqual([]);
    expect(learnGradeEmptyLine("G3", early.chapterCleared)).toBe(LEARN_GRADE_LOCKED);
    expect(LEARN_GRADE_LOCKED).toContain("先打完森林冒险");
    expect(LEARN_GRADE_LOCKED).toContain("就会开启");
    expect(learnGradeEmptyLine("mixed", false)).toBe(LEARN_GRADE_EMPTY);
    const scene = readFileSync(new URL("../game/scenes/LearnScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("learnSceneTitle");
    expect(scene).toContain("learnChipLabel");
    expect(scene).toContain("learnDraftLine");
    expect(scene).toContain("learnGradeEmptyLine");
  });
});

describe("battle return P", () => {
  const g5 = gradeChapters("G5");
  const g3 = gradeChapters("G3");

  function atChapter3(): SaveData {
    return {
      ...fresh(["G3", "G5"]),
      chapterCleared: true,
      currentChapterId: g5[2]!.id,
      battleGrade: "G5",
      battleChapterByGrade: { G5: g5[2]!.id },
      chapterProgress: cleared([g5[0]!.id, g5[1]!.id]),
      learnSelection: { grade: "G3", chapterId: g3[0]!.id },
    };
  }

  it("comes back to the progress chapter after a locked preview and does not store that preview", () => {
    const save = atChapter3();
    const locked = g5[3]!;
    expect(isChapterUnlocked(save, locked)).toBe(false);
    expect(commitBattleEntry(save, locked)).toBe(save);
    const back = battleReturn(save);
    expect(back).toMatchObject({
      kind: "ready",
      spot: { chapter: expect.objectContaining({ id: g5[2]!.id }), step: "progress", review: false },
    });
    expect(battleSnapshot(save).battleChapterByGrade).toEqual({ G5: g5[2]!.id });
    expect(save.learnSelection?.chapterId).toBe(g3[0]!.id);
    expect(save.currentChapterId).toBe(g5[2]!.id);
  });

  it("uses the next open chapter when P is missing, and will not enter a chapter whose previous one is still closed", () => {
    const opened = {
      ...fresh(["G5"]),
      chapterCleared: true,
      battleGrade: "G5" as const,
      currentChapterId: "forest_adventure",
      chapterProgress: cleared([g5[0]!.id, g5[1]!.id]),
    };
    const spot = battleReturn(opened);
    expect(spot).toMatchObject({
      kind: "ready",
      spot: { chapter: expect.objectContaining({ id: g5[2]!.id }), step: "open", review: false },
    });
    expect(opened.battleChapterByGrade).toBeUndefined();
    expect(opened.chapterProgress?.[g5[2]!.id]).toBeUndefined();
    expect(opened.battlesWon).toBe(0);
    const blockedNext = {
      ...fresh(["G5"]),
      chapterCleared: true,
      battleGrade: "G5" as const,
      battleChapterByGrade: { G5: g5[1]!.id },
    };
    expect(isChapterUnlocked(blockedNext, g5[1]!)).toBe(false);
    expect(battleReturn(blockedNext)).toMatchObject({
      kind: "ready",
      spot: { chapter: expect.objectContaining({ id: g5[0]!.id }), step: "open" },
    });
    expect(blockedNext.battleChapterByGrade).toEqual({ G5: g5[1]!.id });
    expect(blockedNext.chapterProgress?.[g5[1]!.id]).toBeUndefined();
  });

  it("asks for an allowed grade when the saved battle grade was turned off", () => {
    const save = {
      ...atChapter3(),
      selectedGrades: ["G3"] as GradeBand[],
    };
    const entry = battleReturn(save);
    expect(entry).toEqual({ kind: "pick-grade", grades: ["G3"] });
    expect(save.battleGrade).toBe("G5");
    expect(save.battleChapterByGrade?.G5).toBe(g5[2]!.id);
    const picked = selectBattleGrade(save, "G3");
    expect(picked.battleGrade).toBe("G3");
    expect(picked.battleChapterByGrade).toEqual(save.battleChapterByGrade);
    expect(picked.currentChapterId).toBe(save.currentChapterId);
    expect(picked.learnSelection).toEqual(save.learnSelection);
    expect(selectBattleGrade(save, "G5")).toBe(save);
  });

  it("writes P only for a legal entry, and a real clear moves the anchor without a win on the next chapter", () => {
    const save = atChapter3();
    const entered = commitBattleEntry(save, g5[0]!);
    expect(entered.currentChapterId).toBe(g5[0]!.id);
    expect(entered.battleGrade).toBe("G5");
    expect(entered.battleChapterByGrade?.G5).toBe(g5[0]!.id);
    expect(entered.learnSelection).toEqual(save.learnSelection);
    expect(entered.chapterProgress).toEqual(save.chapterProgress);
    expect(entered.battlesWon).toBe(save.battlesWon);
    const forest = commitBattleEntry(entered, forestPlayChapter());
    expect(forest.currentChapterId).toBe("forest_adventure");
    expect(forest.battleGrade).toBe("G5");
    expect(forest.battleChapterByGrade?.G5).toBe(g5[0]!.id);
    const moved = advanceBattleAnchor(save, g5[1]!.id);
    expect(moved.battleChapterByGrade?.G5).toBe(g5[2]!.id);
    expect(moved.currentChapterId).toBe(save.currentChapterId);
    expect(moved.learnSelection).toEqual(save.learnSelection);
    expect(isChapterCleared(moved, g5[2]!)).toBe(false);
    expect(moved.chapterProgress?.[g5[2]!.id]).toBeUndefined();
    const none = chooseBattleSpot({
      chapters: [],
      unlocked: () => false,
      cleared: () => false,
      forest: null,
    });
    expect(none).toBeNull();
    expect(BATTLE_NONE).toBe("暂无可进入章节");
  });

  it("updates P from a real boss clear and still keeps the lesson", () => {
    const chapter = g3[0]!;
    const next = g3[1]!;
    let save: SaveData = {
      ...fresh(["G3"]),
      chapterCleared: true,
      battleGrade: "G3",
      currentChapterId: chapter.id,
      learnSelection: { grade: "G3", chapterId: chapter.id },
      chapterProgress: { [chapter.id]: { cleared: false, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } } },
    };
    for (const id of chapter.wordIds) save = learnWord(save, id, START);
    const won = applyBattleOutcome(save, "win", START.getTime(), `chapter:${chapter.id}:boss`, 3, 5);
    expect(won.chapterProgress?.[chapter.id]?.cleared).toBe(true);
    expect(won.battleChapterByGrade?.G3).toBe(next.id);
    expect(won.currentChapterId).toBe(chapter.id);
    expect(won.learnSelection).toEqual(save.learnSelection);
    expect(won.chapterProgress?.[next.id]).toBeUndefined();
    expect(isChapterCleared(won, next)).toBe(false);
    const replay = commitBattleEntry(won, chapter);
    expect(replay.battleChapterByGrade?.G3).toBe(chapter.id);
    expect(replay.chapterProgress).toEqual(won.chapterProgress);
  });
});

describe("saved route fields", () => {
  it("round-trips a lesson and a per-grade anchor, and drops a broken pair", () => {
    const chapter = gradeChapters("G5")[2]!;
    const save = {
      ...fresh(["G5"]),
      learnSelection: { grade: "G5" as const, chapterId: chapter.id },
      battleGrade: "G5" as const,
      battleChapterByGrade: { G5: chapter.id },
    };
    const loaded = deserialize(serialize(save));
    expect(loaded?.learnSelection).toEqual(save.learnSelection);
    expect(loaded?.battleGrade).toBe("G5");
    expect(loaded?.battleChapterByGrade).toEqual({ G5: chapter.id });
    const raw = JSON.parse(serialize(fresh(["G3"]))) as Record<string, unknown>;
    raw.learnSelection = { grade: "G9", chapterId: "nope" };
    raw.battleGrade = "forest";
    raw.battleChapterByGrade = { G3: "ok_id", G5: "Bad Id" };
    const parsed = deserialize(JSON.stringify(raw));
    expect(parsed?.learnSelection).toBeUndefined();
    expect(parsed?.battleGrade).toBeUndefined();
    expect(parsed?.battleChapterByGrade).toEqual({ G3: "ok_id" });
  });
});

describe("scene wiring", () => {
  const map = readFileSync(new URL("../game/scenes/StageMapScene.ts", import.meta.url), "utf8");
  const battle = readFileSync(new URL("../game/scenes/BattleScene.ts", import.meta.url), "utf8");

  it("keeps map preview off the save and shows the return control on a locked chapter", () => {
    const shift = map.slice(map.indexOf("private shiftChapter"), map.indexOf("private returnToProgress"));
    expect(shift).not.toContain("mutate");
    expect(shift).not.toContain("currentChapterId");
    expect(map).toContain("battleReturn");
    expect(map).toContain("commitBattleEntry");
    expect(map).toContain("BATTLE_RETURN_PROGRESS");
    expect(map).toContain("BATTLE_REVIEW");
    expect(map).toContain("BATTLE_NONE");
    expect(map).not.toContain("所选年级没有这一章的词");
    expect(battle).toContain("commitBattleEntry");
    expect(BATTLE_RETURN_PROGRESS).toBe("返回进度章");
  });
});
