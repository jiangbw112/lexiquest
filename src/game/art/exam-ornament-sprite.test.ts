import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./phaser-headless";
import type Phaser from "phaser";
import { EXAM_BOSS_SCALE, EXAM_BOSS_X, EXAM_BOSS_Y, EXAMS, examById } from "../../domain/exams";
import { examAtlases, type ExamPose } from "./exam-art";
import { ExamBossSprite } from "./exam-boss-sprite";

/** The battle canvas is 1280×800. Ornaments have to stay inside the 1280×720 view. */
const VIEW = { w: 1280, h: 720 };
const POSES: readonly ExamPose[] = ["idle", "attack", "hit", "defeat"];

interface AtlasFile {
  frames: Record<string, unknown>;
  meta?: { size?: { w: number; h: number } };
}

interface Plate {
  x: number;
  y: number;
  w: number;
  h: number;
}

function atlasFile(urlPath: string): AtlasFile {
  return JSON.parse(readFileSync(new URL(`../../../public${urlPath}`, import.meta.url), "utf8")) as AtlasFile;
}

/** Visible plate. Phaser draws `-origin * source + trim`, then scales about the sprite. */
function drawnWorld(sprite: Phaser.GameObjects.Sprite): Plate {
  const frame = sprite.frame;
  const parentX = sprite.parentContainer?.x ?? 0;
  const parentY = sprite.parentContainer?.y ?? 0;
  return {
    x: parentX + sprite.x + (-sprite.displayOriginX + frame.x) * sprite.scaleX,
    y: parentY + sprite.y + (-sprite.displayOriginY + frame.y) * sprite.scaleY,
    w: frame.cutWidth * sprite.scaleX,
    h: frame.cutHeight * sprite.scaleY,
  };
}

function insideView(plate: Plate, label: string): void {
  expect(plate.x, label).toBeGreaterThanOrEqual(0);
  expect(plate.y, label).toBeGreaterThanOrEqual(0);
  expect(plate.x + plate.w, label).toBeLessThanOrEqual(VIEW.w);
  expect(plate.y + plate.h, label).toBeLessThanOrEqual(VIEW.h);
}

/** The trimmed-frame origin plant() writes. Phaser then multiplies it by the full source. */
function applyTrimmedOrigin(sprite: Phaser.GameObjects.Sprite): void {
  const frame = sprite.frame;
  const sourceW = frame.realWidth || frame.width;
  const sourceH = frame.realHeight || frame.height;
  const pivotX = frame.customPivot ? frame.pivotX : 0.5;
  const pivotY = frame.customPivot ? frame.pivotY : 0.875;
  const width = frame.width || 1;
  const height = frame.height || 1;
  sprite.setOrigin((pivotX * sourceW - frame.x) / width, (pivotY * sourceH - frame.y) / height);
  sprite.setScale(EXAM_BOSS_SCALE);
}

describe("exam crown and badge stay on the boss", () => {
  let PhaserLib: typeof import("phaser");
  let game: Phaser.Game;
  let scene: Phaser.Scene;

  beforeAll(async () => {
    const loaded = await import("phaser");
    PhaserLib = ((loaded as { default?: typeof import("phaser") }).default ?? loaded) as typeof import("phaser");
    scene = await new Promise<Phaser.Scene>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("phaser headless did not start")), 15000);
      game = new PhaserLib.Game({
        type: PhaserLib.HEADLESS,
        customEnvironment: true,
        width: 1280,
        height: 800,
        banner: false,
        audio: { noAudio: true },
        scene: {
          create(this: Phaser.Scene) {
            clearTimeout(timeout);
            resolve(this);
          },
        },
      });
    });

    const seen = new Set<string>();
    for (const exam of EXAMS) {
      for (const file of examAtlases(exam)) {
        if (seen.has(file.key) || scene.textures.exists(file.key)) continue;
        seen.add(file.key);
        const data = atlasFile(file.dataUrl);
        const canvas = document.createElement("canvas");
        canvas.width = data.meta?.size?.w ?? 8;
        canvas.height = data.meta?.size?.h ?? 8;
        const texture = scene.textures.addAtlasJSONHash(file.key, canvas as unknown as HTMLImageElement, data);
        expect(texture, file.key).toBeTruthy();
      }
    }
  });

  afterAll(() => {
    game?.destroy(true);
  });

  it("throws the crown and the badge off the 1280×720 view when the origin uses the trimmed frame", () => {
    const crown = scene.add.sprite(
      EXAM_BOSS_X,
      EXAM_BOSS_Y,
      "boss_exam_final_shared_crown_base_EAC670_w",
      "boss_exam_final_shared_crown_base_EAC670_w_idle_00",
    );
    const badge = scene.add.sprite(
      EXAM_BOSS_X,
      EXAM_BOSS_Y,
      "boss_exam_midterm_shared_badge_EECF83_w",
      "boss_exam_midterm_shared_badge_EECF83_w_idle_00",
    );
    applyTrimmedOrigin(crown);
    applyTrimmedOrigin(badge);

    const crownPlate = drawnWorld(crown);
    const badgePlate = drawnWorld(badge);
    const crownBounds = crown.getBounds();
    const badgeBounds = badge.getBounds();

    expect(crown.originY).toBeCloseTo(7.552238805970149, 6);
    expect(crownPlate).toMatchObject({ x: expect.closeTo(954.76146789, 2), y: expect.closeTo(-2297.05970149, 2) });
    expect(crownPlate.w).toBeCloseTo(54.5, 4);
    expect(crownPlate.h).toBeCloseTo(33.5, 4);
    expect(crownBounds.y).toBeCloseTo(-2380.0601194, 2);
    expect(crownBounds.y).toBeLessThan(0);
    expect(crownBounds.y + crownBounds.height).toBeLessThan(0);

    expect(badge.originX).toBeCloseTo(2.2588235294117647, 6);
    expect(badge.originY).toBeCloseTo(2.988235294117647, 6);
    expect(badgePlate.x).toBeCloseTo(208.6117647, 2);
    expect(badgePlate.y).toBeCloseTo(-418.4823529, 2);
    expect(badgeBounds.x).toBeCloseTo(112.6117647, 2);
    expect(badgeBounds.y).toBeCloseTo(-627.4823529, 2);
    expect(badgeBounds.y).toBeLessThan(0);

    crown.destroy();
    badge.destroy();
  });

  it("keeps every midterm badge and final crown on the boss", () => {
    expect(EXAMS.filter((exam) => exam.kind === "mid")).toHaveLength(7);
    expect(EXAMS.filter((exam) => exam.kind === "final")).toHaveLength(8);
    const seen = new Set<string>();

    for (const exam of EXAMS) {
      for (let phase = 1; phase <= exam.phases; phase += 1) {
        for (const pose of POSES) {
          const label = `${exam.id} phase ${phase} ${pose}`;
          const boss = new ExamBossSprite(scene, EXAM_BOSS_X, EXAM_BOSS_Y, exam);
          boss.show(phase, pose, null);
          const sprites = boss.root.list.filter((child): child is Phaser.GameObjects.Sprite => {
            return (child as Phaser.GameObjects.Sprite).type === "Sprite";
          });
          const ornament = sprites.find((sprite) => sprite.texture.key.includes("_crown_") || sprite.texture.key.includes("_badge_"));
          const body = sprites.find((sprite) => /boss_exam_(midterm|final)_g\d_w_/.test(sprite.texture.key));
          expect(ornament, label).toBeTruthy();
          expect(body, label).toBeTruthy();
          if (!ornament || !body) continue;

          const plate = drawnWorld(ornament);
          const bodyPlate = drawnWorld(body);
          const bounds = ornament.getBounds();
          const kind = ornament.texture.key.includes("_crown_") ? "crown" : "badge";
          seen.add(`${kind}:${ornament.texture.key}`);

          expect(ornament.visible, label).toBe(true);
          expect(ornament.alpha, label).toBeGreaterThan(0);
          expect(ornament.texture.key, label).not.toBe("__MISSING");
          expect(ornament.originX, label).toBe(ornament.frame.pivotX);
          expect(ornament.originY, label).toBe(ornament.frame.pivotY);
          expect(ornament.originX, label).toBe(0.5);
          expect(ornament.originY, label).toBe(0.875);
          expect(ornament.scaleX, label).toBe(EXAM_BOSS_SCALE);
          expect(ornament.scaleY, label).toBe(EXAM_BOSS_SCALE);
          expect(body.originY, label).toBeGreaterThan(0.9);
          expect(body.scaleX, label).toBe(EXAM_BOSS_SCALE);

          insideView(plate, label);
          insideView({ x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height }, `${label} bounds`);
          expect(bounds.x, label).toBeLessThanOrEqual(plate.x);
          expect(bounds.y, label).toBeLessThanOrEqual(plate.y);
          expect(bounds.x + bounds.width, label).toBeGreaterThanOrEqual(plate.x + plate.w);
          expect(bounds.y + bounds.height, label).toBeGreaterThanOrEqual(plate.y + plate.h);

          const relX = (plate.x + plate.w / 2 - bodyPlate.x) / bodyPlate.w;
          const relY = (plate.y + plate.h / 2 - bodyPlate.y) / bodyPlate.h;
          expect(relX, label).toBeGreaterThan(0);
          expect(relX, label).toBeLessThan(1);
          if (kind === "crown") {
            expect(relY, label).toBeGreaterThanOrEqual(-0.05);
            expect(relY, label).toBeLessThanOrEqual(0.45);
            expect(exam.kind, label).toBe("final");
          } else {
            expect(relY, label).toBeGreaterThanOrEqual(0.45);
            expect(relY, label).toBeLessThanOrEqual(0.9);
            expect(exam.kind, label).toBe("mid");
          }

          if (exam.id === "exam_g6_s2_final" && phase === 1 && pose === "idle") {
            expect(plate.x, label).toBeCloseTo(953, 2);
            expect(plate.y, label).toBeCloseTo(267, 2);
            expect(plate.w, label).toBeCloseTo(54.5, 2);
            expect(plate.h, label).toBeCloseTo(33.5, 2);
            expect(bounds.x, label).toBeCloseTo(788, 2);
            expect(bounds.y, label).toBeCloseTo(184, 2);
            expect(bounds.width, label).toBeCloseTo(384, 2);
            expect(bounds.height, label).toBeCloseTo(384, 2);
          }
          if (exam.id === "exam_g5_s2_mid" && phase === 1 && pose === "idle") {
            expect(plate.x, label).toBeCloseTo(884, 2);
            expect(plate.y, label).toBeCloseTo(393, 2);
            expect(plate.w, label).toBeCloseTo(42.5, 2);
            expect(plate.h, label).toBeCloseTo(42.5, 2);
            expect(bounds.x, label).toBeCloseTo(788, 2);
            expect(bounds.y, label).toBeCloseTo(184, 2);
          }

          boss.root.destroy(true);
        }
      }
    }

    expect(examById("exam_g6_s2_mid")).toBeUndefined();
    expect([...seen].filter((key) => key.startsWith("crown:")).sort()).toEqual([
      "crown:boss_exam_final_shared_crown_base_EAC670_w",
      "crown:boss_exam_final_shared_crown_base_EBC873_w",
      "crown:boss_exam_final_shared_crown_base_EECF83_w",
      "crown:boss_exam_final_shared_crown_enhanced_EAC670_w",
      "crown:boss_exam_final_shared_crown_enhanced_EBC873_w",
      "crown:boss_exam_final_shared_crown_enhanced_EECF83_w",
    ]);
    expect([...seen].filter((key) => key.startsWith("badge:")).sort()).toEqual([
      "badge:boss_exam_midterm_shared_badge_EAC670_w",
      "badge:boss_exam_midterm_shared_badge_EBC873_w",
      "badge:boss_exam_midterm_shared_badge_EECF83_w",
    ]);
  });
});
