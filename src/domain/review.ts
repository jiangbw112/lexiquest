import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";
import { deviceTimeZone, localDayKey } from "./local-day";
import { PROVISIONAL } from "./provisional";
import type { MemoryRecord, StoredFsrs } from "./types";

const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  enable_short_term: true,
});

export function fsrsScheduler(): ReturnType<typeof fsrs> {
  return scheduler;
}

/** Calendar day of an instant. FSRS due checks still compare the absolute timestamp. */
export function calendarDay(ms: number, timeZone = deviceTimeZone()): string {
  return localDayKey(new Date(ms), timeZone);
}

export function storedFromCard(card: Card): StoredFsrs {
  const stored: StoredFsrs = {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
  if (card.last_review) stored.last_review = card.last_review.toISOString();
  return stored;
}

export function cardFromStored(stored: StoredFsrs): Card {
  const card: Card = {
    due: new Date(stored.due),
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsed_days,
    scheduled_days: stored.scheduled_days,
    learning_steps: stored.learning_steps,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state as State,
  };
  if (stored.last_review) card.last_review = new Date(stored.last_review);
  return card;
}

export function introduceMemory(wordId: string, now: Date, rating: Grade = Rating.Good): MemoryRecord {
  const empty = createEmptyCard(now);
  const { card } = scheduler.next(empty, now, rating);
  return {
    wordId,
    fsrs: storedFromCard(card),
    reviewInstants: [now.getTime()],
  };
}

export function applyReview(memory: MemoryRecord, rating: Grade, now: Date): MemoryRecord {
  const { card } = scheduler.next(cardFromStored(memory.fsrs), now, rating);
  return {
    ...memory,
    fsrs: storedFromCard(card),
    reviewInstants: [...memory.reviewInstants, now.getTime()],
  };
}

export function isDue(memory: MemoryRecord, now: Date): boolean {
  return new Date(memory.fsrs.due).getTime() <= now.getTime();
}

/** FSRS relearning means the word lapsed. The card stays; only the badge tone changes. */
export function isLapsed(memory: MemoryRecord): boolean {
  return memory.fsrs.state === State.Relearning;
}

export type BadgeTone = "none" | "bright" | "grey";

/**
 * An earned badge is grey while the word is due or lapsed, and bright again
 * after a review that leaves it neither due nor lapsed. No badge is removed.
 */
export function badgeTone(
  card: { masteryBadge: boolean } | undefined,
  memory: MemoryRecord | undefined,
  now: Date,
): BadgeTone {
  if (!card?.masteryBadge) return "none";
  if (!memory || isLapsed(memory) || isDue(memory, now)) return "grey";
  return "bright";
}

export interface MasteryDecision {
  award: boolean;
  distinctDays: number;
  stability: number;
  reason: "single-day" | "stability" | "eligible";
}

/**
 * Same-calendar-day repetition never awards mastery, even when stability is already high.
 * Battle results do not call this.
 */
export function masteryDecision(
  memory: MemoryRecord,
  config = PROVISIONAL.mastery,
  timeZone = deviceTimeZone(),
): MasteryDecision {
  const distinctDays = memory.realReviewDays
    ? new Set(memory.realReviewDays).size
    : new Set(memory.reviewInstants.map((instant) => calendarDay(instant, timeZone))).size;
  const stability = memory.fsrs.stability;
  if (distinctDays < config.minDistinctCalendarDays) {
    return { award: false, distinctDays, stability, reason: "single-day" };
  }
  if (stability < config.minStability) {
    return { award: false, distinctDays, stability, reason: "stability" };
  }
  return { award: true, distinctDays, stability, reason: "eligible" };
}

export function reviewDesk(
  memories: readonly MemoryRecord[],
  now: Date,
  limit = 4,
): { shown: MemoryRecord[]; hiddenDue: number; keyTargetId?: string } {
  const sorted = [...memories].sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());
  const due = sorted.filter((memory) => isDue(memory, now));
  const waiting = sorted.filter((memory) => !isDue(memory, now));
  const shown = [...due, ...waiting].slice(0, limit);
  const shownDue = shown.filter((memory) => isDue(memory, now)).length;
  return { shown, hiddenDue: Math.max(0, due.length - shownDue), keyTargetId: due[0]?.wordId };
}

export function formatDue(dueMs: number, nowMs: number): string {
  const delta = dueMs - nowMs;
  if (delta <= 0) return "现在可以复习";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `大约 ${Math.max(1, minutes)} 分钟后`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `大约 ${hours} 小时后`;
  const days = Math.max(1, Math.round(hours / 24));
  return `大约 ${days} 天后`;
}
