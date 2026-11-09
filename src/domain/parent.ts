import { Rating, type Grade } from "ts-fsrs";
import { GRADE_BANDS, normalizeGrades, wordById, wordsForGrades } from "./catalog";
import { PROPOSALS } from "./proposals";
import { badgeTone, calendarDay, isDue, type BadgeTone } from "./review";
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
  badgeOnGainedWordIds: [],
  badgeRestoredWordIds: [],
};

export function withParentDefaults(save: SaveData): SaveData {
  const preset = save.parentGoalPreset;
  const safePreset: GoalPreset = preset === "light" || preset === "more" || preset === "standard" ? preset : "standard";
  return {
    ...save,
    spellingMemory: save.spellingMemory ?? {},
    dailyStats: save.dailyStats ?? {},
    dueAnswers: Array.isArray(save.dueAnswers) ? save.dueAnswers : [],
    parentGoalPreset: safePreset,
    dailyGoal: save.dailyGoal ?? null,
    goalDaysTotal: typeof save.goalDaysTotal === "number" ? save.goalDaysTotal : 0,
    lastGoalCompletedDayKey: save.lastGoalCompletedDayKey ?? null,
    goalCalendar: save.goalCalendar ?? {},
    cosmeticTokens: typeof save.cosmeticTokens === "number" ? save.cosmeticTokens : 0,
  };
}

/** Study day: Shanghai calendar date after shifting back across the proposal boundary. */
export function studyDayKey(now: Date): string {
  const shifted = now.getTime() - PROPOSALS.dailyGoal.dayBoundaryHour * 60 * 60 * 1000;
  return calendarDay(shifted, PROPOSALS.dailyGoal.timeZone);
}

export function recentDayKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  let cursor = now.getTime();
  for (let i = 0; i < count; i += 1) {
    keys.push(studyDayKey(new Date(cursor)));
    cursor -= 24 * 60 * 60 * 1000;
  }
  return keys;
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

export function planDailyGoal(save: SaveData, now: Date): DailyGoal {
  const due = dueWordIds(save, now).length;
  const preset = save.parentGoalPreset;
  let mode: GoalMode = "practice";
  let target: number = PROPOSALS.dailyGoal.practiceRounds;
  if (due >= 1) {
    mode = "review";
    target = Math.min(due, goalMax(preset));
  } else if (newWordsRemain(save)) {
    mode = "learn";
    target = PROPOSALS.dailyGoal.learnFallback[preset];
  }
  return {
    dayKey: studyDayKey(now),
    snapshotDue: due,
    mode,
    target,
    progress: 0,
    practiceCount: 0,
    completed: false,
    rewardClaimed: false,
    skipped: false,
  };
}

/** Creates today's snapshot once. A later rise in due words does not raise the target. */
export function ensureDailyGoal(save: SaveData, now: Date): SaveData {
  const dayKey = studyDayKey(now);
  if (save.dailyGoal?.dayKey === dayKey) return save;
  if (save.dailyGoal && save.dailyGoal.dayKey > dayKey) return save;
  return { ...save, dailyGoal: planDailyGoal(save, now) };
}

function derivedProgress(save: SaveData, goal: DailyGoal): number {
  const stat = statFor(save, goal.dayKey);
  if (goal.mode === "review") return stat.reviewedDueWordIds.length;
  if (goal.mode === "learn") return stat.learnedWordIds.length;
  return goal.practiceCount;
}

function settleGoal(save: SaveData): SaveData {
  const goal = save.dailyGoal;
  if (!goal) return save;
  const progress = derivedProgress(save, goal);
  const reached = !goal.skipped && progress >= goal.target && goal.target > 0;
  let next = save;
  let settled: DailyGoal = { ...goal, progress, completed: goal.skipped ? false : goal.completed || reached };
  if (reached && !goal.rewardClaimed) {
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

export function noteLearned(save: SaveData, wordId: string, now: Date): SaveData {
  const ready = ensureDailyGoal(save, now);
  const dayKey = studyDayKey(now);
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
  },
): SaveData {
  if (!input.dueFirst) return save;
  const ready = ensureDailyGoal(save, input.at);
  const dayKey = studyDayKey(input.at);
  const already = ready.dueAnswers.some(
    (answer) => answer.wordId === input.wordId && answer.track === input.track && studyDayKey(new Date(answer.at)) === dayKey,
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
    const afterTone = badgeTone(next.wordCards[input.wordId], next.memory[input.wordId], input.at);
    let gained = stat.badgeOnGainedWordIds;
    let restored = stat.badgeRestoredWordIds;
    if (afterTone === "bright" && input.beforeTone !== "bright" && !gained.includes(input.wordId)) {
      gained = [...gained, input.wordId];
      if (input.beforeTone === "grey") restored = [...restored, input.wordId];
    }
    next = writeStat(next, dayKey, { ...stat, reviewedDueWordIds: reviewed, badgeOnGainedWordIds: gained, badgeRestoredWordIds: restored });
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
  },
): SaveData {
  return noteDueAnswer(save, { ...input, rating: dueRatingFromGrade(input.rating) });
}

/** Counts toward the practice fallback only. Memory, cards, and XP stay as they were. */
export function recordPracticeRound(save: SaveData, now: Date): SaveData {
  const ready = ensureDailyGoal(save, now);
  const goal = ready.dailyGoal;
  if (!goal || goal.mode !== "practice" || goal.skipped) return ready;
  const next = { ...ready, dailyGoal: { ...goal, practiceCount: goal.practiceCount + 1 } };
  return settleGoal(next);
}

export function setGoalPreset(save: SaveData, preset: GoalPreset): SaveData {
  if (save.parentGoalPreset === preset) return save;
  return { ...save, parentGoalPreset: preset };
}

export function skipTodayGoal(save: SaveData, now: Date): SaveData {
  const ready = ensureDailyGoal(save, now);
  const goal = ready.dailyGoal;
  if (!goal || goal.completed || goal.rewardClaimed || goal.skipped) return ready;
  return {
    ...ready,
    dailyGoal: { ...goal, skipped: true },
    goalCalendar: { ...ready.goalCalendar, [goal.dayKey]: "skipped" },
  };
}

export interface StruggleWord {
  wordId: string;
  english: string;
  meaning: string;
  againCount: number;
  lastAgainAt: number;
  hint: string;
}

function answersIn(save: SaveData, dayKeys: readonly string[]): DueAnswerLog[] {
  const allowed = new Set(dayKeys);
  return save.dueAnswers.filter((answer) => allowed.has(studyDayKey(new Date(answer.at))));
}

export function struggleWords(save: SaveData, now: Date, limit: number = PROPOSALS.parentProgress.struggleListLimit): StruggleWord[] {
  const windowKeys = recentDayKeys(now, PROPOSALS.parentProgress.struggleWindowDays);
  const greyKeys = new Set(recentDayKeys(now, PROPOSALS.parentProgress.struggleGreyWindowDays));
  const grouped = new Map<string, DueAnswerLog[]>();
  for (const answer of answersIn(save, windowKeys)) {
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
    const recentAgain = agains.some((answer) => greyKeys.has(studyDayKey(new Date(answer.at))));
    const grey = badgeTone(save.wordCards[wordId], save.memory[wordId], now) === "grey";
    const byGrey = grey && agains.filter((answer) => greyKeys.has(studyDayKey(new Date(answer.at)))).length >= PROPOSALS.parentProgress.struggleGreyRecentAgain && recentAgain;
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
  masteredGained7d: number;
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
  masteredLine: string;
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

export function openingReminder(save: SaveData, now: Date): string {
  const goal = save.dailyGoal;
  if (goal?.completed) return "今日目标已完成。想继续冒险或再复习都行。";
  if (goal?.skipped) return "今天的目标先跳过了。复习和冒险都可以继续。";
  const due = dueWordIds(save, now).length;
  const last = save.lastGoalCompletedDayKey;
  const gap = last ? dayIndex(studyDayKey(now)) - dayIndex(last) : null;
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
  if (goal.skipped) return "今天的目标先跳过了。明天再来就好。";
  if (goal.completed) return "今天的复习目标完成了，真棒。";
  if (goal.mode === "learn") return `今天没有到期复习，学 ${goal.target} 个新词也算完成今日目标。已完成 ${goal.progress} / ${goal.target}`;
  if (goal.mode === "practice") return `今天没有新词要学，练习 ${goal.target} 次学过的词也算完成。已完成 ${goal.progress} / ${goal.target}`;
  return `今日目标：已完成 ${goal.progress} / ${goal.target}`;
}

export function parentView(save: SaveData, now: Date, struggleLimit: number = PROPOSALS.parentProgress.struggleListLimit): ParentView {
  const today = studyDayKey(now);
  const week = recentDayKeys(now, PROPOSALS.parentProgress.recentWindowDays);
  const todayStat = statFor(save, today);
  const learnedToday = todayStat.learnedWordIds.length;
  const reviewedToday = todayStat.reviewedDueWordIds.length;
  const dueNow = dueWordIds(save, now).length;
  const cards = Object.keys(save.wordCards);
  const masteredNow = cards.filter((id) => badgeTone(save.wordCards[id], save.memory[id], now) === "bright").length;
  const gradesLabel = normalizeGrades(save.selectedGrades)
    .map((id) => GRADE_BANDS.find((band) => band.id === id)?.label ?? id)
    .join("、");
  const allStruggle = struggleWords(save, now, Number.MAX_SAFE_INTEGER);
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
  const restored = uniqueAcross(save, week, "badgeRestoredWordIds");
  return {
    learnedToday,
    learned7d: uniqueAcross(save, week, "learnedWordIds"),
    reviewedToday,
    reviewed7d: uniqueAcross(save, week, "reviewedDueWordIds"),
    masteredNow,
    masteredGained7d: uniqueAcross(save, week, "badgeOnGainedWordIds"),
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
    weekLine: `近 7 天：新学 ${uniqueAcross(save, week, "learnedWordIds")} 个 · 复习过 ${uniqueAcross(save, week, "reviewedDueWordIds")} 个词 · 新掌握（含恢复） ${uniqueAcross(save, week, "badgeOnGainedWordIds")} 个`,
    masteredLine: `目前亮着徽章的词：${masteredNow} 个`,
    masteredNote: "徽章变灰只是提醒该复习了，单词卡还在。",
    gradesLine: `正在学：${gradesLabel}`,
    struggleLine,
    reminderLine: openingReminder(save, now),
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
    view.masteredLine,
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
