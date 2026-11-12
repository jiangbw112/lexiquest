import { spellingSkipIds } from "./chapter-plan";
import type { WordCardRecord } from "./types";

/** A collected card. Choosing the right meaning is this, and is not mastery. */
export function isRecognized(card: { wordId: string } | undefined): boolean {
  return Boolean(card);
}

/**
 * Recognized, and spelled once with the answer hidden. The meaning badge is separate.
 * Names that are never spelling questions stay at 已认识 even if an old save stored a time.
 */
export function isMastered(card: { wordId?: string; spelledAloneAt?: number } | undefined): boolean {
  if (typeof card?.spelledAloneAt !== "number") return false;
  if (card.wordId && spellingSkipIds().includes(card.wordId)) return false;
  return true;
}

export function grantWordCard(
  cards: Record<string, WordCardRecord>,
  wordId: string,
  at: number,
): Record<string, WordCardRecord> {
  const existing = cards[wordId];
  if (existing) return cards;
  return {
    ...cards,
    [wordId]: {
      wordId,
      collectedAt: at,
      masteryBadge: false,
      badgeEverOn: false,
    },
  };
}

/**
 * Turns a mastery badge on or off. The word card stays either way.
 * A missing card cannot receive a badge.
 */
export function setMasteryBadge(
  cards: Record<string, WordCardRecord>,
  wordId: string,
  badge: boolean,
  at: number,
): Record<string, WordCardRecord> {
  const existing = cards[wordId];
  if (!existing) {
    throw new Error(`Cannot change a badge for a card that was never collected: ${wordId}`);
  }
  const next: WordCardRecord = {
    ...existing,
    masteryBadge: badge,
    masteredAt: badge ? (existing.masteredAt ?? at) : undefined,
  };
  return { ...cards, [wordId]: next };
}
