// Vite cannot import files from public/, so the client reads this copy.
// public/assets/warrior/v0.1/manifest.json is the same file and is checked in tests.
import manifest from "./data/manifest.json";

/** Provisional v0.1 battle-view warrior. Outfit garments stay their own layers. */
export const WARRIOR_PACK = manifest;

export const WARRIOR_ASSET_ROOT = "assets/warrior/v0.1";

/** Pack display scale: one logical pixel per screen pixel (@2x source). */
export const WARRIOR_LOGICAL_SCALE = 0.5;

export const WARRIOR_ORIGIN = { x: manifest.pivot.normalized[0], y: manifest.pivot.normalized[1] } as const;

export type WarriorAnim = "idle" | "walk" | "attack" | "hit" | "victory";

/**
 * The pack tags garments and held items both as group "class".
 * The client keeps outfit_* swappable without touching body or weapons.
 */
export type WarriorGroup = "system" | "body" | "outfit" | "class";

export interface WarriorLayer {
  id: string;
  slot: string;
  group: WarriorGroup;
  packGroup: string;
  atlasJson: string;
  atlasImage: string;
}

const OUTFIT_SLOTS = new Set(["outfit_back", "outfit_body", "outfit_head", "outfit_front"]);

function clientGroup(slot: string, packGroup: string): WarriorGroup {
  if (OUTFIT_SLOTS.has(slot)) return "outfit";
  if (packGroup === "appearance") return "body";
  if (packGroup === "class") return "class";
  return "system";
}

export const WARRIOR_LAYERS: WarriorLayer[] = manifest.layerOrder_backToFront.map((slot) => {
  const layer = manifest.layers.find((item) => item.slot === slot);
  if (!layer) throw new Error(`Warrior manifest is missing slot ${slot}`);
  return {
    id: layer.id,
    slot,
    group: clientGroup(slot, layer.group),
    packGroup: layer.group ?? "system",
    atlasJson: layer.atlas.json,
    atlasImage: layer.atlas.image,
  };
});

export const WARRIOR_ANIMS = manifest.animations.map((anim) => ({
  key: anim.key as WarriorAnim,
  frameCount: anim.frameCount,
  fps: anim.fps,
  repeat: anim.repeat,
  frames: (layerId: string): string[] => anim.frameNames.map((name) => name.replace("{layerPrefix}", layerId)),
}));

export function warriorTextureKey(slot: string): string {
  return `warrior:${slot}`;
}

export function warriorAnimKey(slot: string, anim: WarriorAnim): string {
  return `${warriorTextureKey(slot)}:${anim}`;
}

export function layersInGroup(group: WarriorGroup): WarriorLayer[] {
  return WARRIOR_LAYERS.filter((layer) => layer.group === group);
}

export function battlePoses(input: {
  action: "attack" | "block" | "heal" | "skill" | "answer";
  playerHpBefore: number;
  playerHpAfter: number;
  phase: string;
}): WarriorAnim[] {
  const poses: WarriorAnim[] = [];
  if (input.action === "attack" || input.action === "skill") poses.push("attack");
  if (input.playerHpAfter < input.playerHpBefore) poses.push("hit");
  if (input.phase === "won") poses.push("victory");
  if (poses.length === 0) poses.push("idle");
  return poses;
}
