import Phaser from "phaser";
import { formatMeaning, sampleWords } from "../../domain/catalog";
import { studyNow } from "../../domain/progress";
import { badgeTone } from "../../domain/review";
import { parchmentTitleY } from "../layout";
import { probeEnter } from "../probe";
import { getSave } from "../session";
import { FONT, paper } from "../ui";
import { warmButton, warmPanel } from "../warm/kit";
import { paintRoom, queueWarm } from "../warm/load";
import { INK, MUTED, NOTE, PLUM } from "../warm/theme";

const TONE_LABEL = { none: "未熟练", bright: "熟练", grey: "熟练·待复习" } as const;
const TONE_BADGE = { none: "badge_mastery_none", bright: "badge_mastery_lit", grey: "badge_mastery_dim" } as const;

export class CollectionScene extends Phaser.Scene {
  constructor() {
    super("collection");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core"], ["bg_room"]);
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    probeEnter("collection");
    if (!paintRoom(this)) paper(this);
    warmPanel(this, 640, 400, 1040, 740);
    const now = studyNow(save);
    const owned = sampleWords().filter((word) => save.wordCards[word.id]);
    const titleY = parchmentTitleY(400, 740);
    this.add.text(160, titleY, "词卡册", { fontFamily: FONT, fontSize: "36px", color: INK });
    this.add.text(340, titleY + 12, `森林冒险 · 已收集 ${owned.length}/${sampleWords().length} · 词卡不会因为徽章变灰而消失`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: NOTE,
    });
    if (owned.length === 0) {
      this.add.text(160, 160, "册子还是空的。去学堂认识一个词。", { fontFamily: FONT, fontSize: "22px", color: MUTED });
    }
    owned.forEach((word, index) => {
      const card = save.wordCards[word.id];
      const tone = badgeTone(card, save.memory[word.id], now);
      const column = index % 7;
      const row = Math.floor(index / 7);
      const x = 200 + column * 145;
      const y = 150 + row * 110;
      warmPanel(this, x, y, 132, 96);
      this.add.text(x - 56, y - 34, word.english, { fontFamily: FONT, fontSize: "18px", color: INK });
      this.add.text(x - 56, y - 6, formatMeaning(word), { fontFamily: FONT, fontSize: "16px", color: MUTED });
      this.add.text(x - 56, y + 18, TONE_LABEL[tone], { fontFamily: FONT, fontSize: "14px", color: tone === "grey" ? PLUM : NOTE });
      this.add.image(x + 51, y - 33, "atlas_ui_core", TONE_BADGE[tone]).setDisplaySize(30, 30);
    });
    warmButton(this, 250, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, tone: "secondary" });
    this.input.keyboard?.once("keydown-ESC", () => this.scene.start("overworld"));
  }
}
