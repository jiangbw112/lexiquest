import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOSS_ANIMS, BOSS_ORIGIN, BOSS_PACK, BOSS_SCALE, canopyPoses } from "./boss-pack";

const ROOT = "public/assets/boss/canopy/v0.1";

interface AtlasFile {
  frames: Record<string, { sourceSize: { w: number; h: number }; pivot?: { x: number; y: number } }>;
}

describe("provisional 林冠 v0.1 atlases", () => {
  it("ships the same manifest the client imports", () => {
    expect(readFileSync(`${ROOT}/manifest.json`, "utf8")).toBe(readFileSync("src/game/art/data/boss-canopy-manifest.json", "utf8"));
  });

  it("parses every atlas at 768² with the foot pivot, and the four animations", () => {
    expect(BOSS_PACK.version).toBe("0.1-provisional");
    expect(BOSS_PACK.qaStatus).toBe("integrable");
    expect(BOSS_PACK.facing).toBe("left");
    expect(BOSS_PACK.flipXNeeded).toBe(false);
    expect(BOSS_ORIGIN).toEqual({ x: 0.5, y: 0.875 });
    expect(BOSS_SCALE).toBe(0.5);
    expect(BOSS_PACK.atlases.map((atlas) => atlas.textureKey)).toEqual([
      "boss_canopy_idle",
      "boss_canopy_attack",
      "boss_canopy_hit",
      "boss_canopy_defeat",
    ]);
    expect(BOSS_ANIMS.map((anim) => [anim.key, anim.frameCount, anim.fps, anim.repeat])).toEqual([
      ["idle", 4, 6, -1],
      ["attack", 6, 12, 0],
      ["hit", 3, 8, 0],
      ["defeat", 6, 8, 0],
    ]);

    for (const anim of BOSS_ANIMS) {
      const atlas = BOSS_PACK.atlases.find((item) => item.anim === anim.key);
      if (!atlas) throw new Error(anim.key);
      const parsed = JSON.parse(readFileSync(`${ROOT}/${atlas.json}`, "utf8")) as AtlasFile;
      expect(statSync(`${ROOT}/${atlas.image}`).size).toBeGreaterThan(500);
      expect(anim.frames).toHaveLength(anim.frameCount);
      for (const frameName of anim.frames) {
        const frame = parsed.frames[frameName];
        expect(frame, frameName).toBeTruthy();
        expect(frame?.sourceSize).toEqual({ w: 768, h: 768 });
        expect(frame?.pivot).toEqual({ x: 0.5, y: 0.875 });
      }
    }
  });

  it("plays hit when hurt, attack when the boss swings, and defeat only on a win", () => {
    expect(
      canopyPoses({
        enemyHpBefore: 65,
        enemyHpAfter: 54,
        phaseIndexBefore: 0,
        phaseIndexAfter: 0,
        enemyHitsBefore: 0,
        enemyHitsAfter: 1,
        phase: "choose",
      }),
    ).toEqual(["hit", "attack", "idle"]);
    expect(
      canopyPoses({
        enemyHpBefore: 65,
        enemyHpAfter: 65,
        phaseIndexBefore: 0,
        phaseIndexAfter: 0,
        enemyHitsBefore: 1,
        enemyHitsAfter: 2,
        phase: "choose",
      }),
    ).toEqual(["attack", "idle"]);
    expect(
      canopyPoses({
        enemyHpBefore: 11,
        enemyHpAfter: 65,
        phaseIndexBefore: 0,
        phaseIndexAfter: 1,
        enemyHitsBefore: 3,
        enemyHitsAfter: 3,
        phase: "choose",
      }),
    ).toEqual(["hit", "idle"]);
    expect(
      canopyPoses({
        enemyHpBefore: 11,
        enemyHpAfter: 0,
        phaseIndexBefore: 1,
        phaseIndexAfter: 1,
        enemyHitsBefore: 4,
        enemyHitsAfter: 4,
        phase: "won",
      }),
    ).toEqual(["hit", "defeat"]);
  });
});
