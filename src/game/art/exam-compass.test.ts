import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { examById, EXAM_BOSS_SCALE } from "../../domain/exams";
import { examLayers } from "./exam-art";
import {
  COMPASS_LAYER_KEY,
  COMPASS_PIVOT,
  COMPASS_REFERENCE_FRAME,
  COMPASS_SOURCE,
  compassDesignRect,
  compassWorldRect,
  isCompassLayer,
} from "./exam-compass";

interface AtlasFrame {
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

function atlasFrames(): { name: string; frame: { x: number; y: number; w: number; h: number } }[] {
  const atlas = JSON.parse(
    readFileSync(
      new URL("../../../public/assets/exam/final/boss/exam_final/g6/v0.1/atlas/boss_exam_final_g6_compass_w@2x.json", import.meta.url),
      "utf8",
    ),
  ) as { frames: Record<string, AtlasFrame> };
  return Object.entries(atlas.frames).map(([name, entry]) => ({
    name,
    frame: {
      x: entry.spriteSourceSize.x,
      y: entry.spriteSourceSize.y,
      w: entry.spriteSourceSize.w,
      h: entry.spriteSourceSize.h,
    },
  }));
}

describe("grade-6 final compass", () => {
  it("hangs the idle plate on the left page at the shared scale", () => {
    expect(EXAM_BOSS_SCALE).toBe(0.5);
    expect(COMPASS_PIVOT).toEqual({ x: 0.5, y: 0.875 });
    expect(COMPASS_SOURCE).toBe(768);
    const local = compassDesignRect(COMPASS_REFERENCE_FRAME);
    expect(local.w).toBe(23.5);
    expect(local.h).toBe(42);
    expect(local.x).toBeLessThan(0);
    expect(local.y).toBeLessThan(0);
    const world = compassWorldRect(local);
    expect(world).toEqual({ x: 942.5, y: 321, w: 23.5, h: 42 });
    expect(world.x).toBeGreaterThanOrEqual(0);
    expect(world.y).toBeGreaterThanOrEqual(0);
    expect(world.x + world.w).toBeLessThanOrEqual(1280);
    expect(world.y + world.h).toBeLessThanOrEqual(720);
  });

  it("keeps every compass frame at the shared scale and inside the view", () => {
    const frames = atlasFrames();
    expect(frames.length).toBeGreaterThan(8);
    const reference = frames.find((entry) => entry.name.endsWith("idle_00"));
    expect(reference?.frame).toEqual(COMPASS_REFERENCE_FRAME);
    for (const entry of frames) {
      const world = compassWorldRect(compassDesignRect(entry.frame));
      expect(world.w, entry.name).toBe(entry.frame.w * EXAM_BOSS_SCALE);
      expect(world.h, entry.name).toBe(entry.frame.h * EXAM_BOSS_SCALE);
      expect(world.w, entry.name).toBeLessThan(40);
      expect(world.h, entry.name).toBeLessThan(50);
      expect(world.x, entry.name).toBeGreaterThanOrEqual(0);
      expect(world.y, entry.name).toBeGreaterThanOrEqual(0);
      expect(world.x + world.w, entry.name).toBeLessThanOrEqual(1280);
      expect(world.y + world.h, entry.name).toBeLessThanOrEqual(720);
    }
    const hit = frames.find((entry) => entry.name.endsWith("hit_01"));
    if (!hit) throw new Error("hit_01");
    const hitWorld = compassWorldRect(compassDesignRect(hit.frame));
    expect(hitWorld.x + hitWorld.w).toBeLessThanOrEqual(1280);
    expect(hitWorld.x + hitWorld.w).toBeCloseTo(980.5, 4);
  });

  it("is a normal layer on the grade-6 final only", () => {
    const sprite = readFileSync(new URL("./exam-boss-sprite.ts", import.meta.url), "utf8");
    expect(sprite).toContain("setOrigin(EXAM_LAYER_PIVOT.x, EXAM_LAYER_PIVOT.y)");
    expect(sprite).toContain("setScale(EXAM_BOSS_SCALE)");
    expect(sprite).not.toContain("addCompass");
    expect(sprite).not.toContain("plantExamLayer");
    expect(sprite).not.toContain("lineStyle");
    expect(sprite).not.toContain("COMPASS_DISPLAY_SCALE");
    const compass = examById("exam_g6_s2_final");
    const sibling = examById("exam_g6_s1_final");
    const mid = examById("exam_g5_s2_mid");
    if (!compass || !sibling || !mid) throw new Error("exam");
    expect(isCompassLayer(COMPASS_LAYER_KEY)).toBe(true);
    expect(examLayers(compass, 1, "idle").some((layer) => isCompassLayer(layer.key))).toBe(true);
    expect(examLayers(compass, 2, "idle").at(-1)?.key).toBe(COMPASS_LAYER_KEY);
    for (const exam of [sibling, mid]) {
      for (const phase of [1, 2, exam.phases]) {
        expect(examLayers(exam, phase, "attack").some((layer) => isCompassLayer(layer.key))).toBe(false);
      }
    }
    expect(isCompassLayer("boss_exam_final_g6_w_idle")).toBe(false);
  });
});
