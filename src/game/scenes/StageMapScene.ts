import Phaser from "phaser";
import { formatMeaning, wordById } from "../../domain/catalog";
import { mapPanel } from "../../domain/map-panel";
import { needsGradeChoice, studyNow } from "../../domain/progress";
import { browserSpeaker, speakWord } from "../../domain/speech";
import {
  chapterDueCount,
  chapterLearnedCount,
  FOREST_CHAPTER,
  FOREST_WORD_COUNT,
  masteryLabel,
  stageById,
  stageStatuses,
  wordsUntilBoss,
} from "../../domain/stages";
import { uiLabel } from "../../domain/ui-label";
import { probeEnter, probeNote } from "../probe";
import { getSave } from "../session";
import { FONT, listenKeys } from "../ui";
import { warmBar, warmButton, warmPanel } from "../warm/kit";
import { queueWarm, warmBackground } from "../warm/load";
import { FONT_LATIN, FONT_TITLE, INK, MUTED, whenGlyphsReady } from "../warm/theme";

const NODE_AT = [
  { x: 230, y: 620 },
  { x: 430, y: 490 },
  { x: 250, y: 350 },
  { x: 470, y: 220 },
  { x: 690, y: 400 },
];

export class StageMapScene extends Phaser.Scene {
  private selected = 0;
  private lookedAt: string | null = null;
  private fontSample = "";

  constructor() {
    super("stages");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_map", "atlas_battle"], ["bg_map"]);
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    if (needsGradeChoice(save)) {
      this.scene.start("grades", { mode: "migrate" });
      return;
    }
    probeEnter("stages");
    listenKeys(this, (event) => {
      if (event.code === "Escape") this.scene.start("overworld");
      const index = Number(event.code.replace("Digit", "")) - 1;
      const stage = FOREST_CHAPTER.stages[index];
      if (!stage) return;
      this.selected = stage.id;
      this.lookedAt = null;
      this.draw();
      this.fight(stage.id);
    });
    this.draw();
  }

  private fight(stageId: number): void {
    const save = getSave();
    const stage = stageById(stageId);
    if (!save || !stage) return;
    const status = stageStatuses(save)[stage.id - 1];
    if (status !== "open" && status !== "cleared") return;
    probeNote(`stage:fight:${stage.id}`);
    this.scene.start("battle", { stageId: stage.id });
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    warmBackground(this, "bg_map");
    const now = studyNow(save);
    const statuses = stageStatuses(save);
    if (!FOREST_CHAPTER.stages.some((stage) => stage.id === this.selected)) {
      const open = statuses.findIndex((status) => status === "open");
      this.selected = FOREST_CHAPTER.stages[open >= 0 ? open : 0]!.id;
    }
    const stage = stageById(this.selected) ?? FOREST_CHAPTER.stages[0]!;
    const status = statuses[stage.id - 1] ?? "locked";
    const panel = mapPanel(save, stage, status);
    probeNote(`map:stage:${stage.id}:${status}`);
    const looked = this.lookedAt ? wordById(this.lookedAt) : undefined;
    const sample = [panel.goal, panel.unlockLine, panel.note, looked ? formatMeaning(looked) : ""].filter(Boolean).join("");
    if (sample && sample !== this.fontSample && document.fonts && !document.fonts.check('700 16px "Noto Sans SC"', sample)) {
      this.fontSample = sample;
      whenGlyphsReady(sample, () => {
        if (this.scene.isActive()) this.draw();
      });
    }

    warmPanel(this, 520, 58, 760, 72);
    this.add.text(180, 36, `已学 ${chapterLearnedCount(save)}/${FOREST_WORD_COUNT}`, { fontFamily: FONT, fontSize: "20px", fontStyle: "700", color: INK });
    this.add.text(430, 36, `掌握 ${masteryLabel(save, now)}`, { fontFamily: FONT, fontSize: "20px", fontStyle: "700", color: INK });
    this.add.text(660, 36, `到期 ${chapterDueCount(save, now)}`, { fontFamily: FONT, fontSize: "20px", fontStyle: "700", color: INK });
    this.add.text(180, 64, `距林心守护还差 ${wordsUntilBoss(save)} 个所选年级的词`, {
      fontFamily: FONT,
      fontSize: "14px",
      color: MUTED,
    });

    FOREST_CHAPTER.stages.forEach((item, index) => {
      const itemStatus = statuses[index] ?? "locked";
      const spot = NODE_AT[index] ?? NODE_AT[0]!;
      const frame = item.type === "boss"
        ? "map_node_boss"
        : itemStatus === "cleared"
          ? "map_node_cleared"
          : itemStatus === "open"
            ? "map_node_current"
            : "map_node_locked";
      const node = this.add.image(spot.x, spot.y, "atlas_map", frame).setScale(0.5);
      const picked = item.id === stage.id;
      if (picked) node.setScale(0.56);
      if (itemStatus === "open") {
        this.tweens.add({
          targets: node,
          scale: picked ? 0.6 : 0.54,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
      node.setInteractive({ useHandCursor: true });
      node.on("pointerup", () => {
        this.selected = item.id;
        this.lookedAt = null;
        this.draw();
      });
    });

    const panelX = 1024;
    const panelY = 450;
    warmPanel(this, panelX, panelY, 300, 560);
    this.add.text(panelX, panelY - 246, panel.title, { fontFamily: FONT_TITLE, fontSize: "28px", color: INK }).setOrigin(0.5);
    if (panel.showLock) {
      this.add.image(panelX - 118, panelY - 210, "atlas_map", "icon_lock_disabled").setScale(24 / 96);
    }
    this.add.text(panel.showLock ? panelX + 8 : panelX, panelY - 210, panel.statusLabel, {
      fontFamily: FONT,
      fontSize: "18px",
      fontStyle: "700",
      color: MUTED,
    }).setOrigin(0.5);
    let cursor = panelY - 176;
    if (panel.goal) {
      this.add.text(panelX - 126, cursor, panel.goal, {
        fontFamily: FONT,
        fontSize: "15px",
        color: MUTED,
        wordWrap: { width: 252 },
      });
      cursor += 48;
    }
    this.add.text(panelX - 126, cursor, panel.status === "open" && stage.type !== "boss" ? `已学 ${panel.learned}/${panel.total}` : `${panel.learned}/${panel.total}`, {
      fontFamily: FONT,
      fontSize: "16px",
      fontStyle: "700",
      color: INK,
    });
    warmBar(this, panelX, cursor + 28, 240, panel.total === 0 ? 0 : panel.learned / panel.total, panel.status === "cleared" ? "gold" : "leaf");
    cursor += 52;
    if (panel.wins !== null) {
      this.add.text(panelX - 126, cursor, `小战斗 ${panel.wins} 胜`, { fontFamily: FONT, fontSize: "16px", color: INK });
      cursor += 28;
    }
    if (panel.note) {
      this.add.text(panelX - 126, cursor, panel.note, { fontFamily: FONT, fontSize: "16px", color: INK, wordWrap: { width: 252 } });
      cursor += 56;
    }
    panel.words.forEach((face, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = panelX - 84 + column * 86;
      const y = cursor + 20 + row * 48;
      const card = this.add.image(x, y, "atlas_map", face.english ? "map_word_card" : "map_word_unknown").setScale(0.5);
      const text = this.add.text(x, y - 2, face.english ?? "?", {
        fontFamily: FONT_LATIN,
        fontSize: face.english ? "14px" : "18px",
        fontStyle: face.english ? "700" : "800",
        color: face.english ? INK : MUTED,
      }).setOrigin(0.5);
      if (text.width > 72) text.setScale(72 / text.width);
      if (face.interactive && face.english) {
        card.setInteractive({ useHandCursor: true });
        card.on("pointerup", () => {
          const word = wordById(face.id);
          if (!word) return;
          this.lookedAt = face.id;
          probeNote(`map:word:${face.id}`);
          speakWord(word.english, browserSpeaker());
          this.draw();
        });
      }
    });
    if (panel.words.length > 0) cursor += panel.words.length > 3 ? 108 : 56;
    if (panel.unlockLine) {
      this.add.text(panelX, cursor + 8, panel.unlockLine, {
        fontFamily: FONT,
        fontSize: "15px",
        fontStyle: "700",
        color: INK,
        wordWrap: { width: 252 },
        align: "center",
      }).setOrigin(0.5, 0);
      cursor += 48;
    }
    if (looked) {
      this.add.text(panelX, cursor + 4, formatMeaning(looked), {
        fontFamily: FONT,
        fontSize: "16px",
        fontStyle: "700",
        color: INK,
        wordWrap: { width: 252 },
        align: "center",
      }).setOrigin(0.5, 0);
    }
    panel.buttons.forEach((button, index) => {
      const x = panel.buttons.length === 1 ? panelX : panelX - 72 + index * 144;
      warmButton(this, x, panelY + 232, button.label, () => {
        if (!button.enabled) return;
        if (button.id === "learn") this.scene.start("learn");
        else this.fight(stage.id);
      }, { width: panel.buttons.length === 1 ? 240 : 132, tone: button.tone, disabled: !button.enabled });
    });
    warmButton(this, 160, 748, uiLabel("回村子"), () => this.scene.start("overworld"), { width: 160, tone: "secondary" });
    probeNote("stages:ready");
  }
}
