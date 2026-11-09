import { chapterExtraWords, isChapterExtra, wordById } from "./catalog";
import chapterFile from "./chapters/chapter_forest_v1.1.json";
import rulesFile from "./chapters/forest-stage-rules.json";
import { PROVISIONAL } from "./provisional";
import { badgeTone, isDue } from "./review";
import type { SaveData } from "./types";

export type StageUnlock =
  | { after_stage: number }
  | { stages_cleared: readonly number[]; all_words_learned: true };

export interface ForestStage {
  id: number;
  name_zh: string;
  goal_zh: string;
  type: "exploration" | "boss";
  new_words: string[];
  learn_before_fight: boolean;
  unlock: StageUnlock | null;
}

export interface ForestChapter {
  chapter_id: string;
  clear_rule: "defeat_boss";
  mastery_blocks_clear: false;
  stages: ForestStage[];
  stage_clear: { all_stage_words_learned: true; min_battle_wins: number };
  boss_unlock: { stages_1_to_4_cleared: true; all_28_learned: true };
  boss_v1: {
    phases: number;
    successful_skill_casts_to_clear: readonly [number, number];
    spelling_ratio_cap: number;
    tunable_after_playtest: boolean;
  };
  question_pool: {
    prefer_due: true;
    fallback: "learned_in_chapter";
    never: "unlearned_or_outside_chapter";
  };
}

export type StageStatus = "locked" | "open" | "cleared" | "skipped";

const EXPECTED_NAMES = ["林缘小径", "河岸花径", "云桥山道", "迷雾村庄", "林心守护"];
const EXPECTED_GOALS = [
  "进入森林，学会认路与常见动植物",
  "沿河前进，描述景物与天气",
  "过桥登山，动作与地形容词",
  "探村护友，抽象与进阶词",
  "夺回宝藏，通关本章",
];
const EXPECTED_COUNTS = [6, 6, 6, 6, 4];

function readChapter(value: unknown): ForestChapter {
  if (typeof value !== "object" || value === null) throw new Error("forest chapter must be an object");
  const file = value as ForestChapter;
  if (file.chapter_id !== "forest_adventure") throw new Error("forest chapter_id");
  if (file.clear_rule !== "defeat_boss") throw new Error("forest clear_rule");
  if (file.mastery_blocks_clear !== false) throw new Error("mastery must not block the chapter clear");
  if (!Array.isArray(file.stages) || file.stages.length !== 5) throw new Error("forest chapter needs 5 stages");
  file.stages.forEach((stage, index) => {
    if (stage.id !== index + 1) throw new Error(`stage id ${stage.id}`);
    if (stage.name_zh !== EXPECTED_NAMES[index]) throw new Error(`stage name ${stage.name_zh}`);
    if (stage.goal_zh !== EXPECTED_GOALS[index]) throw new Error(`stage goal ${stage.goal_zh}`);
    if (!Array.isArray(stage.new_words) || stage.new_words.length !== EXPECTED_COUNTS[index]) {
      throw new Error(`stage ${stage.id} word count`);
    }
    const boss = index === 4;
    if (boss && stage.type !== "boss") throw new Error("stage 5 must be the boss");
    if (!boss && stage.type !== undefined && stage.type !== "exploration") throw new Error(`stage ${stage.id} type`);
    if (boss && stage.learn_before_fight !== true) throw new Error("boss words are learned before the fight");
    if (!boss && stage.unlock !== null) {
      if (!("after_stage" in stage.unlock) || stage.unlock.after_stage !== stage.id - 1) {
        throw new Error(`stage ${stage.id} unlock`);
      }
    }
    if (boss) {
      const unlock = stage.unlock;
      if (!unlock || !("stages_cleared" in unlock) || unlock.all_words_learned !== true) throw new Error("boss unlock");
      if (unlock.stages_cleared.join(",") !== "1,2,3,4") throw new Error("boss unlock stages");
    }
    if (!boss && index === 0 && stage.unlock !== null) throw new Error("stage 1 has no unlock");
  });
  if (file.stage_clear?.all_stage_words_learned !== true || file.stage_clear.min_battle_wins !== 1) {
    throw new Error("stage clear rule");
  }
  if (file.boss_unlock?.stages_1_to_4_cleared !== true || file.boss_unlock.all_28_learned !== true) {
    throw new Error("boss unlock rule");
  }
  if (file.boss_v1?.phases !== 2 || file.boss_v1.spelling_ratio_cap !== 0.3) throw new Error("boss v1");
  const band = file.boss_v1.successful_skill_casts_to_clear;
  if (!Array.isArray(band) || band[0] !== 8 || band[1] !== 12) throw new Error("boss cast band");
  if (file.question_pool?.prefer_due !== true || file.question_pool.fallback !== "learned_in_chapter") {
    throw new Error("question pool");
  }
  if (file.question_pool.never !== "unlearned_or_outside_chapter") throw new Error("question pool never");
  const ids = file.stages.flatMap((stage) => stage.new_words);
  if (new Set(ids).size !== ids.length) throw new Error("a forest word is in two stages");
  for (const id of ids) {
    if (!wordById(id)) throw new Error(`stage word ${id} is not in the catalog`);
  }
  return {
    ...file,
    stages: file.stages.map((stage, index) => ({
      ...stage,
      type: index === 4 ? "boss" : "exploration",
      learn_before_fight: stage.learn_before_fight === true,
    })),
  };
}

interface ChapterStageFile {
  id: number;
  name_zh: string;
  goal_zh?: string;
  type?: "boss" | "exploration" | "normal";
  learn_before_fight?: boolean;
  unlock?: { after_stage?: number; stages_cleared?: number[]; all_words_learned?: boolean } | null;
  word_refs: string[];
}

interface ChapterFile {
  chapter_id: string;
  clear_rule: "defeat_boss";
  mastery_blocks_clear: false;
  stages: ChapterStageFile[];
}

function stageUnlock(stage: ChapterStageFile, index: number): StageUnlock | null {
  const unlock = stage.unlock;
  if (unlock == null) {
    if (index === 0) return null;
    throw new Error(`stage ${stage.id} unlock`);
  }
  if (index === 4) {
    const cleared = unlock.stages_cleared;
    if (!Array.isArray(cleared) || cleared.join(",") !== "1,2,3,4" || unlock.all_words_learned !== true) {
      throw new Error("boss unlock");
    }
    return { stages_cleared: [1, 2, 3, 4], all_words_learned: true };
  }
  if (unlock.after_stage !== index) throw new Error(`stage ${stage.id} unlock`);
  return { after_stage: unlock.after_stage };
}

function stagesFromChapter(file: ChapterFile): ForestStage[] {
  return file.stages.map((stage, index) => {
    if (typeof stage.goal_zh !== "string" || stage.goal_zh.trim() === "") throw new Error(`stage ${stage.id} goal_zh`);
    const boss = index === 4;
    if (boss && stage.type !== "boss") throw new Error("stage 5 must be the boss");
    if (!boss && stage.type !== undefined && stage.type !== "exploration" && stage.type !== "normal") {
      throw new Error(`stage ${stage.id} type`);
    }
    return {
      id: stage.id,
      name_zh: stage.name_zh,
      goal_zh: stage.goal_zh,
      type: boss ? "boss" : "exploration",
      new_words: stage.word_refs,
      learn_before_fight: stage.learn_before_fight === true,
      unlock: stageUnlock(stage, index),
    };
  });
}

const chapter = chapterFile as ChapterFile;
const rules = rulesFile as unknown as Omit<ForestChapter, "stages">;

export const FOREST_CHAPTER: ForestChapter = readChapter({
  ...rules,
  chapter_id: chapter.chapter_id,
  clear_rule: chapter.clear_rule,
  mastery_blocks_clear: chapter.mastery_blocks_clear,
  stages: stagesFromChapter(chapter),
});
export const FOREST_WORD_COUNT = FOREST_CHAPTER.stages.reduce((sum, stage) => sum + stage.new_words.length, 0);
export const BOSS_STAGE_ID = 5;

export function chapterWordIds(): string[] {
  return FOREST_CHAPTER.stages.flatMap((stage) => stage.new_words);
}

export function stageById(id: number): ForestStage | undefined {
  return FOREST_CHAPTER.stages.find((stage) => stage.id === id);
}

export function stageEncounterId(stageId: number): string {
  return `forest-stage-${stageId}`;
}

export function explorationStageByEncounter(encounterId: string | undefined): ForestStage | null {
  const match = /^forest-stage-(\d+)$/.exec(encounterId ?? "");
  if (!match) return null;
  const stage = stageById(Number(match[1]));
  if (!stage || stage.type === "boss") return null;
  return stage;
}

/**
 * A chapter word counts when its grade is selected. chapter_extra_words always
 * count, even when that entry's grade_est is not selected. Ids are unique.
 */
function countsTowardBoss(id: string, grades: ReadonlySet<string>): boolean {
  if (isChapterExtra(id)) return true;
  const word = wordById(id);
  return Boolean(word && grades.has(word.grade));
}

/** Chapter words in the selected grades, plus every chapter_extra_words id, deduped. */
export function requiredWordIds(save: SaveData): string[] {
  const grades = new Set(save.selectedGrades);
  const seen = new Set<string>();
  const ids: string[] = [];
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const id of chapterWordIds()) {
    if (countsTowardBoss(id, grades)) push(id);
  }
  for (const extra of chapterExtraWords()) push(extra.id);
  return ids;
}

export function stageWordIds(save: SaveData, stage: ForestStage): string[] {
  const grades = new Set(save.selectedGrades);
  return stage.new_words.filter((id) => countsTowardBoss(id, grades));
}

/** Map lock line. The word count is requiredWordIds, not a fixed chapter size. */
export function bossUnlockLine(save: SaveData): string {
  const boss = FOREST_CHAPTER.stages.find((stage) => stage.type === "boss");
  const prior = boss?.unlock && "stages_cleared" in boss.unlock ? boss.unlock.stages_cleared.length : 0;
  return `通过前 ${prior} 关并学完 ${requiredWordIds(save).length} 个词`;
}

export function battleWordIds(save: SaveData): string[] {
  return requiredWordIds(save);
}

export function chapterLearnedCount(save: SaveData): number {
  return chapterWordIds().filter((id) => save.wordCards[id]).length;
}

export function litMasteryCount(save: SaveData, now: Date): number {
  return chapterWordIds().filter((id) => badgeTone(save.wordCards[id], save.memory[id], now) === "bright").length;
}

export function chapterDueCount(save: SaveData, now: Date): number {
  const allowed = new Set(requiredWordIds(save));
  return Object.values(save.memory).filter((memory) => allowed.has(memory.wordId) && isDue(memory, now)).length;
}

export function stageWins(save: SaveData, stageId: number): number {
  return save.stageWins[String(stageId)] ?? 0;
}

export function stageCleared(save: SaveData, stage: ForestStage): boolean {
  if (stage.type === "boss") return save.chapterCleared;
  const ids = stageWordIds(save, stage);
  if (ids.length === 0) return false;
  const learned = !FOREST_CHAPTER.stage_clear.all_stage_words_learned || ids.every((id) => save.wordCards[id]);
  return learned && stageWins(save, stage.id) >= FOREST_CHAPTER.stage_clear.min_battle_wins;
}

export function explorationCleared(save: SaveData): boolean {
  return FOREST_CHAPTER.stages
    .filter((stage) => stage.type !== "boss")
    .every((stage) => stageWordIds(save, stage).length === 0 || stageCleared(save, stage));
}

/**
 * Stages 1–4 cleared, and every required word collected.
 * Required words are the selected grades' chapter words plus chapter_extra_words.
 * No selected grade means the grade gate should already have stopped the player.
 * If a save still gets here, the boss stays locked.
 */
export function bossReady(save: SaveData): boolean {
  if (save.selectedGrades.length === 0) return false;
  if (FOREST_CHAPTER.boss_unlock.stages_1_to_4_cleared && !explorationCleared(save)) return false;
  if (!FOREST_CHAPTER.boss_unlock.all_28_learned) return explorationCleared(save);
  const required = requiredWordIds(save);
  return required.length > 0 && required.every((id) => save.wordCards[id]);
}

export function stageStatuses(save: SaveData): StageStatus[] {
  const statuses: StageStatus[] = [];
  let gateOpen = true;
  for (const stage of FOREST_CHAPTER.stages) {
    if (stage.type === "boss") {
      if (save.chapterCleared) statuses.push("cleared");
      else if (gateOpen && bossReady(save)) statuses.push("open");
      else statuses.push("locked");
      continue;
    }
    if (stageWordIds(save, stage).length === 0) {
      statuses.push("skipped");
      continue;
    }
    if (!gateOpen) {
      statuses.push("locked");
      continue;
    }
    if (stageCleared(save, stage)) statuses.push("cleared");
    else {
      statuses.push("open");
      gateOpen = false;
    }
  }
  return statuses;
}

/** First open stage when the map is entered, including a return from battle. */
export function initialMapStageId(statuses: readonly StageStatus[]): number {
  const open = statuses.findIndex((status) => status === "open");
  return FOREST_CHAPTER.stages[open >= 0 ? open : 0]!.id;
}

export function clearedStageCount(save: SaveData): number {
  return stageStatuses(save).filter((status) => status === "cleared").length;
}

export function wordsUntilBoss(save: SaveData): number {
  return requiredWordIds(save).filter((id) => !save.wordCards[id]).length;
}

export function masteryLabel(save: SaveData, now: Date): string {
  return `${litMasteryCount(save, now)}/${FOREST_WORD_COUNT}`;
}

export interface StageCombat {
  encounterId: string;
  enemyName: string;
  enemyHp: number;
  enemyAttack: number;
  sprite: string;
  phases: { hp: number; note: string }[] | null;
  spellingCap: number | null;
}

export function stageCombat(stage: ForestStage): StageCombat {
  if (stage.type === "boss") {
    const phases = PROVISIONAL.chapterEnding.phases.map((phase) => ({ hp: phase.hp, note: phase.note }));
    return {
      encounterId: PROVISIONAL.chapterEnding.bossId,
      enemyName: PROVISIONAL.chapterEnding.bossName,
      enemyHp: phases[0]?.hp ?? PROVISIONAL.chapterEnding.bossHp,
      enemyAttack: PROVISIONAL.chapterEnding.bossAttack,
      sprite: PROVISIONAL.chapterEnding.bossSprite,
      phases,
      spellingCap: FOREST_CHAPTER.boss_v1.spelling_ratio_cap,
    };
  }
  return {
    encounterId: stageEncounterId(stage.id),
    enemyName: stage.name_zh,
    enemyHp: PROVISIONAL.chapterBattle.explorationEnemyHp,
    enemyAttack: PROVISIONAL.chapterBattle.explorationEnemyAttack,
    sprite: "inkling",
    phases: null,
    spellingCap: null,
  };
}
