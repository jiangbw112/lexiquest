// Vite cannot import files from public/, so the client reads this copy.
// public/assets/boss/canopy/v0.1/manifest.json is the same file and is checked in tests.
import manifest from "./data/boss-canopy-manifest.json";

/** Provisional v0.1 林冠. One layer, faces left, no flip. */
export const BOSS_PACK = manifest;

export const BOSS_ASSET_ROOT = "assets/boss/canopy/v0.1";

/** @2x source at half scale. The pack's recommended battle scale. */
export const BOSS_SCALE = manifest.recommendedBattle.scale;

export const BOSS_ORIGIN = { x: manifest.pivot.normalized[0], y: manifest.pivot.normalized[1] } as const;

export const BOSS_BATTLE_POS = { x: manifest.recommendedBattle.x, y: manifest.recommendedBattle.y } as const;

export type BossAnim = "idle" | "attack" | "hit" | "defeat";

export const BOSS_ANIMS = manifest.animations.map((anim) => ({
  key: anim.anim as BossAnim,
  textureKey: anim.textureKey,
  frameCount: anim.frameCount,
  fps: anim.fps,
  repeat: anim.repeat,
  frames: anim.frameNames,
}));

/**
 * What 林冠 plays after one player action.
 * A phase change is a hit, then idle: the counterattack is skipped.
 * Defeat holds. It does not return to idle.
 */
export function canopyPoses(input: {
  enemyHpBefore: number;
  enemyHpAfter: number;
  phaseIndexBefore: number;
  phaseIndexAfter: number;
  enemyHitsBefore: number;
  enemyHitsAfter: number;
  phase: string;
}): BossAnim[] {
  const poses: BossAnim[] = [];
  const hurt = input.enemyHpAfter < input.enemyHpBefore || input.phaseIndexAfter > input.phaseIndexBefore;
  const swung = input.enemyHitsAfter > input.enemyHitsBefore;
  if (hurt) poses.push("hit");
  if (input.phase === "won") {
    poses.push("defeat");
    return poses;
  }
  if (swung) poses.push("attack");
  if (poses.length === 0) return ["idle"];
  poses.push("idle");
  return poses;
}
