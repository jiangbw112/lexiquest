import Phaser from "phaser";
import { formatMeaning, wordById } from "../../domain/catalog";
import { mapResultsFramesReady, mapStarCenter } from "../../domain/battle-results";
import { activeChapter, mapCounts, playStatuses, starKey, visibleChapters } from "../../domain/chapter-plan";
import { mapPanel } from "../../domain/map-panel";
import { studyNow } from "../../domain/progress";
import { badgeTone, isDue } from "../../domain/review";
import { browserSpeaker, speakWord } from "../../domain/speech";
import {
  chapterDueCount,
  learnedRequiredCount,
  masteryLabel,
  requiredWordIds,
  wordsUntilBoss,
} from "../../domain/stages";
import { uiLabel } from "../../domain/ui-label";
import { MAP_WORD_CARD_HIT, mapWordCardCenter } from "../hit";
import { cjkWrap } from "../layout";
import { redirectUngraded } from "../grade-route";
import { resetPlayTimer, restPromptDue, snoozeRest } from "../play-timer";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, listenKeys } from "../ui";
import { warmBar, warmButton, warmPanel, warmSlice, warmTitlePlank } from "../warm/kit";
import { queueWarm, warmBackground } from "../warm/load";
import { BOSS_NODE_ORIGIN, bossMapFrame } from "../warm/frames";
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
  private restPrompt = false;
  private retryStageId: number | null = null;
  private waitingForMapArt = false;

  init(data: { fromBattleEnd?: boolean; retryStageId?: number } = {}): void {
    this.restPrompt = Boolean(data.fromBattleEnd) && restPromptDue();
    this.retryStageId = this.restPrompt ? data.retryStageId ?? null : null;
  }

  constructor() {
    super("stages");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_map", "atlas_map_results", "atlas_battle"], ["bg_map"]);
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    if (redirectUngraded(this, save)) return;
    probeEnter("stages");
    const opened = playStatuses(save, activeChapter(save));
    const openAt = opened.findIndex((status) => status === "open");
    this.selected = activeChapter(save).stages[openAt >= 0 ? openAt : 0]!.id;
    this.lookedAt = null;
    listenKeys(this, (event) => {
      if (this.restPrompt) return;
      if (event.code === "Escape") this.scene.start("overworld");
      if (event.code === "BracketLeft") {
        this.shiftChapter(-1);
        return;
      }
      if (event.code === "BracketRight") {
        this.shiftChapter(1);
        return;
      }
      const saveNow = getSave();
      if (!saveNow) return;
      const index = Number(event.code.replace("Digit", "")) - 1;
      const stage = activeChapter(saveNow).stages[index];
      if (!stage) return;
      this.selected = stage.id;
      this.lookedAt = null;
      this.draw();
      this.fight(stage.id);
    });
    this.draw();
  }

  /** atlas_map_results loads with this scene. Nodes and stars wait until its frames exist. */
  private mapArtReady(): boolean {
    if (!this.textures.exists("atlas_map_results")) return false;
    const atlas = this.textures.get("atlas_map_results");
    return mapResultsFramesReady((frame) => atlas.has(frame));
  }

  private waitForMapArt(): void {
    if (this.waitingForMapArt) return;
    this.waitingForMapArt = true;
    this.load.once("complete", () => {
      this.waitingForMapArt = false;
      if (this.scene.isActive()) this.draw();
    });
    if (this.load.isLoading()) return;
    queueWarm(this, ["atlas_map_results"], []);
    if (this.load.totalToLoad > 0) this.load.start();
    else this.waitingForMapArt = false;
  }

  private shiftChapter(delta: number): void {
    const save = getSave();
    if (!save) return;
    const list = visibleChapters(save.selectedGrades);
    const index = list.findIndex((item) => item.id === activeChapter(save).id);
    const next = list[index + delta];
    if (!next) return;
    mutate((current) => ({ ...current, currentChapterId: next.id }));
    const updated = getSave();
    if (!updated) return;
    const statuses = playStatuses(updated, next);
    const openAt = statuses.findIndex((status) => status === "open");
    this.selected = next.stages[openAt >= 0 ? openAt : 0]!.id;
    this.lookedAt = null;
    this.draw();
  }

  private fight(stageId: number): void {
    const save = getSave();
    if (!save || this.restPrompt) return;
    const chapter = activeChapter(save);
    const stage = chapter.stages.find((item) => item.id === stageId);
    if (!stage) return;
    const status = playStatuses(save, chapter)[stage.id - 1];
    if (status !== "open" && status !== "cleared") return;
    probeNote(`stage:fight:${stage.id}`);
    this.scene.start("battle", { stageId: stage.id, chapterId: chapter.id });
  }

  private draw(): void {
    if (!this.mapArtReady()) {
      this.waitForMapArt();
      return;
    }
    const save = getSave();
    if (!save) return;
    this.tweens.killAll();
    this.children.removeAll(true);
    warmBackground(this, "bg_map");
    const now = studyNow(save);
    const chapter = activeChapter(save);
    const statuses = playStatuses(save, chapter);
    if (!chapter.stages.some((stage) => stage.id === this.selected)) {
      const open = statuses.findIndex((status) => status === "open");
      this.selected = chapter.stages[open >= 0 ? open : 0]!.id;
    }
    const stage = chapter.stages.find((item) => item.id === this.selected) ?? chapter.stages[0]!;
    const status = statuses[stage.id - 1] ?? "locked";
    const panel = mapPanel(save, stage, status, mapCounts(save, chapter, stage));
    probeNote(`map:stage:${stage.id}:${status}`);
    const looked = this.lookedAt ? wordById(this.lookedAt) : undefined;
    const sample = [panel.goal, panel.unlockLine, panel.note, looked ? formatMeaning(looked) : ""].filter(Boolean).join("");
    if (sample && sample !== this.fontSample && document.fonts && !document.fonts.check('700 16px "Noto Sans SC"', sample)) {
      this.fontSample = sample;
      whenGlyphsReady(sample, () => {
        if (this.scene.isActive()) this.draw();
      });
    }

    warmTitlePlank(this, 300, 48, 420, chapter.name);
    const chapters = visibleChapters(save.selectedGrades);
    const chapterIndex = Math.max(0, chapters.findIndex((item) => item.id === chapter.id));
    warmButton(this, 150, 118, "上一章", () => this.shiftChapter(-1), { width: 140, tone: "secondary", disabled: chapterIndex <= 0 });
    warmPanel(this, 300, 118, 140, 46);
    this.add.text(300, 118, `第 ${chapterIndex + 1} / ${chapters.length} 章`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: INK,
    }).setOrigin(0.5);
    warmButton(this, 450, 118, "下一章", () => this.shiftChapter(1), {
      width: 140,
      tone: "secondary",
      disabled: chapterIndex >= chapters.length - 1,
    });
    warmPanel(this, 930, 48, 540, 66);
    const forestChapter = chapter.grade === "mixed";
    const learned = forestChapter
      ? learnedRequiredCount(save)
      : chapter.wordIds.filter((id) => save.wordCards[id]).length;
    const total = forestChapter ? requiredWordIds(save).length : chapter.wordIds.length;
    const mastery = forestChapter
      ? masteryLabel(save, now)
      : `${chapter.wordIds.filter((id) => badgeTone(save.wordCards[id], save.memory[id], now) === "bright").length}/${chapter.wordIds.length}`;
    const due = forestChapter
      ? chapterDueCount(save, now)
      : Object.values(save.memory).filter((memory) => chapter.wordIds.includes(memory.wordId) && isDue(memory, now)).length;
    const untilBoss = forestChapter
      ? wordsUntilBoss(save)
      : chapter.wordIds.filter((id) => !save.wordCards[id]).length;
    this.add.text(680, 26, `已学 ${learned}/${total}`, {
      fontFamily: FONT,
      fontSize: "20px",
      fontStyle: "700",
      color: INK,
    });
    this.add.text(860, 26, `熟练 ${mastery}`, { fontFamily: FONT, fontSize: "20px", fontStyle: "700", color: INK });
    this.add.text(1040, 26, `到期 ${due}`, { fontFamily: FONT, fontSize: "20px", fontStyle: "700", color: INK });
    const untilLine = forestChapter ? `距林心守护还差 ${untilBoss} 个词` : `距${chapter.bossName}还差 ${untilBoss} 个词`;
    this.add.text(680, 52, untilLine, {
      fontFamily: FONT,
      fontSize: "14px",
      color: MUTED,
    });

    chapter.stages.forEach((item, index) => {
      const itemStatus = statuses[index] ?? "locked";
      const spot = NODE_AT[index] ?? NODE_AT[0]!;
      const frame = item.type === "boss"
        ? bossMapFrame(itemStatus)
        : itemStatus === "cleared"
          ? "map_node_cleared"
          : itemStatus === "open"
            ? "map_node_current"
            : "map_node_locked";
      const atlas = frame === "map_node_boss_cleared" ? "atlas_map_results" : "atlas_map";
      const node = this.add.image(spot.x, spot.y, atlas, frame).setScale(0.5);
      if (item.type === "boss") node.setOrigin(BOSS_NODE_ORIGIN.x, BOSS_NODE_ORIGIN.y);
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
      const record = save.bestStars?.[starKey(chapter.id, item.id)];
      if (record === 1 || record === 2 || record === 3) {
        const starAt = mapStarCenter(index);
        this.drawMapStars(starAt.x, starAt.y, record, 24, true);
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
        wordWrap: cjkWrap(252),
      });
      cursor += 48;
    }
    if (panel.progressLabel) {
      this.add.text(panelX - 126, cursor, panel.progressLabel, {
        fontFamily: FONT,
        fontSize: "16px",
        fontStyle: "700",
        color: INK,
      });
      warmBar(this, panelX, cursor + 40, 240, panel.total === 0 ? 0 : panel.learned / panel.total, panel.status === "cleared" ? "gold" : "leaf");
      cursor += 64;
    }
    if (panel.wins !== null) {
      this.add.text(panelX - 126, cursor, `小战斗 ${panel.wins} 胜`, { fontFamily: FONT, fontSize: "16px", color: INK });
      cursor += 28;
    }
    if (panel.bestStars) {
      this.add.text(panelX - 126, cursor, "最好成绩", { fontFamily: FONT, fontSize: "16px", color: INK });
      this.drawMapStars(panelX + 36, cursor + 8, panel.bestStars, 20, false);
      cursor += 36;
    }
    if (panel.note) {
      this.add.text(panelX - 126, cursor, panel.note, { fontFamily: FONT, fontSize: "16px", color: INK, wordWrap: cjkWrap(252) });
      cursor += 56;
    }
    panel.words.forEach((face, index) => {
      const { x, y } = mapWordCardCenter(panelX, cursor, index);
      const frame = face.english ? "map_word_card" : "map_word_unknown";
      const card = warmSlice(this, "atlas_map", frame, 80, 48);
      card.setPosition(x, y);
      const text = this.add.text(x, y - 2, face.english ?? "?", {
        fontFamily: FONT_LATIN,
        fontSize: face.english ? "14px" : "18px",
        fontStyle: face.english ? "700" : "800",
        color: face.english ? INK : MUTED,
      }).setOrigin(0.5);
      if (text.width > 72) text.setScale(72 / text.width);
      if (face.interactive && face.english) {
        card.setInteractive(
          new Phaser.Geom.Rectangle(MAP_WORD_CARD_HIT.x, MAP_WORD_CARD_HIT.y, MAP_WORD_CARD_HIT.width, MAP_WORD_CARD_HIT.height),
          Phaser.Geom.Rectangle.Contains,
        );
        if (card.input) card.input.cursor = "pointer";
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
    if (panel.words.length > 0) cursor += panel.words.length > 3 ? 120 : 60;
    if (panel.unlockLine) {
      this.add.text(panelX, cursor + 8, panel.unlockLine, {
        fontFamily: FONT,
        fontSize: "15px",
        fontStyle: "700",
        color: INK,
        wordWrap: cjkWrap(252),
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
        wordWrap: cjkWrap(252),
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
    if (this.restPrompt) this.drawRest();
  }

  private drawRest(): void {
    const zone = this.add.zone(640, 400, 1280, 800);
    zone.setInteractive();
    if (zone.input) zone.input.cursor = "default";
    warmPanel(this, 640, 400, 760, 280);
    this.add.text(640, 330, "已经玩了一会儿啦，起来喝口水、看看远处吧。", {
      fontFamily: FONT,
      fontSize: "22px",
      color: INK,
      wordWrap: cjkWrap(640),
      align: "center",
    }).setOrigin(0.5);
    warmButton(this, 500, 460, "休息一下", () => {
      resetPlayTimer();
      this.restPrompt = false;
      this.scene.start("title");
    }, { width: 200 });
    warmButton(this, 780, 460, "再玩一会儿", () => {
      snoozeRest();
      const retry = this.retryStageId;
      this.restPrompt = false;
      this.retryStageId = null;
      if (retry) {
        this.scene.start("battle", { stageId: retry });
        return;
      }
      this.draw();
    }, { width: 200, tone: "secondary" });
  }

  private drawMapStars(x: number, y: number, lit: number, size: number, cream: boolean): void {
    const gap = 4;
    let start = x - (size * 3 + gap * 2) / 2 + size / 2;
    let rowY = y;
    if (cream) {
      const plate = this.add.graphics();
      plate.fillStyle(0xfff4dc, 0.92);
      plate.lineStyle(1.5, 0x3b2a20, 1);
      plate.fillRoundedRect(x - 46, y - 15, 92, 30, 15);
      plate.strokeRoundedRect(x - 46, y - 15, 92, 30, 15);
      start = x - 46 + 6 + size / 2;
      rowY = y - 15 + 3 + size / 2;
    }
    for (let i = 0; i < 3; i += 1) {
      const frame = i < lit ? "map_star_on" : "map_star_off";
      const step = cream ? 28 : size + gap;
      this.add.image(start + i * step, rowY, "atlas_map_results", frame).setDisplaySize(size, size);
    }
  }
}
