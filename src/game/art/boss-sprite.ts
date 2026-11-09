import Phaser from "phaser";
import { probeNote } from "../probe";
import {
  BOSS_ANIMS,
  BOSS_ASSET_ROOT,
  BOSS_ORIGIN,
  BOSS_PACK,
  BOSS_SCALE,
  type BossAnim,
} from "./boss-pack";

export function queueBossAtlases(scene: Phaser.Scene): void {
  for (const anim of BOSS_PACK.atlases) {
    if (scene.textures.exists(anim.textureKey)) continue;
    scene.load.atlas(anim.textureKey, `${BOSS_ASSET_ROOT}/${anim.image}`, `${BOSS_ASSET_ROOT}/${anim.json}`);
  }
}

export function ensureBossAnims(scene: Phaser.Scene): void {
  for (const anim of BOSS_ANIMS) {
    const key = anim.textureKey;
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: anim.frames.map((frame) => ({ key: anim.textureKey, frame })),
      frameRate: anim.fps,
      repeat: anim.repeat,
    });
  }
}

/** Confirms the four boss atlases and their animation keys loaded in this battle. */
export function reportBossLoad(scene: Phaser.Scene): void {
  ensureBossAnims(scene);
  const missing = BOSS_PACK.atlases.filter((anim) => !scene.textures.exists(anim.textureKey));
  const anims = BOSS_ANIMS.map((anim) => anim.key).filter((key) => scene.anims.exists(`boss_canopy_${key}`));
  if (missing.length > 0) {
    probeNote(`boss:missing:${missing.map((anim) => anim.textureKey).join(",")}`);
    return;
  }
  probeNote(`boss:loaded:${anims.join(",")}`);
}

/** Single-layer 林冠. The sheet faces left, so the battle sprite is not flipped. */
export class BossSprite {
  readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number, scale = BOSS_SCALE) {
    ensureBossAnims(scene);
    const idle = BOSS_ANIMS.find((anim) => anim.key === "idle");
    this.sprite = scene.add
      .sprite(x, y, idle?.textureKey ?? "boss_canopy_idle", idle?.frames[0])
      .setOrigin(BOSS_ORIGIN.x, BOSS_ORIGIN.y)
      .setScale(scale);
    this.play("idle");
  }

  play(anim: BossAnim, onComplete?: () => void): void {
    const spec = BOSS_ANIMS.find((item) => item.key === anim);
    if (!spec) return;
    this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    this.sprite.play(spec.textureKey);
    if (onComplete) this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
  }

  /** Plays each one-shot, then leaves idle looping. Defeat stays on its last frame. */
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
