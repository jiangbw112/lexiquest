import type { WordCardRecord } from "./types";

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
    wordId: existing.wordId,
    collectedAt: existing.collectedAt,
    masteryBadge: badge,
  };
  if (badge) next.masteredAt = existing.masteredAt ?? at;
  return { ...cards, [wordId]: next };
}
