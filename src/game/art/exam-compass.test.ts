import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../domain/contrast";
import { examById, EXAM_BOSS_SCALE } from "../../domain/exams";
import { examLayers } from "./exam-art";
import {
  bakedCompassRect,
  COMPASS_DISPLAY_SCALE,
  COMPASS_GLOW,
  COMPASS_GLOW_PAD,
  COMPASS_IDLE_TARGET,
  COMPASS_LAYER_KEY,
  COMPASS_OUTLINE_PX,
  COMPASS_PLATE,
  COMPASS_REFERENCE_FRAME,
  compassBattleRect,
  compassCardRect,
  G6_PAGE_LANTERN,
  G6_SPINE_CLASP,
  isCompassLayer,
  rectsOverlap,
} from "./exam-compass";

interface AtlasFrame {
  spriteSourceSize: { x: number; y: number; w: number; h: number };
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
  it("draws the pendant larger than the baked 24×42 plate and clear of the lantern", () => {
    expect(EXAM_BOSS_SCALE).toBe(0.5);
    expect(COMPASS_DISPLAY_SCALE).toBeGreaterThan(EXAM_BOSS_SCALE);
    const baked = bakedCompassRect();
    expect(baked.w).toBe(23.5);
    expect(baked.h).toBe(42);

    const shown = compassBattleRect(COMPASS_REFERENCE_FRAME);
    expect(shown.x).toBe(COMPASS_IDLE_TARGET.x);
    expect(shown.y).toBe(COMPASS_IDLE_TARGET.y);
    expect(shown.w).toBeGreaterThanOrEqual(64);
    expect(shown.h).toBeGreaterThanOrEqual(120);
    expect(shown.x).toBeGreaterThan(G6_PAGE_LANTERN.x + G6_PAGE_LANTERN.w + 80);
    expect(rectsOverlap(shown, G6_PAGE_LANTERN)).toBe(false);
    expect(rectsOverlap(shown, G6_SPINE_CLASP)).toBe(false);
    expect(rectsOverlap(compassCardRect(COMPASS_REFERENCE_FRAME), G6_PAGE_LANTERN)).toBe(false);
    expect(rectsOverlap(compassCardRect(COMPASS_REFERENCE_FRAME), G6_SPINE_CLASP)).toBe(false);

    expect(COMPASS_GLOW_PAD).toBeGreaterThanOrEqual(8);
    expect(COMPASS_OUTLINE_PX).toBeGreaterThanOrEqual(2);
    expect(contrastRatio(COMPASS_PLATE, COMPASS_GLOW)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps every compass frame off the lantern and off the spine clasp", () => {
    const frames = atlasFrames();
    expect(frames.length).toBeGreaterThan(8);
    const reference = frames.find((entry) => entry.name.endsWith("idle_00"));
    expect(reference?.frame).toEqual(COMPASS_REFERENCE_FRAME);
    for (const entry of frames) {
      const shown = compassBattleRect(entry.frame);
      expect(shown.w, entry.name).toBeGreaterThanOrEqual(64);
      expect(shown.h, entry.name).toBeGreaterThanOrEqual(120);
      expect(rectsOverlap(shown, G6_PAGE_LANTERN), entry.name).toBe(false);
      expect(rectsOverlap(shown, G6_SPINE_CLASP), entry.name).toBe(false);
      expect(rectsOverlap(compassCardRect(entry.frame), G6_PAGE_LANTERN), entry.name).toBe(false);
    }
  });

  it("leaves every other exam boss on the shared scale", () => {
    const compass = examById("exam_g6_s2_final");
    const sibling = examById("exam_g6_s1_final");
    const mid = examById("exam_g5_s2_final");
    if (!compass || !sibling || !mid) throw new Error("exam");
    expect(isCompassLayer(COMPASS_LAYER_KEY)).toBe(true);
    expect(examLayers(compass, 2, "idle").some((layer) => isCompassLayer(layer.key))).toBe(true);
    for (const exam of [sibling, mid]) {
      for (const phase of [1, 2, 3]) {
        expect(examLayers(exam, phase, "attack").some((layer) => isCompassLayer(layer.key))).toBe(false);
      }
    }
    expect(isCompassLayer("boss_exam_final_g6_w_idle")).toBe(false);
  });
});
