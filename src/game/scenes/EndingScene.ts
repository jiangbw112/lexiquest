import Phaser from "phaser";
import { CHAPTER_ART_LIMITS, displayTitle, FOREST_REWARDS } from "../../domain/chapter-rewards";
import { studyNow } from "../../domain/progress";
import { PROVISIONAL } from "../../domain/provisional";
import { chapterLearnedCount, chapterWordIds, litMasteryCount } from "../../domain/stages";
import { FOREST_ART_LABEL, chapterCosmeticLayers, queueChapterCosmetics } from "../art/chapter-cosmetics";
import { drawEquippedTitle } from "../art/title-bar";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { probeEnter } from "../probe";
import { getSave } from "../session";
import { FONT, button, paper } from "../ui";

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
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    probeEnter("ending");
    paper(this);
    const ending = PROVISIONAL.chapterEnding;
    const total = chapterWordIds().length;
    const lit = litMasteryCount(save, studyNow(save));
    const title = save.equippedTitleId ? displayTitle(FOREST_REWARDS, save.equippedTitleId) : null;
    const granted = chapterCosmeticLayers()
      .filter((layer) => save.unlockedCosmeticIds.includes(layer.id))
      .map((layer) => `${COSMETIC_LABEL[layer.id] ?? layer.id}（${layer.slot}）`);
    this.add.text(150, 48, "已通关森林", { fontFamily: FONT, fontSize: "42px", color: "#17352a" });
    this.add.text(150, 110, `${save.player.name} 打败了${ending.bossName}。这一章走完了。`, {
      fontFamily: FONT,
      fontSize: "22px",
      color: "#17352a",
    });
    this.add.text(150, 160, `徽章亮起 ${lit} / ${total}`, { fontFamily: FONT, fontSize: "40px", color: "#1f7a4d" });
    this.add.text(150, 220, `已学 ${chapterLearnedCount(save)}/${total}。赢下战斗不点亮徽章，也不删词卡。灰掉的徽章不算在亮起里。`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#3d5c4e",
      wordWrap: { width: 700 },
    });
    this.add.text(150, 280, "外观奖励", { fontFamily: FONT, fontSize: "28px", color: "#17352a" });
    this.add.text(150, 324, granted.length > 0 ? granted.join("，") : "还没有外观。", {
      fontFamily: FONT,
      fontSize: "20px",
      color: "#17352a",
      wordWrap: { width: 700 },
    });
    this.add.text(150, 390, title ? `称号：${title.shownZh}` : "称号还没戴上。可以在衣柜里戴。", {
      fontFamily: FONT,
      fontSize: "22px",
      color: "#1f7a4d",
    });
    this.add.text(150, 440, FOREST_ART_LABEL, {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#8a5a12",
      wordWrap: { width: 700 },
    });
    CHAPTER_ART_LIMITS.forEach((line, index) => {
      this.add.text(150, 500 + index * 48, line, {
        fontFamily: FONT,
        fontSize: "15px",
        color: "#3d5c4e",
        wordWrap: { width: 700 },
      });
    });
    const hero = new WarriorSprite(this, 1040, 520, 0.55, save.equippedCosmeticIds);
    hero.play("victory");
    drawEquippedTitle(this, 1040, 160, save.equippedTitleId);
    button(this, 280, 720, "回村子", () => this.scene.start("overworld"), { width: 220 });
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("overworld"));
    this.input.keyboard?.on("keydown-ENTER", () => this.scene.start("overworld"));
  }
}
