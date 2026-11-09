/**
 * Forest chapter cosmetics, v0.1. Frame placement is already inside the
 * 512² canvas, so each sprite stays at (0, 0) with the foot origin.
 * The pin's chest offset is baked into those frames.
 */
import type Phaser from "phaser";
import manifest from "./data/forest-rewards-manifest.json";
import { probeNote } from "../probe";
import { WARRIOR_ANIMS, type WarriorAnim } from "./warrior-pack";

export const FOREST_ART = manifest;
export const CHAPTER_ASSET_ROOT = "assets/chapter/forest/v0.1";
export const FOREST_ART_LABEL =
  "森林章外观 v0.1。花环戴上时藏起整顶头盔。披肩要藏的 back 层，这套战士没有画。";

export const TITLE_UI_KEY = manifest.ui.textureKey;
export const TITLE_LEAF_FRAME = "ui_title_leafIcon";
export const TITLE_CHIP_FRAME = "ui_title_chip";

/** z from slot table v0.2. These win over any earlier cosmetic depths. */
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
  textureKey: string;
  layerPrefix: string;
  atlasJson: string;
  atlasImage: string;
  anchor: string;
  /** @2x pixels from the named anchor. Already drawn into the frame. */
  anchorOffset: readonly [number, number] | null;
}

function readOffset(item: (typeof manifest.items)[number]): readonly [number, number] | null {
  if (!("anchorOffset" in item) || !item.anchorOffset) return null;
  const pair = item.anchorOffset["px@2x_local"];
  const x = pair[0];
  const y = pair[1];
  if (x === undefined || y === undefined) return null;
  return [x, y];
}

export function chapterCosmeticLayers(): ChapterCosmeticLayer[] {
  return manifest.items.map((item) => {
    if (item.textureKey !== item.itemId) throw new Error(`textureKey ${item.textureKey} is not ${item.itemId}`);
    const z = COSMETIC_Z[item.slot as keyof typeof COSMETIC_Z];
    if (z === undefined || z !== item.z) throw new Error(`cosmetic ${item.itemId} z ${item.z} does not match slot ${item.slot}`);
    const offset = readOffset(item);
    return {
      id: item.itemId,
      slot: item.slot,
      z,
      textureKey: item.textureKey,
      layerPrefix: item.layerPrefix,
      atlasJson: item.atlas.json,
      atlasImage: item.atlas.image,
      anchor: item.anchor,
      anchorOffset: offset,
    };
  });
}

export function slotDepth(slot: string): number {
  if (slot in COSMETIC_Z) return COSMETIC_Z[slot as keyof typeof COSMETIC_Z];
  return WARRIOR_SLOT_Z[slot] ?? 0;
}

export function cosmeticTextureKey(id: string): string {
  return chapterCosmeticLayers().find((layer) => layer.id === id)?.textureKey ?? id;
}

export function cosmeticAnimKey(id: string, anim: WarriorAnim): string {
  return `${cosmeticTextureKey(id)}:${anim}`;
}

export function queueChapterCosmetics(scene: Phaser.Scene): void {
  for (const layer of chapterCosmeticLayers()) {
    if (scene.textures.exists(layer.textureKey)) continue;
    scene.load.atlas(
      layer.textureKey,
      `${CHAPTER_ASSET_ROOT}/${layer.atlasImage}`,
      `${CHAPTER_ASSET_ROOT}/${layer.atlasJson}`,
    );
  }
  if (!scene.textures.exists(TITLE_UI_KEY)) {
    scene.load.atlas(TITLE_UI_KEY, `${CHAPTER_ASSET_ROOT}/${manifest.ui.atlas.image}`, `${CHAPTER_ASSET_ROOT}/${manifest.ui.atlas.json}`);
  }
}

export function ensureCosmeticAnims(scene: Phaser.Scene): void {
  for (const layer of chapterCosmeticLayers()) {
    if (!scene.textures.exists(layer.textureKey)) continue;
    for (const anim of WARRIOR_ANIMS) {
      const key = cosmeticAnimKey(layer.id, anim.key);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: anim.frames(layer.layerPrefix).map((frame) => ({ key: layer.textureKey, frame })),
        frameRate: anim.fps,
        repeat: anim.repeat,
      });
    }
  }
}

/** Confirms every cosmetic atlas, its animations, and the title sheet loaded. */
export function reportForestLoad(scene: Phaser.Scene): void {
  ensureCosmeticAnims(scene);
  const layers = chapterCosmeticLayers();
  const missing = layers.filter((layer) => !scene.textures.exists(layer.textureKey)).map((layer) => layer.textureKey);
  if (!scene.textures.exists(TITLE_UI_KEY)) missing.push(TITLE_UI_KEY);
  const anims = WARRIOR_ANIMS.map((anim) => anim.key).filter((key) => scene.anims.exists(cosmeticAnimKey(layers[0]?.id ?? "", key)));
  if (missing.length > 0 || anims.length !== WARRIOR_ANIMS.length) {
    probeNote(`forest:missing:${missing.join(",") || "anims"}`);
    return;
  }
  probeNote(`forest:loaded:${layers.length}:${anims.join(",")}:${TITLE_UI_KEY}`);
}
