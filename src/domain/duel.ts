/**
 * Friend 1v1 scoring is lexicographic and confirmed:
 * more correct answers wins; if the correct counts match, the lower total
 * response time on correct answers wins. A wrong answer scores nothing and
 * adds no time, so a fast miss cannot help.
 *
 * This module does not schedule reviews and does not grant rewards.
 * A real match must be server-authoritative for the room, judging, timing,
 * this comparison, and any rewards. The server rejects replayed or forged
 * payloads and will not grant the same reward twice.
 */
export interface DuelAnswer {
  correct: boolean;
  responseMs: number;
}

export interface DuelTally {
  correctCount: number;
  correctTimeMs: number;
}

export function tallyRound(answers: readonly DuelAnswer[]): DuelTally {
  let correctCount = 0;
  let correctTimeMs = 0;
  for (const answer of answers) {
    if (!answer.correct) continue;
    correctCount += 1;
    const ms = Number.isFinite(answer.responseMs) ? Math.max(0, answer.responseMs) : Number.POSITIVE_INFINITY;
    correctTimeMs += ms;
  }
  return { correctCount, correctTimeMs };
}

export function compareRounds(
  a: readonly DuelAnswer[],
  b: readonly DuelAnswer[],
): { tallyA: DuelTally; tallyB: DuelTally; winner: "a" | "b" | "tie" } {
  const tallyA = tallyRound(a);
  const tallyB = tallyRound(b);
  let winner: "a" | "b" | "tie" = "tie";
  if (tallyA.correctCount !== tallyB.correctCount) {
    winner = tallyA.correctCount > tallyB.correctCount ? "a" : "b";
  } else if (tallyA.correctTimeMs !== tallyB.correctTimeMs) {
    winner = tallyA.correctTimeMs < tallyB.correctTimeMs ? "a" : "b";
  }
  return { tallyA, tallyB, winner };
}
