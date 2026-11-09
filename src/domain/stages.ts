import { sampleWords, wordById } from "./catalog";
import chapterFile from "./data/forest-stages.json";
import { PROVISIONAL } from "./provisional";
import { badgeTone, isDue } from "./review";
import type { SaveData } from "./types";

export interface ForestStage {
  id: number;
  name_zh: string;
  type: "exploration" | "boss";
  new_words: string[];
  learn_before_fight: boolean;
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
    if (!Array.isArray(stage.new_words) || stage.new_words.length !== EXPECTED_COUNTS[index]) {
      throw new Error(`stage ${stage.id} word count`);
    }
    const boss = index === 4;
    if (boss && stage.type !== "boss") throw new Error("stage 5 must be the boss");
    if (!boss && stage.type !== undefined && stage.type !== "exploration") throw new Error(`stage ${stage.id} type`);
    if (boss && stage.learn_before_fight !== true) throw new Error("boss words are learned before the fight");
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
  const sample = new Set(sampleWords().map((word) => word.id));
  if (ids.length !== sample.size || ids.some((id) => !sample.has(id))) {
    throw new Error("stage words must be the forest sample");
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

export const FOREST_CHAPTER: ForestChapter = readChapter(chapterFile);
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

/** Chapter words the selected grades can actually learn. Deselected grades stay out of the boss gate. */
export function requiredWordIds(save: SaveData): string[] {
  const grades = new Set(save.selectedGrades);
  return chapterWordIds().filter((id) => {
    const word = wordById(id);
    return Boolean(word && grades.has(word.grade));
  });
}

export function stageWordIds(save: SaveData, stage: ForestStage): string[] {
  const grades = new Set(save.selectedGrades);
  return stage.new_words.filter((id) => {
    const word = wordById(id);
    return Boolean(word && grades.has(word.grade));
  });
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
 * The chapter file says all 28 cards. A grade that is turned off cannot be learned,
 * so those words do not block the boss. The completion denominator stays 28.
 */
export function bossReady(save: SaveData): boolean {
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
