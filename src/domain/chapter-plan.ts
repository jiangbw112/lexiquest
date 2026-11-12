import { isChapterExtra, wordById } from "./catalog";
import { chapterBossDisplayName, chapterBossId } from "./chapter-bosses";
import { chapterMinion } from "./chapter-scenes";
import { PROVISIONAL } from "./provisional";
import { badgeTone } from "./review";
import {
  FOREST_CHAPTER,
  FOREST_TITLE,
  chapterWordIds,
  requiredWordIds,
  stageCombat,
  stageStatuses,
  type ForestStage,
  type StageCombat,
} from "./stages";
import type { ClassId, GradeBand, SaveData } from "./types";

/**
 * Grade chapters come from chapters/chapters_v0.2.json. The file sits beside the
 * forest chapter because data/ is reserved for word lists. This module does not split the
 * word list. The forest stays the locked forest chapter. Stage words are
 * stages[].word_refs. Boss unlock uses that chapter's word_count.
 * Beijing opera and Mount Taishan stay spellable even though the file lists them.
 */
export const MIN_STAGE_WORDS = 3;

/** Removed from the file's no-spelling list at load. The JSON bytes stay as shipped. */
export const SPELLING_EXCEPTIONS = ["beijing opera", "mount taishan"] as const;

export interface PlayChapter {
  id: string;
  name: string;
  bossName: string;
  grade: GradeBand | "mixed";
  /** 0 for the forest. Grade chapters count from 1 inside that grade. */
  index: number;
  stages: ForestStage[];
  wordIds: string[];
}

export interface ChapterEncounter {
  chapterId: string;
  stageId: number;
  boss: boolean;
}

const GRADE_ORDER: GradeBand[] = ["G3", "G4", "G5", "G6"];

interface StageFile {
  id: number;
  name_zh: string;
  type?: string;
  word_refs: string[];
}

interface ChapterFile {
  chapter_id: string;
  grade: string | null;
  name_zh: string;
  boss_name_zh: string;
  word_count: number;
  chapter_index_in_grade?: number;
  word_refs_formal?: string[];
  no_spelling_word_refs?: string[];
  stages: StageFile[];
  in_chapter_stage_swaps?: unknown[];
}

interface GlossPair {
  a: string;
  b: string;
  rules?: string[];
}

interface GlossFile {
  exact: GlossPair[];
  overlap: GlossPair[];
}

interface LoadedPlan {
  chapters: PlayChapter[];
  skip: string[];
  blocked: Set<string>;
  status: string;
}

function isGrade(value: string): value is GradeBand {
  return GRADE_ORDER.includes(value as GradeBand);
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function loadGloss(file: GlossFile): Set<string> {
  if (!file || !Array.isArray(file.exact) || !Array.isArray(file.overlap)) throw new Error("gloss pairs need exact and overlap");
  const shared = file.overlap.filter((pair) => pair.rules?.includes("R1_shared_sense"));
  const containsOnly = file.overlap.filter((pair) => pair.rules?.includes("R2_contains") && !pair.rules?.includes("R1_shared_sense"));
  if (file.exact.length !== 23 || shared.length !== 26 || containsOnly.length !== 66 || file.overlap.length !== 92) {
    throw new Error(`gloss pair counts ${file.exact.length}/${shared.length}/${containsOnly.length}/${file.overlap.length}`);
  }
  const blocked = new Set<string>();
  for (const pair of [...file.exact, ...shared]) {
    if (!pair.a || !pair.b) throw new Error("gloss pair is missing a word");
    blocked.add(pairKey(pair.a, pair.b));
  }
  return blocked;
}

function loadPlan(file: ChapterFile[], gloss: GlossFile): LoadedPlan {
  if (!Array.isArray(file) || file.length !== 32) throw new Error("chapter file needs 32 chapters");
  const forestEntry = file[0];
  if (forestEntry?.chapter_id !== FOREST_CHAPTER.chapter_id || forestEntry.grade !== null) {
    throw new Error("chapter file must keep the forest as the first chapter");
  }
  const forest = new Set(chapterWordIds());
  const seen = new Set<string>();
  const chapters: PlayChapter[] = [];
  const perGrade = new Map<GradeBand, number>();
  const rawSkip: string[] = [];
  let swaps = 0;
  for (const source of file.slice(1)) {
    const grade = source.grade ?? "";
    if (!isGrade(grade)) throw new Error(`chapter grade ${String(source.grade)}`);
    if (!/^[a-z0-9_-]+$/.test(source.chapter_id)) throw new Error(`chapter id ${source.chapter_id}`);
    if (!source.name_zh?.trim() || !source.boss_name_zh?.trim()) throw new Error(`chapter name ${source.chapter_id}`);
    if (!Array.isArray(source.stages) || source.stages.length !== 5) throw new Error(`chapter ${source.chapter_id} needs 5 stages`);
    const index = (perGrade.get(grade) ?? 0) + 1;
    perGrade.set(grade, index);
    if (source.chapter_index_in_grade !== index) throw new Error(`chapter ${source.chapter_id} index ${source.chapter_index_in_grade}`);
    const stages: ForestStage[] = source.stages.map((stage, stageIndex) => {
      const boss = stageIndex === 4;
      if (stage.id !== stageIndex + 1) throw new Error(`chapter ${source.chapter_id} stage id ${stage.id}`);
      if ((stage.type === "boss") !== boss) throw new Error(`chapter ${source.chapter_id} boss stage`);
      if (!stage.name_zh?.trim()) throw new Error(`chapter ${source.chapter_id} stage ${stage.id} name`);
      if (!Array.isArray(stage.word_refs) || stage.word_refs.length < MIN_STAGE_WORDS) {
        throw new Error(`chapter ${source.chapter_id} stage ${stage.id} needs at least ${MIN_STAGE_WORDS} words`);
      }
      const wordIds: string[] = [];
      for (const id of stage.word_refs) {
        if (seen.has(id) || forest.has(id)) throw new Error(`chapter word ${id} is repeated or already in the forest`);
        const word = wordById(id);
        if (!word || word.grade !== grade) throw new Error(`chapter word ${id} is not a ${grade} catalog word`);
        seen.add(id);
        wordIds.push(id);
      }
      return {
        id: stage.id,
        name_zh: stage.name_zh,
        goal_zh: "",
        type: boss ? "boss" : "exploration",
        new_words: wordIds,
        learn_before_fight: boss,
        unlock: boss
          ? { stages_cleared: [1, 2, 3, 4], all_words_learned: true }
          : stageIndex === 0
            ? null
            : { after_stage: stageIndex },
      };
    });
    const wordIds = stages.flatMap((stage) => stage.new_words);
    if (source.word_count !== wordIds.length) throw new Error(`chapter ${source.chapter_id} word_count ${source.word_count}`);
    if (Array.isArray(source.word_refs_formal)) {
      const formal = [...source.word_refs_formal].sort();
      const fromStages = [...wordIds].sort();
      if (formal.length !== fromStages.length || formal.some((id, i) => id !== fromStages[i])) {
        throw new Error(`chapter ${source.chapter_id} stage words differ from word_refs_formal`);
      }
    }
    const listed = source.no_spelling_word_refs ?? [];
    for (const id of listed) {
      if (!wordIds.includes(id)) throw new Error(`chapter ${source.chapter_id} spelling skip ${id} is not in the chapter`);
      rawSkip.push(id);
    }
    swaps += source.in_chapter_stage_swaps?.length ?? 0;
    chapters.push({
      id: source.chapter_id,
      name: source.name_zh,
      bossName: chapterBossDisplayName(source.chapter_id, source.boss_name_zh),
      grade,
      index,
      stages,
      wordIds,
    });
  }
  if (swaps !== 8) throw new Error(`chapter file has ${swaps} stage swaps`);
  for (const grade of GRADE_ORDER) {
    const count = perGrade.get(grade) ?? 0;
    const expected = grade === "G5" ? 9 : grade === "G6" ? 6 : 8;
    if (count !== expected) throw new Error(`${grade} has ${count} chapters`);
  }
  if (seen.size !== 843) throw new Error(`chapter words ${seen.size}`);
  for (const id of SPELLING_EXCEPTIONS) {
    if (!rawSkip.includes(id)) throw new Error(`spelling exception ${id} is missing from the chapter file`);
  }
  const skip = [...new Set(rawSkip.filter((id) => !SPELLING_EXCEPTIONS.includes(id as (typeof SPELLING_EXCEPTIONS)[number])))];
  for (const id of skip) {
    if (!wordById(id)) throw new Error(`spelling skip ${id} is not in the catalog`);
  }
  return { chapters, skip, blocked: loadGloss(gloss), status: "v0.2" };
}

let LOADED: LoadedPlan | null = null;

export function installChapterPlan(chapters: unknown, gloss: unknown): void {
  LOADED = loadPlan(chapters as ChapterFile[], gloss as GlossFile);
}

export async function ensureChapterPlan(): Promise<void> {
  if (LOADED) return;
  const [chapters, gloss] = await Promise.all([
    fetch(new URL("./chapters/chapters_v0.2.json", import.meta.url)).then(readChapterJson),
    fetch(new URL("./chapters/gloss_overlap_pairs_v0.2.json", import.meta.url)).then(readChapterJson),
  ]);
  installChapterPlan(chapters, gloss);
}

async function readChapterJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`chapter data failed to load (${response.status})`);
  return response.json();
}

function plan(): LoadedPlan {
  if (!LOADED) throw new Error("chapter plan is not loaded");
  return LOADED;
}

export function chapterPlanStatus(): string {
  return plan().status;
}

/** Multi-word names that are never spelling questions. The two exceptions are already removed. */
export function spellingSkipIds(): readonly string[] {
  return plan().skip;
}

/** Exact gloss pairs and pairs that share a sense. Contains-only pairs stay available. */
export function glossPairBlocked(a: string, b: string): boolean {
  return plan().blocked.has(pairKey(a, b));
}

export function gradeChapters(grade: GradeBand): PlayChapter[] {
  return plan().chapters.filter((chapter) => chapter.grade === grade);
}

export function forestPlayChapter(): PlayChapter {
  return {
    id: FOREST_CHAPTER.chapter_id,
    name: FOREST_TITLE,
    bossName: PROVISIONAL.chapterEnding.bossName,
    grade: "mixed",
    index: 0,
    stages: FOREST_CHAPTER.stages,
    wordIds: chapterWordIds(),
  };
}

/** Forest first, then selected grades from G3 to G6, each grade in file order. */
export function visibleChapters(grades: readonly string[] | undefined): PlayChapter[] {
  const selected = new Set(grades ?? []);
  const chapters = [forestPlayChapter()];
  for (const grade of GRADE_ORDER) {
    if (selected.has(grade)) chapters.push(...gradeChapters(grade));
  }
  return chapters;
}

export function isChapterCleared(save: SaveData, chapter: PlayChapter): boolean {
  if (chapter.id === FOREST_CHAPTER.chapter_id) return save.chapterCleared;
  return save.chapterProgress?.[chapter.id]?.cleared === true;
}

/**
 * The forest is always open. A cleared chapter stays open.
 * After the forest boss, every selected grade opens its first chapter.
 * Inside one grade, the next chapter opens when the previous one is cleared.
 */
export function isChapterUnlocked(save: SaveData, chapter: PlayChapter, list = visibleChapters(save.selectedGrades)): boolean {
  const index = list.findIndex((item) => item.id === chapter.id);
  if (index < 0) return false;
  if (index === 0 || isChapterCleared(save, chapter)) return true;
  if (!save.chapterCleared) return false;
  const sameGrade = list.filter((item) => item.grade === chapter.grade);
  const at = sameGrade.findIndex((item) => item.id === chapter.id);
  if (at <= 0) return true;
  const previous = sameGrade[at - 1];
  return previous ? isChapterCleared(save, previous) : false;
}

export function activeChapter(save: SaveData): PlayChapter {
  const list = visibleChapters(save.selectedGrades);
  const current = list.find((chapter) => chapter.id === save.currentChapterId);
  if (current) return current;
  if (save.chapterCleared) {
    const next = list.find((chapter, index) => index > 0 && isChapterUnlocked(save, chapter, list));
    if (next) return next;
  }
  return list[0]!;
}

export function findPlayChapter(save: SaveData, chapterId?: string): PlayChapter {
  if (chapterId) {
    const found = visibleChapters(save.selectedGrades).find((chapter) => chapter.id === chapterId);
    if (found) return found;
  }
  return activeChapter(save);
}

export function playStageWins(save: SaveData, chapter: PlayChapter, stageId: number): number {
  if (chapter.id === FOREST_CHAPTER.chapter_id) return save.stageWins[String(stageId)] ?? 0;
  return save.chapterProgress?.[chapter.id]?.stageWins[String(stageId)] ?? 0;
}

function playStageCleared(save: SaveData, chapter: PlayChapter, stage: ForestStage): boolean {
  if (stage.type === "boss") return isChapterCleared(save, chapter);
  const wins = playStageWins(save, chapter, stage.id) >= FOREST_CHAPTER.stage_clear.min_battle_wins;
  if (stage.new_words.length === 0) return wins;
  return wins && stage.new_words.every((id) => save.wordCards[id]);
}

/** Same gate as the forest: one open stage at a time, boss after stages 1–4 and every word. */
export function playStatuses(save: SaveData, chapter: PlayChapter): Array<"locked" | "open" | "cleared" | "skipped"> {
  if (chapter.id === FOREST_CHAPTER.chapter_id) return stageStatuses(save);
  if (!isChapterUnlocked(save, chapter)) return chapter.stages.map(() => "locked");
  const statuses: Array<"locked" | "open" | "cleared" | "skipped"> = [];
  let gateOpen = true;
  for (const stage of chapter.stages) {
    if (stage.type === "boss") {
      if (isChapterCleared(save, chapter)) statuses.push("cleared");
      else if (gateOpen && chapterBossReady(save, chapter.id)) statuses.push("open");
      else statuses.push("locked");
      continue;
    }
    if (!gateOpen) {
      statuses.push("locked");
      continue;
    }
    if (playStageCleared(save, chapter, stage)) statuses.push("cleared");
    else {
      statuses.push("open");
      gateOpen = false;
    }
  }
  return statuses;
}

export function chapterBossReady(save: SaveData, chapterId: string): boolean {
  if (save.selectedGrades.length === 0) return false;
  const chapter = visibleChapters(save.selectedGrades).find((item) => item.id === chapterId);
  if (!chapter || chapter.id === FOREST_CHAPTER.chapter_id) return false;
  const exploration = chapter.stages.filter((stage) => stage.type !== "boss");
  if (!exploration.every((stage) => playStageCleared(save, chapter, stage))) return false;
  return chapter.wordIds.length > 0 && chapter.wordIds.every((id) => save.wordCards[id]);
}

/** Forest stars stay keyed by "1"…"5". Later chapters use their own key. */
export function starKey(chapterId: string, stageId: number): string {
  return chapterId === FOREST_CHAPTER.chapter_id ? String(stageId) : `${chapterId}:${stageId}`;
}

export function parseChapterEncounter(encounterId: string | undefined): ChapterEncounter | null {
  if (!encounterId) return null;
  const boss = /^chapter:([a-z0-9_-]+):boss$/.exec(encounterId);
  if (boss?.[1]) return { chapterId: boss[1], stageId: 5, boss: true };
  const stage = /^chapter:([a-z0-9_-]+):stage:([1-5])$/.exec(encounterId);
  if (!stage?.[1] || !stage[2]) return null;
  return { chapterId: stage[1], stageId: Number(stage[2]), boss: false };
}

export function stageCombatFor(chapter: PlayChapter, stage: ForestStage, classId: ClassId = "warrior"): StageCombat {
  const minion = chapter.id === FOREST_CHAPTER.chapter_id ? null : chapterMinion(chapter.id);
  const combat = stageCombat(stage, classId, minion?.id ?? "inkling");
  if (chapter.id === FOREST_CHAPTER.chapter_id) return combat;
  const encounterId = stage.type === "boss"
    ? `chapter:${chapter.id}:boss`
    : `chapter:${chapter.id}:stage:${stage.id}`;
  const enemyName = stage.type === "boss" ? chapter.bossName : minion?.name ?? combat.enemyName;
  const sprite = stage.type === "boss" ? chapterBossId(chapter.id) : combat.sprite;
  return { ...combat, encounterId, enemyName, sprite };
}

export interface MapStageCounts {
  wins: number;
  bestStars: 1 | 2 | 3 | null;
  /** Shown only while this stage is locked. */
  lockedLine?: string;
  bossLabel?: string;
}

/** Forest returns undefined so the map keeps its existing panel. */
export function mapCounts(save: SaveData, chapter: PlayChapter, stage: ForestStage): MapStageCounts | undefined {
  if (chapter.id === FOREST_CHAPTER.chapter_id) return undefined;
  const record = save.bestStars?.[starKey(chapter.id, stage.id)];
  const lockedChapter = !isChapterUnlocked(save, chapter);
  const lockedLine = lockedChapter
    ? "通过上一章后开启"
    : stage.type === "boss"
      ? `通过前 4 关并学完 ${chapter.wordIds.length} 个词`
      : undefined;
  return {
    wins: playStageWins(save, chapter, stage.id),
    bestStars: record === 1 || record === 2 || record === 3 ? record : null,
    lockedLine,
    bossLabel: `挑战${chapter.bossName}`,
  };
}

/**
 * A fight draws from the chapter the child is standing on.
 * Unlearned ids may be listed here; the question pool still requires a card.
 */
export function battleWordIds(save: SaveData): string[] {
  const chapter = activeChapter(save);
  if (chapter.id === FOREST_CHAPTER.chapter_id) return requiredWordIds(save);
  return [...chapter.wordIds];
}

/**
 * Words whose chapter is already open. The forest contributes only the words
 * that count for the selected grades, plus every forest extra. Distractors
 * then keep the answer's grade and do not borrow another grade.
 */
export function unlockedWordIds(save: SaveData): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const chapter of visibleChapters(save.selectedGrades)) {
    if (!isChapterUnlocked(save, chapter)) continue;
    const words = chapter.id === FOREST_CHAPTER.chapter_id ? requiredWordIds(save) : chapter.wordIds;
    for (const id of words) push(id);
  }
  return ids;
}

/**
 * Review keeps every collected card whose grade is still selected, including a
 * card whose later chapter is not open yet. Forest extras stay. A paused grade
 * stays out, matching the old grade pause.
 */
export function reviewWordIds(save: SaveData): string[] {
  const grades = new Set(save.selectedGrades);
  const ids = new Set(unlockedWordIds(save));
  for (const id of Object.keys(save.wordCards)) {
    if (isChapterExtra(id)) {
      ids.add(id);
      continue;
    }
    const word = wordById(id);
    if (word && grades.has(word.grade)) ids.add(id);
  }
  return [...ids];
}

/** Parent page: forest words that count, plus every later chapter of the selected grades. */
export function scopeWordIds(save: SaveData): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const id of requiredWordIds(save)) push(id);
  for (const chapter of visibleChapters(save.selectedGrades)) {
    if (chapter.id === FOREST_CHAPTER.chapter_id) continue;
    for (const id of chapter.wordIds) push(id);
  }
  return ids;
}

export function scopeBadgeCount(save: SaveData, now: Date): { lit: number; total: number; clearedChapters: number; chapters: number } {
  const ids = scopeWordIds(save);
  const chapters = visibleChapters(save.selectedGrades);
  return {
    lit: ids.filter((id) => badgeTone(save.wordCards[id], save.memory[id], now) === "bright").length,
    total: ids.length,
    clearedChapters: chapters.filter((chapter) => isChapterCleared(save, chapter)).length,
    chapters: chapters.length,
  };
}

/** Forest order, then later chapters, then any card the chapters do not list. */
export function collectedCardIds(save: SaveData): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  const push = (id: string) => {
    if (seen.has(id) || !save.wordCards[id] || !wordById(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const chapter of visibleChapters(save.selectedGrades)) {
    for (const id of chapter.wordIds) push(id);
  }
  for (const id of Object.keys(save.wordCards)) push(id);
  return ids;
}
