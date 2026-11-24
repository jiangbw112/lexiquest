import { isMastered } from "./cards";
import { wordById, type WordDef } from "./catalog";
import { localDayKey } from "./local-day";
import { gradeIsOpen } from "./progress";
import { checkSpelling, spellingAllowed } from "./questions";
import { excludedFromUnpromptedSpelling, maskedSpellingFace } from "./spelling-leak";
import type { SaveData, WordCardRecord } from "./types";

/** First transition into 已掌握 from 盖住拼. Not paid by boss or exam. */
export const COVER_SPELL_XP = 30;

export const COVER_SPELL_SAVE_FAILED = "没保存上。掌握和经验都没有记下。再试一次。";

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CoverSpellOutcome =
  | "unavailable"
  | "mastered"
  | "practice-too-soon"
  | "practice-revealed"
  | "practice-already-mastered"
  | "practice-stamp-blocked"
  | "revealed";

export interface CoverSpellApplied {
  save: SaveData;
  outcome: CoverSpellOutcome;
  xpGained: number;
  /** Spelling to show after a saved wrong answer or 不会. Empty until then. */
  answer: string;
}

/**
 * 盖住拼 may be offered. none, advanced without a bright badge, skip-list
 * names, and the unprompted-spelling exclusion all stay out. The old 拼写
 * button does not use the exclusion list; this does.
 */
export function coverSpellOffered(word: WordDef, badgeLit: boolean): boolean {
  return spellingAllowed(word, badgeLit) && !excludedFromUnpromptedSpelling(word.id);
}

/** Chinese prompt. The target English is not included. */
export function coverSpellPrompt(word: WordDef): string {
  const face = maskedSpellingFace(word);
  const prompt = `听一听，拼出「${face}」。`;
  const folded = word.english.trim().toLowerCase();
  if (folded && prompt.toLowerCase().includes(folded)) return "听一听，拼出这个词。";
  return prompt;
}

export function coverSpellFeedback(applied: CoverSpellApplied): string {
  switch (applied.outcome) {
    case "mastered":
      return `拼对了。已掌握，经验 +${COVER_SPELL_XP}。`;
    case "practice-too-soon":
      return "拼对了。这次先练习，最早明天才能记成已掌握。";
    case "practice-revealed":
      return "拼对了。今天看过答案，这次只练习。";
    case "practice-already-mastered":
      return "拼对了。这个词已经掌握了。";
    case "practice-stamp-blocked":
      return "拼对了。这次不记掌握，也不加经验。";
    case "revealed":
      return `答案是 ${applied.answer}。今天再练只算练习。`;
    default:
      return "这个词现在不能盖住拼。";
  }
}

function canonicalDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DAY_KEY.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return value;
}

/** A missing day is clear. A bad or future day stays closed so it cannot skip the gate. */
function revealBlocks(card: WordCardRecord, today: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(card, "coverSpellRevealDay")) return false;
  if (card.coverSpellRevealDay === undefined) return false;
  const day = canonicalDay(card.coverSpellRevealDay);
  if (!day || day > today) return true;
  return day === today;
}

function learnedBeforeToday(card: WordCardRecord, today: string, timeZone: string): boolean {
  if (typeof card.collectedAt !== "number" || !Number.isFinite(card.collectedAt)) return false;
  const learnDay = canonicalDay(localDayKey(new Date(card.collectedAt), timeZone));
  if (!learnDay) return false;
  return learnDay < today;
}

/** True only when no mastery stamp has ever been stored. A bad value does not count as empty. */
function stampClear(card: WordCardRecord): boolean {
  return !Object.prototype.hasOwnProperty.call(card, "spelledAloneAt") || card.spelledAloneAt === undefined;
}

function untouched(save: SaveData, outcome: CoverSpellOutcome, answer = ""): CoverSpellApplied {
  return { save, outcome, xpGained: 0, answer };
}

/**
 * One 盖住拼 attempt. Mastery and +30 are written together, or not at all.
 * This does not call noteIndependentSpelling, notePracticeAnswer, reviewWord, or learnWord.
 * `now` is the submit or reveal instant, not the moment the page opened.
 */
export function applyCoverSpell(
  save: SaveData,
  input: {
    wordId: string;
    typed?: string;
    giveUp?: boolean;
    now: Date;
    timeZone: string;
    badgeLit: boolean;
  },
): CoverSpellApplied {
  const word = wordById(input.wordId);
  const card = save.wordCards[input.wordId];
  if (!word || !card || card.wordId !== input.wordId || !gradeIsOpen(save, input.wordId) || !coverSpellOffered(word, input.badgeLit)) {
    return untouched(save, "unavailable");
  }
  const today = localDayKey(input.now, input.timeZone);
  if (!canonicalDay(today)) return untouched(save, "unavailable");
  const correct = input.giveUp !== true && checkSpelling(word.english, input.typed ?? "");
  if (!correct) {
    if (card.coverSpellRevealDay === today) return { save, outcome: "revealed", xpGained: 0, answer: word.english };
    return {
      save: {
        ...save,
        wordCards: {
          ...save.wordCards,
          [input.wordId]: { ...card, coverSpellRevealDay: today },
        },
      },
      outcome: "revealed",
      xpGained: 0,
      answer: word.english,
    };
  }
  if (!stampClear(card)) {
    return untouched(save, isMastered(card) ? "practice-already-mastered" : "practice-stamp-blocked");
  }
  if (revealBlocks(card, today)) return untouched(save, "practice-revealed");
  if (!learnedBeforeToday(card, today, input.timeZone)) return untouched(save, "practice-too-soon");
  if (!Number.isFinite(save.xp)) return untouched(save, "practice-stamp-blocked");
  return {
    save: {
      ...save,
      xp: save.xp + COVER_SPELL_XP,
      wordCards: {
        ...save.wordCards,
        [input.wordId]: { ...card, spelledAloneAt: input.now.getTime() },
      },
    },
    outcome: "mastered",
    xpGained: COVER_SPELL_XP,
    answer: "",
  };
}
