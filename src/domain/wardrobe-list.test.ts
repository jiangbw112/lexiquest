import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { CLASS_IDS } from "./classes";
import { applyBattleOutcome, createSave, switchClass } from "./progress";
import { stageEncounterId } from "./stages";
import { deserialize, serialize } from "./storage";
import type { ClassId, SaveData } from "./types";
import {
  EQUIP_ICON_ATLAS,
  OUTFIT_SLOT,
  WARDROBE_LIST,
  applySlotCheck,
  applyWardrobeIntent,
  equipIconDisplaySize,
  equipIconFrame,
  equipIconMark,
  equippedSlotPieces,
  ownedWardrobeRows,
  settleWardrobeWear,
  wardrobeWearDiffers,
  slotHolderId,
  wardrobeApplies,
  wardrobeCatalog,
  wardrobeListMetrics,
  type SlotPiece,
} from "./wardrobe-list";

function saveWith(classId: ClassId, extra: Partial<SaveData> = {}): SaveData {
  return {
    ...createSave({
      name: "小林",
      classId,
      appearance: DEFAULT_APPEARANCE,
      now: 1,
      grades: ["G3"],
    }),
    ...extra,
  };
}

function wear(save: SaveData, id: string, seenHolderId: string | null, classId: ClassId = save.player.classId) {
  return applyWardrobeIntent(save, { id, wantEquipped: true, seenHolderId }, classId);
}

function clearPiece(save: SaveData, id: string, seenHolderId: string | null, classId: ClassId = save.player.classId) {
  return applyWardrobeIntent(save, { id, wantEquipped: false, seenHolderId }, classId);
}

describe("owned wardrobe list", () => {
  it("gives every owned piece one row and scrolls only after the view is full", () => {
    const none = saveWith("warrior", {
      ownedOutfitIds: [],
      equippedOutfitId: "",
      unlockedCosmeticIds: [],
      equippedCosmeticIds: [],
    });
    expect(ownedWardrobeRows(none)).toEqual([]);
    expect(wardrobeListMetrics(0)).toEqual({ contentHeight: 0, maxScroll: 0 });

    const one = saveWith("warrior", { ownedOutfitIds: ["traveler"], equippedOutfitId: "traveler" });
    expect(ownedWardrobeRows(one).map((row) => row.id)).toEqual(["traveler"]);
    expect(ownedWardrobeRows(one)[0]?.equipped).toBe(true);
    expect(wardrobeListMetrics(1).maxScroll).toBe(0);

    const four = saveWith("mage", {
      ownedOutfitIds: ["traveler", "forest-cape", "star-sash"],
      equippedOutfitId: "traveler",
      unlockedCosmeticIds: ["forest_leaf_cape"],
      equippedCosmeticIds: [],
    });
    const fourRows = ownedWardrobeRows(four);
    expect(fourRows.map((row) => row.id)).toEqual(["traveler", "forest-cape", "star-sash", "forest_leaf_cape"]);
    expect(new Set(fourRows.map((row) => row.slot)).size).toBeLessThanOrEqual(wardrobeCatalog().length);
    expect(wardrobeListMetrics(fourRows.length).maxScroll).toBeGreaterThan(0);

    const more = saveWith("warrior", {
      ownedOutfitIds: ["traveler", "forest-cape", "star-sash"],
      equippedOutfitId: "forest-cape",
      unlockedCosmeticIds: ["forest_leaf_cape", "acorn_pin", "forest_wreath"],
      equippedCosmeticIds: ["acorn_pin", "forest_wreath"],
    });
    const many = ownedWardrobeRows(more);
    expect(many).toHaveLength(6);
    expect(many.filter((row) => row.equipped).map((row) => row.id)).toEqual([
      "forest-cape",
      "acorn_pin",
      "forest_wreath",
    ]);
    const wornSlots = many.filter((row) => row.equipped).map((row) => row.slot);
    expect(new Set(wornSlots).size).toBe(wornSlots.length);
    expect(wardrobeListMetrics(many.length).maxScroll).toBeGreaterThan(wardrobeListMetrics(fourRows.length).maxScroll);
    expect(wardrobeCatalog().filter((piece) => piece.slot === OUTFIT_SLOT)).toHaveLength(3);
  });

  it("replaces the worn piece in one slot only after the new piece is allowed", () => {
    const base = saveWith("warrior", {
      ownedOutfitIds: ["traveler", "forest-cape"],
      equippedOutfitId: "traveler",
      unlockedCosmeticIds: ["forest_wreath", "acorn_pin"],
      equippedCosmeticIds: ["forest_wreath"],
    });
    const blocked = wear(base, "star-sash", "traveler");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("unowned");
    expect(blocked.save).toBe(base);
    expect(blocked.save.equippedOutfitId).toBe("traveler");

    const swapped = wear(base, "forest-cape", "traveler");
    expect(swapped.ok).toBe(true);
    expect(swapped.save).not.toBe(base);
    expect(swapped.save.equippedOutfitId).toBe("forest-cape");
    expect(swapped.save.equippedCosmeticIds).toEqual(["forest_wreath"]);
    expect(swapped.save.xp).toBe(base.xp);
    expect(swapped.save.player).toBe(base.player);
    expect(swapped.save.skillLevels).toBe(base.skillLevels);
    expect(slotHolderId(equippedSlotPieces(swapped.save), OUTFIT_SLOT)).toBe("forest-cape");
    expect(ownedWardrobeRows(swapped.save).filter((row) => row.slot === OUTFIT_SLOT && row.equipped)).toEqual([
      expect.objectContaining({ id: "forest-cape", equipped: true }),
    ]);

    const late = clearPiece(swapped.save, "traveler", "traveler");
    expect(late.ok).toBe(false);
    expect(late.reason).toBe("stale");
    expect(late.save).toBe(swapped.save);
    expect(late.save.equippedOutfitId).toBe("forest-cape");

    const onlyCape = clearPiece(swapped.save, "forest-cape", "forest-cape");
    expect(onlyCape.ok).toBe(true);
    expect(onlyCape.save.equippedOutfitId).toBe("");
    expect(onlyCape.save.player.classId).toBe("warrior");
    expect(onlyCape.save.equippedCosmeticIds).toEqual(["forest_wreath"]);
    expect(ownedWardrobeRows(onlyCape.save).filter((row) => row.slot === OUTFIT_SLOT && row.equipped)).toEqual([]);
    expect(ownedWardrobeRows(onlyCape.save).find((row) => row.id === "forest_wreath")?.equipped).toBe(true);
  });

  it("rejects an unowned or unknown piece and keeps the saved clothes", () => {
    const save = saveWith("mage", {
      ownedOutfitIds: ["traveler"],
      equippedOutfitId: "traveler",
      unlockedCosmeticIds: ["forest_wreath"],
      equippedCosmeticIds: ["forest_wreath"],
    });
    const missing = wear(save, "forest_leaf_cape", null);
    expect(missing.ok).toBe(false);
    expect(missing.reason).toBe("unowned");
    expect(missing.save).toBe(save);

    const unknown = wear(save, "title_forest_trekker", null);
    expect(unknown.ok).toBe(false);
    expect(unknown.reason).toBe("inapplicable");
    expect(unknown.save).toBe(save);
    expect(wardrobeApplies("forest_wreath", "mage")).toBe(true);
    expect(wardrobeApplies("no-such-piece", "mage")).toBe(false);
    for (const classId of CLASS_IDS) expect(wardrobeApplies("acorn_pin", classId)).toBe(true);

    const pin = wear(save, "acorn_pin", null);
    expect(pin.ok).toBe(false);
    expect(pin.save.equippedCosmeticIds).toEqual(["forest_wreath"]);
  });

  it("clears only the piece that was unchecked when two chapter slots are full", () => {
    let save = saveWith("warrior", {
      ownedOutfitIds: ["traveler", "forest-cape"],
      equippedOutfitId: "traveler",
      unlockedCosmeticIds: ["forest_leaf_cape", "acorn_pin", "forest_wreath"],
      equippedCosmeticIds: [],
    });
    for (const id of ["forest_leaf_cape", "acorn_pin", "forest_wreath", "forest-cape"]) {
      const holder = slotHolderId(equippedSlotPieces(save), wardrobeCatalog().find((piece) => piece.id === id)?.slot ?? "");
      const next = wear(save, id, holder);
      expect(next.ok).toBe(true);
      save = next.save;
    }
    expect(save.equippedOutfitId).toBe("forest-cape");
    expect(save.equippedCosmeticIds).toEqual(["forest_leaf_cape", "acorn_pin", "forest_wreath"]);
    const slots = equippedSlotPieces(save).map((piece) => piece.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toHaveLength(4);

    const offPin = clearPiece(save, "acorn_pin", "acorn_pin");
    expect(offPin.ok).toBe(true);
    expect(offPin.save.equippedCosmeticIds).toEqual(["forest_leaf_cape", "forest_wreath"]);
    expect(offPin.save.equippedOutfitId).toBe("forest-cape");

    const loaded = deserialize(serialize(offPin.save));
    expect(loaded?.equippedOutfitId).toBe("forest-cape");
    expect(loaded?.equippedCosmeticIds).toEqual(["forest_leaf_cape", "forest_wreath"]);
  });

  it("keeps a same-slot swap atomic when the old clear arrives late", () => {
    const equipped: SlotPiece[] = [
      { id: "cape-a", slot: "cosmetic_back" },
      { id: "pin", slot: "cosmetic_chest" },
    ];
    const swapped = applySlotCheck(
      equipped,
      { id: "cape-b", slot: "cosmetic_back" },
      { wantEquipped: true, seenHolderId: "cape-a" },
      { owned: true, applies: true },
    );
    expect(swapped.ok).toBe(true);
    expect(swapped.equipped).toEqual([
      { id: "pin", slot: "cosmetic_chest" },
      { id: "cape-b", slot: "cosmetic_back" },
    ]);
    const denied = applySlotCheck(
      equipped,
      { id: "cape-b", slot: "cosmetic_back" },
      { wantEquipped: true, seenHolderId: "cape-a" },
      { owned: false, applies: true },
    );
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe("unowned");
    expect(denied.equipped).toBe(equipped);
    const unfit = applySlotCheck(
      equipped,
      { id: "cape-b", slot: "cosmetic_back" },
      { wantEquipped: true, seenHolderId: "cape-a" },
      { owned: true, applies: false },
    );
    expect(unfit.reason).toBe("inapplicable");
    expect(unfit.equipped).toBe(equipped);

    const late = applySlotCheck(
      swapped.equipped,
      { id: "cape-a", slot: "cosmetic_back" },
      { wantEquipped: false, seenHolderId: "cape-a" },
      { owned: true, applies: true },
    );
    expect(late.ok).toBe(false);
    expect(late.reason).toBe("stale");
    expect(late.equipped).toBe(swapped.equipped);

    const clearNew = applySlotCheck(
      swapped.equipped,
      { id: "cape-b", slot: "cosmetic_back" },
      { wantEquipped: false, seenHolderId: "cape-b" },
      { owned: true, applies: true },
    );
    expect(clearNew.ok).toBe(true);
    expect(clearNew.equipped).toEqual([{ id: "pin", slot: "cosmetic_chest" }]);
  });

  it("reserves a fixed icon well and a slot mark until reviewed art arrives", () => {
    expect(equipIconDisplaySize(179)).toBe(48);
    expect(equipIconDisplaySize(180)).toBe(64);
    expect(equipIconDisplaySize(WARDROBE_LIST.width)).toBe(64);
    for (const piece of wardrobeCatalog()) {
      expect(equipIconFrame(piece.id)).toBe(`equip_${piece.id}`);
      expect(equipIconMark(piece.slot).length).toBe(1);
    }
    expect(equipIconMark("outfit")).toBe("整");
    expect(equipIconMark("cosmetic_back")).toBe("背");
    expect(equipIconMark("cosmetic_chest")).toBe("饰");
    expect(equipIconMark("cosmetic_head")).toBe("头");
    const boot = readFileSync(new URL("../game/scenes/BootScene.ts", import.meta.url), "utf8");
    const preload = boot.slice(boot.indexOf("preload(): void {"), boot.indexOf("create(): void {"));
    expect(preload).not.toContain(EQUIP_ICON_ATLAS);
    const load = readFileSync(new URL("../game/warm/load.ts", import.meta.url), "utf8");
    expect(load).not.toContain(EQUIP_ICON_ATLAS);
    expect(existsSync(new URL("../../public/assets/warm/atlas/atlas_equip_icons.png", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../public/assets/warm/atlas/atlas_equip_icons.json", import.meta.url))).toBe(false);
  });

  it("draws checks from the owned list and drops the old wear buttons", () => {
    const scene = readFileSync(new URL("../game/scenes/WardrobeScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("ownedWardrobeRows");
    expect(scene).toContain("applyWardrobeIntent");
    expect(scene).toContain("icon_check");
    expect(scene).toContain("save.equippedOutfitId");
    expect(scene).toContain('queueWarm(this, ["atlas_ui_core", "atlas_wardrobe"], ["bg_room"])');
    expect(scene).toContain("equipIconFrame");
    expect(scene).toContain("equipIconMark");
    expect(scene).toContain("equipIconDisplaySize");
    expect(scene).not.toContain(`${EQUIP_ICON_ATLAS}.png`);
    expect(scene).toContain("this.scroll = 0");
    expect(scene).toContain("shutdown");
    expect(scene).not.toContain("换上");
    expect(scene).not.toContain("穿着");
    expect(scene).not.toContain("戴上");
    expect(scene).not.toContain("摘下");
    expect(scene).toContain("只给战士");
    expect(scene).toContain("村子只见花环。");
  });

  it("keeps warrior-only outfits off other classes and rolls an old illegal wear back", () => {
    for (const classId of CLASS_IDS) {
      expect(wardrobeApplies("traveler", classId)).toBe(true);
      expect(wardrobeApplies("forest_leaf_cape", classId)).toBe(true);
      expect(wardrobeApplies("acorn_pin", classId)).toBe(true);
      expect(wardrobeApplies("forest_wreath", classId)).toBe(true);
      expect(wardrobeApplies("forest-cape", classId)).toBe(classId === "warrior");
      expect(wardrobeApplies("star-sash", classId)).toBe(classId === "warrior");
    }

    const worn = saveWith("mage", {
      ownedOutfitIds: ["traveler", "forest-cape", "star-sash"],
      equippedOutfitId: "traveler",
      unlockedCosmeticIds: ["forest_leaf_cape", "acorn_pin", "forest_wreath"],
      equippedCosmeticIds: ["forest_wreath"],
      masteryMilestonesClaimed: ["forest-1"],
      inventorUnlockedAt: 12,
      inventorUnlockedBy: "kept",
    });
    const cape = wear(worn, "forest-cape", "traveler");
    expect(cape.ok).toBe(false);
    expect(cape.reason).toBe("inapplicable");
    expect(cape.save).toBe(worn);
    expect(cape.save.equippedOutfitId).toBe("traveler");
    expect(cape.save.equippedCosmeticIds).toEqual(["forest_wreath"]);
    const sash = wear(worn, "star-sash", "traveler");
    expect(sash.save).toBe(worn);
    const rows = ownedWardrobeRows(worn);
    expect(rows.find((row) => row.id === "forest-cape")).toMatchObject({ applies: false, equipped: false });
    expect(rows.find((row) => row.id === "forest_leaf_cape")).toMatchObject({ applies: true, equipped: false });

    const illegal = saveWith("mage", {
      ownedOutfitIds: ["traveler", "forest-cape"],
      equippedOutfitId: "forest-cape",
      unlockedCosmeticIds: ["forest_wreath"],
      equippedCosmeticIds: ["forest_wreath", "acorn_pin", "missing-pin"],
      masteryMilestonesClaimed: ["forest-1"],
      inventorUnlockedAt: 12,
      inventorUnlockedBy: "kept",
    });
    const settled = settleWardrobeWear(illegal);
    expect(settled.equippedOutfitId).toBe("");
    expect(settled.ownedOutfitIds).toEqual(["traveler", "forest-cape"]);
    expect(settled.unlockedCosmeticIds).toEqual(["forest_wreath"]);
    expect(settled.equippedCosmeticIds).toEqual(["forest_wreath"]);
    expect(settled.masteryMilestonesClaimed).toEqual(["forest-1"]);
    expect(settled.inventorUnlockedAt).toBe(12);
    expect(settled.inventorUnlockedBy).toBe("kept");
    expect(settleWardrobeWear(settled)).toBe(settled);

    const unowned = settleWardrobeWear(saveWith("warrior", {
      ownedOutfitIds: ["traveler"],
      equippedOutfitId: "forest-cape",
    }));
    expect(unowned.equippedOutfitId).toBe("");
    expect(unowned.ownedOutfitIds).toEqual(["traveler"]);

    const empty = settleWardrobeWear(saveWith("mage", { equippedOutfitId: "" }));
    expect(empty.equippedOutfitId).toBe("");
    expect(settleWardrobeWear(empty)).toBe(empty);

    const loaded = deserialize(serialize(illegal));
    expect(loaded?.equippedOutfitId).toBe("");
    expect(loaded?.ownedOutfitIds).toEqual(["traveler", "forest-cape"]);
    expect(loaded?.equippedCosmeticIds).toEqual(["forest_wreath"]);
    expect(loaded?.masteryMilestonesClaimed).toEqual(["forest-1"]);
    expect(loaded?.inventorUnlockedAt).toBe(12);

    const fighter = saveWith("warrior", {
      ownedOutfitIds: ["traveler", "forest-cape"],
      equippedOutfitId: "forest-cape",
      masteryMilestonesClaimed: ["forest-1"],
      inventorUnlockedAt: 12,
      inventorUnlockedBy: "kept",
    });
    const mage = switchClass(fighter, "mage");
    expect(mage.player.classId).toBe("mage");
    expect(mage.equippedOutfitId).toBe("");
    expect(mage.ownedOutfitIds).toEqual(["traveler", "forest-cape"]);
    expect(mage.masteryMilestonesClaimed).toEqual(["forest-1"]);
    expect(mage.inventorUnlockedAt).toBe(12);
    expect(mage.inventorUnlockedBy).toBe("kept");
    const back = switchClass(mage, "warrior");
    expect(back.equippedOutfitId).toBe("");
    expect(back.ownedOutfitIds).toEqual(fighter.ownedOutfitIds);

    const granted = applyBattleOutcome(
      saveWith("mage", { ownedOutfitIds: ["traveler"], equippedOutfitId: "traveler" }),
      "win",
      1_700_000_000_000,
      stageEncounterId(1),
      1,
      1,
    );
    expect(granted.ownedOutfitIds).toContain("forest-cape");
    expect(granted.equippedOutfitId).toBe("traveler");
    expect(wardrobeWearDiffers(illegal, settled)).toBe(true);
    expect(wardrobeWearDiffers(settled, settled)).toBe(false);
  });
});
