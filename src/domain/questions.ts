import { allGradeChapters, glossPairBlocked, spellingSkipIds } from "./chapter-plan";
import { formatMeaning, sampleWords, wordById, type WordDef } from "./catalog";
import { hashSeed, shuffle } from "./rng";
import { maskedSpellingFace } from "./spelling-leak";

export interface QuizChoice {
  id: string;
  label: string;
}

export interface QuizQuestion {
  wordId: string;
  kind: "meaning" | "listening";
  prompt: string;
  hint: string;
  choices: QuizChoice[];
  answerId: string;
  direction: "zh-to-en" | "en-to-zh" | "listen-to-zh";
  /** English text for the speech interface. Listening questions always set this. */
  speakText?: string;
}

export interface SpellingQuestion {
  kind: "spelling";
  wordId: string;
  prompt: string;
  answer: string;
  /** Set when the answer contains a hyphen or an apostrophe. */
  hint: string | null;
}

/** Hyphens and apostrophes are compared exactly. Phrases only collapse whitespace. */
export function spellingMarkHint(answer: string): string | null {
  if (answer.includes("-") || answer.includes("'")) return "连字符和撇号要原样输入。";
  return null;
}

/** A meaning or listening question shows the answer plus two distractors. */
export const MEANING_DISTRACTOR_COUNT = 2;
export const MEANING_CHOICE_COUNT = MEANING_DISTRACTOR_COUNT + 1;

/**
 * Same theme and same grade first, then the rest of the theme, then anything else.
 * Exact gloss pairs and pairs that share a sense are left out, including across grades.
 * A pair whose only rule is that one gloss contains the other stays in the pool.
 */
export function pickDistractors(word: WordDef, count: number, seed: number, pool: readonly WordDef[] = sampleWords()): WordDef[] {
  const others = pool.filter((item) => item.id !== word.id && !glossPairBlocked(word.id, item.id));
  const sameGrade = others.filter((item) => item.theme === word.theme && item.gradeEst === word.gradeEst);
  const sameTheme = others.filter((item) => item.theme === word.theme && item.gradeEst !== word.gradeEst);
  const elsewhere = others.filter((item) => item.theme !== word.theme);
  return [...shuffle(sameGrade, seed), ...shuffle(sameTheme, seed + 3), ...shuffle(elsewhere, seed + 9)].slice(0, count);
}

let wordChapters: Map<string, string> | null = null;

function chapterKey(wordId: string): string | null {
  if (!wordChapters) {
    const map = new Map<string, string>();
    for (const word of sampleWords()) map.set(word.id, "forest");
    for (const chapter of allGradeChapters()) {
      for (const id of chapter.wordIds) map.set(id, chapter.id);
    }
    wordChapters = map;
  }
  return wordChapters.get(wordId) ?? null;
}

function englishKey(word: WordDef): string {
  return word.english.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Same English, same Chinese, or the same shown meaning. Gloss pairs are handled separately. */
function labelClash(a: WordDef, b: WordDef): boolean {
  return englishKey(a) === englishKey(b) || a.chinese.trim() === b.chinese.trim() || formatMeaning(a) === formatMeaning(b);
}

function optionBlocked(answer: WordDef, candidate: WordDef, chosen: readonly WordDef[]): boolean {
  for (const other of [answer, ...chosen]) {
    if (other.id === candidate.id) return true;
    if (glossPairBlocked(other.id, candidate.id)) return true;
    if (labelClash(other, candidate)) return true;
  }
  return false;
}

/**
 * Same-grade words already came first. This adds chapter words, then adjacent grades,
 * and stops at the prescribed count. Words already chosen stay in front.
 */
function fillShortDistractors(word: WordDef, chosen: readonly WordDef[], pool: readonly WordDef[], seed: number): WordDef[] {
  const next = [...chosen];
  const home = chapterKey(word.id);
  const tiers = [
    home ? pool.filter((item) => chapterKey(item.id) === home) : [],
    pool.filter((item) => Math.abs(item.gradeEst - word.gradeEst) === 1),
  ];
  for (let index = 0; index < tiers.length; index += 1) {
    if (next.length >= MEANING_DISTRACTOR_COUNT) break;
    const tier = tiers[index] ?? [];
    for (const item of shuffle(tier, seed + 3 + index * 6)) {
      if (next.length >= MEANING_DISTRACTOR_COUNT) break;
      if (optionBlocked(word, item, next)) continue;
      next.push(item);
    }
  }
  return next;
}

export function quizForWord(
  wordId: string,
  seed: number,
  direction: "zh-to-en" | "en-to-zh" | "listen-to-zh" = "zh-to-en",
  pool?: readonly WordDef[],
): QuizQuestion {
  const word = wordById(wordId);
  if (!word) throw new Error(`Unknown word ${wordId}`);
  const mixed = seed || hashSeed(word.id);
  const sameGrade = pool ? pool.filter((item) => item.grade === word.grade) : undefined;
  let distractors = sameGrade
    ? pickDistractors(word, MEANING_DISTRACTOR_COUNT, mixed, sameGrade)
    : pickDistractors(word, MEANING_DISTRACTOR_COUNT, mixed);
  if (pool && distractors.length < MEANING_DISTRACTOR_COUNT) {
    distractors = fillShortDistractors(word, distractors, pool, mixed);
  }
  const choices = shuffle([word, ...distractors], (seed || 1) + 17).map((item) => ({
    id: item.id,
    label: direction === "zh-to-en" ? item.english : formatMeaning(item),
  }));
  const listening = direction === "listen-to-zh";
  return {
    wordId: word.id,
    kind: listening ? "listening" : "meaning",
    prompt: listening ? "听一听，选出意思。" : direction === "zh-to-en" ? `「${formatMeaning(word)}」用英语怎么说？` : `${word.english} 是什么意思？`,
    hint: formatMeaning(word),
    choices,
    answerId: word.id,
    direction,
    speakText: listening ? word.english : undefined,
  };
}

export function listeningQuestion(wordId: string, seed: number, pool?: readonly WordDef[]): QuizQuestion {
  return quizForWord(wordId, seed, "listen-to-zh", pool);
}

/**
 * Basic spelling is available immediately, including grade 3.
 * Advanced spelling needs the badge to be lit: earned, not due, and not lapsed.
 * A grey badge is not enough. None is never asked.
 */
export function spellingAllowed(word: WordDef, badgeLit: boolean, skip: readonly string[] = spellingSkipIds()): boolean {
  if (skip.includes(word.id)) return false;
  if (word.spelling === "none") return false;
  if (word.spelling === "basic") return true;
  return badgeLit;
}

/**
 * Child-facing study-card line for the spelling field. The raw value is never returned.
 * basic is 「要会拼」. advanced is 「先认读」 until the mastery badge is lit.
 * After that badge is lit, this file only says the word may be asked. It does not
 * name a line for the card, so the line is left off. none and any other value are left off.
 */
export function spellingChildLabel(spelling: string, badgeLit: boolean): string | null {
  if (spelling === "basic") return "要会拼";
  if (spelling === "advanced" && !badgeLit) return "先认读";
  return null;
}

export function spellingQuestion(wordId: string, badgeLit: boolean, skip?: readonly string[]): SpellingQuestion | null {
  const word = wordById(wordId);
  if (!word || !spellingAllowed(word, badgeLit, skip)) return null;
  return {
    kind: "spelling",
    wordId: word.id,
    prompt: `用键盘拼出「${maskedSpellingFace(word)}」。`,
    answer: word.english,
    hint: spellingMarkHint(word.english),
  };
}

export function normalizeSpelling(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function checkSpelling(expected: string, typed: string): boolean {
  return normalizeSpelling(typed) === normalizeSpelling(expected);
}

export function nextBattleQuestion(
  learnedIds: readonly string[],
  turn: number,
  seed: number,
  allowedIds?: readonly string[],
): QuizQuestion {
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const learned = learnedIds
    .filter((id) => !allowed || allowed.has(id))
    .map((id) => wordById(id))
    .filter((word): word is WordDef => Boolean(word));
  if (learned.length === 0) throw new Error("Battle questions need at least one learned word");
  const word = learned[turn % learned.length] as WordDef;
  const direction = turn % 2 === 0 ? "zh-to-en" : "en-to-zh";
  return quizForWord(word.id, seed + turn * 17, direction);
}
