import Phaser from "phaser";
import { studyNow } from "../../domain/progress";
import { PROVISIONAL } from "../../domain/provisional";
import { chapterLearnedCount, FOREST_WORD_COUNT, masteryLabel } from "../../domain/stages";
import { probeEnter } from "../probe";
import { getSave } from "../session";
import { FONT, button, paper } from "../ui";

/** Chapter completion. The clear is the boss win. The badge line is mastery, out of 28. */
export class EndingScene extends Phaser.Scene {
  constructor() {
    super("ending");
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
    const reward = PROVISIONAL.chapterBattle;
    const lit = masteryLabel(save, studyNow(save));
    const title = reward.completionTitle;
    this.add.text(180, 80, "森林冒险 · 通关", { fontFamily: FONT, fontSize: "42px", color: "#17352a" });
    this.add.text(180, 150, `${save.player.name} 打败了${ending.bossName}。这一章走完了。`, {
      fontFamily: FONT,
      fontSize: "24px",
      color: "#17352a",
    });
    this.add.text(180, 220, `掌握 ${lit}`, { fontFamily: FONT, fontSize: "48px", color: "#1f7a4d" });
    this.add.text(180, 290, `熟练徽章亮着 ${lit}。分母是这一章的 ${FOREST_WORD_COUNT} 个词。灰掉的徽章不算。`, {
      fontFamily: FONT,
      fontSize: "22px",
      color: "#3d5c4e",
      wordWrap: { width: 860 },
    });
    this.add.text(180, 370, `已学 ${chapterLearnedCount(save)}/${FOREST_WORD_COUNT}。赢下战斗不会把徽章点亮，也不会删掉词卡。`, {
      fontFamily: FONT,
      fontSize: "22px",
      color: "#3d5c4e",
      wordWrap: { width: 860 },
    });
    const cosmetic = reward.completionCosmeticId
      ? `外观：${reward.completionCosmeticId}。`
      : "外观奖励还没定。";
    this.add.text(180, 450, `称号：${title}。${cosmetic}`, {
      fontFamily: FONT,
      fontSize: "22px",
      color: "#8a5a12",
      wordWrap: { width: 860 },
    });
    this.add.text(180, 510, "林心守护者的外形暂用页灵，正式的图换上后会替换这一张。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#3d5c4e",
    });
    button(this, 320, 620, "回村子", () => this.scene.start("overworld"), { width: 220 });
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("overworld"));
    this.input.keyboard?.on("keydown-ENTER", () => this.scene.start("overworld"));
  }
}
