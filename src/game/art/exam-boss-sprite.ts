import Phaser from "phaser";
import { EXAM_BOSS_SCALE, type ExamDef } from "../../domain/exams";
import { examLayers, examPhaseFxKey, type ExamPose } from "./exam-art";

/** Shared foot pivot. Phaser multiplies this by the untrimmed 768 source. */
const EXAM_LAYER_PIVOT = { x: 0.5, y: 0.875 };

/**
 * Every exam layer is the same 768 canvas with this pivot.
 * Body, cloak, cover, glow, crown, badge, compass, and the phase-change
 * effect all stand on the manifest point. An origin written as a fraction of
 * each layer's own trim shifts those layers by different amounts.
 */
export function placeExamLayer(sprite: Phaser.GameObjects.Sprite): void {
  sprite.setOrigin(EXAM_LAYER_PIVOT.x, EXAM_LAYER_PIVOT.y);
  sprite.setScale(EXAM_BOSS_SCALE);
  sprite.setPosition(0, 0);
  sprite.setVisible(true);
  sprite.setAlpha(1);
}

function frameNames(scene: Phaser.Scene, key: string, pose: ExamPose | null): string[] {
  if (!scene.textures.exists(key)) return [];
  return scene.textures.get(key).getFrameNames().filter((name) => {
    if (name === "__BASE") return false;
    return pose === null || name.includes(`_${pose}_`);
  }).sort();
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
      placeExamLayer(sprite);
      sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => placeExamLayer(sprite));
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
        placeExamLayer(sprite);
      }
    }
    if (fxFromPhase === null) return;
    const fxKey = examPhaseFxKey(this.exam, fxFromPhase);
    if (!fxKey) return;
    const names = frameNames(this.root.scene, fxKey, null);
    const frame = names[0];
    if (!frame) return;
    const fx = this.root.scene.add.sprite(0, 0, fxKey, frame);
    placeExamLayer(fx);
    fx.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => placeExamLayer(fx));
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
      placeExamLayer(fx);
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    }
  }
}
