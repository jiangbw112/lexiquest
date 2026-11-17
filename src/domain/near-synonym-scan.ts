import { DEFAULT_APPEARANCE } from "./appearance";
import { CATALOG_WORDS, chapterExtraWords, wordById, type WordDef } from "./catalog";
import { battleWordIds, gradeChapters, unlockedWordIds, visibleChapters } from "./chapter-plan";
import glossFile from "./chapters/gloss_overlap_pairs_v0.2.json";
import { FOREST_CHAPTER_ID } from "./clearance";
import { createSave } from "./progress";
import type { GradeBand, SaveData } from "./types";

/**
 * Finds near-synonym pairs in the 871-word book and counts the ordinary battle
 * multiple-choice questions where one word is the answer and the other can be
 * a distractor. The rules below are the whole definition; the near_synonym
 * list is the pairs this scan says would make two answers.
 *
 * A question is one answer word in one chapter, one grade mix, fully open,
 * and one of the two meaning directions. Distractors follow quizForWord:
 * unlocked words of the answer's grade, then pickDistractors' order.
 * A partner counts when some shuffle can place it in the two distractor slots.
 */

const GRADES: GradeBand[] = ["G3", "G4", "G5", "G6"];
const PARTICLE = new Set(["的", "地", "得", "着"]);
/** One-character substitutions that keep the gloss as the same meaning. */
const SYNONYM_SWAPS: ReadonlyArray<readonly [string, string]> = [
  ["游", "行"],
  // 野/露 and 欢/爱. Code points keep those two glyphs out of the core font subset.
  [String.fromCodePoint(0x91ce), "露"],
  ["欢", String.fromCodePoint(0x7231)],
];
/** Inflections whose gloss is still the same idea when the Chinese is also one edit away. */
const NEAR_SUFFIXES = ["ing", "ied", "ed", "y"] as const;
const STEM_SUFFIXES = ["ing", "ied", "ies", "ed", "es", "est", "er", "ly", "y", "ful", "less", "ness", "ment", "s"] as const;
const IRREGULAR: ReadonlyArray<readonly [string, string]> = [
  ["buy", "bought"], ["drink", "drank"], ["fall", "fell"], ["feel", "felt"], ["fly", "flew"],
  ["get", "got"], ["go", "went"], ["grow", "grew"], ["have", "had"], ["keep", "kept"],
  ["know", "knew"], ["leave", "left"], ["make", "made"], ["meet", "met"], ["ride", "rode"],
  ["run", "ran"], ["say", "said"], ["see", "saw"], ["send", "sent"], ["sing", "sang"],
  ["sit", "sat"], ["sleep", "slept"], ["stand", "stood"], ["swim", "swam"], ["take", "took"],
  ["teach", "taught"], ["tell", "told"], ["think", "thought"], ["win", "won"], ["write", "wrote"],
  ["good", "better"], ["good", "best"], ["bad", "worse"], ["much", "more"], ["old", "older"],
  ["he", "him"], ["she", "her"], ["we", "us"], ["they", "them"], ["i", "me"],
];

interface GlossPair {
  a: string;
  b: string;
  rules?: string[];
}

interface GlossLists {
  exact: GlossPair[];
  overlap: GlossPair[];
  near_synonym: GlossPair[];
}

export interface CandidatePair {
  a: string;
  b: string;
  gradeA: string;
  gradeB: string;
  glossA: string;
  glossB: string;
  rules: string[];
  interchangeable: boolean;
  alreadyBlocked: boolean;
  /** Slots where the pair can be the answer and a distractor before the new blocks. */
  togetherBefore: number;
  /** Same slots that also count as two right answers. */
  doubleAnswerBefore: number;
  doubleAnswerAfter: number;
  g6OpenDoubleBefore: number;
  decision: "already-blocked" | "block" | "leave";
  reason: string;
}

export interface ChoiceFloor {
  choices: number;
  grades: string;
  chapterId: string;
  wordId: string;
  progress: "open" | "frontier";
}

export interface ScanReport {
  wordCount: number;
  /** Fully open grade mix × chapter × answer × two meaning directions. */
  totalQuestions: number;
  g6OpenQuestions: number;
  doubleAnswerBefore: number;
  doubleAnswerAfter: number;
  g6OpenDoubleBefore: number;
  g6OpenDoubleAfter: number;
  frontierDoubleBefore: number;
  frontierDoubleAfter: number;
  minChoicesBefore: ChoiceFloor;
  minChoicesAfter: ChoiceFloor;
  /** Lowest choice count among answers whose own grade is selected. */
  minSelectedChoicesBefore: ChoiceFloor;
  minSelectedChoicesAfter: ChoiceFloor;
  choicesDropped: number;
  candidates: CandidatePair[];
}

interface PairAcc {
  rules: Set<string>;
  interchangeable: boolean;
  alreadyBlocked: boolean;
  /** Block even when the full gloss is not a second right answer. */
  forced: boolean;
}

interface BattleContext {
  grades: string;
  chapterId: string;
  progress: "open" | "frontier";
  g6Open: boolean;
  answers: WordDef[];
  byGrade: Map<string, WordDef[]>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Same norm as gloss_overlap_pairs_v0.2.json. */
export function normGloss(text: string): string {
  return text
    .replace(/[ \t\u3000]+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/…/g, "")
    .replace(/\.\.\./g, "");
}

export function glossSenses(meaning: string): string[] {
  return meaning.split(/[；;，,]/).map(normGloss).filter((part) => part.length > 0);
}

function lists(): GlossLists {
  return glossFile as GlossLists;
}

/** Exact pairs and shared-sense pairs. The near list is not included. */
export function baselineBlocked(): Set<string> {
  const file = lists();
  const blocked = new Set<string>();
  for (const pair of file.exact) blocked.add(pairKey(pair.a, pair.b));
  for (const pair of file.overlap) {
    if (pair.rules?.includes("R1_shared_sense")) blocked.add(pairKey(pair.a, pair.b));
  }
  return blocked;
}

function nearBlocked(): Set<string> {
  const blocked = new Set<string>();
  for (const pair of lists().near_synonym) blocked.add(pairKey(pair.a, pair.b));
  return blocked;
}

function book(): WordDef[] {
  return [...CATALOG_WORDS, ...chapterExtraWords()];
}

function editDistance(left: string, right: string): number {
  if (Math.abs(left.length - right.length) > 2) return 9;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = 0; i < rows; i += 1) dp[i]![0] = i;
  for (let j = 0; j < cols; j += 1) dp[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[left.length]![right.length]!;
}

function sharesHan(left: readonly string[], right: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const sense of right) {
    for (const char of sense) {
      const code = char.codePointAt(0) ?? 0;
      if (code >= 0x4e00 && code <= 0x9fff) seen.add(char);
    }
  }
  for (const sense of left) {
    for (const char of sense) {
      if (seen.has(char)) return true;
    }
  }
  return false;
}

function mentionsEnglish(meaning: string, id: string): boolean {
  if (id.length < 3) return false;
  const lower = meaning.toLowerCase();
  const needle = id.toLowerCase();
  const letter = (char: string) => char >= "a" && char <= "z";
  let from = 0;
  while (from < lower.length) {
    const at = lower.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : lower[at - 1]!;
    const after = lower[at + needle.length] ?? "";
    if (!letter(before) && !letter(after)) return true;
    from = at + 1;
  }
  return false;
}

function stemCandidates(id: string, suffixes: readonly string[]): Array<{ stem: string; suffix: string }> {
  const found: Array<{ stem: string; suffix: string }> = [];
  const ordered = [...suffixes].sort((a, b) => b.length - a.length);
  for (const suffix of ordered) {
    if (!id.endsWith(suffix) || id.length <= suffix.length + 1) continue;
    const stem = id.slice(0, -suffix.length);
    const candidates = new Set<string>([stem]);
    if ((suffix === "ing" || suffix === "ed" || suffix === "er" || suffix === "est") && /(.)\1$/.test(stem)) {
      candidates.add(stem.slice(0, -1));
    }
    if (suffix === "ing" || suffix === "ed" || suffix === "er" || suffix === "est") candidates.add(`${stem}e`);
    if (suffix === "ied" || suffix === "ies") candidates.add(`${stem}y`);
    if (suffix === "es") candidates.add(`${stem}e`);
    for (const candidate of candidates) {
      if (candidate.length >= 2 && candidate !== id) found.push({ stem: candidate, suffix });
    }
    break;
  }
  return found;
}

function synonymSwap(left: string, right: string): boolean {
  if (left.length !== right.length || left.length < 2 || left === right) return false;
  let index = -1;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] === right[i]) continue;
    if (index !== -1) return false;
    index = i;
  }
  if (index < 0) return false;
  const a = left[index]!;
  const b = right[index]!;
  return SYNONYM_SWAPS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

function childCompound(left: string, right: string): boolean {
  if (left.length !== 2 || right.length !== 2) return false;
  return (left[0] === "小" && right[0] === left[1] && right[1] === "子")
    || (right[0] === "小" && left[0] === right[1] && left[1] === "子");
}

function particlePair(left: readonly string[], right: readonly string[]): boolean {
  for (const a of left) {
    for (const b of right) {
      const [long, short] = a.length >= b.length ? [a, b] : [b, a];
      if (long.length === short.length + 1 && long.startsWith(short) && PARTICLE.has(long[long.length - 1]!)) return true;
    }
  }
  return false;
}

function nearLemma(leftId: string, rightId: string, left: readonly string[], right: readonly string[]): string | null {
  const derived = leftId.length >= rightId.length
    ? stemCandidates(leftId, NEAR_SUFFIXES)
    : stemCandidates(rightId, NEAR_SUFFIXES);
  const stem = leftId.length >= rightId.length ? rightId : leftId;
  const hit = derived.find((item) => item.stem === stem);
  if (!hit) return null;
  for (const a of left) {
    for (const b of right) {
      if (a.length < 2 || b.length < 2) continue;
      if (editDistance(a, b) <= 1) return `same_root_${hit.suffix}`;
    }
  }
  return null;
}

/** Close pairs the review asked to block. They are not strict double answers. */
const REVIEW_BLOCK = new Set(["drank|drink", "finally|last", "outer space|space"]);

function addRule(map: Map<string, PairAcc>, a: string, b: string, rule: string, interchangeable: boolean): void {
  if (a === b) return;
  const key = pairKey(a, b);
  const acc = map.get(key) ?? { rules: new Set<string>(), interchangeable: false, alreadyBlocked: false, forced: false };
  acc.rules.add(rule);
  if (interchangeable) acc.interchangeable = true;
  if (REVIEW_BLOCK.has(key)) acc.forced = true;
  map.set(key, acc);
}

function collectPairs(words: readonly WordDef[], blocked: Set<string>): Map<string, PairAcc> {
  const map = new Map<string, PairAcc>();
  const file = lists();
  for (const pair of file.exact) addRule(map, pair.a, pair.b, "exact", true);
  for (const pair of file.overlap) {
    if (pair.rules?.includes("R1_shared_sense")) addRule(map, pair.a, pair.b, "R1_shared_sense", true);
    if (pair.rules?.includes("R2_contains") && !pair.rules?.includes("R1_shared_sense")) {
      addRule(map, pair.a, pair.b, "R2_contains", false);
    }
  }
  for (const key of blocked) {
    const acc = map.get(key);
    if (acc) acc.alreadyBlocked = true;
  }
  const byId = new Map(words.map((word) => [word.id, word]));
  for (let i = 0; i < words.length; i += 1) {
    const left = words[i]!;
    const leftSenses = glossSenses(left.chinese);
    for (let j = i + 1; j < words.length; j += 1) {
      const right = words[j]!;
      const rightSenses = glossSenses(right.chinese);
      const key = pairKey(left.id, right.id);
      if (leftSenses.some((sense) => rightSenses.includes(sense))) {
        if (!blocked.has(key)) addRule(map, left.id, right.id, "shared_sense_unlisted", true);
      }
      for (const a of leftSenses) {
        for (const b of rightSenses) {
          if (synonymSwap(a, b)) addRule(map, left.id, right.id, "synonym_swap", true);
          if (childCompound(a, b)) addRule(map, left.id, right.id, "child_compound", true);
        }
      }
      const lemma = nearLemma(left.id, right.id, leftSenses, rightSenses);
      if (lemma) addRule(map, left.id, right.id, lemma, true);
      if (particlePair(leftSenses, rightSenses)) addRule(map, left.id, right.id, "particle", false);
      if (mentionsEnglish(left.chinese, right.id) || mentionsEnglish(right.chinese, left.id)) {
        addRule(map, left.id, right.id, "mutual_gloss", false);
      }
    }
    for (const hit of stemCandidates(left.id, STEM_SUFFIXES)) {
      const other = byId.get(hit.stem);
      if (!other) continue;
      const otherSenses = glossSenses(other.chinese);
      if (!sharesHan(leftSenses, otherSenses) && !mentionsEnglish(left.chinese, other.id) && !mentionsEnglish(other.chinese, left.id)) {
        continue;
      }
      addRule(map, left.id, other.id, `stem_${hit.suffix}`, false);
    }
  }
  for (const [a, b] of IRREGULAR) {
    const left = byId.get(a);
    const right = byId.get(b);
    if (!left || !right) continue;
    const leftSenses = glossSenses(left.chinese);
    const rightSenses = glossSenses(right.chinese);
    if (!sharesHan(leftSenses, rightSenses) && !mentionsEnglish(left.chinese, right.id) && !mentionsEnglish(right.chinese, left.id)) {
      continue;
    }
    addRule(map, a, b, "irregular", false);
  }
  return map;
}

function gradeMixes(): GradeBand[][] {
  const mixes: GradeBand[][] = [];
  for (let mask = 1; mask < 2 ** GRADES.length; mask += 1) {
    mixes.push(GRADES.filter((_, index) => (mask & (2 ** index)) !== 0));
  }
  return mixes;
}

function stageWins(): Record<string, number> {
  return { "1": 1, "2": 1, "3": 1, "4": 1 };
}

function baseSave(grades: readonly GradeBand[]): SaveData {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: Date.UTC(2026, 2, 1),
    grades,
  });
}

/** Every chapter of the selected grades is cleared, then the child stands on one of them. */
function openSave(grades: readonly GradeBand[], chapterId: string): SaveData {
  const save = baseSave(grades);
  const chapterProgress: NonNullable<SaveData["chapterProgress"]> = {};
  for (const chapter of visibleChapters(grades)) {
    if (chapter.id === FOREST_CHAPTER_ID) continue;
    chapterProgress[chapter.id] = { cleared: true, stageWins: stageWins() };
  }
  return { ...save, chapterCleared: true, chapterProgress, currentChapterId: chapterId };
}

/** The progress that first unlocks this chapter. Later chapters of the same grade stay shut. */
function frontierSave(grades: readonly GradeBand[], chapterId: string, grade: GradeBand | "mixed"): SaveData {
  const save = baseSave(grades);
  if (grade === "mixed") return { ...save, currentChapterId: chapterId };
  const chapterProgress: NonNullable<SaveData["chapterProgress"]> = {};
  const current = gradeChapters(grade).find((chapter) => chapter.id === chapterId);
  for (const chapter of gradeChapters(grade)) {
    if (current && chapter.index < current.index) chapterProgress[chapter.id] = { cleared: true, stageWins: stageWins() };
  }
  return { ...save, chapterCleared: true, chapterProgress, currentChapterId: chapterId };
}

function groupGrades(words: readonly WordDef[]): Map<string, WordDef[]> {
  const grouped = new Map<string, WordDef[]>();
  for (const word of words) {
    const list = grouped.get(word.grade);
    if (list) list.push(word);
    else grouped.set(word.grade, [word]);
  }
  return grouped;
}

function standing(save: SaveData, chapterId: string): SaveData {
  return save.currentChapterId === chapterId ? save : { ...save, currentChapterId: chapterId };
}

function contextsFor(grades: readonly GradeBand[], progress: "open" | "frontier"): BattleContext[] {
  const label = grades.join("+");
  const chapters = visibleChapters(grades);
  if (progress === "open") {
    const save = openSave(grades, chapters[0]?.id ?? FOREST_CHAPTER_ID);
    const unlocked = unlockedWordIds(save).map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word));
    const byGrade = groupGrades(unlocked);
    return chapters.map((chapter) => ({
      grades: label,
      chapterId: chapter.id,
      progress,
      g6Open: label === "G6",
      answers: battleWordIds(standing(save, chapter.id)).map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word)),
      byGrade,
    }));
  }
  return chapters.map((chapter) => {
    const save = frontierSave(grades, chapter.id, chapter.grade);
    const unlocked = unlockedWordIds(save).map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word));
    return {
      grades: label,
      chapterId: chapter.id,
      progress,
      g6Open: false,
      answers: battleWordIds(save).map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word)),
      byGrade: groupGrades(unlocked),
    };
  });
}

/**
 * Words pickDistractors can place in the two slots.
 * The pool is already the answer's grade, matching quizForWord.
 */
function reachable(answer: WordDef, pool: readonly WordDef[], blocked: (a: string, b: string) => boolean): { words: WordDef[]; choices: number } {
  const others = pool.filter((item) => item.id !== answer.id && !blocked(answer.id, item.id));
  const sameGrade = others.filter((item) => item.theme === answer.theme && item.gradeEst === answer.gradeEst);
  const sameTheme = others.filter((item) => item.theme === answer.theme && item.gradeEst !== answer.gradeEst);
  const elsewhere = others.filter((item) => item.theme !== answer.theme);
  const words = sameGrade.length >= 2
    ? sameGrade
    : sameGrade.length + sameTheme.length >= 2
      ? [...sameGrade, ...sameTheme]
      : [...sameGrade, ...sameTheme, ...elsewhere];
  return { words, choices: 1 + Math.min(2, others.length) };
}

function reasonFor(acc: PairAcc, together: number, crossGrade: boolean): { decision: CandidatePair["decision"]; reason: string } {
  if (acc.alreadyBlocked) {
    return { decision: "already-blocked", reason: "Already an exact or shared-sense pair, so it was excluded before this change." };
  }
  if (acc.interchangeable && together > 0) {
    return { decision: "block", reason: "The glosses can stand in for each other, and a fully open grade mix can place one as the answer and the other as a distractor." };
  }
  if (acc.forced && together > 0) {
    return { decision: "block", reason: "The full gloss is not a second right answer, but the pair is close enough to block, and a fully open grade mix can place them on the same question." };
  }
  if (acc.interchangeable && crossGrade) {
    return { decision: "leave", reason: "The glosses are close, but the words are in different grades. Distractors stay in the answer's grade, so this is not a double answer." };
  }
  if (acc.interchangeable) {
    return { decision: "leave", reason: "The glosses are close, but the question rules never put them on the same question." };
  }
  const containsOnly = [...acc.rules].every((rule) => rule === "R2_contains" || rule === "particle");
  if (containsOnly && acc.rules.has("R2_contains")) {
    return {
      decision: "leave",
      reason: together > 0
        ? "One gloss only contains the other (R2). They can share a question, but the full gloss is not a second right answer."
        : "One gloss only contains the other (R2), and the question rules never put them on the same question.",
    };
  }
  if (together > 0) {
    return { decision: "leave", reason: "They look related and can share a question, but the full gloss is not a second right answer." };
  }
  return { decision: "leave", reason: "They look related, but the question rules never put them on the same question." };
}

function emptyFloor(): ChoiceFloor {
  return { choices: 99, grades: "", chapterId: "", wordId: "", progress: "open" };
}

let cachedReport: ScanReport | null = null;

export function scanNearSynonyms(): ScanReport {
  if (cachedReport) return cachedReport;
  const words = book();
  const before = baselineBlocked();
  const after = new Set<string>([...before, ...nearBlocked()]);
  const pairs = collectPairs(words, before);
  const byId = new Map(words.map((word) => [word.id, word]));
  const together = new Map<string, number>();
  const doubleBefore = new Map<string, number>();
  const doubleAfter = new Map<string, number>();
  const g6Before = new Map<string, number>();
  let totalQuestions = 0;
  let g6OpenQuestions = 0;
  let doubleAnswerBefore = 0;
  let doubleAnswerAfter = 0;
  let g6OpenDoubleBefore = 0;
  let g6OpenDoubleAfter = 0;
  let frontierDoubleBefore = 0;
  let frontierDoubleAfter = 0;
  let choicesDropped = 0;
  let minChoicesBefore = emptyFloor();
  let minChoicesAfter = emptyFloor();
  let minSelectedChoicesBefore = emptyFloor();
  let minSelectedChoicesAfter = emptyFloor();
  const interchangeable = new Set<string>();
  for (const [key, acc] of pairs) {
    if (acc.interchangeable && !acc.alreadyBlocked) interchangeable.add(key);
  }
  const blockOf = (set: Set<string>) => (a: string, b: string) => set.has(pairKey(a, b));
  const blockedBefore = blockOf(before);
  const blockedAfter = blockOf(after);
  const mixes = gradeMixes();
  const contexts = mixes.flatMap((grades) => [...contextsFor(grades, "open"), ...contextsFor(grades, "frontier")]);
  for (const context of contexts) {
    for (const answer of context.answers) {
      const pool = context.byGrade.get(answer.grade) ?? [];
      const earlier = reachable(answer, pool, blockedBefore);
      const later = reachable(answer, pool, blockedAfter);
      if (later.choices < earlier.choices) choicesDropped += 1;
      const floorBefore: ChoiceFloor = { choices: earlier.choices, grades: context.grades, chapterId: context.chapterId, wordId: answer.id, progress: context.progress };
      const floorAfter: ChoiceFloor = { choices: later.choices, grades: context.grades, chapterId: context.chapterId, wordId: answer.id, progress: context.progress };
      if (earlier.choices < minChoicesBefore.choices) minChoicesBefore = floorBefore;
      if (later.choices < minChoicesAfter.choices) minChoicesAfter = floorAfter;
      if (context.grades.split("+").includes(answer.grade)) {
        if (earlier.choices < minSelectedChoicesBefore.choices) minSelectedChoicesBefore = floorBefore;
        if (later.choices < minSelectedChoicesAfter.choices) minSelectedChoicesAfter = floorAfter;
      }
      const directions = context.progress === "open" ? 2 : 0;
      if (context.progress === "open") {
        totalQuestions += directions;
        if (context.g6Open) g6OpenQuestions += directions;
      }
      let slotBefore = false;
      let slotAfter = false;
      const seen = new Set<string>();
      for (const partner of earlier.words) {
        const key = pairKey(answer.id, partner.id);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!pairs.has(key)) continue;
        together.set(key, (together.get(key) ?? 0) + directions);
        if (!interchangeable.has(key)) continue;
        doubleBefore.set(key, (doubleBefore.get(key) ?? 0) + directions);
        if (context.g6Open) g6Before.set(key, (g6Before.get(key) ?? 0) + directions);
        slotBefore = true;
      }
      for (const partner of later.words) {
        const key = pairKey(answer.id, partner.id);
        if (!interchangeable.has(key)) continue;
        doubleAfter.set(key, (doubleAfter.get(key) ?? 0) + directions);
        slotAfter = true;
      }
      if (context.progress === "frontier") {
        if (slotBefore) frontierDoubleBefore += 2;
        if (slotAfter) frontierDoubleAfter += 2;
        continue;
      }
      if (slotBefore) doubleAnswerBefore += directions;
      if (slotAfter) doubleAnswerAfter += directions;
      if (context.g6Open && slotBefore) g6OpenDoubleBefore += directions;
      if (context.g6Open && slotAfter) g6OpenDoubleAfter += directions;
    }
  }
  const candidates: CandidatePair[] = [];
  for (const [key, acc] of pairs) {
    const [a, b] = key.split("|") as [string, string];
    const left = byId.get(a);
    const right = byId.get(b);
    if (!left || !right) continue;
    const hits = together.get(key) ?? 0;
    const decided = reasonFor(acc, hits, left.grade !== right.grade);
    candidates.push({
      a,
      b,
      gradeA: left.grade,
      gradeB: right.grade,
      glossA: left.chinese,
      glossB: right.chinese,
      rules: [...acc.rules].sort(),
      interchangeable: acc.interchangeable,
      alreadyBlocked: acc.alreadyBlocked,
      togetherBefore: hits,
      doubleAnswerBefore: acc.interchangeable && !acc.alreadyBlocked ? (doubleBefore.get(key) ?? 0) : 0,
      doubleAnswerAfter: acc.interchangeable && !acc.alreadyBlocked ? (doubleAfter.get(key) ?? 0) : 0,
      g6OpenDoubleBefore: g6Before.get(key) ?? 0,
      decision: decided.decision,
      reason: decided.reason,
    });
  }
  candidates.sort((left, right) => left.decision.localeCompare(right.decision) || left.a.localeCompare(right.a) || left.b.localeCompare(right.b));
  cachedReport = {
    wordCount: words.length,
    totalQuestions,
    g6OpenQuestions,
    doubleAnswerBefore,
    doubleAnswerAfter,
    g6OpenDoubleBefore,
    g6OpenDoubleAfter,
    frontierDoubleBefore,
    frontierDoubleAfter,
    minChoicesBefore,
    minChoicesAfter,
    minSelectedChoicesBefore,
    minSelectedChoicesAfter,
    choicesDropped,
    candidates,
  };
  return cachedReport;
}

export function pairsToBlock(report: ScanReport): Array<{ a: string; b: string }> {
  return report.candidates
    .filter((pair) => pair.decision === "block")
    .map((pair) => ({ a: pair.a, b: pair.b }));
}
