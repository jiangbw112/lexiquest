import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./phaser-headless";
import type Phaser from "phaser";
import { EXAM_BOSS_SCALE, EXAM_BOSS_X, EXAM_BOSS_Y, EXAMS } from "../../domain/exams";
import { EXAM_ANSWER_REVEAL, answerRevealLayout, type ScreenBox } from "../answer-reveal-layout";
import { EXAM_STRIKE_BUTTON } from "../battle-hud";
import { examAtlases, examLayers, examPhaseFxKey, type ExamPose } from "./exam-art";
import { COMPASS_LAYER_KEY } from "./exam-compass";
import { ExamBossSprite, placeExamLayer } from "./exam-boss-sprite";

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

function separation(a: ScreenBox, b: ScreenBox): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  if (dx < 0 && dy < 0) return Math.max(dx, dy);
  if (dx < 0) return dy;
  if (dy < 0) return dx;
  return Math.max(dx, dy);
}

function trimmedOrigin(sprite: Phaser.GameObjects.Sprite): void {
  const frame = sprite.frame;
  const sourceW = frame.realWidth || frame.width;
  const sourceH = frame.realHeight || frame.height;
  const pivotX = frame.customPivot ? frame.pivotX : 0.5;
  const pivotY = frame.customPivot ? frame.pivotY : 0.875;
  const width = frame.width || 1;
  const height = frame.height || 1;
  sprite.setOrigin((pivotX * sourceW - frame.x) / width, (pivotY * sourceH - frame.y) / height);
  sprite.setScale(EXAM_BOSS_SCALE);
  sprite.setPosition(0, 0);
}

function inside(plate: Plate, label: string): void {
  expect(plate.x, label).toBeGreaterThanOrEqual(0);
  expect(plate.y, label).toBeGreaterThanOrEqual(0);
  expect(plate.x + plate.w, label).toBeLessThanOrEqual(VIEW.w);
  expect(plate.y + plate.h, label).toBeLessThanOrEqual(VIEW.h);
}

describe("exam boss layers share one pivot", () => {
  let PhaserLib: typeof import("phaser");
  let game: Phaser.Game;
  let scene: Phaser.Scene;
  const answer = answerRevealLayout(EXAM_ANSWER_REVEAL);
  const strike: ScreenBox = {
    x: EXAM_STRIKE_BUTTON.x - EXAM_STRIKE_BUTTON.w / 2,
    y: EXAM_STRIKE_BUTTON.y - EXAM_STRIKE_BUTTON.h / 2,
    w: EXAM_STRIKE_BUTTON.w,
    h: EXAM_STRIKE_BUTTON.h,
  };

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
        expect(scene.textures.addAtlasJSONHash(file.key, canvas as unknown as HTMLImageElement, data), file.key).toBeTruthy();
      }
    }
  });

  afterAll(() => {
    game?.destroy(true);
  });

  it("moves each layer from its own trim offset onto the shared pivot", () => {
    const samples = [
      { key: "boss_exam_final_g6_w_idle", frame: "boss_exam_final_g6_body_w_idle_00", dy: 35.41 },
      { key: "boss_exam_final_shared_cloak_316E60_w_idle", frame: "boss_exam_final_shared_cloak_316E60_w_idle_00", dy: 46.35 },
      { key: "boss_exam_final_shared_cover_gold_p1_EAC670_w_idle", frame: "boss_exam_final_shared_cover_gold_p1_EAC670_w_idle_00", dy: 127.09 },
      { key: "boss_exam_midterm_shared_glow_w", frame: "boss_exam_midterm_shared_glow_w_idle_00", dy: 495.5 },
      { key: COMPASS_LAYER_KEY, frame: `${COMPASS_LAYER_KEY}_idle_00`, dy: 1483.43 },
    ];
    const root = scene.add.container(EXAM_BOSS_X, EXAM_BOSS_Y);
    for (const sample of samples) {
      const sprite = scene.add.sprite(0, 0, sample.key, sample.frame);
      root.add(sprite);
      trimmedOrigin(sprite);
      const before = drawnWorld(sprite);
      placeExamLayer(sprite);
      const after = drawnWorld(sprite);
      expect(after.y - before.y, sample.frame).toBeCloseTo(sample.dy, 1);
      expect(sprite.originX, sample.frame).toBe(0.5);
      expect(sprite.originY, sample.frame).toBe(0.875);
      expect(sprite.scaleX, sample.frame).toBe(EXAM_BOSS_SCALE);
      inside(after, sample.frame);
      sprite.destroy();
    }
    root.destroy();
  });

  it("keeps every frame of every exam inside the view and off the answer plate", () => {
    expect(EXAMS.filter((exam) => exam.kind === "mid")).toHaveLength(7);
    expect(EXAMS.filter((exam) => exam.kind === "final")).toHaveLength(8);
    for (const exam of EXAMS) {
      for (let phase = 1; phase <= exam.phases; phase += 1) {
        for (const pose of POSES) {
          const label = `${exam.id} phase ${phase} ${pose}`;
          const boss = new ExamBossSprite(scene, EXAM_BOSS_X, EXAM_BOSS_Y, exam);
          boss.show(phase, pose, phase < exam.phases ? phase : null);
          expect(boss.root.list.some((child) => (child as Phaser.GameObjects.GameObject).type === "Graphics"), label).toBe(false);
          const sprites = boss.root.list.filter((child): child is Phaser.GameObjects.Sprite => {
            return (child as Phaser.GameObjects.Sprite).type === "Sprite";
          });
          expect(sprites.length, label).toBeGreaterThan(0);
          const keys = new Set(sprites.map((sprite) => sprite.texture.key));
          for (const layer of examLayers(exam, phase, pose)) expect(keys.has(layer.key), `${label} ${layer.key}`).toBe(true);
          const fxKey = phase < exam.phases ? examPhaseFxKey(exam, phase) : null;
          if (fxKey) expect(keys.has(fxKey), `${label} fx`).toBe(true);
          if (exam.id === "exam_g6_s2_final") {
            expect(sprites.filter((sprite) => sprite.texture.key === COMPASS_LAYER_KEY), label).toHaveLength(1);
          }

          for (const sprite of sprites) {
            expect(sprite.originX, label).toBe(0.5);
            expect(sprite.originY, label).toBe(0.875);
            expect(sprite.scaleX, label).toBe(EXAM_BOSS_SCALE);
            expect(sprite.scaleY, label).toBe(EXAM_BOSS_SCALE);
            expect(sprite.x, label).toBe(0);
            expect(sprite.y, label).toBe(0);
            expect(sprite.visible, label).toBe(true);
            expect(sprite.alpha, label).toBeGreaterThan(0);
            sprite.anims?.stop();
            const names = sprite.texture.getFrameNames().filter((name) => name !== "__BASE" && (sprite.texture.key.startsWith("fx_") || name.includes(`_${pose}_`)));
            expect(names.length, `${label} ${sprite.texture.key}`).toBeGreaterThan(0);
            for (const name of names) {
              sprite.setFrame(name);
              placeExamLayer(sprite);
              const plate = drawnWorld(sprite);
              const bounds = sprite.getBounds();
              inside(plate, `${label} ${name}`);
              inside({ x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height }, `${label} ${name} bounds`);
              expect(separation(answer.plate, plate), `${label} ${name}`).toBeGreaterThanOrEqual(8);
              expect(separation(answer.button, plate), `${label} ${name}`).toBeGreaterThanOrEqual(8);
              expect(separation(strike, plate), `${label} ${name}`).toBeGreaterThanOrEqual(8);
            }
          }

          if (exam.id === "exam_g6_s2_final" && phase === 1 && pose === "idle") {
            const body = sprites.find((sprite) => sprite.texture.key === "boss_exam_final_g6_w_idle");
            const cloak = sprites.find((sprite) => sprite.texture.key.includes("cloak_316E60"));
            const cover = sprites.find((sprite) => sprite.texture.key.includes("cover_gold_p1"));
            const compass = sprites.find((sprite) => sprite.texture.key === COMPASS_LAYER_KEY);
            if (!body || !cloak || !cover || !compass) throw new Error(label);
            body.setFrame("boss_exam_final_g6_body_w_idle_00");
            cloak.setFrame("boss_exam_final_shared_cloak_316E60_w_idle_00");
            cover.setFrame("boss_exam_final_shared_cover_gold_p1_EAC670_w_idle_00");
            compass.setFrame(`${COMPASS_LAYER_KEY}_idle_00`);
            placeExamLayer(body);
            placeExamLayer(cloak);
            placeExamLayer(cover);
            placeExamLayer(compass);
            expect(drawnWorld(body)).toMatchObject({ x: 825, y: 284, w: 310.5, h: 244 });
            expect(drawnWorld(cloak)).toMatchObject({ x: 818, y: 288, w: 324.5, h: 233 });
            expect(drawnWorld(cover)).toMatchObject({ x: 834, y: 277, w: 292.5, h: 201.5 });
            const compassPlate = drawnWorld(compass);
            expect(compassPlate).toEqual({ x: 942.5, y: 321, w: 23.5, h: 42 });
            const bodyPlate = drawnWorld(body);
            expect(compassPlate.x + compassPlate.w / 2).toBeLessThan(bodyPlate.x + bodyPlate.w / 2);
            expect(compassPlate.x).toBeGreaterThan(bodyPlate.x);
            expect(compassPlate.y).toBeGreaterThan(bodyPlate.y);
            expect(compassPlate.y + compassPlate.h).toBeLessThan(bodyPlate.y + bodyPlate.h);
          }

          if (fxKey) {
            const fx = sprites.find((sprite) => sprite.texture.key === fxKey);
            if (!fx) throw new Error(`${label} fx sprite`);
            const frame02 = fx.texture.getFrameNames().find((name) => name.endsWith("_02"));
            expect(frame02, fxKey).toBeTruthy();
            if (frame02) {
              fx.setFrame(frame02);
              placeExamLayer(fx);
              inside(drawnWorld(fx), `${label} ${frame02}`);
            }
          }
          boss.root.destroy(true);
        }
      }
    }
  });
});
