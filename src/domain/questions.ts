import { sampleWords, wordById, type WordDef } from "./catalog";
import { hashSeed, shuffle } from "./rng";

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
}

/** Same theme and same grade first, then the rest of the theme, then anything else. */
export function pickDistractors(word: WordDef, count: number, seed: number, pool: readonly WordDef[] = sampleWords()): WordDef[] {
  const others = pool.filter((item) => item.id !== word.id);
  const sameGrade = others.filter((item) => item.theme === word.theme && item.gradeEst === word.gradeEst);
  const sameTheme = others.filter((item) => item.theme === word.theme && item.gradeEst !== word.gradeEst);
  const elsewhere = others.filter((item) => item.theme !== word.theme);
  return [...shuffle(sameGrade, seed), ...shuffle(sameTheme, seed + 3), ...shuffle(elsewhere, seed + 9)].slice(0, count);
}

export function quizForWord(
  wordId: string,
  seed: number,
  direction: "zh-to-en" | "en-to-zh" | "listen-to-zh" = "zh-to-en",
): QuizQuestion {
  const word = wordById(wordId);
  if (!word) throw new Error(`Unknown word ${wordId}`);
  const distractors = pickDistractors(word, 2, seed || hashSeed(word.id));
  const choices = shuffle([word, ...distractors], (seed || 1) + 17).map((item) => ({
    id: item.id,
    label: direction === "zh-to-en" ? item.english : item.chinese,
  }));
  const listening = direction === "listen-to-zh";
  return {
    wordId: word.id,
    kind: listening ? "listening" : "meaning",
    prompt: listening ? "听一听，选出意思。" : direction === "zh-to-en" ? `「${word.chinese}」用英语怎么说？` : `${word.english} 是什么意思？`,
    hint: word.chinese,
    choices,
    answerId: word.id,
    direction,
    speakText: listening ? word.english : undefined,
  };
}

export function listeningQuestion(wordId: string, seed: number): QuizQuestion {
  return quizForWord(wordId, seed, "listen-to-zh");
}

/** Basic spelling is available immediately, including grade 3. Advanced waits for a mastery badge. None is never asked. */
export function spellingAllowed(word: WordDef, mastered: boolean): boolean {
  if (word.spelling === "none") return false;
  if (word.spelling === "basic") return true;
  return mastered;
}

export function spellingQuestion(wordId: string, mastered: boolean): SpellingQuestion | null {
  const word = wordById(wordId);
  if (!word || !spellingAllowed(word, mastered)) return null;
  return {
    kind: "spelling",
    wordId: word.id,
    prompt: `用键盘拼出「${word.chinese}」。`,
    answer: word.english,
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
