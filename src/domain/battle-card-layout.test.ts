import { describe, expect, it } from "vitest";
import { SKILLS } from "./skills";
import { BATTLE_CARD_H, BATTLE_CARD_W, battleCardLayout, type CardBox } from "./battle-card-layout";

function overlaps(a: CardBox, b: CardBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Positive when the boxes are apart. Zero when they touch. Negative when they overlap. */
function gap(a: CardBox, b: CardBox): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  if (dx > 0 && dy > 0) return Math.hypot(dx, dy);
  return Math.max(dx, dy);
}

function inside(box: CardBox): boolean {
  return box.x >= 0 && box.y >= 0 && box.x + box.w <= BATTLE_CARD_W && box.y + box.h <= BATTLE_CARD_H;
}

describe("battle card label bounds", () => {
  const longest = SKILLS.map((skill) => skill.name).reduce((best, name) => (name.length > best.length ? name : best));

  it("uses the real long names", () => {
    expect(longest).toBe("发现一击");
    expect(SKILLS.some((skill) => skill.name === "旋风斩")).toBe(true);
    expect(SKILLS.some((skill) => skill.name === "探路杖")).toBe(true);
    expect(SKILLS.some((skill) => skill.name === "盾击")).toBe(true);
  });

  it("keeps the name, the star, the diamonds and the badge apart and on the card", () => {
    const cases = [
      { name: "盾击", star: "★2", energy: 2 },
      { name: "旋风斩", star: "★3", energy: 3 },
      { name: "探路杖", star: "★1", energy: 2 },
      { name: longest, star: "★10", energy: 3 },
      { name: longest, star: "★99", energy: 3 },
    ];
    for (const item of cases) {
      const layout = battleCardLayout({ name: item.name, star: item.star, energy: item.energy, equipped: true });
      const texts = [layout.name, layout.star].filter((box): box is CardBox => box != null);
      const icons = [...layout.diamonds, layout.badge, layout.order].filter((box): box is CardBox => box != null);
      expect(texts.length).toBe(2);
      expect(layout.diamonds).toHaveLength(item.energy);
      expect(layout.badge).not.toBeNull();
      for (const box of [...texts, ...icons]) expect(inside(box)).toBe(true);
      for (const text of texts) {
        for (const icon of icons) expect(gap(text, icon)).toBeGreaterThanOrEqual(4);
      }
      expect(overlaps(layout.name, layout.star!)).toBe(false);
      expect(gap(layout.name, layout.star!)).toBeGreaterThanOrEqual(4);
    }
  });
});
