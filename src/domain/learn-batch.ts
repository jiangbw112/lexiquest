import { assessLearnSelection } from "./chapter-route";
import { activeChapter, isChapterCleared, type PlayChapter } from "./chapter-plan";
import { requiredWordIds } from "./stages";
import type { SaveData } from "./types";

/**
 * Settlement copy stays inside the committed Noto subset.
 * 尚 / 往 are not in that subset, and the source fonts are not in the repo.
 * 还可学、还没通关、去本章地图 say the same thing with glyphs the game already ships.
 */
export const LEARN_CONTINUE_BATCH = "继续本次";
export const LEARN_CONTINUE_CHAPTER = "继续学本章";
export const LEARN_GO_MAP = "去本章地图";
export const LEARN_BACK_VILLAGE = "返回村庄";
export const LEARN_CARDS_DONE = "本章词卡已学完，章节还没通关";
export const LEARN_CARDS_DONE_CLEARED = "本章词卡已学完。";

export function learnCompletedLine(count: number): string {
  return `本次完成 ${count} 词`;
}

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
  primaryLabel: string;
  secondaryLabel: string | null;
  message: string | null;
  completedLine: string;
  remainingLine: string;
}

export interface ChapterLearnResume {
  chapterId: string;
  chapterName: string;
  remaining: number;
  batchIds: string[];
  nextWordId: string | null;
}

/** Forest counts the selected grades plus extras. A later chapter counts its own word list. */
export function chapterLearnScope(save: SaveData, chapter: PlayChapter = activeChapter(save)): string[] {
  if (chapter.grade === "mixed") return requiredWordIds(save);
  return [...chapter.wordIds];
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
  let primaryLabel: string;
  let secondaryLabel: string | null = null;
  let message: string | null = null;
  if (batchRemaining.length > 0) {
    kind = "continue-batch";
    nextWordId = batchRemaining[0] ?? null;
    nextBatchIds = batch;
    primaryLabel = LEARN_CONTINUE_BATCH;
  } else if (remaining.length > 0) {
    kind = "continue-chapter";
    nextBatchIds = openLearnBatch(save, chapter);
    nextWordId = nextBatchIds.find((id) => !save.wordCards[id]) ?? remaining[0] ?? null;
    primaryLabel = LEARN_CONTINUE_CHAPTER;
  } else {
    kind = "cards-done";
    primaryLabel = LEARN_GO_MAP;
    secondaryLabel = LEARN_BACK_VILLAGE;
    message = cleared ? LEARN_CARDS_DONE_CLEARED : LEARN_CARDS_DONE;
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
    completedLine: learnCompletedLine(completed),
    remainingLine: learnRemainingLine(remaining.length),
  };
}

/**
 * Settlement only chooses the next screen.
 * It does not grant a card, a win, a clear, or any other progress.
 */
export function confirmLearnSettlement(save: SaveData): SaveData {
  return save;
}
