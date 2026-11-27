import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { allGradeChapters, gradeChapters, graduationBossReady, isChapterUnlocked } from "./chapter-plan";
import { FOREST_CHAPTER_ID, isCleared } from "./clearance";
import { inventorEarnedByClear, isClassUnlocked } from "./class-unlock";
import { createSave, setSelectedGrades } from "./progress";
import { FOREST_CHAPTER } from "./stages";
import { finalExamIds } from "./titles";

const START = Date.parse("2026-03-01T02:00:00Z");

function saveWith(grades: string[] = ["G3"]) {
  return setSelectedGrades(
    createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START,
      grades,
    }),
    grades,
  );
}

describe("one clear check", () => {
  it("clears a stage on a win and keeps chapter, exam, inventor, and graduation on their own records", () => {
    const save = saveWith();
    const stage = FOREST_CHAPTER.stages[0]!;
    expect(isCleared(save, { kind: "stage", chapterId: FOREST_CHAPTER_ID, stage })).toBe(false);
    const won = { ...save, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    expect(isCleared(won, { kind: "stage", chapterId: FOREST_CHAPTER_ID, stage })).toBe(true);
    expect(isCleared(won, { kind: "chapter", chapterId: FOREST_CHAPTER_ID })).toBe(false);
    expect(isChapterUnlocked(won, gradeChapters("G3")[0]!)).toBe(true);
    expect(isChapterUnlocked(won, gradeChapters("G3")[1]!)).toBe(false);
    expect(graduationBossReady(won)).toBe(false);
    const examId = finalExamIds()[0]!;
    expect(isCleared(won, { kind: "exam", examId })).toBe(false);
    expect(inventorEarnedByClear(won)).toBe(false);
    expect(isClassUnlocked("inventor", won)).toBe(false);

    const examined = { ...won, examProgress: { [examId]: { cleared: true } } };
    expect(isCleared(examined, { kind: "exam", examId })).toBe(true);
    expect(inventorEarnedByClear(examined)).toBe(true);
    expect(isClassUnlocked("inventor", examined)).toBe(true);
    expect(examined.unlockedClassIds).toBeUndefined();
    expect(graduationBossReady(examined)).toBe(false);

    const forest = { ...won, chapterCleared: true };
    expect(isCleared(forest, { kind: "chapter", chapterId: FOREST_CHAPTER_ID })).toBe(true);
    expect(isChapterUnlocked(forest, gradeChapters("G3")[0]!)).toBe(true);
    expect(isChapterUnlocked(forest, gradeChapters("G3")[1]!)).toBe(false);
    expect(graduationBossReady(forest)).toBe(false);

    const chapters = allGradeChapters();
    expect(chapters).toHaveLength(31);
    const progress = Object.fromEntries(chapters.map((chapter) => [chapter.id, { cleared: true, stageWins: { "1": 1 } }]));
    expect(graduationBossReady({ ...save, chapterProgress: progress })).toBe(true);
    const first = chapters[0]!;
    const almost = {
      ...save,
      chapterProgress: { ...progress, [first.id]: { cleared: false, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } } },
    };
    expect(isCleared(almost, { kind: "stage", chapterId: first.id, stage: first.stages[0]! })).toBe(true);
    expect(isCleared(almost, { kind: "chapter", chapterId: first.id })).toBe(false);
    expect(graduationBossReady(almost)).toBe(false);
  });
});
