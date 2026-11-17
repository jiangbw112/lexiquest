import Phaser from "phaser";
import { EXAM_BOSS_SCALE, type ExamDef } from "../../domain/exams";
import { examLayers, examPhaseFxKey, type ExamPose } from "./exam-art";
import {
  COMPASS_DISPLAY_SCALE,
  COMPASS_GLOW,
  COMPASS_GLOW_PAD,
  COMPASS_LAYER_KEY,
  COMPASS_OUTLINE_DELTAS,
  COMPASS_PLATE,
  compassBattleRect,
  compassShift,
  cssHex,
  isCompassLayer,
} from "./exam-compass";

function frameNames(scene: Phaser.Scene, key: string, pose: ExamPose | null): string[] {
  if (!scene.textures.exists(key)) return [];
  return scene.textures.get(key).getFrameNames().filter((name) => {
    if (name === "__BASE") return false;
    return pose === null || name.includes(`_${pose}_`);
  }).sort();
}

/** The atlas pivot is the foot point. Scale stays 0.5 for this art batch. */
function plant(sprite: Phaser.GameObjects.Sprite): void {
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

/** Larger plate, cream card, ink copies. Other layers never call this. */
function addCompass(root: Phaser.GameObjects.Container, names: string[], pose: ExamPose): void {
  const scene = root.scene;
  const first = names[0];
  if (!first) return;
  const glow = scene.add.graphics();
  root.add(glow);
  const outlines = COMPASS_OUTLINE_DELTAS.map((delta) => {
    const sprite = scene.add.sprite(0, 0, COMPASS_LAYER_KEY, first);
    root.add(sprite);
    return { sprite, delta };
  });
  const main = scene.add.sprite(0, 0, COMPASS_LAYER_KEY, first);
  root.add(main);
  const place = (sprite: Phaser.GameObjects.Sprite, dx: number, dy: number) => {
    plant(sprite);
    const shift = compassShift();
    sprite.setScale(COMPASS_DISPLAY_SCALE);
    sprite.setPosition(shift.x + dx, shift.y + dy);
  };
  const sync = () => {
    place(main, 0, 0);
    const frameName = main.frame.name;
    for (const item of outlines) {
      if (item.sprite.frame.name !== frameName) item.sprite.setFrame(frameName);
      place(item.sprite, item.delta.x, item.delta.y);
      item.sprite.setTint(cssHex(COMPASS_PLATE));
    }
    const rect = compassBattleRect({
      x: main.frame.x,
      y: main.frame.y,
      w: main.frame.width,
      h: main.frame.height,
    });
    glow.clear();
    glow.fillStyle(cssHex(COMPASS_GLOW), 0.96);
    glow.fillRoundedRect(
      rect.x - COMPASS_GLOW_PAD,
      rect.y - COMPASS_GLOW_PAD,
      rect.w + COMPASS_GLOW_PAD * 2,
      rect.h + COMPASS_GLOW_PAD * 2,
      18,
    );
  };
  sync();
  if (names.length < 2) return;
  const anim = `${COMPASS_LAYER_KEY}:${pose}`;
  if (!scene.anims.exists(anim)) {
    scene.anims.create({
      key: anim,
      frames: names.map((name) => ({ key: COMPASS_LAYER_KEY, frame: name })),
      frameRate: 8,
      repeat: pose === "idle" ? -1 : 0,
    });
  }
  main.play(anim);
  main.on(Phaser.Animations.Events.ANIMATION_UPDATE, sync);
  sync();
}

export class ExamBossSprite {
  readonly root: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly exam: ExamDef,
  ) {
    this.root = scene.add.container(x, y);
  }

  show(phase: number, pose: ExamPose, fxFromPhase: number | null): void {
    this.root.removeAll(true);
    for (const layer of examLayers(this.exam, phase, pose)) {
      const names = frameNames(this.root.scene, layer.key, layer.pose);
      const frame = names[0];
      if (!frame) continue;
      if (isCompassLayer(layer.key)) {
        addCompass(this.root, names, pose);
        continue;
      }
      const sprite = this.root.scene.add.sprite(0, 0, layer.key, frame);
      plant(sprite);
      sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => plant(sprite));
      this.root.add(sprite);
      if (names.length > 1) {
        const anim = `${layer.key}:${pose}`;
        if (!this.root.scene.anims.exists(anim)) {
          this.root.scene.anims.create({
            key: anim,
            frames: names.map((name) => ({ key: layer.key, frame: name })),
            frameRate: 8,
            repeat: pose === "idle" ? -1 : 0,
          });
        }
        sprite.play(anim);
        plant(sprite);
      }
    }
    if (fxFromPhase === null) return;
    const fxKey = examPhaseFxKey(this.exam, fxFromPhase);
    if (!fxKey) return;
    const names = frameNames(this.root.scene, fxKey, null);
    const frame = names[0];
    if (!frame) return;
    const fx = this.root.scene.add.sprite(0, 0, fxKey, frame);
    plant(fx);
    this.root.add(fx);
    if (names.length > 1) {
      const anim = `${fxKey}:once`;
      if (!this.root.scene.anims.exists(anim)) {
        this.root.scene.anims.create({
          key: anim,
          frames: names.map((name) => ({ key: fxKey, frame: name })),
          frameRate: 8,
          repeat: 0,
        });
      }
      fx.play(anim);
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    }
  }
}
