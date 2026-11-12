import type Phaser from "phaser";
import { resolvedClassId } from "../../domain/class-unlock";
import type { ClassId } from "../../domain/types";
import {
  CLASS_ASSET_ROOT,
  CLASS_ATLASES,
  PORTRAIT_ATLAS,
  classAtlasKeys,
  type ClassView,
} from "./class-atlas";

export const WREATH_PLACES_KEY = "cls:wreath-places";

export function savedClassId(save: { player?: { classId?: string }; finalBossCleared?: boolean } | null | undefined): ClassId {
  return resolvedClassId(save?.player?.classId, save);
}

function queueAtlas(scene: Phaser.Scene, key: string): void {
  const entry = CLASS_ATLASES[key];
  if (!entry || scene.textures.exists(key)) return;
  scene.load.atlas(key, `${CLASS_ASSET_ROOT}/${entry.png}`, `${CLASS_ASSET_ROOT}/${entry.json}`);
}

/** Shared side sheet plus this class. Not used by BootScene. */
export function queueClassSide(scene: Phaser.Scene, classId: ClassId): void {
  for (const key of classAtlasKeys(classId, "side")) queueAtlas(scene, key);
}

/** Shared top sheet plus this class, at @2x. */
export function queueClassTop(scene: Phaser.Scene, classId: ClassId): void {
  for (const key of classAtlasKeys(classId, "top" satisfies ClassView)) queueAtlas(scene, key);
}

export function queueClassWreath(scene: Phaser.Scene): void {
  queueAtlas(scene, "cls:wreath");
  if (!scene.cache.json.exists(WREATH_PLACES_KEY)) {
    scene.load.json(WREATH_PLACES_KEY, `${CLASS_ASSET_ROOT}/wreath/places.json`);
  }
}

/** Class picker. Six stills, nothing else from the class packs. */
export function queueClassPortraits(scene: Phaser.Scene): void {
  queueAtlas(scene, PORTRAIT_ATLAS);
}
