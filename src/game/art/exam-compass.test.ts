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
  COMPASS_HALO_RINGS,
  COMPASS_IDLE_TARGET,
  COMPASS_LAYER_KEY,
  COMPASS_OUTLINE_DELTAS,
  COMPASS_OUTLINE_PX,
  COMPASS_PIVOT,
  COMPASS_PLATE,
  COMPASS_REFERENCE_FRAME,
  COMPASS_SOURCE,
  compassBattleRect,
  compassCardRect,
  compassHaloRect,
  compassShift,
  compassSpriteDrawRect,
  compassWorldRect,
  G6_PAGE_LANTERN,
  G6_RIGHT_HAND,
  G6_SPINE_CLASP,
  isCompassLayer,
  phaserTrimmedDrawRect,
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

  it("draws the plate and the halo in one coordinate space, off the right hand", () => {
    const frames = atlasFrames();
    const idle = frames.filter((entry) => entry.name.includes("_idle_"));
    expect(idle.length).toBeGreaterThan(3);
    expect(frames.every((entry) => entry.name.startsWith(`${COMPASS_LAYER_KEY}_`))).toBe(true);
    expect(COMPASS_LAYER_KEY).not.toBe("__MISSING");
    expect(Math.max(...COMPASS_HALO_RINGS.map((ring) => ring.alpha))).toBeLessThanOrEqual(0.35);
    expect(Math.max(...COMPASS_HALO_RINGS.map((ring) => ring.outset + ring.line / 2))).toBe(COMPASS_GLOW_PAD);

    for (const entry of frames) {
      const plate = compassSpriteDrawRect(entry.frame);
      const glow = compassBattleRect(entry.frame);
      const halo = compassHaloRect(entry.frame);
      expect(plate, entry.name).toEqual(glow);
      expect(plate.w, entry.name).toBe(entry.frame.w * COMPASS_DISPLAY_SCALE);
      expect(plate.h, entry.name).toBe(entry.frame.h * COMPASS_DISPLAY_SCALE);
      expect(halo.x, entry.name).toBeLessThanOrEqual(plate.x);
      expect(halo.y, entry.name).toBeLessThanOrEqual(plate.y);
      expect(halo.x + halo.w, entry.name).toBeGreaterThanOrEqual(plate.x + plate.w);
      expect(halo.y + halo.h, entry.name).toBeGreaterThanOrEqual(plate.y + plate.h);
      expect(rectsOverlap(halo, G6_RIGHT_HAND), entry.name).toBe(false);
      expect(rectsOverlap(compassWorldRect(halo), compassWorldRect(G6_RIGHT_HAND)), entry.name).toBe(false);
      for (const delta of COMPASS_OUTLINE_DELTAS) {
        const ink = compassSpriteDrawRect(entry.frame, delta);
        expect(ink.x, entry.name).toBeGreaterThanOrEqual(halo.x);
        expect(ink.y, entry.name).toBeGreaterThanOrEqual(halo.y);
        expect(ink.x + ink.w, entry.name).toBeLessThanOrEqual(halo.x + halo.w);
        expect(ink.y + ink.h, entry.name).toBeLessThanOrEqual(halo.y + halo.h);
      }
      const trimmedFraction = {
        x: (COMPASS_PIVOT.x * COMPASS_SOURCE - entry.frame.x) / entry.frame.w,
        y: (COMPASS_PIVOT.y * COMPASS_SOURCE - entry.frame.y) / entry.frame.h,
      };
      const thrown = phaserTrimmedDrawRect(entry.frame, trimmedFraction, COMPASS_DISPLAY_SCALE, compassShift());
      expect(Math.hypot(thrown.x - plate.x, thrown.y - plate.y), entry.name).toBeGreaterThan(400);
    }

    const sprite = readFileSync(new URL("./exam-boss-sprite.ts", import.meta.url), "utf8");
    const body = sprite.slice(sprite.indexOf("function addCompass"), sprite.indexOf("export class ExamBossSprite"));
    expect(body).toContain("scene.add.sprite(0, 0, COMPASS_LAYER_KEY, first)");
    expect(body).toContain("sprite.setOrigin(COMPASS_PIVOT.x, COMPASS_PIVOT.y)");
    expect(body).toContain("sprite.setVisible(true)");
    expect(body).toContain("sprite.setAlpha(1)");
    expect(body).toContain("glow.lineStyle(ring.line, cream, ring.alpha)");
    expect(body).not.toContain("fillRoundedRect");
    expect(body).not.toContain("fillStyle");
    expect(body).not.toContain("plant(");
    expect(body.indexOf("root.add(glow)")).toBeLessThan(body.indexOf("root.add(sprite)"));
    expect(body.indexOf("root.add(sprite)")).toBeLessThan(body.lastIndexOf("root.add(main)"));
    const layers = examLayers(examById("exam_g6_s2_final")!, 2, "idle");
    expect(layers.at(-1)?.key).toBe(COMPASS_LAYER_KEY);
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
