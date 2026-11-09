import Phaser from "phaser";
import { sampleWords } from "../../domain/catalog";
import { PROVISIONAL } from "../../domain/provisional";
import { probeEnter } from "../probe";
import { getSave } from "../session";
import { FONT, button, paper } from "../ui";

/** Provisional end of the 28-word sample. Not a final story. */
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
    const total = sampleWords().length;
    const learned = Object.keys(save.wordCards).length;
    const ending = PROVISIONAL.chapterEnding;
    this.add.text(180, 80, "森林冒险 · 暂定完成", { fontFamily: FONT, fontSize: "42px", color: "#17352a" });
    this.add.text(180, 150, `${ending.label}。这一屏是示例章节的结尾，不是最终故事。`, {
      fontFamily: FONT,
      fontSize: "20px",
      color: "#8a5a12",
    });
    this.add.text(180, 220, `${save.player.name} 收集了 ${learned}/${total} 张森林冒险词卡，并打败了${ending.bossName}。`, {
      fontFamily: FONT,
      fontSize: "24px",
      color: "#17352a",
      wordWrap: { width: 860 },
    });
    this.add.text(180, 300, "词卡都还在册子里。熟练徽章要靠以后的复习，赢下战斗不会把它们点亮，也不会删掉。", {
      fontFamily: FONT,
      fontSize: "22px",
      color: "#3d5c4e",
      wordWrap: { width: 860 },
    });
    this.add.text(180, 400, "林冠的外形暂用页灵，正式的图换上后会替换这一张。探险家和其他职业的图还没有。", {
      fontFamily: FONT,
      fontSize: "20px",
      color: "#3d5c4e",
      wordWrap: { width: 860 },
    });
    button(this, 320, 560, "回村子", () => this.scene.start("overworld"), { width: 220 });
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("overworld"));
    this.input.keyboard?.on("keydown-ENTER", () => this.scene.start("overworld"));
  }
}
