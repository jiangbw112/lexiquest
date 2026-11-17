/**
 * Exam questions. The pool is collected cards from the exam's chapters.
 * The word semester field is not read. The exclusion list blocks spelling only.
 */
import exclusionFile from "./chapters/spelling_exclusion_word_ids_v0.1.json";
import { isMastered } from "./cards";
import { wordById, type WordDef } from "./catalog";
import { gradeChapters, spellingSkipIds } from "./chapter-plan";
import { examById, type ExamDef } from "./exams";
import { deviceTimeZone, localDayKey } from "./local-day";
import { quizForWord, spellingAllowed, spellingQuestion, type QuizQuestion, type SpellingQuestion } from "./questions";
import { isDue } from "./review";
import { excludedFromUnpromptedSpelling, maskedSpellingFace } from "./spelling-leak";
import type { ExamPhaseRunRecord, SaveData } from "./types";

export const EXAM_NO_QUESTION = "当前没有可用题目，请返回学堂学习或稍后再试";

export function spellingExclusionIds(): readonly string[] {
  return exclusionFile.wordIds;
}

/** Same gate as battle composeQuestion: leak rule and the 20-word list. */
export function isSpellingExcluded(wordId: string): boolean {
  return excludedFromUnpromptedSpelling(wordId);
}

export interface ExamWord {
  id: string;
  mastered: boolean;
  learnedToday: boolean;
  due: boolean;
  canSpell: boolean;
  badgeLit: boolean;
}

export interface ExamAsk {
  count: number;
  lastIndex: number;
}

export interface ExamSession {
  asks: Record<string, ExamAsk>;
  nextIndex: number;
  fightQuestions: number;
  fightSpelling: number;
}

export interface ExamSchedule {
  words: ExamWord[];
  phaseQuestions: number;
  phaseSpelling: number;
  phaseWords: string[];
  committedQuestions: number;
  committedSpelling: number;
  sessionAsks: Record<string, ExamAsk>;
  sessionIndex: number;
  fightShare: number;
  fightSpellingMax: number;
  relief: boolean;
  phaseSpellingMax: number;
}

export function emptySession(): ExamSession {
  return { asks: {}, nextIndex: 0, fightQuestions: 0, fightSpelling: 0 };
}

export function examCardPool(save: SaveData, exam: ExamDef, now: Date, gradeOpen: (save: SaveData, wordId: string) => boolean, timeZone = deviceTimeZone()): ExamWord[] {
  const today = localDayKey(now, timeZone);
  const skip = spellingSkipIds();
  const ids = new Set<string>();
  for (const chapterId of exam.chapters) {
    const chapter = gradeChapters(exam.grade).find((item) => item.id === chapterId);
    for (const id of chapter?.wordIds ?? []) ids.add(id);
  }
  const words: ExamWord[] = [];
  for (const id of ids) {
    const card = save.wordCards[id];
    const word = wordById(id);
    if (!card || !word || !gradeOpen(save, id)) continue;
    const learnedToday = localDayKey(new Date(card.collectedAt), timeZone) === today;
    const memory = save.memory[id];
    const due = Boolean(memory && isDue(memory, now));
    const badgeLit = card.masteryBadge === true && !due;
    const canSpell = !learnedToday && !due && !isSpellingExcluded(id) && spellingAllowed(word, badgeLit, skip);
    words.push({
      id,
      mastered: isMastered(card),
      learnedToday,
      due,
      canSpell,
      badgeLit,
    });
  }
  words.sort((a, b) => a.id.localeCompare(b.id));
  return words;
}

export function scheduleForPhase(exam: ExamDef, session: ExamSession, losses: number, words: ExamWord[]): ExamSchedule {
  return {
    words,
    phaseQuestions: 0,
    phaseSpelling: 0,
    phaseWords: [],
    committedQuestions: session.fightQuestions,
    committedSpelling: session.fightSpelling,
    sessionAsks: Object.fromEntries(Object.entries(session.asks).map(([id, ask]) => [id, { ...ask }])),
    sessionIndex: session.nextIndex,
    fightShare: exam.kind === "mid" ? 0.4 : 0.5,
    fightSpellingMax: exam.kind === "mid" ? 8 : 12,
    relief: losses >= 3,
    phaseSpellingMax: 4,
  };
}

export function sessionFromSchedule(schedule: ExamSchedule, countThisAttempt: boolean): ExamSession {
  return {
    asks: schedule.sessionAsks,
    nextIndex: schedule.sessionIndex,
    fightQuestions: schedule.committedQuestions + (countThisAttempt ? schedule.phaseQuestions : 0),
    fightSpelling: schedule.committedSpelling + (countThisAttempt ? schedule.phaseSpelling : 0),
  };
}

function fresh(word: ExamWord, schedule: ExamSchedule): boolean {
  if (schedule.phaseWords.includes(word.id)) return false;
  const ask = schedule.sessionAsks[word.id];
  if (!ask || ask.count <= 0) return true;
  if (ask.count >= 2) return false;
  return schedule.sessionIndex - ask.lastIndex >= 4;
}

function spellingRoom(schedule: ExamSchedule): boolean {
  if (schedule.phaseQuestions <= 0) return false;
  if (schedule.phaseSpelling >= schedule.phaseSpellingMax) return false;
  const fightSpelling = schedule.committedSpelling + schedule.phaseSpelling;
  const fightQuestions = schedule.committedQuestions + schedule.phaseQuestions;
  if (fightSpelling >= schedule.fightSpellingMax) return false;
  const fightShare = (fightSpelling + 1) / (fightQuestions + 1);
  if (fightShare > schedule.fightShare + 1e-9) return false;
  if (schedule.relief) {
    const phaseShare = (schedule.phaseSpelling + 1) / (schedule.phaseQuestions + 1);
    if (phaseShare > 0.3 + 1e-9) return false;
  }
  return true;
}

function pickId(words: readonly ExamWord[], seed: number): ExamWord | undefined {
  if (words.length === 0) return undefined;
  const index = Math.abs(seed) % words.length;
  return words[index];
}

export function pickExamQuestion(schedule: ExamSchedule, seed: number): QuizQuestion | SpellingQuestion | null {
  const pool = schedule.words;
  if (pool.length === 0) return null;
  const open = pool.filter((word) => fresh(word, schedule));
  const source = open.length > 0 ? open : pool;
  const repeat = open.length === 0;
  const defs = pool.map((word) => wordById(word.id)).filter((word): word is WordDef => Boolean(word));
  if (spellingRoom(schedule) && !repeat) {
    const spellable = source.filter((word) => word.canSpell && !word.mastered && !excludedFromUnpromptedSpelling(word.id));
    const practice = source.filter((word) => word.canSpell && word.mastered && !excludedFromUnpromptedSpelling(word.id));
    const chosen = pickId(spellable, seed) ?? (source.some((word) => word.due || !word.mastered) ? undefined : pickId(practice, seed + 1));
    if (chosen) {
      const spelling = spellingQuestion(chosen.id, chosen.badgeLit, spellingSkipIds());
      if (spelling) return spelling;
    }
  }
  const due = source.filter((word) => word.due);
  const learning = source.filter((word) => !word.mastered && !word.due);
  const rest = source.filter((word) => word.mastered && !word.due);
  const choice = pickId(due, seed) ?? pickId(learning, seed + 3) ?? pickId(rest, seed + 5) ?? source[0];
  if (!choice) return null;
  const direction = schedule.sessionIndex % 2 === 0 ? "zh-to-en" : "en-to-zh";
  return presentExamMeaning(quizForWord(choice.id, seed + schedule.sessionIndex * 17, direction, defs));
}

/** Chinese on an exam card uses the spelling-face mask. The part of speech stays. */
function presentExamMeaning(question: QuizQuestion): QuizQuestion {
  const word = wordById(question.wordId);
  if (!word) return question;
  if (question.direction === "zh-to-en") {
    const face = maskedSpellingFace(word);
    return { ...question, prompt: `「${face}」用英语怎么说？`, hint: face };
  }
  if (question.direction === "en-to-zh") {
    return {
      ...question,
      hint: maskedSpellingFace(word),
      choices: question.choices.map((choice) => {
        const item = wordById(choice.id);
        return item ? { ...choice, label: maskedSpellingFace(item) } : choice;
      }),
    };
  }
  return question;
}

export function noteExamAsk(schedule: ExamSchedule, wordId: string, spelling: boolean): ExamSchedule {
  const raw = schedule.sessionAsks[wordId];
  const prev = raw && Number.isInteger(raw.count) && Number.isInteger(raw.lastIndex) ? raw : { count: 0, lastIndex: -99 };
  const sessionIndex = Number.isInteger(schedule.sessionIndex) ? schedule.sessionIndex : 0;
  return {
    ...schedule,
    phaseQuestions: schedule.phaseQuestions + 1,
    phaseSpelling: schedule.phaseSpelling + (spelling ? 1 : 0),
    phaseWords: schedule.phaseWords.includes(wordId) ? schedule.phaseWords : [...schedule.phaseWords, wordId],
    sessionIndex: sessionIndex + 1,
    sessionAsks: {
      ...schedule.sessionAsks,
      [wordId]: { count: prev.count + 1, lastIndex: sessionIndex },
    },
  };
}

export function examAnswerSpelling(wordId: string, spelling: boolean): boolean {
  return spelling && !isSpellingExcluded(wordId);
}

export function lossesForPhase(save: SaveData, examId: string, phaseNo: number): number {
  const count = save.examProgress?.[examId]?.phaseLosses?.[String(phaseNo)];
  return typeof count === "number" && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function keptAsk(value: unknown): ExamAsk | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ask = value as { count?: unknown; lastIndex?: unknown };
  const count = wholeNumber(ask.count);
  if (count === null || typeof ask.lastIndex !== "number" || !Number.isInteger(ask.lastIndex)) return null;
  return { count, lastIndex: ask.lastIndex };
}

export function storedSession(save: SaveData, examId: string, practice: boolean): ExamSession {
  if (practice) return emptySession();
  const session = save.examProgress?.[examId]?.session;
  if (!session?.asks || typeof session.asks !== "object" || Array.isArray(session.asks)) return emptySession();
  const nextIndex = wholeNumber(session.nextIndex);
  const fightQuestions = wholeNumber(session.fightQuestions);
  const fightSpelling = wholeNumber(session.fightSpelling);
  if (nextIndex === null || fightQuestions === null || fightSpelling === null) return emptySession();
  const asks: Record<string, ExamAsk> = {};
  for (const [id, ask] of Object.entries(session.asks)) {
    const kept = keptAsk(ask);
    if (kept) asks[id] = kept;
  }
  return { asks, nextIndex, fightQuestions, fightSpelling };
}

export function examDefOrNull(id: string): ExamDef | undefined {
  return examById(id);
}

export function phaseRunFromSchedule(
  schedule: ExamSchedule,
  input: { phaseNo: number; seed: number; casts: number; pending: ExamPhaseRunRecord["pending"] },
): ExamPhaseRunRecord {
  return {
    phaseNo: input.phaseNo,
    seed: input.seed,
    casts: input.casts,
    pending: input.pending ? { wordId: input.pending.wordId, kind: input.pending.kind } : null,
    phaseQuestions: schedule.phaseQuestions,
    phaseSpelling: schedule.phaseSpelling,
    phaseWords: [...schedule.phaseWords],
    committedQuestions: schedule.committedQuestions,
    committedSpelling: schedule.committedSpelling,
    asks: Object.fromEntries(Object.entries(schedule.sessionAsks).map(([id, ask]) => [id, { ...ask }])),
    nextIndex: schedule.sessionIndex,
    fightQuestions: schedule.committedQuestions,
    fightSpelling: schedule.committedSpelling,
    fightShare: schedule.fightShare,
    fightSpellingMax: schedule.fightSpellingMax,
    relief: schedule.relief,
    phaseSpellingMax: schedule.phaseSpellingMax,
  };
}

export function writePhaseRun(save: SaveData, examId: string, run: ExamPhaseRunRecord): SaveData {
  const prior = save.examProgress?.[examId];
  return {
    ...save,
    examProgress: {
      ...(save.examProgress ?? {}),
      [examId]: { ...(prior ?? {}), phaseRun: run },
    },
  };
}

/** A broken run is discarded. A run for another phase is ignored. */
export function readPhaseRun(save: SaveData, examId: string, phaseNo: number): ExamPhaseRunRecord | null {
  const raw = save.examProgress?.[examId]?.phaseRun;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (wholeNumber(raw.phaseNo) !== phaseNo || phaseNo < 1) return null;
  const seed = wholeNumber(raw.seed);
  const casts = wholeNumber(raw.casts);
  const phaseQuestions = wholeNumber(raw.phaseQuestions);
  const phaseSpelling = wholeNumber(raw.phaseSpelling);
  const committedQuestions = wholeNumber(raw.committedQuestions);
  const committedSpelling = wholeNumber(raw.committedSpelling);
  const nextIndex = wholeNumber(raw.nextIndex);
  const fightQuestions = wholeNumber(raw.fightQuestions);
  const fightSpelling = wholeNumber(raw.fightSpelling);
  const fightSpellingMax = wholeNumber(raw.fightSpellingMax);
  const phaseSpellingMax = wholeNumber(raw.phaseSpellingMax);
  const fightShare = typeof raw.fightShare === "number" && Number.isFinite(raw.fightShare) && raw.fightShare > 0 && raw.fightShare <= 1
    ? raw.fightShare
    : null;
  if (
    seed === null || casts === null || phaseQuestions === null || phaseSpelling === null
    || committedQuestions === null || committedSpelling === null || nextIndex === null
    || fightQuestions === null || fightSpelling === null || fightSpellingMax === null
    || phaseSpellingMax === null || fightShare === null || typeof raw.relief !== "boolean"
    || !Array.isArray(raw.phaseWords) || casts !== phaseQuestions || phaseSpelling > phaseQuestions
    || committedQuestions !== fightQuestions || committedSpelling !== fightSpelling
    || nextIndex < phaseQuestions
  ) return null;
  if (!raw.asks || typeof raw.asks !== "object" || Array.isArray(raw.asks)) return null;
  const asks: ExamPhaseRunRecord["asks"] = {};
  for (const [id, ask] of Object.entries(raw.asks)) {
    const kept = keptAsk(ask);
    if (kept) asks[id] = kept;
  }
  const phaseWords: string[] = [];
  for (const id of raw.phaseWords) {
    if (typeof id !== "string" || id.length < 1 || !asks[id]) return null;
    if (!phaseWords.includes(id)) phaseWords.push(id);
  }
  if (phaseWords.length > phaseQuestions) return null;
  let pending: ExamPhaseRunRecord["pending"] = null;
  if (raw.pending !== null && raw.pending !== undefined) {
    if (!raw.pending || typeof raw.pending !== "object" || Array.isArray(raw.pending)) return null;
    const wordId = raw.pending.wordId;
    const kind = raw.pending.kind;
    if (typeof wordId !== "string" || wordId.length < 1 || (kind !== "meaning" && kind !== "spelling")) return null;
    if (!phaseWords.includes(wordId) || phaseQuestions < 1) return null;
    pending = { wordId, kind };
  }
  return {
    phaseNo,
    seed,
    casts,
    pending,
    phaseQuestions,
    phaseSpelling,
    phaseWords,
    committedQuestions,
    committedSpelling,
    asks,
    nextIndex,
    fightQuestions,
    fightSpelling,
    fightShare,
    fightSpellingMax,
    relief: raw.relief,
    phaseSpellingMax,
  };
}

export function scheduleFromPhaseRun(run: ExamPhaseRunRecord, words: ExamWord[]): ExamSchedule {
  return {
    words,
    phaseQuestions: run.phaseQuestions,
    phaseSpelling: run.phaseSpelling,
    phaseWords: [...run.phaseWords],
    committedQuestions: run.fightQuestions,
    committedSpelling: run.fightSpelling,
    sessionAsks: Object.fromEntries(Object.entries(run.asks).map(([id, ask]) => [id, { ...ask }])),
    sessionIndex: run.nextIndex,
    fightShare: run.fightShare,
    fightSpellingMax: run.fightSpellingMax,
    relief: run.relief,
    phaseSpellingMax: run.phaseSpellingMax,
  };
}

/** The question on screen, rebuilt from the saved seed. A waiting attack has none. */
export function pendingExamQuestion(run: ExamPhaseRunRecord, words: ExamWord[]): QuizQuestion | SpellingQuestion | null {
  if (!run.pending || run.casts < 1) return null;
  const word = words.find((item) => item.id === run.pending?.wordId);
  const askedAt = run.nextIndex - 1;
  if (run.pending.kind === "spelling") {
    return spellingQuestion(run.pending.wordId, word?.badgeLit === true, spellingSkipIds());
  }
  const pickSeed = run.seed + (run.casts - 1) * 13;
  const direction = askedAt % 2 === 0 ? "zh-to-en" : "en-to-zh";
  const defs = words.map((item) => wordById(item.id)).filter((item): item is WordDef => Boolean(item));
  const pendingDef = wordById(run.pending.wordId);
  const pool = pendingDef && !defs.some((item) => item.id === pendingDef.id) ? [...defs, pendingDef] : defs;
  return presentExamMeaning(quizForWord(run.pending.wordId, pickSeed + askedAt * 17, direction, pool));
}
