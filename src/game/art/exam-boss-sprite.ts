import Phaser from "phaser";
import { EXAM_BOSS_SCALE, type ExamDef } from "../../domain/exams";
import { examLayers, examPhaseFxKey, type ExamPose } from "./exam-art";

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

/** Atlas foot pivot. Phaser multiplies origin by the untrimmed source, not the trimmed plate. */
const ORNAMENT_PIVOT = { x: 0.5, y: 0.875 };

function isCrownOrBadge(key: string): boolean {
  return key.includes("_crown_") || key.includes("_badge_");
}

/**
 * Crown and badge plates are a small trim of the 768 source.
 * plant() divides by that trim, then Phaser multiplies by the full source and the plate leaves the view.
 * The atlas pivot keeps the crown on the head and the badge on the chest. The body still uses plant().
 */
function placeCrownOrBadge(sprite: Phaser.GameObjects.Sprite): void {
  sprite.setOrigin(ORNAMENT_PIVOT.x, ORNAMENT_PIVOT.y);
  sprite.setScale(EXAM_BOSS_SCALE);
  sprite.setPosition(0, 0);
  sprite.setVisible(true);
  sprite.setAlpha(1);
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
      const sprite = this.root.scene.add.sprite(0, 0, layer.key, frame);
      const place = isCrownOrBadge(layer.key) ? placeCrownOrBadge : plant;
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
