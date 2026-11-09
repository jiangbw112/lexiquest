import { classById } from "./classes";
import { quizForWord, type QuizQuestion } from "./questions";
import {
  drawSkillQuestionWord,
  emptySkillDeck,
  skillQuestionPool,
  type SkillQuestionDeck,
} from "./skill-cast";
import {
  castEffect,
  fillSkillSlots,
  SKILL_CARD_RULES,
  type SkillCardRules,
  type SkillSlot,
} from "./skills";
import { PROVISIONAL } from "./provisional";
import type { ClassId } from "./types";

export const MIN_LEARNED_FOR_BATTLE = 4;
export const MAX_ENERGY = 6;

export interface EncounterDef {
  id: string;
  name: string;
  title: string;
  maxHp: number;
  attack: number;
  blurb: string;
  accent: string;
  winsRequired: number;
  /** Atlas frame id under monster/. Defaults to the encounter id. */
  sprite?: string;
}

export const ENCOUNTERS: EncounterDef[] = [
  {
    id: "inkling",
    name: "墨团",
    title: "词灵 · 墨团",
    maxHp: 36,
    attack: 6,
    blurb: "一团喜欢躲在词卡后面的墨水。答对单词，它就会露出破绽。",
    accent: "#2c3142",
    winsRequired: 0,
  },
  {
    id: "page",
    name: "页灵",
    title: "词灵 · 页灵",
    maxHp: 52,
    attack: 7,
    blurb: "一页会扑过来的纸。它比墨团更结实，格挡和技能会帮上忙。",
    accent: "#8c6239",
    winsRequired: 1,
  },
  {
    id: PROVISIONAL.chapterEnding.bossId,
    name: PROVISIONAL.chapterEnding.bossName,
    title: "词灵 · 林冠",
    maxHp: PROVISIONAL.chapterEnding.bossHp,
    attack: PROVISIONAL.chapterEnding.bossAttack,
    blurb: "暂定结局。示例词卡集齐之后才会出现。外形先沿用页灵。",
    accent: "#1f7a4d",
    winsRequired: 1,
    sprite: "page",
  },
];

export const CHAPTER_BOSS_ID = PROVISIONAL.chapterEnding.bossId;

/** Fights the player may choose. The chapter boss stays locked until every sample card is collected. */
export function openEncounters(learnedIds: readonly string[], sampleIds: readonly string[]): EncounterDef[] {
  const ready = sampleIds.length > 0 && sampleIds.every((id) => learnedIds.includes(id));
  return ENCOUNTERS.filter((encounter) => encounter.id !== CHAPTER_BOSS_ID || ready);
}

export type BattlePhase = "question" | "choose" | "won" | "lost";

export interface BattleAction {
  type: "attack" | "block" | "heal" | "skill";
  skillId?: string;
  /** Use this when two filler slots share one id. */
  slotIndex?: number;
}

export interface BattleState {
  encounterId: string;
  seed: number;
  playerHp: number;
  playerMaxHp: number;
  enemyHp: number;
  enemyMaxHp: number;
  energy: number;
  maxEnergy: number;
  guard: number;
  enemyHits: number;
  phase: BattlePhase;
  question: QuizQuestion | null;
  /** Set while a skill card is waiting for its word question. */
  pendingSlot: number | null;
  slots: SkillSlot[];
  deck: SkillQuestionDeck;
  dueWordIds: string[];
  casts: number;
  rules: SkillCardRules;
  turn: number;
  lastNote: string;
  log: string[];
  learnedIds: string[];
  /** When set, non-due skill questions stay inside this id list. Due words are not filtered. */
  allowedWordIds: string[] | null;
  classId: ClassId;
  equippedSkillIds: string[];
  skillLevels: Record<string, number>;
}

export function canStartBattle(learnedCount: number): boolean {
  return learnedCount >= MIN_LEARNED_FOR_BATTLE;
}

export function encounterById(id: string): EncounterDef {
  const found = ENCOUNTERS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown encounter ${id}`);
  return found;
}

export function startBattle(input: {
  encounterId: string;
  classId: ClassId;
  learnedIds: readonly string[];
  equippedSkillIds: readonly string[];
  skillLevels: Record<string, number>;
  seed: number;
  /** FSRS-due word ids at the start of the fight. Unlearned ids are ignored. */
  dueWordIds?: readonly string[];
  /** Selected-grade word ids. Omitted means the fallback pool is every learned word. */
  allowedWordIds?: readonly string[];
  rules?: Partial<SkillCardRules>;
}): BattleState {
  const encounter = encounterById(input.encounterId);
  const hero = classById(input.classId);
  const rules: SkillCardRules = { ...SKILL_CARD_RULES, ...input.rules };
  const slots = fillSkillSlots(input.classId, input.equippedSkillIds, input.skillLevels, rules);
  const learnedIds = [...input.learnedIds];
  return {
    encounterId: encounter.id,
    seed: input.seed,
    playerHp: hero.maxHp,
    playerMaxHp: hero.maxHp,
    enemyHp: encounter.maxHp,
    enemyMaxHp: encounter.maxHp,
    energy: 0,
    maxEnergy: MAX_ENERGY,
    guard: 0,
    enemyHits: 0,
    phase: "choose",
    question: null,
    pendingSlot: null,
    slots,
    deck: emptySkillDeck(),
    dueWordIds: [...(input.dueWordIds ?? [])],
    casts: 0,
    rules,
    turn: 0,
    lastNote: "可以攻击、格挡、治疗，或打出一张技能卡。技能卡会抽一道已学的词。",
    log: [`${encounter.name}出现了。`],
    learnedIds,
    allowedWordIds: input.allowedWordIds ? [...input.allowedWordIds] : null,
    classId: input.classId,
    equippedSkillIds: slots.filter((slot) => slot.origin === "equipped").map((slot) => slot.skillId),
    skillLevels: { ...input.skillLevels },
  };
}

function pushLog(log: string[], line: string): string[] {
  return [...log, line].slice(-5);
}

function applySlotEffect(
  slot: SkillSlot,
  amount: number,
  current: { enemyHp: number; playerHp: number; playerMaxHp: number; guard: number },
): { enemyHp: number; playerHp: number; guard: number; note: string } {
  if (slot.kind === "damage") {
    return { ...current, enemyHp: current.enemyHp - amount, note: `${slot.name}造成 ${amount} 点伤害。` };
  }
  if (slot.kind === "guard") {
    return { ...current, guard: amount, note: `${slot.name}挡下下一次 ${amount} 点伤害。` };
  }
  if (slot.kind === "heal") {
    const healed = Math.min(amount, current.playerMaxHp - current.playerHp);
    const note = healed > 0 ? `${slot.name}恢复 ${healed} 点体力。` : "体力已经满了。";
    return { ...current, playerHp: current.playerHp + healed, note };
  }
  const guard = Math.round(amount * 0.45);
  return {
    ...current,
    enemyHp: current.enemyHp - amount,
    guard,
    note: `${slot.name}造成 ${amount} 点伤害，并格挡 ${guard} 点。`,
  };
}

function enemyDamage(state: BattleState): number {
  const base = encounterById(state.encounterId).attack + Math.floor(state.enemyHits / 2);
  return Math.max(0, base - state.guard);
}

function afterEnemyHit(state: BattleState, note: string): BattleState {
  const dealt = enemyDamage(state);
  const playerHp = state.playerHp - dealt;
  const name = encounterById(state.encounterId).name;
  const hitText = dealt > 0 ? `受到 ${dealt} 点伤害。` : "这次没有受到伤害。";
  const log = pushLog(state.log, `${name}：${hitText}`);
  if (playerHp <= 0) {
    return {
      ...state,
      playerHp: 0,
      guard: 0,
      enemyHits: state.enemyHits + 1,
      phase: "lost",
      log,
      lastNote: `${note}${hitText}你先退下来。词卡都还在。`,
    };
  }
  const turn = state.turn + 1;
  return {
    ...state,
    playerHp,
    guard: 0,
    enemyHits: state.enemyHits + 1,
    phase: "choose",
    turn,
    pendingSlot: null,
    question: null,
    log,
    lastNote: `${note}${hitText}`,
  };
}

export function answerQuestion(state: BattleState, choiceId: string): BattleState {
  if (state.phase !== "question" || !state.question || state.pendingSlot === null) return state;
  const slot = state.slots[state.pendingSlot];
  if (!slot) return state;
  const correct = choiceId === state.question.answerId;
  const amount = castEffect(slot, correct, state.rules.wrongAnswerMultiplier);
  const hero = classById(state.classId);
  const enemyHp = state.enemyHp;
  const playerHp = state.playerHp;
  const guard = state.guard;
  const energy = Math.min(state.maxEnergy, state.energy + (correct ? hero.energyGain : 0));
  const applied = applySlotEffect(slot, amount, { enemyHp, playerHp, playerMaxHp: state.playerMaxHp, guard });
  const quality = correct ? "答对了，全力发动。" : "答错了，只有减弱的基础效果。";
  const note = `${quality}${applied.note}`;
  if (applied.enemyHp <= 0) {
    return {
      ...state,
      enemyHp: 0,
      playerHp: applied.playerHp,
      energy,
      guard: applied.guard,
      pendingSlot: null,
      question: null,
      phase: "won",
      log: pushLog(state.log, "词灵散开了。"),
      lastNote: `${note}你赢了。`,
    };
  }
  return afterEnemyHit(
    { ...state, enemyHp: applied.enemyHp, playerHp: applied.playerHp, energy, guard: applied.guard, lastNote: note },
    note,
  );
}

export function takeAction(
  state: BattleState,
  action: BattleAction,
): { ok: boolean; reason?: string; state: BattleState } {
  if (state.phase !== "choose") return { ok: false, reason: "现在不能行动", state };
  const hero = classById(state.classId);
  let enemyHp = state.enemyHp;
  let playerHp = state.playerHp;
  let guard = state.guard;
  const energy = state.energy;
  let note: string;

  if (action.type === "attack") {
    enemyHp -= hero.attack;
    note = `攻击造成 ${hero.attack} 点伤害。`;
  } else if (action.type === "block") {
    guard = hero.block;
    note = `你格挡住下一次 ${hero.block} 点伤害。`;
  } else if (action.type === "heal") {
    const healed = Math.min(hero.heal, state.playerMaxHp - playerHp);
    playerHp += healed;
    note = healed > 0 ? `治疗恢复 ${healed} 点体力。` : "体力已经满了。";
  } else {
    const slot =
      action.slotIndex !== undefined
        ? state.slots[action.slotIndex]
        : state.slots.find((item) => item.origin === "equipped" && item.skillId === action.skillId);
    if (!slot) return { ok: false, reason: "这张技能卡没有装备", state };
    if (energy < slot.energyCost) return { ok: false, reason: "能量不够", state };
    const pool = skillQuestionPool(state.dueWordIds, state.learnedIds, {
      allowedIds: state.allowedWordIds ?? undefined,
    });
    if (pool.length === 0) {
      return { ok: false, reason: "所选年级里还没有可以出题的词。先去学堂，或在给家长里再选年级。已经学过的词仍会在复习桌出现。", state };
    }
    let drawn: { wordId: string; deck: SkillQuestionDeck };
    try {
      drawn = drawSkillQuestionWord(pool, state.deck, state.seed + state.casts * 17 + 1);
    } catch {
      return { ok: false, reason: "还没有学过的词", state };
    }
    const question = quizForWord(
      drawn.wordId,
      state.seed + state.casts * 13,
      state.casts % 2 === 0 ? "zh-to-en" : "en-to-zh",
    );
    return {
      ok: true,
      state: {
        ...state,
        energy: energy - slot.energyCost,
        phase: "question",
        pendingSlot: slot.index,
        question,
        deck: drawn.deck,
        casts: state.casts + 1,
        lastNote: `打出${slot.name}。先答题：答对是完整效果，答错只有减弱的基础效果。`,
      },
    };
  }
  if (enemyHp <= 0) {
    return {
      ok: true,
      state: {
        ...state,
        enemyHp: 0,
        playerHp,
        energy,
        guard,
        phase: "won",
        log: pushLog(state.log, "词灵散开了。"),
        lastNote: `${note}你赢了。`,
      },
    };
  }

  return {
    ok: true,
    state: afterEnemyHit({ ...state, enemyHp, playerHp, energy, guard, lastNote: note }, note),
  };
}
