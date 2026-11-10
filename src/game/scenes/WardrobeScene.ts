import Phaser from "phaser";
import {
  displayTitle,
  equipCosmetic,
  equipTitle,
  FOREST_REWARDS,
  unequipCosmetic,
} from "../../domain/chapter-rewards";
import { OUTFITS } from "../../domain/outfits";
import { equipOutfit } from "../../domain/progress";
import { chapterCosmeticLayers, queueChapterCosmetics } from "../art/chapter-cosmetics";
import { drawEquippedTitle } from "../art/title-bar";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { parchmentTitleY } from "../layout";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, paper } from "../ui";
import { warmButton, warmSlice } from "../warm/kit";
import { paintRoom, queueWarm } from "../warm/load";
import { containerHitArea } from "../hit";
import { DIS_TEXT, INK, MUTED, NOTE } from "../warm/theme";

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
    queueWarm(this, ["atlas_ui_core", "atlas_wardrobe"], ["bg_room"]);
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
    if (!paintRoom(this)) paper(this);
    warmSlice(this, "atlas_ui_core", "panel_parchment", 1040, 740).setPosition(640, 400);
    const titleY = parchmentTitleY(400, 740);
    this.add.text(150, titleY, "衣柜", { fontFamily: FONT, fontSize: "36px", color: INK });
    this.add.text(150, titleY + 48, "戴上花环，头盔会藏起来。", {
      fontFamily: FONT,
      fontSize: "16px",
      color: NOTE,
    });
    OUTFITS.forEach((outfit, index) => {
      const owned = save.ownedOutfitIds.includes(outfit.id);
      const y = 150 + index * 78;
      this.add.text(160, y, outfit.name, { fontFamily: FONT, fontSize: "22px", color: INK });
      if (!owned) {
        this.add.text(340, y, "还没得到", { fontFamily: FONT, fontSize: "18px", color: MUTED });
        return;
      }
      const wearing = save.equippedOutfitId === outfit.id;
      warmButton(this, 460, y + 14, wearing ? "穿着" : "换上", () => {
        mutate((current) => equipOutfit(current, outfit.id));
        this.draw();
      }, { width: 120, height: 56, tone: wearing ? "primary" : "secondary" });
    });

    this.add.text(160, 390, "森林章外观", { fontFamily: FONT, fontSize: "22px", color: INK });
    chapterCosmeticLayers().forEach((layer, index) => {
      const owned = save.unlockedCosmeticIds.includes(layer.id);
      const on = save.equippedCosmeticIds.includes(layer.id);
      const left = 135 + index * 210;
      const top = 420;
      const frame = !owned ? "wardrobe_slot_disabled" : on ? "wardrobe_slot_selected" : "wardrobe_slot_normal";
      const slot = warmSlice(this, "atlas_wardrobe", frame, 190, 104);
      slot.setPosition(left + 95, top + 52);
      const color = owned ? INK : DIS_TEXT;
      const status = !owned ? "未得到" : on ? "摘下" : "戴上";
      this.add.text(left + 95, top + 36, COSMETIC_LABEL[layer.id] ?? "", { fontFamily: FONT, fontSize: "18px", color }).setOrigin(0.5);
      this.add.text(left + 95, top + 64, status, { fontFamily: FONT, fontSize: "16px", color }).setOrigin(0.5);
      if (!owned) return;
      const hit = this.add.container(left + 95, top + 52);
      hit.setSize(190, 104);
      const area = containerHitArea(190, 104);
      hit.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
      if (hit.input) hit.input.cursor = "pointer";
      let down = false;
      const show = (state: "normal" | "hover" | "pressed") => {
        if (on && state === "normal") slot.setFrame("wardrobe_slot_selected");
        else slot.setFrame(`wardrobe_slot_${state}`);
      };
      hit.on("pointerover", () => {
        if (!down) show("hover");
      });
      hit.on("pointerout", () => {
        down = false;
        show("normal");
      });
      hit.on("pointerdown", () => {
        down = true;
        show("pressed");
      });
      hit.on("pointerup", () => {
        if (!down) return;
        down = false;
        mutate((current) => (on ? unequipCosmetic(current, layer.id) : equipCosmetic(current, layer.id)));
        this.draw();
      });
    });

    this.add.text(160, 548, "称号。一次只戴一个。", { fontFamily: FONT, fontSize: "22px", color: INK });
    if (save.unlockedTitleIds.length === 0) {
      this.add.text(160, 580, "还没有称号。", { fontFamily: FONT, fontSize: "18px", color: MUTED });
    }
    save.unlockedTitleIds.forEach((titleId, index) => {
      const title = displayTitle(FOREST_REWARDS, titleId);
      const on = save.equippedTitleId === titleId;
      warmButton(this, 230 + index * 210, 610, on ? title.shownZh : `戴 ${title.shownZh}`, () => {
        mutate((current) => equipTitle(current, on ? null : titleId));
        this.draw();
      }, { width: 190, height: 56, tone: on ? "primary" : "secondary" });
    });
    if (save.equippedTitleId) {
      warmButton(this, 860, 610, "卸下称号", () => {
        mutate((current) => equipTitle(current, null));
        this.draw();
      }, { width: 150, height: 56, tone: "secondary" });
    }

    this.add.image(1000, 294, "atlas_wardrobe", "wardrobe_arch").setDisplaySize(280, 420);
    this.add.image(1000, 492, "atlas_wardrobe", "wardrobe_stage").setDisplaySize(280, 105);
    const hero = new WarriorSprite(this, 1000, 500, 0.48, save.equippedCosmeticIds);
    hero.play("idle");
    drawEquippedTitle(this, 1000, 360, save.equippedTitleId);
    const worn = save.equippedCosmeticIds.join(",") || "none";
    const helmet = hero.isSlotVisible("outfit_head") ? "shown" : "hidden";
    const back = hero.isSlotDrawn("back") ? "drawn" : "absent";
    probeNote(`forest:equip:${worn}:helmet=${helmet}:back=${back}`);
    warmButton(this, 1040, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, tone: "secondary" });
  }
}
