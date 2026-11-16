/**
 * Owned-clothes list for the wardrobe.
 * Rows are the clothes the save already has. They are not new body slots.
 * One worn piece per existing slot: outfits share `equippedOutfitId`,
 * chapter pieces use `FOREST_REWARDS.slot_map`.
 */
import { FOREST_REWARDS } from "./chapter-rewards";
import { CLASS_IDS } from "./classes";
import { COSMETIC_LABEL } from "./cosmetic-label";
import { OUTFITS } from "./outfits";
import type { ClassId, SaveData } from "./types";

export const OUTFIT_SLOT = "outfit";

/**
 * Future reviewed icon atlas. Do not queue it until the art is in the repo.
 * Load it in the wardrobe scene next to `atlas_wardrobe`, never in BootScene.
 * Each frame is `equip_{id}` and is drawn at `equipIconDisplaySize`.
 */
export const EQUIP_ICON_ATLAS = "atlas_equip_icons";

/** Frame name for a later atlas: `equip_{id}`, including hyphenated ids. */
export function equipIconFrame(id: string): string {
  return `equip_${id}`;
}

/** 48 logical pixels, or 64 when the cell is at least 180 wide. */
export function equipIconDisplaySize(cellWidth: number): 48 | 64 {
  return cellWidth >= 180 ? 64 : 48;
}

/**
 * One character already in the font subset, until the icon atlas exists.
 * Chest would start with 胸, which is not in the subset, so that slot uses 饰.
 */
export function equipIconMark(slot: string): string {
  if (slot === OUTFIT_SLOT) return "整";
  if (slot === "cosmetic_back") return "背";
  if (slot === "cosmetic_chest") return "饰";
  if (slot === "cosmetic_head") return "头";
  return "装";
}

/** Viewport for the owned list. More rows than this height can scroll. */
export const WARDROBE_LIST = {
  x: 140,
  y: 168,
  width: 680,
  height: 288,
  rowStride: 96,
} as const;

export interface SlotPiece {
  id: string;
  slot: string;
}

export interface WardrobePiece extends SlotPiece {
  name: string;
  kind: "outfit" | "cosmetic";
}

export interface WardrobeRow extends WardrobePiece {
  equipped: boolean;
  /** False when this class cannot wear the piece. The row stays, the box does not. */
  applies: boolean;
}

export type WearReason = "unowned" | "inapplicable" | "stale";

export interface SlotCheckIntent {
  wantEquipped: boolean;
  /** Piece in this slot when the box was pressed. A late clear still carries that id. */
  seenHolderId: string | null;
}

export interface WardrobeIntent extends SlotCheckIntent {
  id: string;
}

export function wardrobeListMetrics(rowCount: number): { contentHeight: number; maxScroll: number } {
  const contentHeight = Math.max(0, rowCount) * WARDROBE_LIST.rowStride;
  return { contentHeight, maxScroll: Math.max(0, contentHeight - WARDROBE_LIST.height) };
}

export function wardrobeCatalog(): WardrobePiece[] {
  const outfits: WardrobePiece[] = OUTFITS.map((outfit) => ({
    id: outfit.id,
    name: outfit.name,
    slot: OUTFIT_SLOT,
    kind: "outfit",
  }));
  const cosmetics: WardrobePiece[] = Object.keys(FOREST_REWARDS.slot_map).map((id) => ({
    id,
    name: COSMETIC_LABEL[id] ?? id,
    slot: FOREST_REWARDS.slot_map[id] ?? id,
    kind: "cosmetic",
  }));
  return [...outfits, ...cosmetics];
}

export function wardrobePiece(id: string): WardrobePiece | null {
  return wardrobeCatalog().find((piece) => piece.id === id) ?? null;
}

/**
 * Chapter pieces are for every class: the forest manifest says 「六职通用」,
 * and README says the wreath already draws on all six side and top views.
 * Traveler adds no actor-sheet frames (`outfits.ts` cape/hat/sash are empty),
 * so it is the shared "change back" outfit, not a class costume.
 * Forest-cape and star-sash add cape, hat, or sash frames. README says the
 * forest cape's side cape and leaf hat draw on the warrior only, and
 * `ClassSideSprite` draws every one of those extra frames only for the warrior.
 */
export function wardrobeApplies(id: string, classId: ClassId): boolean {
  const piece = wardrobePiece(id);
  if (!piece || !CLASS_IDS.includes(classId)) return false;
  if (piece.kind === "cosmetic" || piece.id === "traveler") return true;
  return classId === "warrior";
}

function owns(save: SaveData, piece: WardrobePiece): boolean {
  if (piece.kind === "outfit") return save.ownedOutfitIds.includes(piece.id);
  return save.unlockedCosmeticIds.includes(piece.id);
}

/** Equipped catalog pieces, last one in a slot wins. */
export function equippedSlotPieces(save: SaveData): SlotPiece[] {
  const pieces: SlotPiece[] = [];
  const outfit = wardrobePiece(save.equippedOutfitId);
  if (outfit?.kind === "outfit") pieces.push({ id: outfit.id, slot: outfit.slot });
  for (const id of save.equippedCosmeticIds) {
    const piece = wardrobePiece(id);
    if (!piece || piece.kind !== "cosmetic") continue;
    const previous = pieces.findIndex((item) => item.slot === piece.slot);
    if (previous >= 0) pieces.splice(previous, 1);
    pieces.push({ id: piece.id, slot: piece.slot });
  }
  return pieces;
}

export function slotHolderId(equipped: readonly SlotPiece[], slot: string): string | null {
  let holder: string | null = null;
  for (const piece of equipped) {
    if (piece.slot === slot) holder = piece.id;
  }
  return holder;
}

export function applySlotCheck(
  equipped: readonly SlotPiece[],
  piece: SlotPiece,
  intent: SlotCheckIntent,
  gate: { owned: boolean; applies: boolean },
): { equipped: readonly SlotPiece[]; ok: boolean; reason?: WearReason } {
  if (!gate.applies) return { equipped, ok: false, reason: "inapplicable" };
  if (!gate.owned) return { equipped, ok: false, reason: "unowned" };
  const holder = slotHolderId(equipped, piece.slot);
  if (intent.wantEquipped) {
    const next = equipped.filter((item) => item.slot !== piece.slot);
    next.push({ id: piece.id, slot: piece.slot });
    return { equipped: next, ok: true };
  }
  if (holder !== piece.id || intent.seenHolderId !== piece.id) {
    return { equipped, ok: false, reason: "stale" };
  }
  return { equipped: equipped.filter((item) => item.id !== piece.id || item.slot !== piece.slot), ok: true };
}

function samePieces(left: readonly SlotPiece[], right: readonly SlotPiece[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((piece, index) => piece.id === right[index]?.id && piece.slot === right[index]?.slot);
}

function writePieces(save: SaveData, equipped: readonly SlotPiece[]): SaveData {
  const outfit = equipped.find((piece) => piece.slot === OUTFIT_SLOT);
  const equippedCosmeticIds = equipped.filter((piece) => piece.slot !== OUTFIT_SLOT).map((piece) => piece.id);
  return {
    ...save,
    equippedOutfitId: outfit?.id ?? "",
    equippedCosmeticIds,
  };
}

export function applyWardrobeIntent(save: SaveData, intent: WardrobeIntent, classId: ClassId): {
  save: SaveData;
  ok: boolean;
  reason?: WearReason;
} {
  const piece = wardrobePiece(intent.id);
  const applies = piece !== null && wardrobeApplies(intent.id, classId);
  const owned = piece !== null && owns(save, piece);
  const before = equippedSlotPieces(save);
  const result = applySlotCheck(
    before,
    piece ?? { id: intent.id, slot: "" },
    intent,
    { owned, applies },
  );
  if (!result.ok || samePieces(before, result.equipped)) {
    return { save, ok: result.ok, reason: result.reason };
  }
  return { save: writePieces(save, result.equipped), ok: true };
}

export function ownedWardrobeRows(save: SaveData, classId: ClassId = save.player.classId): WardrobeRow[] {
  const equipped = equippedSlotPieces(save);
  return wardrobeCatalog()
    .filter((piece) => owns(save, piece))
    .map((piece) => {
      const applies = wardrobeApplies(piece.id, classId);
      return {
        ...piece,
        applies,
        equipped: applies && slotHolderId(equipped, piece.slot) === piece.id,
      };
    });
}

/** True when the stored wear is not the wear the game will keep. */
export function wardrobeWearDiffers(
  before: { equippedOutfitId?: unknown; equippedCosmeticIds?: unknown },
  after: { equippedOutfitId: string; equippedCosmeticIds: readonly string[] },
): boolean {
  if (before.equippedOutfitId !== after.equippedOutfitId) return true;
  const ids = Array.isArray(before.equippedCosmeticIds)
    ? before.equippedCosmeticIds.filter((id): id is string => typeof id === "string")
    : [];
  return ids.length !== after.equippedCosmeticIds.length
    || ids.some((id, index) => id !== after.equippedCosmeticIds[index]);
}

/**
 * Empty `equippedOutfitId` is the class default.
 * An outfit or cosmetic that this class cannot wear, or that the save does
 * not own, comes off. Ownership lists stay as they were.
 */
export function settleWardrobeWear(save: SaveData): SaveData {
  const classId = save.player.classId;
  const outfitId = save.equippedOutfitId;
  const outfitOk = outfitId === ""
    || (wardrobePiece(outfitId)?.kind === "outfit"
      && save.ownedOutfitIds.includes(outfitId)
      && wardrobeApplies(outfitId, classId));
  const cosmetics = save.equippedCosmeticIds.filter((id) => {
    const piece = wardrobePiece(id);
    return piece?.kind === "cosmetic"
      && save.unlockedCosmeticIds.includes(id)
      && wardrobeApplies(id, classId);
  });
  const cosmeticsSame = cosmetics.length === save.equippedCosmeticIds.length
    && cosmetics.every((id, index) => id === save.equippedCosmeticIds[index]);
  if (outfitOk && cosmeticsSame) return save;
  return {
    ...save,
    equippedOutfitId: outfitOk ? outfitId : "",
    equippedCosmeticIds: cosmetics,
  };
}
