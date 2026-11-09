import { describe, expect, it } from "vitest";
import { compareRounds, tallyRound } from "./duel";

describe("friend duel scoring", () => {
  it("lets more correct answers win, and ignores how fast the misses were", () => {
    const oneSlowRight = [
      { correct: false, responseMs: 100 },
      { correct: false, responseMs: 120 },
      { correct: true, responseMs: 9_000 },
    ];
    const oneFastRight = [{ correct: true, responseMs: 200 }, { correct: false, responseMs: 50 }];
    const sameCount = compareRounds(oneSlowRight, oneFastRight);
    expect(sameCount.tallyA.correctCount).toBe(1);
    expect(sameCount.tallyB.correctCount).toBe(1);
    expect(sameCount.tallyA.correctTimeMs).toBe(9_000);
    expect(sameCount.tallyB.correctTimeMs).toBe(200);
    expect(sameCount.winner).toBe("b");
    const moreCorrect = compareRounds(oneSlowRight, [
      { correct: true, responseMs: 20_000 },
      { correct: true, responseMs: 20_000 },
    ]);
    expect(moreCorrect.winner).toBe("b");
    expect(moreCorrect.tallyB.correctCount).toBeGreaterThan(moreCorrect.tallyA.correctCount);
  });

  it("breaks a correct-count tie by lower total time on correct answers only", () => {
    const fast = [
      { correct: true, responseMs: 400 },
      { correct: false, responseMs: 50 },
      { correct: true, responseMs: 600 },
    ];
    const slow = [
      { correct: true, responseMs: 700 },
      { correct: true, responseMs: 800 },
      { correct: false, responseMs: 10 },
    ];
    const result = compareRounds(fast, slow);
    expect(result.tallyA.correctCount).toBe(result.tallyB.correctCount);
    expect(result.tallyA.correctTimeMs).toBe(1_000);
    expect(result.tallyB.correctTimeMs).toBe(1_500);
    expect(result.winner).toBe("a");
    expect(tallyRound([{ correct: false, responseMs: 1 }])).toEqual({ correctCount: 0, correctTimeMs: 0 });
  });

  it("ties when both are wrong, even if one was much faster", () => {
    const result = compareRounds(
      [{ correct: false, responseMs: 80 }, { correct: false, responseMs: 90 }],
      [{ correct: false, responseMs: 4_000 }],
    );
    expect(result.winner).toBe("tie");
    expect(result.tallyA.correctTimeMs).toBe(0);
    expect(result.tallyB.correctTimeMs).toBe(0);
  });
});
