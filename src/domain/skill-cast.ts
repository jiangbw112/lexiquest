import { wordById } from "./catalog";
import { quizForWord, type QuizQuestion } from "./questions";
import { shuffle } from "./rng";
import {
  fillSkillSlots,
  SKILL_CARD_RULES,
  type SkillCardRules,
  type SkillSlot,
} from "./skills";
import type { ClassId } from "./types";

export interface SkillQuestionDeck {
  /** Words still to deal before the pool is shuffled again. */
  queue: string[];
}

export function emptySkillDeck(): SkillQuestionDeck {
  return { queue: [] };
}

/**
 * Due words that the player has actually learned come first.
 * If none of those are due, the pool is every learned word.
 * Unlearned ids are dropped even when a due list names them.
 */
export function skillQuestionPool(
  dueIds: readonly string[],
  learnedIds: readonly string[],
  options?: { allowedIds?: readonly string[] },
): string[] {
  const learned = new Set(learnedIds);
  const knownLearned = (id: string) => learned.has(id) && Boolean(wordById(id));
  const due = unique(dueIds.filter(knownLearned));
  if (due.length > 0) return due;
  const allowed = options?.allowedIds ? new Set(options.allowedIds) : null;
  return unique(learnedIds.filter((id) => knownLearned(id) && (!allowed || allowed.has(id))));
}

/**
 * Deals the whole pool before repeating, so a larger set is not stuck on the same three words.
 * A pool of three or fewer has to repeat; that is the whole set, not a hidden shorter cycle.
 */
export function drawSkillQuestionWord(
  pool: readonly string[],
  deck: SkillQuestionDeck,
  seed: number,
): { wordId: string; deck: SkillQuestionDeck } {
  if (pool.length === 0) throw new Error("No learned words to ask");
  const allowed = new Set(pool);
  let queue = deck.queue.filter((id) => allowed.has(id));
  if (queue.length === 0) queue = shuffle([...pool], seed || 1);
  const wordId = queue[0];
  if (!wordId) throw new Error("No learned words to ask");
  return { wordId, deck: { queue: queue.slice(1) } };
}

export function sharedDuelWordPool(learnedA: readonly string[], learnedB: readonly string[]): string[] {
  const right = new Set(learnedB);
  return unique(learnedA.filter((id) => right.has(id) && Boolean(wordById(id))));
}

export interface SharedDuel {
  /** One loadout. Both sides receive copies with the same numbers. */
  slots: SkillSlot[];
  sideA: SkillSlot[];
  sideB: SkillSlot[];
  questions: QuizQuestion[];
}

/**
 * Friend 1v1 uses one shared learned-word pool and one set of slot values.
 * Personal due lists are not read, and nothing here schedules a review.
 */
export function buildSharedDuel(input: {
  classId: ClassId;
  equippedSkillIds: readonly string[];
  skillLevels: Record<string, number>;
  learnedA: readonly string[];
  learnedB: readonly string[];
  seed: number;
  questionCount: number;
  rules?: SkillCardRules;
}): SharedDuel {
  const pool = sharedDuelWordPool(input.learnedA, input.learnedB);
  if (pool.length === 0) throw new Error("Shared duel pool is empty");
  const slots = fillSkillSlots(input.classId, input.equippedSkillIds, input.skillLevels, input.rules ?? SKILL_CARD_RULES);
  let deck = emptySkillDeck();
  const questions: QuizQuestion[] = [];
  for (let index = 0; index < input.questionCount; index += 1) {
    const drawn = drawSkillQuestionWord(pool, deck, input.seed + index * 17);
    deck = drawn.deck;
    const direction = index % 2 === 0 ? "zh-to-en" : "en-to-zh";
    questions.push(quizForWord(drawn.wordId, input.seed + index * 13, direction));
  }
  return {
    slots,
    sideA: slots.map((slot) => ({ ...slot })),
    sideB: slots.map((slot) => ({ ...slot })),
    questions,
  };
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
