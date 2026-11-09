import Phaser from "phaser";
import {
  CHAPTER_ART_LIMITS,
  displayTitle,
  equipCosmetic,
  equipTitle,
  FOREST_REWARDS,
  unequipCosmetic,
} from "../../domain/chapter-rewards";
import { OUTFITS } from "../../domain/outfits";
import { equipOutfit } from "../../domain/progress";
import { FOREST_ART_LABEL, chapterCosmeticLayers, queueChapterCosmetics } from "../art/chapter-cosmetics";
import { drawEquippedTitle } from "../art/title-bar";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { WARRIOR_ART_NOTE } from "../p0";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, paper } from "../ui";

const COSMETIC_LABEL: Record<string, string> = {
  forest_leaf_cape: "林叶披肩",
  acorn_pin: "橡实别针",
  forest_wreath: "森语花环",
};

export class WardrobeScene extends Phaser.Scene {
  constructor() {
    super("wardrobe");
  }

  preload(): void {
    queueWarriorAtlases(this);
    queueChapterCosmetics(this);
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    probeEnter("wardrobe");
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("overworld"));
    this.draw();
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    paper(this);
    this.add.text(150, 36, "衣柜", { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
    this.add.text(150, 84, `${WARRIOR_ART_NOTE}。${FOREST_ART_LABEL}`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#8a5a12",
      wordWrap: { width: 680 },
    });
    OUTFITS.forEach((outfit, index) => {
      const owned = save.ownedOutfitIds.includes(outfit.id);
      const y = 150 + index * 78;
      this.add.text(160, y, outfit.name, { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
      if (!owned) {
        this.add.text(340, y, "还没得到", { fontFamily: FONT, fontSize: "18px", color: "#3d5c4e" });
        return;
      }
      button(this, 460, y + 12, save.equippedOutfitId === outfit.id ? "穿着" : "换上", () => {
        mutate((current) => equipOutfit(current, outfit.id));
        this.draw();
      }, { width: 120, height: 40, fill: save.equippedOutfitId === outfit.id ? 0x1f7a4d : 0x5c6b62 });
    });

    this.add.text(160, 400, "森林章外观", { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
    chapterCosmeticLayers().forEach((layer, index) => {
      const owned = save.unlockedCosmeticIds.includes(layer.id);
      const on = save.equippedCosmeticIds.includes(layer.id);
      const x = 230 + index * 210;
      this.add.text(x, 438, COSMETIC_LABEL[layer.id] ?? layer.id, {
        fontFamily: FONT,
        fontSize: "18px",
        color: "#17352a",
      }).setOrigin(0.5, 0);
      this.add.text(x, 464, layer.slot, { fontFamily: FONT, fontSize: "14px", color: "#3d5c4e" }).setOrigin(0.5, 0);
      button(this, x, 510, !owned ? "未得到" : on ? "摘下" : "戴上", () => {
        if (!owned) return;
        mutate((current) => (on ? unequipCosmetic(current, layer.id) : equipCosmetic(current, layer.id)));
        this.draw();
      }, { width: 140, height: 44, fill: on ? 0x1f7a4d : 0x5c6b62 });
    });

    this.add.text(160, 560, "称号。一次只戴一个。", { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
    if (save.unlockedTitleIds.length === 0) {
      this.add.text(160, 598, "还没有称号。", { fontFamily: FONT, fontSize: "18px", color: "#3d5c4e" });
    }
    save.unlockedTitleIds.forEach((titleId, index) => {
      const title = displayTitle(FOREST_REWARDS, titleId);
      const on = save.equippedTitleId === titleId;
      button(this, 230 + index * 210, 610, on ? title.shownZh : `戴 ${title.shownZh}`, () => {
        mutate((current) => equipTitle(current, on ? null : titleId));
        this.draw();
      }, { width: 190, height: 44, fill: on ? 0x1f7a4d : 0x5c6b62 });
    });
    if (save.equippedTitleId) {
      button(this, 860, 610, "卸下称号", () => {
        mutate((current) => equipTitle(current, null));
        this.draw();
      }, { width: 150, height: 44, fill: 0x5c6b62 });
    }

    CHAPTER_ART_LIMITS.forEach((line, index) => {
      this.add.text(150, 652 + index * 48, line, {
        fontFamily: FONT,
        fontSize: "14px",
        color: "#3d5c4e",
        wordWrap: { width: 760 },
      });
    });
    const hero = new WarriorSprite(this, 1040, 400, 0.48, save.equippedCosmeticIds);
    hero.play("idle");
    drawEquippedTitle(this, 1040, 120, save.equippedTitleId);
    const worn = save.equippedCosmeticIds.join(",") || "none";
    const helmet = hero.isSlotVisible("outfit_head") ? "shown" : "hidden";
    const back = hero.isSlotDrawn("back") ? "drawn" : "absent";
    probeNote(`forest:equip:${worn}:helmet=${helmet}:back=${back}`);
    button(this, 1040, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
  }
}
