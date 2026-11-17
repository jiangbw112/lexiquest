import Phaser from "phaser";
import { EXAM_BOSS_SCALE, type ExamDef } from "../../domain/exams";
import { examLayers, examPhaseFxKey, type ExamPose } from "./exam-art";
import {
  COMPASS_DISPLAY_SCALE,
  COMPASS_GLOW,
  COMPASS_HALO_RINGS,
  COMPASS_LAYER_KEY,
  COMPASS_OUTLINE_DELTAS,
  COMPASS_PIVOT,
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

/**
 * Foot plant for every exam layer except the compass, the crown, and the badge.
 * The origin is a fraction of the trimmed frame. Phaser then multiplies that fraction
 * by the untrimmed 768 source. On the grade-6 body idle frame, scale 0.5, the plate
 * sits about 0.31px to the right and 35.41px above the atlas pivot. Layers that share
 * this function stay aligned with each other, so the offset stays.
 */
export function plantExamLayer(sprite: Phaser.GameObjects.Sprite): void {
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

/** Atlas foot pivot. Phaser multiplies origin by the untrimmed source, not the trimmed plate. */
const ORNAMENT_PIVOT = { x: 0.5, y: 0.875 };

function isCrownOrBadge(key: string): boolean {
  return key.includes("_crown_") || key.includes("_badge_");
}

/**
 * Crown and badge plates are a small trim of the 768 source.
 * plantExamLayer() divides by that trim, then Phaser multiplies by the full source and the plate leaves the view.
 * The atlas pivot keeps the crown on the head and the badge on the chest. The body still uses plantExamLayer().
 */
function placeCrownOrBadge(sprite: Phaser.GameObjects.Sprite): void {
  sprite.setOrigin(ORNAMENT_PIVOT.x, ORNAMENT_PIVOT.y);
  sprite.setScale(EXAM_BOSS_SCALE);
  sprite.setPosition(0, 0);
  sprite.setVisible(true);
  sprite.setAlpha(1);
}

/** Larger plate, soft halo, ink copies. Other layers never call this. */
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
    sprite.setOrigin(COMPASS_PIVOT.x, COMPASS_PIVOT.y);
    sprite.setScale(COMPASS_DISPLAY_SCALE);
    sprite.setVisible(true);
    sprite.setAlpha(1);
    const shift = compassShift();
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
    const cream = cssHex(COMPASS_GLOW);
    for (const ring of COMPASS_HALO_RINGS) {
      glow.lineStyle(ring.line, cream, ring.alpha);
      glow.strokeRoundedRect(
        rect.x - ring.outset,
        rect.y - ring.outset,
        rect.w + ring.outset * 2,
        rect.h + ring.outset * 2,
        20,
      );
    }
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
      const place = isCrownOrBadge(layer.key) ? placeCrownOrBadge : plantExamLayer;
      place(sprite);
      sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => place(sprite));
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
        place(sprite);
      }
    }
    if (fxFromPhase === null) return;
    const fxKey = examPhaseFxKey(this.exam, fxFromPhase);
    if (!fxKey) return;
    const names = frameNames(this.root.scene, fxKey, null);
    const frame = names[0];
    if (!frame) return;
    const fx = this.root.scene.add.sprite(0, 0, fxKey, frame);
    plantExamLayer(fx);
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
