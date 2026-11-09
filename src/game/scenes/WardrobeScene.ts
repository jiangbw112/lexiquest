import Phaser from "phaser";
import { OUTFITS } from "../../domain/outfits";
import { equipOutfit } from "../../domain/progress";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { WARRIOR_ART_NOTE } from "../p0";
import { probeEnter } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, paper } from "../ui";

export class WardrobeScene extends Phaser.Scene {
  constructor() {
    super("wardrobe");
  }

  preload(): void {
    queueWarriorAtlases(this);
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
    this.add.text(160, 48, "衣柜", { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
    this.add.text(160, 100, `${WARRIOR_ART_NOTE}。衣服层和身体、武器是分开的，但这一包只有外观 A 的一套战士装。`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#3d5c4e",
      wordWrap: { width: 620 },
    });
    this.add.text(160, 156, "斗篷和绶带会记在存档里，画面还不会换。地图上的小人仍是占位图。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#3d5c4e",
      wordWrap: { width: 620 },
    });
    const hero = new WarriorSprite(this, 980, 620, 0.66);
    hero.play("idle");
    OUTFITS.forEach((outfit, index) => {
      const owned = save.ownedOutfitIds.includes(outfit.id);
      const y = 230 + index * 110;
      this.add.text(180, y, outfit.name, { fontFamily: FONT, fontSize: "28px", color: "#17352a" });
      this.add.text(180, y + 36, owned ? outfit.description : "还没得到", {
        fontFamily: FONT,
        fontSize: "18px",
        color: "#3d5c4e",
        wordWrap: { width: 340 },
      });
      if (!owned) return;
      button(this, 760, y + 24, save.equippedOutfitId === outfit.id ? "穿着" : "换上", () => {
        mutate((current) => equipOutfit(current, outfit.id));
        this.draw();
      }, { width: 140, fill: save.equippedOutfitId === outfit.id ? 0x1f7a4d : 0x5c6b62 });
    });
    button(this, 250, 700, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
  }
}
