import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SPAWN_PIVOT, PROJECTILE_ART, spawnOffset } from "./projectile-art";

const RANGED = ["mage", "ranger", "healer", "inventor"] as const;

describe("projectile art", () => {
  it("gives each ranged class a fly clip and a three-frame hit", () => {
    for (const id of RANGED) {
      const art = PROJECTILE_ART[id];
      expect(art.fly.frames.length, id).toBeGreaterThanOrEqual(2);
      expect(art.hit.frames, id).toHaveLength(3);
      expect(art.hit.repeat, id).toBe(0);
      expect(art.fly.frames.every((frame) => frame.startsWith(`fx_proj_${id}_fly`)), id).toBe(true);
      expect(art.hit.frames.every((frame) => frame.startsWith(`fx_proj_${id}_hit`)), id).toBe(true);
    }
  });

  it("places the spawn on the anchor, scaled from the 512px foot pivot", () => {
    const battleScale = 0.72;
    for (const id of RANGED) {
      const [px, py] = PROJECTILE_ART[id].anchorPx;
      const offset = spawnOffset(id, battleScale);
      expect(offset.x, id).toBeCloseTo((px - SPAWN_PIVOT.x) * battleScale, 5);
      expect(offset.y, id).toBeCloseTo((py - SPAWN_PIVOT.y) * battleScale, 5);
      expect(offset).not.toEqual({ x: 36, y: -70 });
    }
    const source = readFileSync(new URL("../scenes/BattleScene.ts", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("private launchProjectile"), source.indexOf("private drawMonster"));
    expect(body).toContain("spawnOffset");
    expect(body).not.toContain("add.rectangle");
    expect(body).not.toContain("add.circle");
    expect(body).not.toContain("setStrokeStyle");
    expect(body).not.toContain("+ 36");
  });
});
