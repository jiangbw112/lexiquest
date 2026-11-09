import Phaser from "phaser";
import { sampleWords } from "../../domain/catalog";
import { studyNow } from "../../domain/progress";
import { badgeTone } from "../../domain/review";
import { SAMPLE_DATA_LABEL } from "../../domain/catalog";
import { probeEnter } from "../probe";
import { getSave } from "../session";
import { FONT, button, paper } from "../ui";

const TONE_LABEL = { none: "未熟练", bright: "熟练", grey: "熟练·待复习" } as const;

export class CollectionScene extends Phaser.Scene {
  constructor() {
    super("collection");
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    probeEnter("collection");
    paper(this);
    const now = studyNow(save);
    this.add.text(160, 40, "词卡册", { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
    this.add.text(340, 52, `${SAMPLE_DATA_LABEL} · 词卡不会因为徽章变灰而消失`, { fontFamily: FONT, fontSize: "18px", color: "#8a5a12" });
    const owned = sampleWords().filter((word) => save.wordCards[word.id]);
    if (owned.length === 0) {
      this.add.text(160, 160, "册子还是空的。去学堂认识一个词。", { fontFamily: FONT, fontSize: "22px", color: "#3d5c4e" });
    }
    owned.forEach((word, index) => {
      const card = save.wordCards[word.id];
      const tone = badgeTone(card, save.memory[word.id], now);
      const column = index % 7;
      const row = Math.floor(index / 7);
      const x = 200 + column * 145;
      const y = 150 + row * 110;
      this.add.rectangle(x, y, 132, 96, tone === "grey" ? 0xe7e1d6 : 0xfff8ee).setStrokeStyle(3, tone === "bright" ? 0xc9891d : 0x17352a);
      this.add.text(x - 56, y - 34, word.english, { fontFamily: FONT, fontSize: "18px", color: "#17352a" });
      this.add.text(x - 56, y - 6, word.chinese, { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e" });
      this.add.text(x - 56, y + 18, TONE_LABEL[tone], { fontFamily: FONT, fontSize: "14px", color: tone === "grey" ? "#8a7560" : "#8a5a12" });
    });
    button(this, 250, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
    this.input.keyboard?.once("keydown-ESC", () => this.scene.start("overworld"));
  }
}
