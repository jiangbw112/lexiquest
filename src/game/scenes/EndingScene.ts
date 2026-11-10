import Phaser from "phaser";
import { displayTitle, FOREST_REWARDS } from "../../domain/chapter-rewards";
import { studyNow } from "../../domain/progress";
import { PROVISIONAL } from "../../domain/provisional";
import { chapterLearnedCount, chapterWordIds, litMasteryCount } from "../../domain/stages";
import { chapterCosmeticLayers, queueChapterCosmetics } from "../art/chapter-cosmetics";
import { drawEquippedTitle } from "../art/title-bar";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { probeEnter } from "../probe";
import { getSave } from "../session";
import { FONT, paper } from "../ui";
import { warmButton, warmPanel } from "../warm/kit";
import { queueWarm, warmBackground } from "../warm/load";
import { INK, MUTED, NOTE, TEAL_DEEP } from "../warm/theme";

const COSMETIC_LABEL: Record<string, string> = {
  forest_leaf_cape: "林叶披肩",
  acorn_pin: "橡实别针",
  forest_wreath: "森语花环",
};

/** Settlement after the first clear. Cosmetics and titles come from the reward config. */
export class EndingScene extends Phaser.Scene {
  constructor() {
    super("ending");
  }

  preload(): void {
    queueWarriorAtlases(this);
    queueChapterCosmetics(this);
    queueWarm(this, ["atlas_ui_core"], ["bg_ending"]);
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    probeEnter("ending");
    if (this.textures.exists("bg_ending")) warmBackground(this, "bg_ending");
    else paper(this);
    warmPanel(this, 500, 400, 760, 740);
    const ending = PROVISIONAL.chapterEnding;
    const total = chapterWordIds().length;
    const lit = litMasteryCount(save, studyNow(save));
    const title = save.equippedTitleId ? displayTitle(FOREST_REWARDS, save.equippedTitleId) : null;
    const granted = chapterCosmeticLayers()
      .filter((layer) => save.unlockedCosmeticIds.includes(layer.id))
      .map((layer) => COSMETIC_LABEL[layer.id] ?? "");
    this.add.text(150, 48, "已通关森林", { fontFamily: FONT, fontSize: "42px", color: INK });
    this.add.text(150, 110, `${save.player.name} 打败了${ending.bossName}。这一章走完了。`, {
      fontFamily: FONT,
      fontSize: "22px",
      color: INK,
    });
    this.add.text(150, 160, `徽章亮起 ${lit} / ${total}`, { fontFamily: FONT, fontSize: "40px", color: TEAL_DEEP });
    this.add.text(150, 220, `已学 ${chapterLearnedCount(save)}/${total}。赢下战斗不点亮徽章，也不删词卡。灰掉的徽章不算在亮起里。`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: MUTED,
      wordWrap: { width: 700 },
    });
    this.add.text(150, 280, "外观奖励", { fontFamily: FONT, fontSize: "28px", color: INK });
    this.add.text(150, 324, granted.length > 0 ? granted.join("，") : "还没有外观。", {
      fontFamily: FONT,
      fontSize: "20px",
      color: INK,
      wordWrap: { width: 700 },
    });
    this.add.text(150, 390, title ? `称号：${title.shownZh}` : "称号还没戴上。可以在衣柜里戴。", {
      fontFamily: FONT,
      fontSize: "22px",
      color: TEAL_DEEP,
    });
    this.add.text(150, 440, "戴上花环，头盔会藏起来。", {
      fontFamily: FONT,
      fontSize: "16px",
      color: NOTE,
    });
    const hero = new WarriorSprite(this, 1040, 560, 0.55, save.equippedCosmeticIds);
    hero.play("victory");
    drawEquippedTitle(this, 1040, 200, save.equippedTitleId);
    warmButton(this, 280, 720, "回村子", () => this.scene.start("overworld"), { width: 220 });
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("overworld"));
    this.input.keyboard?.on("keydown-ENTER", () => this.scene.start("overworld"));
  }
}
