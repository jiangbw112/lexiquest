import { assessLearnSelection } from "./chapter-route";
import { activeChapter, gradeChapters, isChapterCleared, isChapterUnlocked, type PlayChapter } from "./chapter-plan";
import { FOREST_CHAPTER, forestStudyWordIds, gradeForestStudyWordIds } from "./stages";
import { gradeLabel, gradePracticeEntries, namedWords, otherGradeForestLine } from "./study-copy";
import type { GradeBand, SaveData } from "./types";

/**
 * Settlement copy stays inside the committed Noto subset.
 * 尚 / 往 are not in that subset, and the source fonts are not in the repo.
 */
export const LEARN_GO_MAP = "去本章地图";
export const LEARN_BACK_VILLAGE = "返回村庄";
export const LEARN_RETURN_CHAPTERS = "返回选择章节";
export const LEARN_CARDS_DONE_CLEARED = "本章词卡已学完。";
export const LEARN_PRACTICE_DONE = "这几个词学完了。";
export const LEARN_FIGHT_BOSS = "去挑战 Boss";
export const LEARN_GO_BATTLE = "去对战";

export function learnRemainingLine(count: number): string {
  return `本章还可学 ${count} 词`;
}

export type LearnAdvance =
  | { kind: "next"; batchIds: readonly string[]; resetBatch: boolean }
  | { kind: "done" };

/**
 * After a card is collected, the next word opens immediately.
 * A finished chapter is the only stop, because there is no next word.
 */
export function learnAdvance(view: LearnBatchView): LearnAdvance {
  if (view.kind === "cards-done" || !view.nextWordId) return { kind: "done" };
  return {
    kind: "next",
    batchIds: view.nextBatchIds,
    resetBatch: view.kind === "continue-chapter",
  };
}

export type LearnBatchKind = "continue-batch" | "continue-chapter" | "cards-done";

export interface LearnBatchView {
  chapterId: string;
  chapterName: string;
  completed: number;
  remaining: number;
  kind: LearnBatchKind;
  nextWordId: string | null;
  /** Next study list. Still this chapter's word pool. */
  nextBatchIds: string[];
  scopeIds: string[];
  chapterCleared: boolean;
  /** Map button on a finished chapter. Continue steps have no button. */
  primaryLabel: string | null;
  secondaryLabel: string | null;
  message: string | null;
  remainingLine: string;
  settlement: LearnSettlement | null;
}

export interface LearnSettlement {
  message: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  primary: "map" | "village" | "grade" | "chapters";
  grade?: GradeBand;
  wordIds?: string[];
  mapChapterId?: string;
  focusBoss?: boolean;
}

export interface ChapterLearnResume {
  chapterId: string;
  chapterName: string;
  remaining: number;
  batchIds: string[];
  nextWordId: string | null;
}

/** Forest battle uses forestStudyWordIds. A graded forest lesson uses that grade's slice, or a shorter list when the scene named specific words. */
export function chapterLearnScope(save: SaveData, chapter: PlayChapter = activeChapter(save)): string[] {
  if (chapter.id === FOREST_CHAPTER.chapter_id && chapter.grade === "mixed") return forestStudyWordIds(save.selectedGrades);
  if (
    chapter.id === FOREST_CHAPTER.chapter_id
    && (chapter.grade === "G3" || chapter.grade === "G4" || chapter.grade === "G5" || chapter.grade === "G6")
  ) {
    const full = new Set(gradeForestStudyWordIds(chapter.grade));
    const listed = chapter.wordIds.filter((id) => full.has(id));
    return listed.length > 0 ? listed : [...full];
  }
  return [...chapter.wordIds];
}

function blockingMapChapterId(_save: SaveData, chapter: PlayChapter): string {
  if (chapter.grade === "mixed" || chapter.id === FOREST_CHAPTER.chapter_id) return "";
  const same = gradeChapters(chapter.grade);
  const at = same.findIndex((item) => item.id === chapter.id);
  if (at > 0) return same[at - 1]!.id;
  return same[0]?.id ?? chapter.id;
}

/** Four mutually exclusive lines for a chapter whose own cards are finished. */
export function learnCardsDoneCopy(save: SaveData, chapter: PlayChapter): LearnSettlement {
  const forestId = FOREST_CHAPTER.chapter_id;
  const cleared = isChapterCleared(save, chapter);
  if (chapter.id === forestId && chapter.grade !== "mixed") {
    const missing = namedWords(forestStudyWordIds(save.selectedGrades).filter((id) => !save.wordCards[id]));
    const groups = gradePracticeEntries(save, missing);
    const first = groups[0];
    if (missing.length > 0 && first) {
      return {
        message: otherGradeForestLine(chapter.grade, groups),
        primaryLabel: `去${gradeLabel(first.grade)}学`,
        secondaryLabel: LEARN_BACK_VILLAGE,
        primary: "grade",
        grade: first.grade,
        wordIds: first.wordIds,
        mapChapterId: forestId,
      };
    }
    return {
      message: LEARN_CARDS_DONE_CLEARED,
      primaryLabel: LEARN_RETURN_CHAPTERS,
      secondaryLabel: LEARN_BACK_VILLAGE,
      primary: "chapters",
    };
  }
  if (chapter.id === forestId) {
    return {
      message: LEARN_CARDS_DONE_CLEARED,
      primaryLabel: LEARN_RETURN_CHAPTERS,
      secondaryLabel: LEARN_BACK_VILLAGE,
      primary: "chapters",
    };
  }
  if (cleared) {
    return {
      message: LEARN_CARDS_DONE_CLEARED,
      primaryLabel: LEARN_RETURN_CHAPTERS,
      secondaryLabel: LEARN_BACK_VILLAGE,
      primary: "chapters",
    };
  }
  const unlocked = isChapterUnlocked(save, chapter);
  if (unlocked) {
    return {
      message: "本章词都学会了！去对战挑战 Boss 吧",
      primaryLabel: LEARN_FIGHT_BOSS,
      secondaryLabel: LEARN_BACK_VILLAGE,
      primary: "map",
      mapChapterId: chapter.id,
      focusBoss: true,
    };
  }
  return {
    message: "本章词都学会了。对战里先打完上一章，这一章才能挑战。",
    primaryLabel: LEARN_GO_BATTLE,
    secondaryLabel: LEARN_BACK_VILLAGE,
    primary: "map",
    mapChapterId: blockingMapChapterId(save, chapter),
    focusBoss: false,
  };
}

/**
 * One batch is one stage's still-in-scope words, in stage order.
 * The size comes from that stage. It is not a fixed count.
 * Boss-stage words stay in the pool; learning them does not clear the chapter.
 */
export function learnStageBatches(save: SaveData, chapter: PlayChapter = activeChapter(save)): string[][] {
  const scope = chapterLearnScope(save, chapter);
  const allowed = new Set(scope);
  const seen = new Set<string>();
  const batches: string[][] = [];
  for (const stage of chapter.stages) {
    const ids: string[] = [];
    for (const id of stage.new_words) {
      if (!allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length > 0) batches.push(ids);
  }
  const rest = scope.filter((id) => !seen.has(id));
  if (rest.length > 0) batches.push(rest);
  return batches;
}

/** The first stage batch that still has a word without a card. Empty when the chapter has none. */
export function openLearnBatch(save: SaveData, chapter: PlayChapter = activeChapter(save)): string[] {
  return learnStageBatches(save, chapter).find((batch) => batch.some((id) => !save.wordCards[id])) ?? [];
}

export function chapterWordsRemaining(save: SaveData, chapter: PlayChapter = activeChapter(save)): number {
  return chapterLearnScope(save, chapter).filter((id) => !save.wordCards[id]).length;
}

/**
 * What the academy shows again after a village round-trip.
 * Only a still-legal lesson L is loaded. Battle progress and map preview do not fill it in.
 * An invalid lesson keeps its id on the save and returns no word ids.
 */
export function resumeChapterLearn(save: SaveData): ChapterLearnResume {
  const assessed = assessLearnSelection(save);
  if (assessed.status !== "ready") {
    return {
      chapterId: save.learnSelection?.chapterId ?? "",
      chapterName: "",
      remaining: 0,
      batchIds: [],
      nextWordId: null,
    };
  }
  const chapter = assessed.chapter;
  const batchIds = openLearnBatch(save, chapter);
  return {
    chapterId: chapter.id,
    chapterName: chapter.name,
    remaining: chapterWordsRemaining(save, chapter),
    batchIds,
    nextWordId: batchIds.find((id) => !save.wordCards[id]) ?? null,
  };
}

/**
 * Describes the screen after a card, or when the chapter has no new words.
 * `batchIds` is the batch the child is in. `learnedThisBatch` is only this visit.
 */
export function learnBatchView(
  save: SaveData,
  batchIds: readonly string[],
  learnedThisBatch: readonly string[],
  chapter: PlayChapter = activeChapter(save),
): LearnBatchView {
  const scopeIds = chapterLearnScope(save, chapter);
  const scope = new Set(scopeIds);
  const batch = batchIds.filter((id) => scope.has(id));
  const batchSet = new Set(batch);
  const learned = new Set<string>();
  for (const id of learnedThisBatch) {
    if (batchSet.has(id) && save.wordCards[id]) learned.add(id);
  }
  const batchRemaining = batch.filter((id) => !save.wordCards[id]);
  const remaining = scopeIds.filter((id) => !save.wordCards[id]);
  const cleared = isChapterCleared(save, chapter);
  const completed = learned.size;
  let kind: LearnBatchKind;
  let nextWordId: string | null = null;
  let nextBatchIds: string[] = [];
  let primaryLabel: string | null = null;
  let secondaryLabel: string | null = null;
  let message: string | null = null;
  let settlement: LearnSettlement | null = null;
  if (batchRemaining.length > 0) {
    kind = "continue-batch";
    nextWordId = batchRemaining[0] ?? null;
    nextBatchIds = batch;
  } else if (remaining.length > 0) {
    kind = "continue-chapter";
    nextBatchIds = openLearnBatch(save, chapter);
    nextWordId = nextBatchIds.find((id) => !save.wordCards[id]) ?? remaining[0] ?? null;
  } else {
    kind = "cards-done";
    settlement = learnCardsDoneCopy(save, chapter);
    primaryLabel = settlement.primaryLabel;
    secondaryLabel = settlement.secondaryLabel;
    message = settlement.message;
  }
  return {
    chapterId: chapter.id,
    chapterName: chapter.name,
    completed,
    remaining: remaining.length,
    kind,
    nextWordId,
    nextBatchIds,
    scopeIds,
    chapterCleared: cleared,
    primaryLabel,
    secondaryLabel,
    message,
    remainingLine: learnRemainingLine(remaining.length),
    settlement,
  };
}

export type LearnChapterFinish =
  | { kind: "chapter-select"; hint: string }
  | { kind: "stay" };

/**
 * After the card that finishes this chapter is stored.
 * Opening a chapter that was already finished stays on its dialog.
 * A failed save stays put and does not drop the in-memory card.
 */
export function learnChapterFinishRoute(input: {
  saved: boolean;
  cardAdded: boolean;
  remainingBefore: number;
  remainingAfter: number;
}): LearnChapterFinish {
  if (input.cardAdded && input.saved && input.remainingBefore > 0 && input.remainingAfter === 0) {
    return { kind: "chapter-select", hint: LEARN_CARDS_DONE_CLEARED };
  }
  return { kind: "stay" };
}

/**
 * Settlement only chooses the next screen.
 * It does not grant a card, a win, a clear, or any other progress.
 */
export function confirmLearnSettlement(save: SaveData): SaveData {
  return save;
}
