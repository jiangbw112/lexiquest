import Phaser from "phaser";
import {
  CHAPTER_BOSS_DISPLAY_HEIGHT,
  CHAPTER_BOSS_FPS,
  CHAPTER_BOSS_POSES,
  chapterBossAsset,
  chapterBossTextureKey,
  type ChapterBossPose,
} from "../../domain/chapter-bosses";
import type { BossAnim } from "./boss-pack";

export function queueChapterBoss(scene: Phaser.Scene, bossId: string): void {
  for (const pose of CHAPTER_BOSS_POSES) {
    const key = chapterBossTextureKey(bossId, pose);
    if (scene.textures.exists(key)) continue;
    const asset = chapterBossAsset(bossId, pose);
    scene.load.atlas(key, asset.imageUrl, asset.dataUrl);
  }
}

function poseFrames(scene: Phaser.Scene, bossId: string, pose: ChapterBossPose): string[] {
  const key = chapterBossTextureKey(bossId, pose);
  if (!scene.textures.exists(key)) return [];
  return scene.textures.get(key).getFrameNames().filter((name) => name !== "__BASE").sort();
}

function ensurePose(scene: Phaser.Scene, bossId: string, pose: ChapterBossPose): void {
  const key = chapterBossTextureKey(bossId, pose);
  if (scene.anims.exists(key) || !scene.textures.exists(key)) return;
  const names = poseFrames(scene, bossId, pose);
  if (names.length === 0) return;
  scene.anims.create({
    key,
    frames: names.map((frame) => ({ key, frame })),
    frameRate: CHAPTER_BOSS_FPS,
    repeat: pose === "idle" ? -1 : 0,
  });
}

/** Feet stay on the battle mark. Origin and scale come from the current frame, not a fixed atlas size. */
function plant(sprite: Phaser.GameObjects.Sprite): void {
  const frame = sprite.frame;
  const sourceW = frame.realWidth || frame.width;
  const sourceH = frame.realHeight || frame.height;
  const pivotX = frame.customPivot ? frame.pivotX : 0.5;
  const pivotY = frame.customPivot ? frame.pivotY : 1;
  const width = frame.width || 1;
  const height = frame.height || 1;
  sprite.setOrigin((pivotX * sourceW - frame.x) / width, (pivotY * sourceH - frame.y) / height);
  if (sourceH > 0) sprite.setScale(CHAPTER_BOSS_DISPLAY_HEIGHT / sourceH);
}

/** Milliseconds of the one-shot clips. Idle does not extend the lock. */
export function chapterBossReactionMs(scene: Phaser.Scene, bossId: string, poses: readonly BossAnim[]): number {
  let ms = 0;
  for (const pose of poses) {
    if (pose === "idle") continue;
    const count = poseFrames(scene, bossId, pose).length;
    if (count === 0) continue;
    ms += (count / CHAPTER_BOSS_FPS) * 1000;
  }
  return ms;
}

export class ChapterBossSprite {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly bossId: string;

  constructor(scene: Phaser.Scene, x: number, y: number, bossId: string) {
    this.bossId = bossId;
    for (const pose of CHAPTER_BOSS_POSES) ensurePose(scene, bossId, pose);
    const idle = chapterBossTextureKey(bossId, "idle");
    this.sprite = scene.add.sprite(x, y, idle).on(Phaser.Animations.Events.ANIMATION_UPDATE, () => plant(this.sprite));
    plant(this.sprite);
    this.play("idle");
  }

  play(anim: BossAnim, onComplete?: () => void): void {
    const key = chapterBossTextureKey(this.bossId, anim);
    if (!this.sprite.scene.anims.exists(key)) return;
    this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    this.sprite.play(key);
    plant(this.sprite);
    if (onComplete) this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
  }

  playSequence(anims: readonly BossAnim[]): void {
    const [head, ...rest] = anims;
    if (!head) return;
    if (rest.length === 0) {
      this.play(head);
      return;
    }
    this.play(head, () => this.playSequence(rest));
  }
}
