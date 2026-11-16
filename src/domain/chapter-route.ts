import { GRADE_BANDS, normalizeGrades } from "./catalog";
import {
  forestPlayChapter,
  gradeChapters,
  isChapterCleared,
  isChapterUnlocked,
  type PlayChapter,
} from "./chapter-plan";
import { FOREST_CHAPTER, FOREST_TITLE } from "./stages";
import type { GradeBand, SaveData } from "./types";
import { uiLabel } from "./ui-label";

/**
 * Academy L and battle P.
 * Map preview V is not stored: leaving the map drops it.
 * New lines stay inside the committed core subset. The three glyphs called out in learn-batch stay unused.
 */
export const LEARN_PICK = "请选章";
export const LEARN_RESELECT = "请重新选章";
export const LEARN_LOAD_FAILED = "本章没有载入。";
export const LEARN_GRADE_EMPTY = "这一年级还没有可学的章";
/** Grade chapters stay locked until the forest adventure is cleared. */
export const LEARN_GRADE_LOCKED = "先打完森林冒险，这一年级就会开启";
export const BATTLE_RETURN_PROGRESS = "返回进度章";
export const BATTLE_NONE = "暂无可进入章节";
export const BATTLE_REVIEW = "回顾";
export const BATTLE_PICK_GRADE = "请选一个年级";

export type LearnGrade = GradeBand | "mixed";

export interface LearnDraft {
  grade: LearnGrade;
  chapterId: string | null;
}

export interface LearnMemory {
  grade: LearnGrade;
  name: string;
}

export type LearnAssessment =
  | { status: "ready"; chapter: PlayChapter }
  | { status: "choose" }
  | { status: "reselect"; remembered: LearnMemory | null }
  | { status: "load-failed" };

export interface BattleSpot {
  chapter: PlayChapter;
  /** Cleared chapter shown again, including an explicit replay anchor. */
  review: boolean;
  step: "progress" | "open" | "review" | "forest";
}

export type BattleReturn =
  | { kind: "ready"; grade: GradeBand | null; spot: BattleSpot }
  | { kind: "pick-grade"; grades: GradeBand[] }
  | { kind: "blocked"; reason: "no-grade" | "no-chapter"; message: string };

const GRADE_ORDER: readonly GradeBand[] = ["G3", "G4", "G5", "G6"];

function chapterById(chapterId: string): PlayChapter | undefined {
  if (chapterId === FOREST_CHAPTER.chapter_id) return forestPlayChapter();
  for (const grade of GRADE_ORDER) {
    const found = gradeChapters(grade).find((chapter) => chapter.id === chapterId);
    if (found) return found;
  }
  return undefined;
}

export function learnGradeLabel(grade: LearnGrade): string {
  if (grade === "mixed") return "森林";
  return GRADE_BANDS.find((item) => item.id === grade)?.label ?? "";
}

/** Selected grades for the forest lesson, in band order, joined with 、. */
export function forestGradeLabel(save: SaveData): string {
  return normalizeGrades(save.selectedGrades)
    .map((id) => GRADE_BANDS.find((band) => band.id === id)?.label ?? "")
    .filter((label) => label.length > 0)
    .join("、");
}

/** Title line. A forest lesson names the selected grades instead of only 森林. */
export function learnSceneTitle(save: SaveData, grade: LearnGrade, chapterName: string): string {
  const label = grade === "mixed" ? forestGradeLabel(save) : learnGradeLabel(grade);
  return uiLabel(`学堂 · ${label} · ${chapterName}`);
}

/** Grade chip. The forest chip is the chapter name plus the selected grades. */
export function learnChipLabel(grade: LearnGrade, save: SaveData): string {
  if (grade !== "mixed") return learnGradeLabel(grade);
  const grades = forestGradeLabel(save);
  return grades.length > 0 ? `${FOREST_TITLE}（${grades}）` : FOREST_TITLE;
}

export function learnDraftLine(grade: LearnGrade, save: SaveData, chapterName: string | null): string {
  const label = grade === "mixed" ? forestGradeLabel(save) : learnGradeLabel(grade);
  return `${label} · ${chapterName ?? LEARN_PICK}`;
}

/**
 * An empty grade list before the forest adventure is cleared is the lock, not a missing chapter.
 * The lock itself is unchanged.
 */
export function learnGradeEmptyLine(grade: LearnGrade, forestCleared: boolean): string {
  if (grade !== "mixed" && !forestCleared) return LEARN_GRADE_LOCKED;
  return LEARN_GRADE_EMPTY;
}

/** Title line. Both the grade and the chapter name are required whenever a pair is shown. */
export function learnHeading(grade: LearnGrade, chapterName: string): string {
  return `学堂 · ${learnGradeLabel(grade)} · ${chapterName}`;
}

export function learnGradeOptions(save: SaveData): GradeBand[] {
  return normalizeGrades(save.selectedGrades);
}

/** Parent-allowed grades only, and inside a grade only chapters the existing order has opened. */
export function legalLearnChapters(save: SaveData, grade: LearnGrade): PlayChapter[] {
  if (normalizeGrades(save.selectedGrades).length === 0) return [];
  if (grade === "mixed") return [forestPlayChapter()];
  if (!normalizeGrades(save.selectedGrades).includes(grade)) return [];
  return gradeChapters(grade).filter((chapter) => isChapterUnlocked(save, chapter));
}

export function assessLearnSelection(save: SaveData): LearnAssessment {
  const selection = save.learnSelection;
  if (!selection) return { status: "choose" };
  const chapter = chapterById(selection.chapterId);
  if (!chapter) return { status: "load-failed" };
  const paired = chapter.grade === selection.grade;
  const legal = paired && legalLearnChapters(save, selection.grade).some((item) => item.id === chapter.id);
  if (!legal) {
    return {
      status: "reselect",
      remembered: paired ? { grade: selection.grade, name: chapter.name } : null,
    };
  }
  return { status: "ready", chapter };
}

/**
 * Switching grade drops the chapter on the draft.
 * The saved lesson is unchanged until confirm, so an old chapter is never shown under a new grade.
 */
export function changeLearnDraftGrade(draft: LearnDraft, grade: LearnGrade): LearnDraft {
  if (draft.grade === grade) return draft;
  return { grade, chapterId: null };
}

export function initialLearnDraft(save: SaveData): LearnDraft {
  const selection = save.learnSelection;
  const assessed = assessLearnSelection(save);
  if (assessed.status === "ready" && selection) return { grade: selection.grade, chapterId: selection.chapterId };
  const options = learnGradeOptions(save);
  if (selection && (selection.grade === "mixed" || options.includes(selection.grade))) {
    return { grade: selection.grade, chapterId: null };
  }
  const withChapters = options.find((grade) => legalLearnChapters(save, grade).length > 0);
  if (withChapters) return { grade: withChapters, chapterId: null };
  const forest = legalLearnChapters(save, "mixed")[0];
  return { grade: "mixed", chapterId: forest?.id ?? null };
}

/** Writes L only when the chapter still belongs to that grade and is legal. Battle fields stay. */
export function confirmLearnSelection(save: SaveData, grade: LearnGrade, chapterId: string): SaveData {
  const chapter = legalLearnChapters(save, grade).find((item) => item.id === chapterId);
  if (!chapter || chapter.grade !== grade) return save;
  if (save.learnSelection?.grade === grade && save.learnSelection.chapterId === chapterId) return save;
  return { ...save, learnSelection: { grade, chapterId } };
}

export interface SpotInput {
  chapters: readonly PlayChapter[];
  savedChapterId?: string;
  unlocked: (chapter: PlayChapter) => boolean;
  cleared: (chapter: PlayChapter) => boolean;
  /** Null when the forest entrance fails the current gate. */
  forest: PlayChapter | null;
}

/**
 * ① saved enterable P, including a cleared chapter that was explicitly entered
 * ② first unlocked chapter in this grade that is not cleared
 * ③ last unlocked cleared chapter, marked 回顾
 * ④ forest
 * Positioning does not write the save.
 */
export function chooseBattleSpot(input: SpotInput): BattleSpot | null {
  const saved = input.chapters.find((chapter) => chapter.id === input.savedChapterId);
  if (saved && input.unlocked(saved)) {
    return { chapter: saved, review: input.cleared(saved), step: "progress" };
  }
  const open = input.chapters.find((chapter) => input.unlocked(chapter) && !input.cleared(chapter));
  if (open) return { chapter: open, review: false, step: "open" };
  const cleared = input.chapters.filter((chapter) => input.unlocked(chapter) && input.cleared(chapter));
  const last = cleared[cleared.length - 1];
  if (last) return { chapter: last, review: true, step: "review" };
  if (input.forest && input.unlocked(input.forest)) return { chapter: input.forest, review: false, step: "forest" };
  return null;
}

function spotForGrade(save: SaveData, grade: GradeBand): BattleSpot | null {
  const forest = forestPlayChapter();
  const forestOpen = isChapterUnlocked(save, forest);
  return chooseBattleSpot({
    chapters: gradeChapters(grade),
    savedChapterId: save.battleChapterByGrade?.[grade],
    unlocked: (chapter) => isChapterUnlocked(save, chapter),
    cleared: (chapter) => isChapterCleared(save, chapter),
    forest: forestOpen ? forest : null,
  });
}

/**
 * Re-enter the map on the last battle grade that the parent still allows.
 * An invalid grade asks for an allowed grade and does not pick one.
 * No battle grade yet stays on the forest instead of jumping to a newly checked grade.
 */
export function battleReturn(save: SaveData): BattleReturn {
  const grades = learnGradeOptions(save);
  if (grades.length === 0) return { kind: "blocked", reason: "no-grade", message: BATTLE_NONE };
  const grade = save.battleGrade;
  if (grade && !grades.includes(grade)) return { kind: "pick-grade", grades };
  if (!grade) {
    const forest = forestPlayChapter();
    if (!isChapterUnlocked(save, forest)) return { kind: "blocked", reason: "no-chapter", message: BATTLE_NONE };
    return { kind: "ready", grade: null, spot: { chapter: forest, review: false, step: "forest" } };
  }
  const spot = spotForGrade(save, grade);
  if (!spot) return { kind: "blocked", reason: "no-chapter", message: BATTLE_NONE };
  return { kind: "ready", grade, spot };
}

/** Records the grade choice only. The chapter anchor stays until a real entry or a clear. */
export function selectBattleGrade(save: SaveData, grade: GradeBand): SaveData {
  if (!learnGradeOptions(save).includes(grade)) return save;
  if (save.battleGrade === grade) return save;
  return { ...save, battleGrade: grade };
}

/** Explicit entry of a legal open chapter. Preview and paging must not call this. */
export function commitBattleEntry(save: SaveData, chapter: PlayChapter): SaveData {
  if (!isChapterUnlocked(save, chapter)) return save;
  const grade = chapter.grade === "mixed" ? null : chapter.grade;
  const sameChapter = save.currentChapterId === chapter.id;
  const sameGrade = grade === null || save.battleGrade === grade;
  const sameAnchor = grade === null || save.battleChapterByGrade?.[grade] === chapter.id;
  if (sameChapter && sameGrade && sameAnchor) return save;
  return {
    ...save,
    currentChapterId: chapter.id,
    battleGrade: grade ?? save.battleGrade,
    battleChapterByGrade: grade
      ? { ...save.battleChapterByGrade, [grade]: chapter.id }
      : save.battleChapterByGrade,
  };
}

/**
 * Real boss clear moves that grade's anchor to the next unlocked uncleared chapter.
 * The last entered chapter id stays, so a retry still fights the chapter that was cleared.
 * No win is written on the next chapter.
 */
export function advanceBattleAnchor(save: SaveData, clearedChapterId: string): SaveData {
  const chapter = chapterById(clearedChapterId);
  if (!chapter || chapter.grade === "mixed") return save;
  if (!isChapterCleared(save, chapter)) return save;
  if (!learnGradeOptions(save).includes(chapter.grade)) return save;
  const next = gradeChapters(chapter.grade).find((item) => isChapterUnlocked(save, item) && !isChapterCleared(save, item));
  const anchor = next ?? chapter;
  if (save.battleChapterByGrade?.[chapter.grade] === anchor.id) return save;
  return {
    ...save,
    battleChapterByGrade: { ...save.battleChapterByGrade, [chapter.grade]: anchor.id },
  };
}
