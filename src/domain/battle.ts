import { classById } from "./classes";
import { wordById, type WordDef } from "./catalog";
import { checkSpelling, quizForWord, spellingAllowed, spellingQuestion, type QuizQuestion, type SpellingQuestion } from "./questions";
import {
  drawSkillQuestionWord,
  emptySkillDeck,
  skillQuestionPool,
  type SkillQuestionDeck,
} from "./skill-cast";
import {
  castEffect,
  castHeal,
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
    /** Provisional v0.1 林冠 pack. The battle scene loads `boss_canopy_{anim}` instead of an actors frame. */
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

export type BasicAction = "attack" | "block" | "heal";

export interface BattleAction {
  type: BasicAction | "skill";
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
  /** Set while attack, block, or heal is waiting for its word question. */
  pendingBasic: BasicAction | null;
  slots: SkillSlot[];
  deck: SkillQuestionDeck;
  dueWordIds: string[];
  casts: number;
  rules: SkillCardRules;
  turn: number;
  lastNote: string;
  log: string[];
  /** Memory only. Each answered question in this fight. Not written to the save. */
  answers: { wordId: string; correct: boolean; kind: string }[];
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
  /** Block and heal actions in a row. A damaging action sets this back to 0. */
  supportStreak: number;
  /** Boss only. After enough answers, a correct damaging action ends the current phase. */
  shaken: boolean;
  /** True on the action that makes the support streak 3, until the next action. */
  attackHint: boolean;
  /** How many times this fight has raised `attackHint`. The scene toasts only the first two. */
  attackHintShown: number;
  /** Times each word has been asked in this fight. */
  askedCount: Record<string, number>;
  /** Learned words ordered by FSRS due, used to fill a short due list up to 4. */
  padOrder: string[];
  /**
   * Actual HP changes from the latest answered action, in display order.
   * Enemy damage, then the player's own heal, then the counterattack.
   * Each amount is after shield, max HP, and zero clamps. Zero changes are omitted.
   */
  turnDeltas: TurnDelta[];
  /**
   * Unlocked words a meaning question may use as distractors.
   * Null keeps the forest sample pool.
   */
  distractorIds: string[] | null;
}

export interface TurnDelta {
  target: "player" | "enemy";
  amount: number;
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
  /** Learned words, earliest review first. Ties should already be shuffled. */
  padOrder?: readonly string[];
  /** Unlocked word ids. Meaning questions keep the answer's grade and drop same meanings. */
  distractorIds?: readonly string[];
}): BattleState {
  const known = ENCOUNTERS.find((item) => item.id === input.encounterId);
  const enemy = input.enemy ?? (known
    ? { name: known.name, maxHp: known.maxHp, attack: known.attack, sprite: known.sprite ?? known.id }
    : null);
  if (!enemy) throw new Error(`Unknown encounter ${input.encounterId}`);
  const boss = input.encounterId === CHAPTER_BOSS_ID;
  const classHp = PROVISIONAL.chapterEnding.bossPhaseHpByClass[input.classId];
  const phases = input.phases === undefined
    ? boss
      ? PROVISIONAL.chapterEnding.phases.map((phase) => ({ hp: classHp, note: phase.note }))
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
    pendingBasic: null,
    slots,
    deck: emptySkillDeck(),
    dueWordIds: [...(input.dueWordIds ?? [])],
    casts: 0,
    rules,
    turn: 0,
    lastNote: "可以攻击、格挡、治疗，或打出一张技能卡。技能卡会抽一道已学的词。",
    log: [`${enemy.name}出现了。`],
    answers: [],
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
    supportStreak: 0,
    shaken: false,
    attackHint: false,
    attackHintShown: 0,
    askedCount: {},
    padOrder: [...(input.padOrder ?? [])],
    turnDeltas: [],
    distractorIds: input.distractorIds ? [...input.distractorIds] : null,
  };
}

function clampedHpDelta(before: number, after: number, max: number): number {
  const from = Math.max(0, Math.min(max, before));
  const to = Math.max(0, Math.min(max, after));
  return to - from;
}

function pushLog(log: string[], line: string): string[] {
  return [...log, line].slice(-5);
}

/** Immediate half, then the rest. The rest is cancelled by the caller when the turn ends early. */
export function splitDelayDamage(amount: number): { now: number; later: number } {
  const now = Math.round(amount / 2);
  return { now, later: amount - now };
}

function applySlotEffect(
  slot: SkillSlot,
  amount: number,
  current: { enemyHp: number; playerHp: number; playerMaxHp: number; guard: number },
  healAmount = 0,
): { enemyHp: number; playerHp: number; guard: number; note: string } {
  if (slot.kind === "damage" || slot.kind === "delay-damage") {
    const note = amount > 0 ? `${slot.name}造成了伤害。` : "这次没有打中。";
    return { ...current, enemyHp: current.enemyHp - amount, note };
  }
  if (slot.kind === "guard") {
    return { ...current, guard: amount, note: `${slot.name}挡下了下一次伤害。` };
  }
  if (slot.kind === "heal") {
    const room = current.playerMaxHp - current.playerHp;
    const healed = Math.min(amount, Math.max(0, room));
    const note = room <= 0 ? "体力已经满了。" : `${slot.name}恢复了体力。`;
    return { ...current, playerHp: current.playerHp + healed, note };
  }
  if (slot.kind === "strike-heal") {
    const room = current.playerMaxHp - current.playerHp;
    const healed = Math.min(healAmount, Math.max(0, room));
    const note = healed > 0 ? `${slot.name}造成了伤害，也恢复了体力。` : `${slot.name}造成了伤害。`;
    return {
      ...current,
      enemyHp: current.enemyHp - amount,
      playerHp: current.playerHp + healed,
      note,
    };
  }
  const guard = Math.round(amount * 0.45);
  return {
    ...current,
    enemyHp: current.enemyHp - amount,
    guard,
    note: `${slot.name}造成了伤害，并格挡。`,
  };
}

export function enemyDamage(state: Pick<BattleState, "enemyAttack" | "enemyHits" | "guard">): number {
  return Math.max(0, state.enemyAttack - state.guard);
}

function supportAmount(amount: number, streak: number): number {
  const free = PROVISIONAL.chapterBattle.supportStreakFree;
  if (streak <= free) return amount;
  const steps = Math.min(streak, 8) - free;
  return Math.floor(amount / 2 ** steps);
}

function damagingKind(kind: SkillSlot["kind"]): boolean {
  return kind === "damage" || kind === "strike-guard" || kind === "strike-heal" || kind === "delay-damage";
}

function afterEnemyHit(state: BattleState, note: string): BattleState {
  const dealt = enemyDamage(state);
  const playerHp = state.playerHp - dealt;
  const hitText = dealt > 0 ? "受到了伤害。" : "这次没有受到伤害。";
  const log = pushLog(state.log, `${state.enemyName}：${hitText}`);
  if (playerHp <= 0) {
    return {
      ...state,
      playerHp: 0,
      guard: 0,
      enemyHits: state.enemyHits + 1,
      phase: "lost",
      pendingSlot: null,
      pendingBasic: null,
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
    pendingBasic: null,
    question: null,
    log,
    lastNote: `${note}${hitText}`,
  };
}

function finishPlayerTurn(state: BattleState, note: string, skipCounter = false): BattleState {
  if (state.enemyHp > 0 && skipCounter) {
    return {
      ...state,
      guard: 0,
      phase: "choose",
      turn: state.turn + 1,
      pendingSlot: null,
      pendingBasic: null,
      question: null,
      lastNote: note,
    };
  }
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
      pendingBasic: null,
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
    pendingBasic: null,
    question: null,
    log: pushLog(state.log, "词灵散开了。"),
    lastNote: `${note}你赢了。`,
  };
}

function basicEffectSlot(state: BattleState, action: BasicAction): SkillSlot {
  const hero = classById(state.classId);
  const effect = action === "attack" ? hero.attack : action === "block" ? hero.block : hero.heal;
  const name = action === "attack" ? "攻击" : action === "block" ? "格挡" : "治疗";
  const kind = action === "attack" ? "damage" : action === "block" ? "guard" : "heal";
  return {
    index: -1,
    skillId: `basic-${action}`,
    name,
    kind,
    origin: "base",
    fullPower: effect,
    basePower: effect,
    fullHeal: 0,
    baseHeal: 0,
    energyCost: 0,
    level: null,
  };
}

export function answerQuestion(state: BattleState, choiceId: string): BattleState {
  if (state.phase !== "question" || !state.question) return state;
  const slot = state.pendingBasic
    ? basicEffectSlot(state, state.pendingBasic)
    : state.pendingSlot === null
      ? undefined
      : state.slots[state.pendingSlot];
  if (!slot) return state;
  const correct = state.question.kind === "spelling"
    ? checkSpelling(state.question.answer, choiceId)
    : choiceId === state.question.answerId;
  let amount = castEffect(slot, correct, state.rules.wrongAnswerMultiplier);
  const supportive = slot.kind === "heal" || slot.kind === "guard";
  const damaging = damagingKind(slot.kind);
  let supportStreak = state.supportStreak;
  if (supportive) {
    supportStreak += 1;
    amount = supportAmount(amount, supportStreak);
  } else if (damaging) {
    supportStreak = 0;
  }
  const delayed = slot.kind === "delay-damage";
  const split = delayed ? splitDelayDamage(amount) : { now: amount, later: 0 };
  let later = split.later;
  const healAmount = slot.kind === "strike-heal" ? castHeal(slot, correct, state.rules.wrongAnswerMultiplier) : 0;
  const hero = classById(state.classId);
  const energy = Math.min(state.maxEnergy, state.energy + (correct ? hero.energyGain : 0));
  const applied = applySlotEffect(slot, delayed ? split.now : amount, {
    enemyHp: state.enemyHp,
    playerHp: state.playerHp,
    playerMaxHp: state.playerMaxHp,
    guard: state.guard,
  }, healAmount);
  const phaseEnd = Boolean(state.shaken && correct && damaging && state.phases);
  const whiff = delayed && split.now === 0;
  if (whiff || phaseEnd || applied.enemyHp <= 0) later = 0;
  const quality = correct ? "答对了，全力发动。" : "答错了，只有减弱的基础效果。";
  const note = `${quality}${applied.note}`;
  const enemyHpForTurn = phaseEnd ? 0 : applied.enemyHp;
  const playerHpForTurn = applied.playerHp;
  const enemyAmount = clampedHpDelta(state.enemyHp, enemyHpForTurn, state.enemyMaxHp);
  const playerEffect = clampedHpDelta(state.playerHp, playerHpForTurn, state.playerMaxHp);
  let finished = finishPlayerTurn(
    {
      ...state,
      enemyHp: enemyHpForTurn,
      playerHp: playerHpForTurn,
      energy,
      guard: applied.guard,
      supportStreak,
      pendingSlot: null,
      pendingBasic: null,
      lastNote: note,
    },
    note,
    whiff,
  );
  if (finished.phase === "lost") later = 0;
  let laterAmount = 0;
  if (later > 0 && finished.phase !== "won" && finished.phase !== "lost" && finished.enemyHp > 0) {
    const beforeLater = finished.enemyHp;
    const nextEnemy = beforeLater - later;
    const followNote = `${finished.lastNote}齿轮还在转。`;
    laterAmount = clampedHpDelta(beforeLater, Math.max(0, nextEnemy), finished.enemyMaxHp);
    if (nextEnemy <= 0) {
      finished = finishPlayerTurn({ ...finished, enemyHp: nextEnemy, lastNote: followNote }, followNote);
    } else {
      finished = { ...finished, enemyHp: nextEnemy, lastNote: followNote };
    }
  }
  const playerHit = clampedHpDelta(playerHpForTurn, finished.playerHp, state.playerMaxHp);
  const turnDeltas: TurnDelta[] = [];
  if (enemyAmount !== 0) turnDeltas.push({ target: "enemy", amount: enemyAmount });
  if (playerEffect !== 0) turnDeltas.push({ target: "player", amount: playerEffect });
  if (playerHit !== 0) turnDeltas.push({ target: "player", amount: playerHit });
  if (laterAmount !== 0) turnDeltas.push({ target: "enemy", amount: laterAmount });
  finished = { ...finished, turnDeltas };
  if (finished.phases && finished.phase !== "won" && finished.questionsAsked >= PROVISIONAL.chapterEnding.shakenAfterQuestions) {
    finished = { ...finished, shaken: true };
  }
  const hintNow = supportive && supportStreak === 3 && finished.phase !== "won" && finished.phase !== "lost";
  return {
    ...finished,
    answers: [...(state.answers ?? []), { wordId: state.question.wordId, correct, kind: state.question.kind }],
    attackHint: hintNow,
    attackHintShown: finished.attackHintShown + (hintNow ? 1 : 0),
  };
}

function learnedPool(state: BattleState): string[] {
  return skillQuestionPool([], state.learnedIds, { allowedIds: state.allowedWordIds ?? undefined });
}

function drawBattleWord(state: BattleState, pool: readonly string[]): {
  wordId: string;
  deck: SkillQuestionDeck;
  recent: string[];
  askedCount: Record<string, number>;
} {
  const window = PROVISIONAL.chapterBattle.recentQuestionWindow;
  const cap = 2;
  const asked = state.askedCount;
  const avoid = new Set(window > 0 ? state.recentQuestionIds.slice(-window) : []);
  const learned = learnedPool(state);
  let candidates = pool.filter((id) => (asked[id] ?? 0) < cap);
  if (candidates.length === 0) candidates = learned.filter((id) => (asked[id] ?? 0) < cap);
  if (candidates.length === 0) {
    const source = learned.length > 0 ? learned : [...pool];
    const least = Math.min(...source.map((id) => asked[id] ?? 0));
    candidates = source.filter((id) => (asked[id] ?? 0) === least);
  }
  const fresh = candidates.filter((id) => !avoid.has(id));
  const choicePool = fresh.length > 0 ? fresh : candidates;
  if (choicePool.length === 0) throw new Error("No learned words to ask");
  const drawn = drawSkillQuestionWord(choicePool, emptySkillDeck(), state.seed + state.casts * 17 + 1);
  return {
    wordId: drawn.wordId,
    deck: drawn.deck,
    recent: [...state.recentQuestionIds, drawn.wordId].slice(-12),
    askedCount: { ...asked, [drawn.wordId]: (asked[drawn.wordId] ?? 0) + 1 },
  };
}

function askQuestion(
  state: BattleState,
  slot: SkillSlot,
  basic: BasicAction | null = null,
): { ok: boolean; reason?: string; state: BattleState } {
  const pool = skillQuestionPool(state.dueWordIds, state.learnedIds, {
    allowedIds: state.allowedWordIds ?? undefined,
    padOrder: state.padOrder,
  });
  if (pool.length === 0) {
    return { ok: false, reason: "所选年级里还没有可以出题的词。先去学堂，或在给家长里再勾选年级。已经学过的词卡还在册子里。", state };
  }
  let drawn: ReturnType<typeof drawBattleWord>;
  try {
    drawn = drawBattleWord(state, pool);
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
      state.spellingAsked < PROVISIONAL.chapterEnding.bossSpellingMax &&
      nextShare <= state.spellingCap + 1e-9,
  );
  const distractors = state.distractorIds
    ? state.distractorIds.map((id) => wordById(id)).filter((item): item is WordDef => Boolean(item))
    : undefined;
  const question = spell
    ? spellingQuestion(drawn.wordId, lit)
    : quizForWord(drawn.wordId, state.seed + state.casts * 13, state.questionsAsked % 2 === 0 ? "zh-to-en" : "en-to-zh", distractors);
  if (!question) return { ok: false, reason: "这道题现在出不了", state };
  return {
    ok: true,
    state: {
      ...state,
      energy: state.energy - slot.energyCost,
      phase: "question",
      pendingSlot: basic ? null : slot.index,
      pendingBasic: basic,
      question,
      deck: drawn.deck,
      recentQuestionIds: drawn.recent,
      askedCount: drawn.askedCount,
      casts: state.casts + 1,
      questionsAsked: state.questionsAsked + 1,
      spellingAsked: state.spellingAsked + (question.kind === "spelling" ? 1 : 0),
      lastNote: basic
        ? `${slot.name}之前先答题：答对是完整效果，答错只有减弱的基础效果。`
        : `打出${slot.name}。先答题：答对是完整效果，答错只有减弱的基础效果。`,
    },
  };
}

export function takeAction(
  state: BattleState,
  action: BattleAction,
): { ok: boolean; reason?: string; state: BattleState } {
  if (state.phase !== "choose") return { ok: false, reason: "现在不能行动", state };
  if (action.type === "attack" || action.type === "block" || action.type === "heal") {
    return askQuestion(state, basicEffectSlot(state, action.type), action.type);
  }
  const slot =
    action.slotIndex !== undefined
      ? state.slots[action.slotIndex]
      : state.slots.find((item) => item.origin === "equipped" && item.skillId === action.skillId);
  if (!slot) return { ok: false, reason: "这张技能卡没有装备", state };
  if (state.energy < slot.energyCost) return { ok: false, reason: "能量不够", state };
  return askQuestion(state, slot);
}
