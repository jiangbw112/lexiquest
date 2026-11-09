import { Rating, type Grade } from "ts-fsrs";
import { GRADE_BANDS, normalizeGrades, wordById, wordsForGrades } from "./catalog";
import { PROPOSALS } from "./proposals";
import { badgeTone, isDue, type BadgeTone } from "./review";
import type {
  DailyGoal,
  DailyStat,
  DueAnswerLog,
  DueRating,
  GoalMode,
  GoalPreset,
  MemoryTrack,
  SaveData,
} from "./types";

const EMPTY_STAT: DailyStat = {
  learnedWordIds: [],
  reviewedDueWordIds: [],
  badgeFirstOnWordIds: [],
  badgeRestoredWordIds: [],
};

function shiftDay(dayKey: string, delta: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + delta));
  return shifted.toISOString().slice(0, 10);
}

function zonedPart(now: Date, timeZone: string, type: "year" | "month" | "day" | "hour"): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  return formatted.formatToParts(now).find((part) => part.type === type)?.value ?? "";
}

/** The device zone. Tests pass an explicit zone instead of changing the machine. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Study day in `timeZone`: the local calendar date, rolling at the confirmed 04:00 wall clock. */
export function studyDayKey(now: Date, timeZone = deviceTimeZone()): string {
  const hour = Number(zonedPart(now, timeZone, "hour"));
  const day = `${zonedPart(now, timeZone, "year")}-${zonedPart(now, timeZone, "month")}-${zonedPart(now, timeZone, "day")}`;
  if (Number.isNaN(hour) || hour >= PROPOSALS.dailyGoal.dayBoundaryHour) return day;
  return shiftDay(day, -1);
}

function keysEnding(dayKey: string, count: number): string[] {
  const keys: string[] = [];
  let cursor = dayKey;
  for (let i = 0; i < count; i += 1) {
    keys.push(cursor);
    cursor = shiftDay(cursor, -1);
  }
  return keys;
}

export function recentDayKeys(now: Date, count: number, timeZone = deviceTimeZone()): string[] {
  return keysEnding(studyDayKey(now, timeZone), count);
}

function normalizePreset(value: unknown): GoalPreset {
  if (value === "easy" || value === "light") return "easy";
  if (value === "more") return "more";
  return "normal";
}

function normalizeStat(value: DailyStat | undefined): DailyStat {
  if (!value) return EMPTY_STAT;
  const legacy = value as DailyStat & { badgeOnGainedWordIds?: string[] };
  return {
    learnedWordIds: value.learnedWordIds ?? [],
    reviewedDueWordIds: value.reviewedDueWordIds ?? [],
    badgeFirstOnWordIds: value.badgeFirstOnWordIds ?? legacy.badgeOnGainedWordIds ?? [],
    badgeRestoredWordIds: value.badgeRestoredWordIds ?? [],
  };
}

function normalizeGoal(value: DailyGoal | null | undefined): DailyGoal | null {
  if (!value || typeof value.dayKey !== "string") return null;
  const legacy = value as DailyGoal & { target?: number; progress?: number; practiceCount?: number };
  const rawMode = (value as { mode?: string }).mode;
  const mode: GoalMode =
    rawMode === "learn" || rawMode === "learn_fallback"
      ? "learn_fallback"
      : rawMode === "practice" || rawMode === "practice_fallback"
        ? "practice_fallback"
        : "review";
  const active = legacy.target ?? 0;
  return {
    dayKey: value.dayKey,
    snapshotDue: value.snapshotDue ?? 0,
    mode,
    targetReview: value.targetReview ?? (mode === "review" ? active : 0),
    targetLearn: value.targetLearn ?? (mode === "learn_fallback" ? active : 0),
    targetPractice: value.targetPractice ?? (mode === "practice_fallback" ? active : PROPOSALS.dailyGoal.practiceQuestions),
    progressReview: value.progressReview ?? (mode === "review" ? (legacy.progress ?? 0) : 0),
    progressLearn: value.progressLearn ?? (mode === "learn_fallback" ? (legacy.progress ?? 0) : 0),
    progressPractice: value.progressPractice ?? legacy.practiceCount ?? (mode === "practice_fallback" ? (legacy.progress ?? 0) : 0),
    completed: value.completed === true,
    rewardClaimed: value.rewardClaimed === true,
  };
}

export function withParentDefaults(save: SaveData): SaveData {
  const stats: Record<string, DailyStat> = {};
  for (const [key, value] of Object.entries(save.dailyStats ?? {})) stats[key] = normalizeStat(value);
  const calendar: Record<string, "completed" | "missed"> = {};
  for (const [key, value] of Object.entries(save.goalCalendar ?? {})) {
    if (value === "completed" || value === "missed") calendar[key] = value;
  }
  const next: SaveData & { parentPin?: unknown } = {
    ...save,
    spellingMemory: save.spellingMemory ?? {},
    dailyStats: stats,
    dueAnswers: Array.isArray(save.dueAnswers) ? save.dueAnswers : [],
    parentGoalPreset: normalizePreset(save.parentGoalPreset),
    dailyGoal: normalizeGoal(save.dailyGoal),
    goalDaysTotal: typeof save.goalDaysTotal === "number" ? save.goalDaysTotal : 0,
    lastGoalCompletedDayKey: save.lastGoalCompletedDayKey ?? null,
    goalCalendar: calendar,
    cosmeticTokens: typeof save.cosmeticTokens === "number" ? save.cosmeticTokens : 0,
    lastTimezone: typeof save.lastTimezone === "string" ? save.lastTimezone : null,
    clockAnomaly: save.clockAnomaly === true,
  };
  delete next.parentPin;
  return next;
}

function statFor(save: SaveData, dayKey: string): DailyStat {
  return save.dailyStats[dayKey] ?? EMPTY_STAT;
}

function writeStat(save: SaveData, dayKey: string, stat: DailyStat): SaveData {
  return { ...save, dailyStats: { ...save.dailyStats, [dayKey]: stat } };
}

export function dueWordIds(save: SaveData, now: Date): string[] {
  const ids = new Set<string>();
  for (const [wordId, memory] of Object.entries(save.memory)) {
    if (save.wordCards[wordId] && isDue(memory, now)) ids.add(wordId);
  }
  for (const [wordId, memory] of Object.entries(save.spellingMemory)) {
    if (save.wordCards[wordId] && isDue(memory, now)) ids.add(wordId);
  }
  return [...ids];
}

function newWordsRemain(save: SaveData): boolean {
  return wordsForGrades(save.selectedGrades).some((word) => !save.wordCards[word.id]);
}

function goalMax(preset: GoalPreset): number {
  return PROPOSALS.dailyGoal.goalMax[preset];
}

export function goalTarget(goal: DailyGoal): number {
  if (goal.mode === "learn_fallback") return goal.targetLearn;
  if (goal.mode === "practice_fallback") return goal.targetPractice;
  return goal.targetReview;
}

export function goalProgress(goal: DailyGoal): number {
  if (goal.mode === "learn_fallback") return goal.progressLearn;
  if (goal.mode === "practice_fallback") return goal.progressPractice;
  return goal.progressReview;
}

export function planDailyGoal(save: SaveData, now: Date, timeZone = deviceTimeZone()): DailyGoal {
  const due = dueWordIds(save, now).length;
  const preset = save.parentGoalPreset;
  const mode: GoalMode = due >= 1 ? "review" : newWordsRemain(save) ? "learn_fallback" : "practice_fallback";
  return {
    dayKey: studyDayKey(now, timeZone),
    snapshotDue: due,
    mode,
    targetReview: due >= 1 ? Math.min(due, goalMax(preset)) : 0,
    targetLearn: due >= 1 ? 0 : PROPOSALS.dailyGoal.learnFallback[preset],
    targetPractice: PROPOSALS.dailyGoal.practiceQuestions,
    progressReview: 0,
    progressLearn: 0,
    progressPractice: 0,
    completed: false,
    rewardClaimed: false,
  };
}

/**
 * Opens a study day once. A later due-count does not raise the target.
 * An earlier day key, from a clock or zone change, does not roll the goal or the tokens back.
 * A later day key starts a new snapshot and does not pay the days in between.
 */
export function ensureDailyGoal(save: SaveData, now: Date, timeZone = deviceTimeZone()): SaveData {
  const computed = studyDayKey(now, timeZone);
  const goal = save.dailyGoal;
  const base = { ...save, lastTimezone: timeZone };
  if (!goal) return { ...base, dailyGoal: planDailyGoal(base, now, timeZone), clockAnomaly: false };
  if (computed === goal.dayKey) return { ...base, clockAnomaly: false };
  if (computed < goal.dayKey) return { ...base, clockAnomaly: true };
  return { ...base, dailyGoal: planDailyGoal(base, now, timeZone), clockAnomaly: false };
}

function logicalDayKey(save: SaveData, now: Date, timeZone: string): string {
  const computed = studyDayKey(now, timeZone);
  if (save.dailyGoal && computed < save.dailyGoal.dayKey) return save.dailyGoal.dayKey;
  return computed;
}

function derivedProgress(save: SaveData, goal: DailyGoal): number {
  const stat = statFor(save, goal.dayKey);
  if (goal.mode === "review") return stat.reviewedDueWordIds.length;
  if (goal.mode === "learn_fallback") return stat.learnedWordIds.length;
  return goal.progressPractice;
}

function withProgress(goal: DailyGoal, progress: number): DailyGoal {
  if (goal.mode === "learn_fallback") return { ...goal, progressLearn: progress };
  if (goal.mode === "practice_fallback") return { ...goal, progressPractice: progress };
  return { ...goal, progressReview: progress };
}

function settleGoal(save: SaveData): SaveData {
  const goal = save.dailyGoal;
  if (!goal) return save;
  const progress = derivedProgress(save, goal);
  const reached = progress >= goalTarget(goal) && goalTarget(goal) > 0;
  const alreadyPaid = save.goalCalendar[goal.dayKey] === "completed" || save.lastGoalCompletedDayKey === goal.dayKey;
  let next = save;
  let settled = withProgress(goal, progress);
  settled = { ...settled, completed: goal.completed || reached || alreadyPaid, rewardClaimed: goal.rewardClaimed || alreadyPaid };
  if (reached && !settled.rewardClaimed) {
    settled = { ...settled, completed: true, rewardClaimed: true };
    next = {
      ...next,
      cosmeticTokens: next.cosmeticTokens + PROPOSALS.dailyGoal.cosmeticTokenReward,
      goalDaysTotal: next.goalDaysTotal + 1,
      lastGoalCompletedDayKey: goal.dayKey,
      goalCalendar: { ...next.goalCalendar, [goal.dayKey]: "completed" },
    };
  }
  return { ...next, dailyGoal: settled };
}

export function noteLearned(save: SaveData, wordId: string, now: Date, timeZone = deviceTimeZone()): SaveData {
  const ready = ensureDailyGoal(save, now, timeZone);
  const dayKey = logicalDayKey(ready, now, timeZone);
  const stat = statFor(ready, dayKey);
  if (stat.learnedWordIds.includes(wordId)) return ready;
  const next = writeStat(ready, dayKey, { ...stat, learnedWordIds: [...stat.learnedWordIds, wordId] });
  return settleGoal(next);
}

export function dueRatingFromGrade(rating: Grade): DueRating {
  if (rating === Rating.Again) return "again";
  if (rating === Rating.Hard) return "hard";
  if (rating === Rating.Easy) return "easy";
  return "good";
}

/**
 * Records one due first-answer. A same-day repeat, or any answer that was not due, is ignored.
 * Meaning and spelling can each log once per study day; the parent review count still rises by one word.
 */
export function noteDueAnswer(
  save: SaveData,
  input: {
    wordId: string;
    track: MemoryTrack;
    rating: DueRating;
    at: Date;
    dueFirst: boolean;
    beforeTone?: BadgeTone;
    timeZone?: string;
  },
): SaveData {
  if (!input.dueFirst) return save;
  const zone = input.timeZone ?? deviceTimeZone();
  const ready = ensureDailyGoal(save, input.at, zone);
  const dayKey = logicalDayKey(ready, input.at, zone);
  const already = ready.dueAnswers.some(
    (answer) => answer.wordId === input.wordId && answer.track === input.track && studyDayKey(new Date(answer.at), zone) === dayKey,
  );
  let next = ready;
  if (!already) {
    const answer: DueAnswerLog = {
      at: input.at.getTime(),
      wordId: input.wordId,
      track: input.track,
      rating: input.rating,
    };
    next = { ...next, dueAnswers: [...next.dueAnswers, answer] };
    const stat = statFor(next, dayKey);
    const reviewed = stat.reviewedDueWordIds.includes(input.wordId)
      ? stat.reviewedDueWordIds
      : [...stat.reviewedDueWordIds, input.wordId];
    const card = next.wordCards[input.wordId];
    const afterTone = badgeTone(card, next.memory[input.wordId], input.at);
    let first = stat.badgeFirstOnWordIds;
    let restored = stat.badgeRestoredWordIds;
    if (card && afterTone === "bright" && input.beforeTone !== "bright") {
      if (!card.badgeEverOn) {
        if (!first.includes(input.wordId)) first = [...first, input.wordId];
        next = {
          ...next,
          wordCards: {
            ...next.wordCards,
            [input.wordId]: { ...card, badgeEverOn: true, badgeLastChangedAt: input.at.getTime() },
          },
        };
      } else if (input.beforeTone === "grey" && !restored.includes(input.wordId)) {
        restored = [...restored, input.wordId];
        next = {
          ...next,
          wordCards: {
            ...next.wordCards,
            [input.wordId]: { ...card, badgeLastChangedAt: input.at.getTime() },
          },
        };
      }
    }
    next = writeStat(next, dayKey, { ...statFor(next, dayKey), reviewedDueWordIds: reviewed, badgeFirstOnWordIds: first, badgeRestoredWordIds: restored });
  }
  return settleGoal(next);
}

export function noteDueReview(
  save: SaveData,
  input: {
    wordId: string;
    rating: Grade;
    at: Date;
    dueFirst: boolean;
    beforeTone: BadgeTone;
    track: MemoryTrack;
    timeZone?: string;
  },
): SaveData {
  return noteDueAnswer(save, { ...input, rating: dueRatingFromGrade(input.rating) });
}

/**
 * One answered question on a learned word, counted only while today's goal is the practice fallback.
 * The count itself does not change FSRS, cards, or XP.
 */
export function notePracticeAnswer(save: SaveData, wordId: string, now: Date, timeZone = deviceTimeZone()): SaveData {
  if (!save.wordCards[wordId]) return save;
  const ready = ensureDailyGoal(save, now, timeZone);
  const goal = ready.dailyGoal;
  if (!goal || goal.mode !== "practice_fallback") return ready;
  const next = { ...ready, dailyGoal: { ...goal, progressPractice: goal.progressPractice + 1 } };
  return settleGoal(next);
}

export function setGoalPreset(save: SaveData, preset: GoalPreset): SaveData {
  if (save.parentGoalPreset === preset) return save;
  return { ...save, parentGoalPreset: preset };
}

export interface StruggleWord {
  wordId: string;
  english: string;
  meaning: string;
  againCount: number;
  lastAgainAt: number;
  hint: string;
}

function answersIn(save: SaveData, dayKeys: readonly string[], timeZone: string): DueAnswerLog[] {
  const allowed = new Set(dayKeys);
  return save.dueAnswers.filter((answer) => allowed.has(studyDayKey(new Date(answer.at), timeZone)));
}

export function struggleWords(
  save: SaveData,
  now: Date,
  limit: number = PROPOSALS.parentProgress.struggleListLimit,
  timeZone = deviceTimeZone(),
): StruggleWord[] {
  const windowKeys = recentDayKeys(now, PROPOSALS.parentProgress.struggleWindowDays, timeZone);
  const greyKeys = new Set(recentDayKeys(now, PROPOSALS.parentProgress.struggleGreyWindowDays, timeZone));
  const grouped = new Map<string, DueAnswerLog[]>();
  for (const answer of answersIn(save, windowKeys, timeZone)) {
    const list = grouped.get(answer.wordId) ?? [];
    list.push(answer);
    grouped.set(answer.wordId, list);
  }
  const found: StruggleWord[] = [];
  for (const [wordId, answers] of grouped) {
    const word = wordById(wordId);
    if (!word || !save.wordCards[wordId]) continue;
    const agains = answers.filter((answer) => answer.rating === "again");
    const rate = answers.length === 0 ? 0 : agains.length / answers.length;
    const byCount = agains.length >= PROPOSALS.parentProgress.struggleAgainCount;
    const byRate = answers.length >= PROPOSALS.parentProgress.struggleMinDueAnswers && rate >= PROPOSALS.parentProgress.struggleAgainRate;
    const recentAgain = agains.some((answer) => greyKeys.has(studyDayKey(new Date(answer.at), timeZone)));
    const grey = badgeTone(save.wordCards[wordId], save.memory[wordId], now) === "grey";
    const byGrey =
      grey &&
      agains.filter((answer) => greyKeys.has(studyDayKey(new Date(answer.at), timeZone))).length >=
        PROPOSALS.parentProgress.struggleGreyRecentAgain &&
      recentAgain;
    if (!byCount && !byRate && !byGrey) continue;
    const lastAgainAt = agains.reduce((latest, answer) => Math.max(latest, answer.at), 0);
    found.push({
      wordId,
      english: word.english,
      meaning: word.chinese,
      againCount: agains.length,
      lastAgainAt,
      hint: "最近几次复习容易混",
    });
  }
  found.sort((a, b) => b.againCount - a.againCount || b.lastAgainAt - a.lastAgainAt);
  return found.slice(0, limit);
}

export interface ParentWordRow {
  wordId: string;
  english: string;
  meaning: string;
  due: boolean;
  tracks: MemoryTrack[];
}

/** One row per word. Meaning and spelling dues do not become two rows. */
export function parentWordRows(save: SaveData, now: Date): ParentWordRow[] {
  return Object.keys(save.wordCards)
    .map((wordId) => {
      const word = wordById(wordId);
      if (!word) return null;
      const tracks: MemoryTrack[] = [];
      if (save.memory[wordId]) tracks.push("meaning");
      if (save.spellingMemory[wordId]) tracks.push("spelling");
      const due = dueWordIds(save, now).includes(wordId);
      return { wordId, english: word.english, meaning: word.chinese, due, tracks };
    })
    .filter((row): row is ParentWordRow => row !== null);
}

export interface ParentView {
  learnedToday: number;
  learned7d: number;
  reviewedToday: number;
  reviewed7d: number;
  masteredNow: number;
  masteredFirst7d: number;
  masteredRestored7d: number;
  dueNow: number;
  gradesLabel: string;
  goal: DailyGoal | null;
  goalDaysTotal: number;
  cosmeticTokens: number;
  struggle: StruggleWord[];
  struggleTotal: number;
  rows: ParentWordRow[];
  emptyLine: string | null;
  todayLine: string | null;
  goalLine: string;
  daysLine: string;
  weekLine: string;
  firstMasteredLine: string;
  restoredMasteredLine: string;
  masteredLine: string;
  clockNote: string | null;
  masteredNote: string;
  gradesLine: string;
  struggleLine: string;
  reminderLine: string;
}

function uniqueAcross(save: SaveData, dayKeys: readonly string[], field: keyof DailyStat): number {
  const ids = new Set<string>();
  for (const key of dayKeys) {
    for (const id of statFor(save, key)[field]) ids.add(id);
  }
  return ids.size;
}

function dayIndex(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

export function openingReminder(save: SaveData, now: Date, timeZone = deviceTimeZone()): string {
  const goal = save.dailyGoal;
  if (goal?.completed) return "今日目标已完成。想继续冒险或再复习都行。";
  const due = dueWordIds(save, now).length;
  const last = save.lastGoalCompletedDayKey;
  const today = logicalDayKey(save, now, timeZone);
  const gap = last ? dayIndex(today) - dayIndex(last) : null;
  if (gap !== null && gap >= PROPOSALS.dailyGoal.reminderLongDays) return "欢迎回来。我们从待复习开始，不着急一次做完。";
  if (gap !== null && gap >= 3 && gap <= PROPOSALS.dailyGoal.reminderMidDays) {
    return `单词卡都在，随时可以捡起来。今天待复习 ${due} 个。`;
  }
  if (due >= 1) return "有几个词在等你复习，做完今日目标就轻松啦。";
  if (Object.keys(save.wordCards).length === 0) return "还没有学习记录。和孩子一起从森林冒险的第一关开始吧。";
  return "今天没有到期的词，学几个新词也很棒。";
}

export function goalStatusLine(goal: DailyGoal | null): string {
  if (!goal) return "今日目标还没开始。";
  const progress = goalProgress(goal);
  const target = goalTarget(goal);
  if (goal.completed && goal.mode === "learn_fallback") return "今天的新词目标完成了，真棒。";
  if (goal.completed && goal.mode === "practice_fallback") return "今天的练习目标完成了，真棒。";
  if (goal.completed) return "今天的复习目标完成了，真棒。";
  if (goal.mode === "learn_fallback") return `今天没有到期复习，学 ${target} 个新词也算完成今日目标。已完成 ${progress} / ${target}`;
  if (goal.mode === "practice_fallback") return `暂时没有新词可学，做 ${target} 次练习也算完成今日目标。已完成 ${progress} / ${target}`;
  const extra = progress > target ? `多复习了 ${progress - target} 个。` : "";
  return `今日目标：已完成 ${progress} / ${target}${extra ? `。${extra}` : ""}`;
}

export function parentView(
  save: SaveData,
  now: Date,
  struggleLimit: number = PROPOSALS.parentProgress.struggleListLimit,
  timeZone = deviceTimeZone(),
): ParentView {
  const today = logicalDayKey(save, now, timeZone);
  const week = keysEnding(today, PROPOSALS.parentProgress.recentWindowDays);
  const todayStat = statFor(save, today);
  const learnedToday = todayStat.learnedWordIds.length;
  const reviewedToday = todayStat.reviewedDueWordIds.length;
  const dueNow = dueWordIds(save, now).length;
  const cards = Object.keys(save.wordCards);
  const masteredNow = cards.filter((id) => badgeTone(save.wordCards[id], save.memory[id], now) === "bright").length;
  const gradesLabel = normalizeGrades(save.selectedGrades)
    .map((id) => GRADE_BANDS.find((band) => band.id === id)?.label ?? id)
    .join("、");
  const allStruggle = struggleWords(save, now, Number.MAX_SAFE_INTEGER, timeZone);
  const struggle = allStruggle.slice(0, struggleLimit);
  let emptyLine: string | null = null;
  let todayLine: string | null = null;
  if (cards.length === 0) emptyLine = "还没有学习记录。和孩子一起从森林冒险的第一关开始吧。";
  else if (learnedToday === 0 && reviewedToday === 0) {
    todayLine = dueNow === 0 ? "今天没有到期的词，学几个新词也很棒。" : `今天还没开始。待复习有 ${dueNow} 个，有空打开复习就好。`;
  } else if (uniqueAcross(save, week, "learnedWordIds") === 0 && uniqueAcross(save, week, "reviewedDueWordIds") === 0) {
    todayLine = "这几天休息了一下。单词卡都还在，想捡起来时从待复习开始即可。";
  }
  const struggleLine = struggle.length === 0 ? "最近没有特别吃力的词，继续保持就好。" : "这些词最近复习时容易错，一起再练练：";
  const first = uniqueAcross(save, week, "badgeFirstOnWordIds");
  const restored = uniqueAcross(save, week, "badgeRestoredWordIds");
  return {
    learnedToday,
    learned7d: uniqueAcross(save, week, "learnedWordIds"),
    reviewedToday,
    reviewed7d: uniqueAcross(save, week, "reviewedDueWordIds"),
    masteredNow,
    masteredFirst7d: first,
    masteredRestored7d: restored,
    dueNow,
    gradesLabel,
    goal: save.dailyGoal,
    goalDaysTotal: save.goalDaysTotal,
    cosmeticTokens: save.cosmeticTokens,
    struggle,
    struggleTotal: allStruggle.length,
    rows: parentWordRows(save, now),
    emptyLine,
    todayLine,
    goalLine: goalStatusLine(save.dailyGoal),
    daysLine: `累计完成 ${save.goalDaysTotal} 天`,
    weekLine: `近 7 天：新学 ${uniqueAcross(save, week, "learnedWordIds")} 个 · 复习过 ${uniqueAcross(save, week, "reviewedDueWordIds")} 个词`,
    firstMasteredLine: `首次掌握：${first} 个`,
    restoredMasteredLine: `重新掌握：${restored} 个`,
    masteredLine: `目前亮着徽章的词：${masteredNow} 个`,
    masteredNote: "徽章变灰只是提醒该复习了，单词卡还在。",
    gradesLine: `正在学：${gradesLabel}`,
    struggleLine,
    reminderLine: openingReminder(save, now, timeZone),
    clockNote: save.clockAnomaly ? "这台电脑的时间比学习记录更早，已经完成的目标还会留着。" : null,
  };
}

/** Every parent-facing sentence for this view, so tests can reject streak and jargon copy. */
export function parentFacingLines(view: ParentView): string[] {
  return [
    "今天的学习",
    "数据只保存在这台电脑",
    `今天新学 ${view.learnedToday} 个`,
    `今天复习 ${view.reviewedToday} 个`,
    `现在待复习 ${view.dueNow} 个`,
    view.goalLine,
    view.daysLine,
    view.weekLine,
    view.firstMasteredLine,
    view.restoredMasteredLine,
    view.masteredLine,
    view.clockNote ?? "",
    view.masteredNote,
    view.gradesLine,
    view.struggleLine,
    view.reminderLine,
    view.emptyLine ?? "",
    view.todayLine ?? "",
    ...view.struggle.map((word) => `${word.english} ${word.meaning} ${word.hint}`),
    "太好了，暂时没有到期要复习的词。",
  ];
}
