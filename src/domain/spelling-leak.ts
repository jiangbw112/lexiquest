import { catalogWords, chapterExtraWords, formatMeaning, type WordDef } from "./catalog";
import exclusionFile from "./chapters/spelling_exclusion_word_ids_v0.1.json";

/**
 * Shown in place of a Latin word that would give away the spelling.
 * Fullwidth tilde, the mark used in the masked question face.
 */
export const SPELLING_MASK = "～";

/** Bytes of the gameplay list. The file is not rewritten when the rule matches more words. */
export const SPELLING_EXCLUSION_SHA256 = "516cc9da9ac457e400b71530ec77174179e13ad643311dfa84423e866c7fb311";

/** A Latin word, including an internal hyphen or apostrophe. Digits stay out. */
const LATIN_WORD = /[A-Za-z]+(?:[-'][A-Za-z]+)*/g;

/** Longer suffixes first so -es is not peeled as -s. */
const SUFFIXES = ["ing", "es", "ed", "s", "d"] as const;

export type ExclusionSource = "rule" | "list" | "both";

export interface ExcludedSpellingWord {
  id: string;
  source: ExclusionSource;
}

interface ExclusionFile {
  wordIds: readonly string[];
}

const listedIds = (exclusionFile as ExclusionFile).wordIds;

/** Word ids from the gameplay list, in file order. */
export function listedSpellingExclusionIds(): readonly string[] {
  return listedIds;
}

function playableWords(): WordDef[] {
  return [...catalogWords(), ...chapterExtraWords()];
}

function latinWords(text: string): string[] {
  return text.match(LATIN_WORD) ?? [];
}

/** Stem keys after one suffix step. A stem shorter than 3 letters is dropped. */
function stemKeys(token: string): Set<string> {
  const keys = new Set<string>();
  const pieces = new Set<string>();
  const folded = token.toLowerCase();
  pieces.add(folded.replace(/[-'\s]+/g, ""));
  for (const part of folded.split(/[-'\s]+/)) {
    if (part.length >= 2) pieces.add(part);
  }
  for (const word of pieces) {
    if (word.length < 2) continue;
    keys.add(word);
    for (const suffix of SUFFIXES) {
      if (!word.endsWith(suffix)) continue;
      const stem = word.slice(0, -suffix.length);
      if (stem.length < 3) continue;
      keys.add(stem);
      if ((suffix === "ing" || suffix === "ed") && /[aeiou]([bcdfghjklmnpqrstvwxyz])\1$/.test(stem)) {
        const undoubled = stem.slice(0, -1);
        if (undoubled.length >= 3) keys.add(undoubled);
      }
    }
  }
  return keys;
}

/**
 * True when `token` is the answer, a piece of a hyphenated or spaced answer,
 * or either side is the other with -ing, -es, -ed, -s, or -d removed.
 * bought/buy and drank/drink do not match; those stay on the gameplay list.
 */
export function sharesStem(answer: string, token: string): boolean {
  const left = answer.toLowerCase();
  const right = token.toLowerCase();
  if (left === right) return true;
  const parts = left.split(/[-'\s]+/).filter((part) => part.length >= 2);
  if (parts.includes(right)) return true;
  const fromAnswer = stemKeys(left);
  for (const key of stemKeys(right)) {
    if (key.length >= 3 && fromAnswer.has(key)) return true;
  }
  return false;
}

/** The spelling question face: part of speech, then the Chinese gloss. */
function spellingFace(word: { chinese: string; pos?: string | null }): string {
  return formatMeaning(word);
}

/**
 * The gloss or the spelling face contains a Latin word with the same stem as the answer.
 * Recognition prompts are not scanned. An English-to-Chinese prompt shows the answer on purpose.
 */
export function promptLeaksAnswer(word: Pick<WordDef, "english" | "chinese" | "pos">): boolean {
  const text = `${word.chinese}\n${spellingFace(word)}`;
  return latinWords(text).some((token) => sharesStem(word.english, token));
}

/** Replace same-stem Latin words. Other letters, including a part-of-speech mark, stay. */
export function maskSpellingFace(face: string, answer: string): string {
  return face.replace(LATIN_WORD, (token) => (sharesStem(answer, token) ? SPELLING_MASK : token));
}

/** Mask the face that spelling questions interpolate into the prompt. */
export function maskedSpellingFace(word: Pick<WordDef, "english" | "chinese" | "pos">): string {
  return maskSpellingFace(spellingFace(word), word.english);
}

let ruledCache: Set<string> | null = null;

function ruledIds(): Set<string> {
  if (ruledCache) return ruledCache;
  ruledCache = new Set(playableWords().filter((word) => promptLeaksAnswer(word)).map((word) => word.id));
  return ruledCache;
}

/** Rule hits and the gameplay list, together. Battle spelling reads this. */
export function excludedFromUnpromptedSpelling(wordId: string): boolean {
  return listedIds.includes(wordId) || ruledIds().has(wordId);
}

/** Every excluded id, sorted, with whether the rule, the list, or both named it. */
export function excludedSpellingWords(): ExcludedSpellingWord[] {
  const listed = new Set(listedIds);
  const ruled = ruledIds();
  return [...new Set([...listed, ...ruled])].sort().map((id) => ({
    id,
    source: listed.has(id) && ruled.has(id) ? "both" : listed.has(id) ? "list" : "rule",
  }));
}

/**
 * English on a review row. An open spelling panel hides every row's English word,
 * so the list behind the panel cannot be read as the answer.
 */
export function reviewDeskEnglish(english: string, spellingPanelOpen: boolean): string {
  return spellingPanelOpen ? "" : english;
}

/**
 * Gloss on a review row. An open spelling panel hides every Latin word, including
 * stems that are not the answer and single letters such as the T in T恤.
 */
export function reviewDeskMeaning(meaning: string, spellingPanelOpen: boolean): string {
  if (!spellingPanelOpen) return meaning;
  return meaning.replace(LATIN_WORD, SPELLING_MASK);
}
