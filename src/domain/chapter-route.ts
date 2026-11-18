import { GRADE_BANDS, normalizeGrades } from "./catalog";
import {
  forestPlayChapter,
  gradeChapters,
  isChapterCleared,
  isChapterUnlocked,
  type PlayChapter,
} from "./chapter-plan";
import { FOREST_CHAPTER, FOREST_TITLE, forestStudyWordIds, gradeForestStudyWordIds, stageWordIds, type ForestStage } from "./stages";
import type { GradeBand, SaveData } from "./types";
import { uiLabel } from "./ui-label";

/**
 * Academy L and battle P.
 * Map preview V is not stored: leaving the map drops it.
 * New lines stay inside the committed core subset. The three glyphs called out in learn-batch stay unused.
 */
export const LEARN_PICK = "请选章";
export const LEARN_SWITCH = "换一章";
export const LEARN_RESELECT = "请重新选章";
export const LEARN_LOAD_FAILED = "本章没有载入。";
export const LEARN_GRADE_EMPTY = "这一年级还没有可学的章";
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

/**
 * Title line.
 * An old forest lesson names the selected grades and stops there.
 * The chapter name is not appended, so the title does not end in 「· 森林冒险」.
 */
export function learnSceneTitle(save: SaveData, grade: LearnGrade, chapterName: string): string {
  if (grade === "mixed") {
    const grades = forestGradeLabel(save);
    return uiLabel(grades ? `学堂 · ${grades}` : "学堂");
  }
  return uiLabel(`学堂 · ${learnGradeLabel(grade)} · ${chapterName}`);
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

/** Shown when an allowed grade has no chapter to list. Battle progress does not produce this line. */
export function learnGradeEmptyLine(): string {
  return LEARN_GRADE_EMPTY;
}

/**
 * Grade the child is in now.
 * The academy lesson wins. A forest lesson is not a grade, so the battle grade is used instead.
 * This can name a grade the parent has since turned off. Callers that list academy grades must not add it back.
 */
export function currentStudyGrade(save: SaveData): GradeBand | null {
  const lesson = save.learnSelection?.grade;
  if (lesson && lesson !== "mixed") return lesson;
  return save.battleGrade ?? null;
}

/**
 * Grades the academy may list.
 * Parent-open grades are `selectedGrades`: the first grade pick and the parent-page checkboxes write the same field.
 * A lesson or battle grade the parent has turned off is not added back.
 * Forest is not a grade on this list.
 */
export function academyGradeChoices(save: SaveData): GradeBand[] {
  return normalizeGrades(save.selectedGrades);
}

/**
 * Formal forest words of this grade, then every chapter-extra word.
 * The extras carry their own grade_est, and `forestLearnUnits` files them there.
 * The boss gate counts all eight no matter which grades are open, so each academy
 * forest chapter carries the full eight instead of only the extras of this grade.
 */
export function academyForestWordIds(grade: GradeBand): string[] {
  return gradeForestStudyWordIds(grade);
}

/** First academy chapter of an allowed grade. Battle chapters are not this object. */
export function academyForestChapter(grade: GradeBand): PlayChapter {
  const wordIds = academyForestWordIds(grade);
  const allowed = new Set(wordIds);
  const forest = forestPlayChapter();
  return {
    id: forest.id,
    name: forest.name,
    bossName: forest.bossName,
    grade,
    index: 0,
    stages: forest.stages.map((stage) => ({
      ...stage,
      new_words: stage.new_words.filter((id) => allowed.has(id)),
    })),
    wordIds,
  };
}

/** Title line. Both the grade and the chapter name are required whenever a pair is shown. */
export function learnHeading(grade: LearnGrade, chapterName: string): string {
  return `学堂 · ${learnGradeLabel(grade)} · ${chapterName}`;
}

export function learnGradeOptions(save: SaveData): GradeBand[] {
  return normalizeGrades(save.selectedGrades);
}

/**
 * Parent-allowed grades only. Forest is not a grade chip.
 * The first chapter is that grade's forest lesson. The grade chapters follow, and battle unlock is not consulted.
 */
export function legalLearnChapters(save: SaveData, grade: LearnGrade): PlayChapter[] {
  if (academyGradeChoices(save).length === 0) return [];
  if (grade === "mixed") return [];
  if (!academyGradeChoices(save).includes(grade)) return [];
  return [academyForestChapter(grade), ...gradeChapters(grade)];
}

/**
 * Academy lesson for this forest stage.
 * Prefer a chapter that still holds this stage's unlearned words.
 * Otherwise prefer a chapter that still holds an unlearned boss-list word.
 * A chapter whose cards are already finished is not used while another still has words.
 */
export function academyLessonForStage(save: SaveData, stage: ForestStage): LearnDraft | null {
  const chapters = academyGradeChoices(save).map((grade) => academyForestChapter(grade));
  if (chapters.length === 0) return null;
  const counted = stageWordIds(save, stage);
  const missingStage = counted.filter((id) => !save.wordCards[id]);
  const bossMissing = new Set(forestStudyWordIds(save.selectedGrades).filter((id) => !save.wordCards[id]));
  const stillOpen = (chapter: PlayChapter) => chapter.wordIds.some((id) => !save.wordCards[id]);
  const holdsAll = (chapter: PlayChapter, ids: readonly string[]) =>
    ids.length > 0 && ids.every((id) => chapter.wordIds.includes(id));
  const open = chapters.filter(stillOpen);
  const queue = missingStage.length > 0 ? missingStage : counted;
  const chosen = open.find((chapter) => holdsAll(chapter, missingStage))
    ?? open.find((chapter) => chapter.wordIds.some((id) => bossMissing.has(id)))
    ?? open.find((chapter) => missingStage.some((id) => chapter.wordIds.includes(id)))
    ?? open[0]
    ?? chapters.find((chapter) => holdsAll(chapter, queue))
    ?? chapters.find((chapter) => queue.some((id) => chapter.wordIds.includes(id)))
    ?? chapters[0];
  if (!chosen || chosen.grade === "mixed") return null;
  return { grade: chosen.grade, chapterId: chosen.id };
}

/** Points the academy at the forest lesson for this stage. Battle fields, cards, and rewards stay. */
export function openAcademyForStage(save: SaveData, stage: ForestStage): SaveData {
  const lesson = academyLessonForStage(save, stage);
  if (!lesson || lesson.grade === "mixed" || !lesson.chapterId) return save;
  return confirmLearnSelection(save, lesson.grade, lesson.chapterId);
}

export function assessLearnSelection(save: SaveData): LearnAssessment {
  const selection = save.learnSelection;
  if (!selection) return { status: "choose" };
  if (selection.grade !== "mixed") {
    const listed = legalLearnChapters(save, selection.grade).find((item) => item.id === selection.chapterId);
    if (listed && listed.grade === selection.grade) return { status: "ready", chapter: listed };
  }
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
  if (assessed.status === "ready" && selection && selection.grade !== "mixed") {
    return { grade: selection.grade, chapterId: selection.chapterId };
  }
  const options = academyGradeChoices(save);
  if (selection?.grade === "mixed") {
    const grade = options.find((item) => legalLearnChapters(save, item).some((chapter) => chapter.id === FOREST_CHAPTER.chapter_id))
      ?? options[0]
      ?? "G3";
    const forest = legalLearnChapters(save, grade).find((chapter) => chapter.id === FOREST_CHAPTER.chapter_id);
    return { grade, chapterId: forest?.id ?? null };
  }
  if (selection && options.includes(selection.grade)) {
    return { grade: selection.grade, chapterId: null };
  }
  const withChapters = options.find((grade) => legalLearnChapters(save, grade).length > 0);
  if (withChapters) return { grade: withChapters, chapterId: null };
  return { grade: options[0] ?? "G3", chapterId: null };
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

/**
 * The exam node records the grade chapter it sits on.
 * Rest and the other returns read that anchor, so leaving an exam does not fall back to the forest.
 * The session, XP, and title grants stay on the save.
 */
export function commitExamReturn(save: SaveData, grade: GradeBand, chapterId: string): SaveData {
  const chapter = gradeChapters(grade).find((item) => item.id === chapterId);
  if (!chapter) return save;
  return commitBattleEntry(save, chapter);
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
