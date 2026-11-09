/**
 * Forest chapter cosmetics. Final art replaces the png/json files in
 * CHAPTER_ASSET_ROOT. Ids, frame names, and the foot pivot stay the same.
 */
import type Phaser from "phaser";
import { FOREST_REWARDS } from "../../domain/chapter-rewards";
import { WARRIOR_ANIMS, type WarriorAnim } from "./warrior-pack";

export const CHAPTER_ASSET_ROOT = "assets/chapter/forest/v0.1-placeholder";

export const PLACEHOLDER_ART_LABEL =
  "单色剪影占位，不是成品图。正式绘制排在林冠 Boss 剩余部分之后。换成同名图片即可，不必改代码。";

/** z from the warrior slot table, plus cosmetic_chest which that table does not list yet. */
export const COSMETIC_Z = {
  cosmetic_back: 6,
  cosmetic_chest: 47,
  cosmetic_head: 65,
} as const;

export const WARRIOR_SLOT_Z: Record<string, number> = {
  shadow: 0,
  back: 5,
  hand_main: 10,
  body_back: 20,
  outfit_back: 25,
  body: 30,
  outfit_body: 40,
  hair: 50,
  outfit_head: 60,
  body_front: 70,
  outfit_front: 75,
  hand_off: 80,
};

export interface ChapterCosmeticLayer {
  id: string;
  slot: string;
  z: number;
}

export function chapterCosmeticLayers(config = FOREST_REWARDS): ChapterCosmeticLayer[] {
  return Object.entries(config.slot_map).map(([id, slot]) => {
    const z = COSMETIC_Z[slot as keyof typeof COSMETIC_Z];
    if (z === undefined) throw new Error(`No z for cosmetic slot ${slot}`);
    return { id, slot, z };
  });
}

export function slotDepth(slot: string): number {
  if (slot in COSMETIC_Z) return COSMETIC_Z[slot as keyof typeof COSMETIC_Z];
  return WARRIOR_SLOT_Z[slot] ?? 0;
}

export function cosmeticTextureKey(id: string): string {
  return `chapter:${id}`;
}

export function cosmeticAnimKey(id: string, anim: WarriorAnim): string {
  return `${cosmeticTextureKey(id)}:${anim}`;
}

export function queueChapterCosmetics(scene: Phaser.Scene): void {
  for (const layer of chapterCosmeticLayers()) {
    const key = cosmeticTextureKey(layer.id);
    if (scene.textures.exists(key)) continue;
    scene.load.atlas(key, `${CHAPTER_ASSET_ROOT}/${layer.id}.png`, `${CHAPTER_ASSET_ROOT}/${layer.id}.json`);
  }
  if (!scene.textures.exists("title_leaf_icon")) {
    scene.load.image("title_leaf_icon", `${CHAPTER_ASSET_ROOT}/title_leaf_icon.png`);
  }
}

export function ensureCosmeticAnims(scene: Phaser.Scene): void {
  for (const layer of chapterCosmeticLayers()) {
    const texture = cosmeticTextureKey(layer.id);
    if (!scene.textures.exists(texture)) continue;
    for (const anim of WARRIOR_ANIMS) {
      const key = cosmeticAnimKey(layer.id, anim.key);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: anim.frames(layer.id).map((frame) => ({ key: texture, frame })),
        frameRate: anim.fps,
        repeat: anim.repeat,
      });
    }
  }
}
