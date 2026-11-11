import Phaser from "phaser";
import { formatMeaning, sampleWords, wordById } from "../../domain/catalog";
import { studyNow } from "../../domain/progress";
import { badgeTone } from "../../domain/review";
import { COLLECTION_CARD, cjkWrap, parchmentTitleY } from "../layout";
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
    const forestOwned = sampleWords().filter((word) => save.wordCards[word.id]);
    const forestIds = new Set(forestOwned.map((word) => word.id));
    const later = Object.keys(save.wordCards)
      .filter((id) => !forestIds.has(id))
      .map((id) => wordById(id))
      .filter((word): word is NonNullable<ReturnType<typeof wordById>> => Boolean(word));
    const owned = [...forestOwned, ...later];
    const shown = owned.slice(0, 35);
    const titleY = parchmentTitleY(400, 740);
    this.add.text(160, titleY, "词卡册", { fontFamily: FONT, fontSize: "36px", color: INK });
    this.add.text(340, titleY + 12, `已收集 ${owned.length} 个 · 词卡不会因为徽章变灰而消失`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: NOTE,
      wordWrap: cjkWrap(760),
    });
    if (owned.length === 0) {
      this.add.text(160, 160, "册子还是空的。去学堂认识一个词。", { fontFamily: FONT, fontSize: "22px", color: MUTED });
    }
    shown.forEach((word, index) => {
      const card = save.wordCards[word.id];
      const tone = badgeTone(card, save.memory[word.id], now);
      const column = index % 7;
      const row = Math.floor(index / 7);
      const x = 200 + column * 145;
      const y = 150 + row * 110;
      warmPanel(this, x, y, COLLECTION_CARD.width, COLLECTION_CARD.height);
      const left = x - COLLECTION_CARD.width / 2 + COLLECTION_CARD.padX;
      const english = this.add.text(left, y - 44, word.english, {
        fontFamily: FONT,
        fontSize: "15px",
        color: INK,
        wordWrap: cjkWrap(COLLECTION_CARD.englishWidth),
      }).setOrigin(0, 0);
      const englishFit = Math.min(
        1,
        COLLECTION_CARD.englishWidth / Math.max(english.width, 1),
        COLLECTION_CARD.englishHeight / Math.max(english.height, 1),
      );
      if (englishFit < 1) english.setScale(englishFit);
      const meaning = this.add.text(left, y - 16, formatMeaning(word), {
        fontFamily: FONT,
        fontSize: "13px",
        color: MUTED,
        wordWrap: cjkWrap(COLLECTION_CARD.meaningWidth),
      }).setOrigin(0, 0);
      const meaningFit = Math.min(
        1,
        COLLECTION_CARD.meaningWidth / Math.max(meaning.width, 1),
        COLLECTION_CARD.meaningHeight / Math.max(meaning.height, 1),
      );
      if (meaningFit < 1) meaning.setScale(meaningFit);
      const toneLabel = this.add.text(left, y + 28, TONE_LABEL[tone], {
        fontFamily: FONT,
        fontSize: "14px",
        color: tone === "grey" ? PLUM : NOTE,
      }).setOrigin(0, 0.5);
      if (toneLabel.width > COLLECTION_CARD.meaningWidth) toneLabel.setScale(COLLECTION_CARD.meaningWidth / toneLabel.width);
      this.add.image(x + 51, y - 33, "atlas_ui_core", TONE_BADGE[tone]).setDisplaySize(30, 30);
    });
    warmButton(this, 250, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, tone: "secondary" });
    this.input.keyboard?.once("keydown-ESC", () => this.scene.start("overworld"));
  }
}
