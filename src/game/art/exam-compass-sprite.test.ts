import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import "./phaser-headless";
import type Phaser from "phaser";
import { EXAM_BOSS_SCALE, EXAM_BOSS_X, EXAM_BOSS_Y, examById } from "../../domain/exams";
import { ExamBossSprite } from "./exam-boss-sprite";
import {
  COMPASS_LAYER_KEY,
  COMPASS_PIVOT,
  COMPASS_REFERENCE_FRAME,
  COMPASS_SOURCE,
  compassDesignRect,
  compassWorldRect,
} from "./exam-compass";

interface AtlasFile {
  frames: Record<string, {
    frame: { x: number; y: number; w: number; h: number };
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

function atlas(url: URL): AtlasFile {
  return JSON.parse(readFileSync(url, "utf8")) as AtlasFile;
}

function drawnQuad(sprite: Phaser.GameObjects.Sprite): { x: number; y: number; w: number; h: number } {
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

describe("grade-6 compass sprite in Phaser", () => {
  let PhaserLib: typeof import("phaser");
  let game: Phaser.Game;

  afterAll(() => {
    game?.destroy(true);
  });

  it("draws one shared-scale plate on the left page, inside the canvas", async () => {
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
      const canvas = document.createElement("canvas");
      canvas.width = file.meta?.size?.w ?? 8;
      canvas.height = file.meta?.size?.h ?? 8;
      const texture = scene.textures.addAtlasJSONHash(key, canvas as unknown as HTMLImageElement, file);
      expect(texture, key).toBeTruthy();
    };
    addAtlas(COMPASS_LAYER_KEY, compassAtlas);
    addAtlas(BODY_KEY, bodyAtlas);

    const exam = examById("exam_g6_s2_final");
    if (!exam) throw new Error("exam");
    const boss = new ExamBossSprite(scene, EXAM_BOSS_X, EXAM_BOSS_Y, exam);
    boss.show(1, "idle", null);
    const sprites = boss.root.list.filter((child) => {
      const sprite = child as Phaser.GameObjects.Sprite;
      return sprite.type === "Sprite";
    }) as Phaser.GameObjects.Sprite[];
    expect(boss.root.list.some((child) => (child as Phaser.GameObjects.Graphics).type === "Graphics")).toBe(false);
    const compasses = sprites.filter((sprite) => sprite.texture.key === COMPASS_LAYER_KEY);
    expect(compasses).toHaveLength(1);
    const main = compasses[0];
    if (!main) throw new Error("compass sprite");
    const body = sprites.find((sprite) => sprite.texture.key === BODY_KEY);
    if (!body) throw new Error("body");

    expect(main.visible).toBe(true);
    expect(main.alpha).toBeGreaterThan(0);
    expect(main.originX).toBe(COMPASS_PIVOT.x);
    expect(main.originY).toBe(COMPASS_PIVOT.y);
    expect(main.scaleX).toBe(EXAM_BOSS_SCALE);
    expect(main.x).toBe(0);
    expect(main.y).toBe(0);
    expect(body.originX).toBe(COMPASS_PIVOT.x);
    expect(body.originY).toBe(COMPASS_PIVOT.y);
    expect(body.scaleX).toBe(EXAM_BOSS_SCALE);
    expect(body.x).toBe(main.x);
    expect(body.y).toBe(main.y);

    const names = main.texture.getFrameNames().filter((name) => name !== "__BASE");
    expect(names.length).toBeGreaterThan(8);
    main.anims?.stop();
    for (const name of names) {
      main.setFrame(name);
      const plate = drawnQuad(main);
      const design = compassWorldRect(compassDesignRect({
        x: main.frame.x,
        y: main.frame.y,
        w: main.frame.width,
        h: main.frame.height,
      }));
      const bounds = main.getBounds();
      expect(plate.x, name).toBeCloseTo(design.x, 4);
      expect(plate.y, name).toBeCloseTo(design.y, 4);
      expect(plate.w, name).toBeCloseTo(design.w, 4);
      expect(plate.h, name).toBeCloseTo(design.h, 4);
      expect(plate.x, name).toBeGreaterThanOrEqual(0);
      expect(plate.y, name).toBeGreaterThanOrEqual(0);
      expect(plate.x + plate.w, name).toBeLessThanOrEqual(1280);
      expect(plate.y + plate.h, name).toBeLessThanOrEqual(720);
      expect(bounds.x, name).toBeGreaterThanOrEqual(0);
      expect(bounds.y, name).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width, name).toBeLessThanOrEqual(1280);
      expect(bounds.y + bounds.height, name).toBeLessThanOrEqual(800);
      expect(main.scaleX, name).toBe(EXAM_BOSS_SCALE);
    }

    main.setFrame(`${COMPASS_LAYER_KEY}_idle_00`);
    const idlePlate = drawnQuad(main);
    const bodyPlate = drawnQuad(body);
    expect(idlePlate).toEqual({ x: 942.5, y: 321, w: 23.5, h: 42 });
    expect(idlePlate.x + idlePlate.w / 2).toBeLessThan(bodyPlate.x + bodyPlate.w / 2);
    expect(idlePlate.x).toBeGreaterThan(bodyPlate.x);
    expect(idlePlate.x).toBeLessThan(bodyPlate.x + bodyPlate.w);
    expect(idlePlate.y).toBeGreaterThan(bodyPlate.y);
    expect(idlePlate.y).toBeLessThan(bodyPlate.y + bodyPlate.h);
  });
});
