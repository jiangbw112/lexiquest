import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import "./phaser-headless";
import type Phaser from "phaser";
import { examById } from "../../domain/exams";
import { ExamBossSprite, plantExamLayer } from "./exam-boss-sprite";
import {
  COMPASS_DISPLAY_SCALE,
  COMPASS_LAYER_KEY,
  COMPASS_OUTLINE_DELTAS,
  COMPASS_PIVOT,
  COMPASS_PLATE,
  COMPASS_REFERENCE_FRAME,
  COMPASS_SOURCE,
  compassBattleRect,
  compassCardRect,
  cssHex,
  phaserTrimmedDrawRect,
  plantedRect,
  rectsOverlap,
} from "./exam-compass";

interface AtlasFile {
  frames: Record<string, {
    frame: { x: number; y: number; w: number; h: number };
    trimmed?: boolean;
    spriteSourceSize: { x: number; y: number; w: number; h: number };
    sourceSize: { w: number; h: number };
    pivot?: { x: number; y: number };
  }>;
  meta?: { size?: { w: number; h: number } };
}

const COMPASS_ATLAS = new URL(
  "../../../public/assets/exam/final/boss/exam_final/g6/v0.1/atlas/boss_exam_final_g6_compass_w@2x.json",
  import.meta.url,
);
const BODY_ATLAS = new URL(
  "../../../public/assets/exam/final/boss/exam_final/g6/v0.1/atlas/boss_exam_final_g6_w_idle@2x.json",
  import.meta.url,
);
const BODY_KEY = "boss_exam_final_g6_w_idle";
const BODY_IDLE = "boss_exam_final_g6_body_w_idle_00";

function atlas(url: URL): AtlasFile {
  return JSON.parse(readFileSync(url, "utf8")) as AtlasFile;
}

function drawnQuad(sprite: Phaser.GameObjects.Sprite): { x: number; y: number; w: number; h: number } {
  const frame = sprite.frame;
  return {
    x: sprite.x + (-sprite.displayOriginX + frame.x) * sprite.scaleX,
    y: sprite.y + (-sprite.displayOriginY + frame.y) * sprite.scaleY,
    w: frame.cutWidth * sprite.scaleX,
    h: frame.cutHeight * sprite.scaleY,
  };
}

function boundsRect(sprite: Phaser.GameObjects.Sprite): { x: number; y: number; w: number; h: number } {
  const bounds = sprite.getBounds();
  return { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
}

describe("grade-6 compass sprite in Phaser", () => {
  let PhaserLib: typeof import("phaser");
  let game: Phaser.Game;

  afterAll(() => {
    game?.destroy(true);
  });

  it("lands the live sprite on the plate and keeps the shared body plant", async () => {
    const loaded = await import("phaser");
    PhaserLib = ((loaded as { default?: typeof import("phaser") }).default ?? loaded) as typeof import("phaser");
    const compassAtlas = atlas(COMPASS_ATLAS);
    const bodyAtlas = atlas(BODY_ATLAS);
    const idle = compassAtlas.frames[`${COMPASS_LAYER_KEY}_idle_00`];
    expect(idle?.spriteSourceSize).toEqual(COMPASS_REFERENCE_FRAME);
    expect(idle?.sourceSize).toEqual({ w: COMPASS_SOURCE, h: COMPASS_SOURCE });

    const scene = await new Promise<Phaser.Scene>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("phaser headless did not start")), 5000);
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

    const addAtlas = (key: string, file: AtlasFile) => {
      const source = scene.game.canvas;
      source.width = file.meta?.size?.w ?? 8;
      source.height = file.meta?.size?.h ?? 8;
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const texture = scene.textures.addAtlasJSONHash(key, canvas as unknown as HTMLImageElement, file);
      expect(texture, key).toBeTruthy();
    };
    addAtlas(COMPASS_LAYER_KEY, compassAtlas);
    addAtlas(BODY_KEY, bodyAtlas);

    const exam = examById("exam_g6_s2_final");
    if (!exam) throw new Error("exam");
    const boss = new ExamBossSprite(scene, 0, 0, exam);
    boss.show(2, "idle", null);
    const sprites = boss.root.list.filter((child) => {
      const sprite = child as Phaser.GameObjects.Sprite;
      return sprite.type === "Sprite" && sprite.texture?.key === COMPASS_LAYER_KEY;
    }) as Phaser.GameObjects.Sprite[];
    expect(sprites).toHaveLength(1 + COMPASS_OUTLINE_DELTAS.length);
    const main = sprites.at(-1);
    if (!main) throw new Error("compass sprite");
    const plate = compassBattleRect({
      x: main.frame.x,
      y: main.frame.y,
      w: main.frame.width,
      h: main.frame.height,
    });
    const card = compassCardRect({
      x: main.frame.x,
      y: main.frame.y,
      w: main.frame.width,
      h: main.frame.height,
    });
    const drawn = drawnQuad(main);
    const bounds = boundsRect(main);

    expect(main.texture.key).toBe(COMPASS_LAYER_KEY);
    expect(main.texture.key).not.toBe("__MISSING");
    expect(main.frame.name).toBe(`${COMPASS_LAYER_KEY}_idle_00`);
    expect(main.visible).toBe(true);
    expect(main.alpha).toBeGreaterThan(0);
    expect(main.originX).toBe(COMPASS_PIVOT.x);
    expect(main.originY).toBe(COMPASS_PIVOT.y);
    expect(main.scaleX).toBe(COMPASS_DISPLAY_SCALE);
    expect(drawn.x).toBeCloseTo(plate.x, 4);
    expect(drawn.y).toBeCloseTo(plate.y, 4);
    expect(drawn.w).toBeCloseTo(plate.w, 4);
    expect(drawn.h).toBeCloseTo(plate.h, 4);
    expect(rectsOverlap(bounds, card)).toBe(true);
    expect(rectsOverlap(bounds, plate)).toBe(true);
    expect(bounds.x).toBeLessThanOrEqual(plate.x);
    expect(bounds.y).toBeLessThanOrEqual(plate.y);
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(plate.x + plate.w);
    expect(bounds.y + bounds.h).toBeGreaterThanOrEqual(plate.y + plate.h);

    const ink = cssHex(COMPASS_PLATE);
    sprites.slice(0, -1).forEach((sprite, index) => {
      const delta = COMPASS_OUTLINE_DELTAS[index];
      if (!delta) throw new Error("outline");
      const copy = drawnQuad(sprite);
      expect(sprite.texture.key, String(index)).toBe(COMPASS_LAYER_KEY);
      expect(sprite.texture.key, String(index)).not.toBe("__MISSING");
      expect(sprite.visible, String(index)).toBe(true);
      expect(sprite.alpha, String(index)).toBeGreaterThan(0);
      expect(sprite.tintTopLeft, String(index)).toBe(ink);
      expect(copy.x, String(index)).toBeCloseTo(plate.x + delta.x, 4);
      expect(copy.y, String(index)).toBeCloseTo(plate.y + delta.y, 4);
    });

    const historical = plantedRect(COMPASS_REFERENCE_FRAME, COMPASS_DISPLAY_SCALE);
    const shift = { x: 148 - historical.x, y: -196 - historical.y };
    const thrown = scene.add.sprite(0, 0, COMPASS_LAYER_KEY, `${COMPASS_LAYER_KEY}_idle_00`);
    plantExamLayer(thrown);
    thrown.setScale(COMPASS_DISPLAY_SCALE);
    thrown.setPosition(shift.x, shift.y);
    const thrownQuad = drawnQuad(thrown);
    const thrownOrigin = {
      x: (COMPASS_PIVOT.x * COMPASS_SOURCE - COMPASS_REFERENCE_FRAME.x) / COMPASS_REFERENCE_FRAME.w,
      y: (COMPASS_PIVOT.y * COMPASS_SOURCE - COMPASS_REFERENCE_FRAME.y) / COMPASS_REFERENCE_FRAME.h,
    };
    const predicted = phaserTrimmedDrawRect(COMPASS_REFERENCE_FRAME, thrownOrigin, COMPASS_DISPLAY_SCALE, shift);
    expect(thrownQuad.x).toBeCloseTo(-1114.298, 2);
    expect(thrownQuad.y).toBeCloseTo(-4646.286, 2);
    expect(thrownQuad.x).toBeCloseTo(predicted.x, 4);
    expect(thrownQuad.y).toBeCloseTo(predicted.y, 4);
    expect(rectsOverlap(boundsRect(thrown), { x: 148, y: -196, w: 70.5, h: 126 })).toBe(false);

    const fixed = scene.add.sprite(0, 0, COMPASS_LAYER_KEY, `${COMPASS_LAYER_KEY}_idle_00`);
    fixed.setOrigin(COMPASS_PIVOT.x, COMPASS_PIVOT.y);
    fixed.setScale(COMPASS_DISPLAY_SCALE);
    fixed.setPosition(shift.x, shift.y);
    const fixedQuad = drawnQuad(fixed);
    expect(fixedQuad).toEqual({ x: 148, y: -196, w: 70.5, h: 126 });
    expect(rectsOverlap(boundsRect(fixed), { x: 136, y: -208, w: 94.5, h: 150 })).toBe(true);

    const body = scene.add.sprite(0, 0, BODY_KEY, BODY_IDLE);
    plantExamLayer(body);
    const bodyFrame = body.frame;
    const bodyDrawn = drawnQuad(body);
    const bodyPivot = {
      x: (bodyFrame.x - COMPASS_PIVOT.x * bodyFrame.realWidth) * body.scaleX,
      y: (bodyFrame.y - COMPASS_PIVOT.y * bodyFrame.realHeight) * body.scaleY,
    };
    expect(body.scaleX).toBe(0.5);
    expect(bodyDrawn.x - bodyPivot.x).toBeCloseTo(0.30917874396135403, 6);
    expect(bodyDrawn.y - bodyPivot.y).toBeCloseTo(-35.40983606557376, 6);
  });
});
