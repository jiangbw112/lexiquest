import { describe, expect, it } from "vitest";
import { grantWordCard, setMasteryBadge } from "./cards";

describe("word cards and mastery badges", () => {
  it("grants a card immediately and keeps it when the badge changes", () => {
    const collectedAt = Date.parse("2026-03-01T02:00:00Z");
    const granted = grantWordCard({}, "lantern", collectedAt);
    expect(granted.lantern).toMatchObject({
      wordId: "lantern",
      collectedAt,
      masteryBadge: false,
    });

    const again = grantWordCard(granted, "lantern", collectedAt + 50_000);
    expect(again).toBe(granted);

    const withBadge = setMasteryBadge(granted, "lantern", true, collectedAt + 86_400_000);
    expect(withBadge.lantern?.masteryBadge).toBe(true);
    expect(withBadge.lantern?.collectedAt).toBe(collectedAt);
    expect(Object.keys(withBadge)).toEqual(["lantern"]);

    const badgeOff = setMasteryBadge(withBadge, "lantern", false, collectedAt + 90_000_000);
    expect(badgeOff.lantern).toMatchObject({
      wordId: "lantern",
      collectedAt,
      masteryBadge: false,
    });
    expect(badgeOff.lantern?.masteredAt).toBeUndefined();
  });

  it("refuses to badge a word that was never collected", () => {
    expect(() => setMasteryBadge({}, "river", true, 1)).toThrow(/never collected/);
  });
});
