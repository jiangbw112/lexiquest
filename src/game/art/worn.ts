import { outfitById } from "../../domain/outfits";
import { visibleFrames } from "./layers";

/** Always on the side-view paper doll. Reward pieces are everything else. */
const SIDE_BASE = new Set(["side/body", "side/tunic", "side/hair", "side/emblem"]);

/**
 * Side-view frames the equipped outfit adds.
 * Traveler is the base clothes, so it adds nothing.
 */
export function outfitExtraFrames(outfitId: string): string[] {
  return visibleFrames("side", outfitId).filter((name) => !SIDE_BASE.has(name));
}

/** Chapter cosmetics that have their own layered sprites. */
export const WORN_COSMETIC_IDS = ["forest_leaf_cape", "acorn_pin", "forest_wreath"] as const;

export type WornCosmeticId = (typeof WORN_COSMETIC_IDS)[number];

export function wornCosmeticIds(ids: readonly string[]): WornCosmeticId[] {
  return WORN_COSMETIC_IDS.filter((id) => ids.includes(id));
}

/**
 * Top-down plaza frames for an outfit.
 * Hats are not in that sheet; the actor draws those from the side sheet.
 */
export function villageOutfitFrames(outfitId: string): string[] {
  return visibleFrames("top", outfitId);
}

export function outfitHatFrame(outfitId: string): "side/hat-leaf" | "side/hat-star" | null {
  const hat = outfitById(outfitId).hat;
  if (hat === "leaf") return "side/hat-leaf";
  if (hat === "star") return "side/hat-star";
  return null;
}

/** Plaza doll hair crown, local pixels, feet at the origin. */
const VILLAGE_HAT_TARGET = { x: 10, y: -118 };

/** Opaque center of each hat inside its 256×320 side frame. */
const VILLAGE_HAT_CENTER: Record<string, { x: number; y: number; scale: number; targetY: number }> = {
  "side/hat-leaf": { x: 167.5, y: 51.5, scale: 0.9, targetY: -118 },
  "side/hat-star": { x: 149.5, y: 41.5, scale: 1.05, targetY: -116 },
};

/** Puts a side-view hat on the plaza doll's bun. Origin stays the frame's feet. */
export function villageHatPlacement(frame: string): { x: number; y: number; scale: number } {
  const hat = VILLAGE_HAT_CENTER[frame] ?? { x: 128, y: 40, scale: 1, targetY: VILLAGE_HAT_TARGET.y };
  const localX = (hat.x - 128) * hat.scale;
  const localY = (hat.y - 320) * hat.scale;
  return { x: VILLAGE_HAT_TARGET.x - localX, y: hat.targetY - localY, scale: hat.scale };
}

/**
 * Foot-anchored chapter art is drawn for the 512² warrior. These nudges
 * move the same frame onto the shorter plaza doll: wreath on the hair,
 * pin on the chest, leaf cape across the shoulders.
 */
export function villageCosmeticNudge(id: string): { x: number; y: number } {
  if (id === "forest_wreath") return { x: 4, y: -38 };
  if (id === "acorn_pin") return { x: 8, y: -16 };
  if (id === "forest_leaf_cape") return { x: 8, y: 24 };
  return { x: 0, y: 0 };
}

/** Leaf cape is a side-view cloak. Drawn larger so its edges clear the plaza body. */
export function villageCosmeticScale(id: string): number {
  if (id === "forest_leaf_cape") return 0.62;
  return 160 / 512;
}

/**
 * The actor sash sits on that sheet's waist. The warrior's head is taller,
 * so the same fraction lands on the chin. This drops it onto the belt.
 * Local pixels, before the scene scale.
 */
export const WARRIOR_SASH_DROP = 56;
