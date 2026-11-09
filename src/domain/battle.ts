import { classById } from "./classes";
import { wordById } from "./catalog";
import { checkSpelling, quizForWord, spellingAllowed, spellingQuestion, type QuizQuestion, type SpellingQuestion } from "./questions";
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
import { FOREST_CHAPTER } from "./stages";
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

export interface BattleEnemy {
  name: string;
  maxHp: number;
  attack: number;
  sprite: string;
}

export interface BossPhase {
  hp: number;
  note: string;
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
    title: "词灵 · 林心守护者",
    maxHp: PROVISIONAL.chapterEnding.bossHp,
    attack: PROVISIONAL.chapterEnding.bossAttack,
    blurb: "森林冒险的最后一关。前面的区域清关，并且所选年级的本章词都学过，才会开门。",
    accent: "#1f7a4d",
    winsRequired: 1,
    sprite: PROVISIONAL.chapterEnding.bossSprite,
  },
];

export const CHAPTER_BOSS_ID = PROVISIONAL.chapterEnding.bossId;

/** Fights the old practice list may show. The chapter boss stays behind the sample-card gate here. */
export function openEncounters(learnedIds: readonly string[], sampleIds: readonly string[]): EncounterDef[] {
  const ready = sampleIds.length > 0 && sampleIds.every((id) => learnedIds.includes(id));
  return ENCOUNTERS.filter((encounter) => encounter.id !== CHAPTER_BOSS_ID || ready);
}

export type BattlePhase = "question" | "choose" | "won" | "lost";
export type BattleQuestion = QuizQuestion | SpellingQuestion;

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
  enemyName: string;
  enemyAttack: number;
  enemySprite: string;
  energy: number;
  maxEnergy: number;
  guard: number;
  enemyHits: number;
  phase: BattlePhase;
  question: BattleQuestion | null;
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
  /** Selected-grade chapter words. Omitted means the fallback pool is every learned word. */
  allowedWordIds: string[] | null;
  classId: ClassId;
  equippedSkillIds: string[];
  skillLevels: Record<string, number>;
  /** Word ids whose mastery badge is lit. Advanced spelling reads this, not a grey badge. */
  litWordIds: string[];
  recentQuestionIds: string[];
  questionsAsked: number;
  spellingAsked: number;
  /** Null keeps the fight on meaning and listening questions. */
  spellingCap: number | null;
  phases: BossPhase[] | null;
  phaseIndex: number;
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
  enemy?: BattleEnemy;
  phases?: readonly BossPhase[] | null;
  spellingCap?: number | null;
  litWordIds?: readonly string[];
}): BattleState {
  const known = ENCOUNTERS.find((item) => item.id === input.encounterId);
  const enemy = input.enemy ?? (known
    ? { name: known.name, maxHp: known.maxHp, attack: known.attack, sprite: known.sprite ?? known.id }
    : null);
  if (!enemy) throw new Error(`Unknown encounter ${input.encounterId}`);
  const boss = input.encounterId === CHAPTER_BOSS_ID;
  const phases = input.phases === undefined
    ? boss
      ? PROVISIONAL.chapterEnding.phases.map((phase) => ({ hp: phase.hp, note: phase.note }))
      : null
    : input.phases;
  const opening = phases?.[0];
  const hero = classById(input.classId);
  const rules: SkillCardRules = { ...SKILL_CARD_RULES, ...input.rules };
  const slots = fillSkillSlots(input.classId, input.equippedSkillIds, input.skillLevels, rules);
  const learnedIds = [...input.learnedIds];
  return {
    encounterId: input.encounterId,
    seed: input.seed,
    playerHp: hero.maxHp,
    playerMaxHp: hero.maxHp,
    enemyHp: opening?.hp ?? enemy.maxHp,
    enemyMaxHp: opening?.hp ?? enemy.maxHp,
    enemyName: enemy.name,
    enemyAttack: enemy.attack,
    enemySprite: enemy.sprite,
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
    log: [`${enemy.name}出现了。`],
    learnedIds,
    allowedWordIds: input.allowedWordIds ? [...input.allowedWordIds] : null,
    classId: input.classId,
    equippedSkillIds: slots.filter((slot) => slot.origin === "equipped").map((slot) => slot.skillId),
    skillLevels: { ...input.skillLevels },
    litWordIds: [...(input.litWordIds ?? [])],
    recentQuestionIds: [],
    questionsAsked: 0,
    spellingAsked: 0,
    spellingCap: input.spellingCap === undefined ? (boss ? FOREST_CHAPTER.boss_v1.spelling_ratio_cap : null) : input.spellingCap,
    phases: phases ? phases.map((phase) => ({ ...phase })) : null,
    phaseIndex: 0,
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
  const base = state.enemyAttack + Math.floor(state.enemyHits / 2);
  return Math.max(0, base - state.guard);
}

function afterEnemyHit(state: BattleState, note: string): BattleState {
  const dealt = enemyDamage(state);
  const playerHp = state.playerHp - dealt;
  const hitText = dealt > 0 ? `受到 ${dealt} 点伤害。` : "这次没有受到伤害。";
  const log = pushLog(state.log, `${state.enemyName}：${hitText}`);
  if (playerHp <= 0) {
    return {
      ...state,
      playerHp: 0,
      guard: 0,
      enemyHits: state.enemyHits + 1,
      phase: "lost",
      pendingSlot: null,
      question: null,
      log,
      lastNote: `${note}${hitText}你先退下来。词卡都还在。`,
    };
  }
  return {
    ...state,
    playerHp,
    guard: 0,
    enemyHits: state.enemyHits + 1,
    phase: "choose",
    turn: state.turn + 1,
    pendingSlot: null,
    question: null,
    log,
    lastNote: `${note}${hitText}`,
  };
}

function finishPlayerTurn(state: BattleState, note: string): BattleState {
  if (state.enemyHp > 0) return afterEnemyHit(state, note);
  const next = state.phases?.[state.phaseIndex + 1];
  if (next) {
    return {
      ...state,
      phaseIndex: state.phaseIndex + 1,
      enemyHp: next.hp,
      enemyMaxHp: next.hp,
      phase: "choose",
      pendingSlot: null,
      question: null,
      guard: 0,
      log: pushLog(state.log, next.note),
      lastNote: `${note}${next.note}`,
    };
  }
  return {
    ...state,
    enemyHp: 0,
    phase: "won",
    pendingSlot: null,
    question: null,
    log: pushLog(state.log, "词灵散开了。"),
    lastNote: `${note}你赢了。`,
  };
}

export function answerQuestion(state: BattleState, choiceId: string): BattleState {
  if (state.phase !== "question" || !state.question || state.pendingSlot === null) return state;
  const slot = state.slots[state.pendingSlot];
  if (!slot) return state;
  const correct = state.question.kind === "spelling"
    ? checkSpelling(state.question.answer, choiceId)
    : choiceId === state.question.answerId;
  const amount = castEffect(slot, correct, state.rules.wrongAnswerMultiplier);
  const hero = classById(state.classId);
  const energy = Math.min(state.maxEnergy, state.energy + (correct ? hero.energyGain : 0));
  const applied = applySlotEffect(slot, amount, {
    enemyHp: state.enemyHp,
    playerHp: state.playerHp,
    playerMaxHp: state.playerMaxHp,
    guard: state.guard,
  });
  const quality = correct ? "答对了，全力发动。" : "答错了，只有减弱的基础效果。";
  const note = `${quality}${applied.note}`;
  return finishPlayerTurn(
    { ...state, enemyHp: applied.enemyHp, playerHp: applied.playerHp, energy, guard: applied.guard, lastNote: note },
    note,
  );
}

function drawBattleWord(
  pool: readonly string[],
  deck: SkillQuestionDeck,
  recent: readonly string[],
  seed: number,
): { wordId: string; deck: SkillQuestionDeck; recent: string[] } {
  const window = PROVISIONAL.chapterBattle.recentQuestionWindow;
  const avoid = new Set(window > 0 ? recent.slice(-window) : []);
  let working = deck;
  let picked = "";
  const skipped: string[] = [];
  for (let attempt = 0; attempt < pool.length; attempt += 1) {
    const drawn = drawSkillQuestionWord(pool, working, seed + attempt);
    working = drawn.deck;
    if (!avoid.has(drawn.wordId) || attempt === pool.length - 1) {
      picked = drawn.wordId;
      break;
    }
    skipped.push(drawn.wordId);
  }
  if (!picked) throw new Error("No learned words to ask");
  return {
    wordId: picked,
    deck: { queue: [...working.queue, ...skipped] },
    recent: [...recent, picked].slice(-12),
  };
}

function askQuestion(state: BattleState, slot: SkillSlot): { ok: boolean; reason?: string; state: BattleState } {
  const pool = skillQuestionPool(state.dueWordIds, state.learnedIds, {
    allowedIds: state.allowedWordIds ?? undefined,
  });
  if (pool.length === 0) {
    return { ok: false, reason: "所选年级里还没有可以出题的词。先去学堂，或在给家长里再勾选年级。已经学过的词卡还在册子里。", state };
  }
  let drawn: { wordId: string; deck: SkillQuestionDeck; recent: string[] };
  try {
    drawn = drawBattleWord(pool, state.deck, state.recentQuestionIds, state.seed + state.casts * 17 + 1);
  } catch {
    return { ok: false, reason: "还没有学过的词", state };
  }
  const word = wordById(drawn.wordId);
  const lit = state.litWordIds.includes(drawn.wordId);
  const nextShare = (state.spellingAsked + 1) / (state.questionsAsked + 1);
  const spell = Boolean(
    word &&
      state.spellingCap !== null &&
      spellingAllowed(word, lit) &&
      nextShare <= state.spellingCap + 1e-9,
  );
  const question = spell
    ? spellingQuestion(drawn.wordId, lit)
    : quizForWord(drawn.wordId, state.seed + state.casts * 13, state.questionsAsked % 2 === 0 ? "zh-to-en" : "en-to-zh");
  if (!question) return { ok: false, reason: "这道题现在出不了", state };
  return {
    ok: true,
    state: {
      ...state,
      energy: state.energy - slot.energyCost,
      phase: "question",
      pendingSlot: slot.index,
      question,
      deck: drawn.deck,
      recentQuestionIds: drawn.recent,
      casts: state.casts + 1,
      questionsAsked: state.questionsAsked + 1,
      spellingAsked: state.spellingAsked + (question.kind === "spelling" ? 1 : 0),
      lastNote: `打出${slot.name}。先答题：答对是完整效果，答错只有减弱的基础效果。`,
    },
  };
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
    return askQuestion(state, slot);
  }
  return {
    ok: true,
    state: finishPlayerTurn({ ...state, enemyHp, playerHp, energy, guard, lastNote: note }, note),
  };
}
