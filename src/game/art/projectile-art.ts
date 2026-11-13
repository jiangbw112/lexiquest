/**
 * Ranged projectile art. Frames live in atlas_fx_projectiles and load with the battle.
 * Spawn points come from the 512px anchors: (px - 256, py - 448) times the hero's display scale.
 */
import type Phaser from "phaser";
import type { ClassId } from "../../domain/types";

export const PROJECTILE_ATLAS = "atlas_fx_projectiles";
/** Texture is @2x, so 0.5 is one logical pixel. */
export const PROJECTILE_SCALE = 0.5;
/** Foot pivot inside a 512px side frame. */
export const SPAWN_PIVOT = { x: 256, y: 448 } as const;

export type RangedClassId = Extract<ClassId, "mage" | "ranger" | "healer" | "inventor">;

export interface ProjectileClip { key: string; frames: readonly string[]; frameRate: number; repeat: number }
export interface ProjectileArt {
  fly: ProjectileClip;
  hit: ProjectileClip;
  /** The frame faces right. True means rotate toward the flight direction. */
  rotateToDirection: boolean;
  /** Anchor on the 512px attack frame, before display scale. */
  anchorPx: readonly [number, number];
}

const SPEC = {
  mage: { fly: 4, rate: 12, rotate: true, anchor: [416.3, 258.6] },
  ranger: { fly: 2, rate: 12, rotate: true, anchor: [372.4, 276.6] },
  healer: { fly: 3, rate: 10, rotate: false, anchor: [329.3, 239.8] },
  inventor: { fly: 4, rate: 12, rotate: false, anchor: [340.5, 265.2] },
} as const;

function clip(id: RangedClassId, kind: "fly" | "hit"): ProjectileClip {
  const count = kind === "hit" ? 3 : SPEC[id].fly;
  const key = `fx_proj_${id}_${kind}`;
  return {
    key,
    frames: Array.from({ length: count }, (_, index) => `${key}_${index.toString().padStart(2, "0")}`),
    frameRate: kind === "fly" ? SPEC[id].rate : 12,
    repeat: kind === "hit" ? 0 : -1,
  };
}

export const PROJECTILE_ART: Record<RangedClassId, ProjectileArt> = {
  mage: { fly: clip("mage", "fly"), hit: clip("mage", "hit"), rotateToDirection: SPEC.mage.rotate, anchorPx: SPEC.mage.anchor },
  ranger: { fly: clip("ranger", "fly"), hit: clip("ranger", "hit"), rotateToDirection: SPEC.ranger.rotate, anchorPx: SPEC.ranger.anchor },
  healer: { fly: clip("healer", "fly"), hit: clip("healer", "hit"), rotateToDirection: SPEC.healer.rotate, anchorPx: SPEC.healer.anchor },
  inventor: { fly: clip("inventor", "fly"), hit: clip("inventor", "hit"), rotateToDirection: SPEC.inventor.rotate, anchorPx: SPEC.inventor.anchor },
};

export function hasProjectileArt(id: ClassId): id is RangedClassId {
  return id in PROJECTILE_ART;
}

/** Logical offset from the foot pivot at the hero's current display scale. */
export function spawnOffset(classId: RangedClassId, displayScale: number): { x: number; y: number } {
  const [px, py] = PROJECTILE_ART[classId].anchorPx;
  return {
    x: (px - SPAWN_PIVOT.x) * displayScale,
    y: (py - SPAWN_PIVOT.y) * displayScale,
  };
}

export function registerProjectileAnims(scene: Phaser.Scene): void {
  if (!scene.textures.exists(PROJECTILE_ATLAS)) return;
  for (const art of Object.values(PROJECTILE_ART)) {
    for (const item of [art.fly, art.hit]) {
      if (scene.anims.exists(item.key)) continue;
      scene.anims.create({
        key: item.key,
        frames: item.frames.map((frame) => ({ key: PROJECTILE_ATLAS, frame })),
        frameRate: item.frameRate,
        repeat: item.repeat,
      });
    }
  }
}

export function spawnProjectile(
  scene: Phaser.Scene,
  classId: RangedClassId,
  x: number,
  y: number,
  toX: number,
  toY: number,
): Phaser.GameObjects.Sprite {
  const art = PROJECTILE_ART[classId];
  const sprite = scene.add.sprite(x, y, PROJECTILE_ATLAS, art.fly.frames[0]).setOrigin(0.5).setScale(PROJECTILE_SCALE);
  if (art.rotateToDirection) sprite.setRotation(Math.atan2(toY - y, toX - x));
  sprite.play(art.fly.key);
  return sprite;
}

/** Plays the three-frame hit once, then destroys the sprite. Hit frames stay unrotated. */
export function playProjectileHit(sprite: Phaser.GameObjects.Sprite, classId: RangedClassId, onDone?: () => void): void {
  const art = PROJECTILE_ART[classId];
  sprite.setRotation(0).setFlipX(false);
  sprite.once(`animationcomplete-${art.hit.key}`, () => {
    sprite.destroy();
    onDone?.();
  });
  sprite.play(art.hit.key);
}
