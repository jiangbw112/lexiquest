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
