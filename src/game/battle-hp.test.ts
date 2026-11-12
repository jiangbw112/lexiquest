import { describe, expect, it } from "vitest";
import { hpAfterSteps, hpForHandoff } from "./battle-hp";

describe("hp bars follow each hit", () => {
  it("keeps the pre-action HP until a hit, then adds that step, then lands on the final HP", () => {
    const before = { playerHp: 42, enemyHp: 40 };
    const steps = [
      { target: "enemy" as const, amount: -8 },
      { target: "player" as const, amount: -5 },
    ];
    const finalHp = { playerHp: 37, enemyHp: 32 };

    expect(hpAfterSteps(before, steps, 0)).toEqual(before);
    expect(hpAfterSteps(before, steps, 1)).toEqual({ playerHp: 42, enemyHp: 32 });
    expect(hpAfterSteps(before, steps, steps.length)).toEqual(finalHp);
  });

  it("adds the heal when +N appears and removes it when the counter hits", () => {
    const before = { playerHp: 37, enemyHp: 32 };
    const steps = [
      { target: "player" as const, amount: 5 },
      { target: "player" as const, amount: -5 },
    ];

    expect(hpAfterSteps(before, steps, 0)).toEqual(before);
    expect(hpAfterSteps(before, steps, 1)).toEqual({ playerHp: 42, enemyHp: 32 });
    expect(hpAfterSteps(before, steps, 2)).toEqual({ playerHp: 37, enemyHp: 32 });
  });

  it("hands the final HP to results even when the bar has not applied the last step", () => {
    const before = { playerHp: 42, enemyHp: 40 };
    const steps = [
      { target: "enemy" as const, amount: -8 },
      { target: "player" as const, amount: -5 },
    ];
    const displayed = hpAfterSteps(before, steps, 1);
    const finalHp = hpAfterSteps(before, steps, steps.length);

    expect(displayed).toEqual({ playerHp: 42, enemyHp: 32 });
    expect(hpForHandoff(displayed, finalHp)).toEqual(finalHp);
    expect(hpForHandoff(displayed, finalHp)).not.toEqual(displayed);
  });
});
