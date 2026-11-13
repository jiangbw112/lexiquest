import Phaser from "phaser";
import {
  LOSS_ENCOURAGEMENT,
  moreBadgeLabel,
  PRACTICE_LINE_1,
  PRACTICE_LINE_2,
  PRACTICE_NOTICE,
  RESULTS_LAYOUT,
  resultsLowerShift,
  resultsRewardDrop,
  resultsSkipHintState,
  resultsSkipKind,
  resultsStackNudge,
  bossVictoryBanner,
  practiceItemLine,
  visibleItems,
  xpBarSegments,
  type XpFillSegment,
  type BattleResultsView,
  type ResultItem,
} from "../../domain/battle-results";
import { skillCardFrame, skillIconFrame, skillLevelFrame, starMark } from "../../domain/skill-card-face";
import { browserSpeaker, speakWord } from "../../domain/speech";
import { uiLabel } from "../../domain/ui-label";
import { queueChapterCosmetics } from "../art/chapter-cosmetics";
import { ClassSideSprite } from "../art/class-sprite";
import { queueClassSide, queueClassWreath, savedClassId } from "../art/class-load";
import { restPromptDue } from "../play-timer";
import { probeNote } from "../probe";
import { getSave } from "../session";
import { listenKeys } from "../ui";
import { warmButton, warmPanel, warmSlice } from "../warm/kit";
import { queueWarm } from "../warm/load";
import { applyFittedText, RESULTS_WORD_CHIP, resultsGlossBox } from "../layout";
import { CREAM, FONT_BODY, FONT_LATIN, FONT_TITLE, INK, MUTED, NOTE, TEAL_DEEP, motionOff } from "../warm/theme";

const KEY_LOCK_MS = 300;
const BROWN = 0x5d3e2b;
const GOLD = 0xe9c46a;

export class BattleResultsScene extends Phaser.Scene {
  private view!: BattleResultsView;
  private openedAt = 0;
  private settled = false;
  private buttons: Phaser.GameObjects.Container[] = [];
  private skipHint?: Phaser.GameObjects.Text;
  private finishing: { setAlpha: (alpha: number) => unknown }[] = [];
  private xpFills: {
    leaf: Phaser.GameObjects.NineSlice;
    gold: Phaser.GameObjects.NineSlice;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  private xpSegments: XpFillSegment[] = [];
  private xpRunning: { value: number } | null = null;
  private xpHold: Phaser.Time.TimerEvent | null = null;
  private finalNoted = false;

  constructor() {
    super("battle-results");
  }

  init(data: BattleResultsView): void {
    this.view = data;
    this.settled = false;
    this.buttons = [];
    this.finishing = [];
    this.xpFills = null;
    this.xpSegments = [];
    this.xpRunning = null;
    this.xpHold = null;
    this.finalNoted = false;
  }

  preload(): void {
    queueClassSide(this, savedClassId(getSave()));
    queueClassWreath(this);
    queueChapterCosmetics(this);
    queueWarm(this, ["atlas_ui_core", "atlas_ui_pages", "atlas_battle", "atlas_skills", "atlas_results"], []);
  }

  create(): void {
    this.openedAt = this.time.now;
    const view = this.view;
    probeNote(`battle:results:open:${view.won}:${view.stars ?? "none"}:${view.practiceOnly}:${view.newRecord}`);
    const dim = this.add.rectangle(640, 400, 1280, 800, 0x000000, 0.55);
    dim.setInteractive();
    dim.on("pointerdown", () => {
      // Keep the old corner from skipping the page or reaching the battle underneath.
      if (!resultsSkipHintState(resultsSkipKind(this.view)).interactive) return;
      if (this.settled) return;
      this.finishMotion();
    });
    this.drawGlow();
    warmPanel(this, RESULTS_LAYOUT.panel.x, RESULTS_LAYOUT.panel.y, RESULTS_LAYOUT.panel.w, RESULTS_LAYOUT.panel.h);
    this.drawHero();
    this.drawTitle();
    this.drawWords();
    if (view.won) this.drawWinBody();
    else this.drawLossBody();
    this.drawButtons();
    this.skipHint = this.add.text(1180, 760, "点一下看全部", {
      fontFamily: FONT_BODY,
      fontSize: "16px",
      color: CREAM,
    }).setOrigin(1, 0.5);
    this.applySkipHint();
    if (motionOff()) this.finishMotion();
    else {
      for (const piece of this.finishing) piece.setAlpha(0);
      this.tweens.add({
        targets: this.finishing,
        alpha: 1,
        duration: 700,
        delay: 200,
        onComplete: () => {
          if (this.settled) return;
          this.showContent();
          this.startXpGrow();
        },
      });
    }
    this.time.delayedCall(KEY_LOCK_MS, () => this.enableButtons());
    listenKeys(this, (event) => this.onKey(event));
  }

  private applySkipHint(): void {
    const skip = resultsSkipHintState(resultsSkipKind(this.view));
    this.skipHint?.setVisible(skip.visible);
    if (!skip.interactive) this.skipHint?.disableInteractive();
  }

  private showContent(): void {
    this.tweens.killTweensOf(this.finishing);
    for (const piece of this.finishing) piece.setAlpha(1);
    this.applySkipHint();
  }

  private noteFinal(): void {
    if (this.finalNoted) return;
    this.finalNoted = true;
    probeNote(`battle:results:final:${this.view.won}:${this.view.stars ?? "none"}:${this.view.practiceOnly}:${this.view.newRecord}`);
  }

  /** Skip the fade and the XP grow. A click or Space shows the finished screen. */
  private finishMotion(): void {
    if (this.settled) return;
    this.settled = true;
    this.showContent();
    this.snapXp();
    this.noteFinal();
  }

  private enableButtons(): void {
    for (const button of this.buttons) button.setVisible(true);
  }

  private keysOpen(): boolean {
    return this.time.now - this.openedAt >= KEY_LOCK_MS;
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.keysOpen()) return;
    if (event.code === "Space") {
      this.finishMotion();
      return;
    }
    if (event.code.startsWith("Digit")) return;
    if (!this.view.won && event.code === "Enter") {
      this.retry();
      return;
    }
    if (!this.view.won && event.code === "Escape") {
      this.toMap(false);
      return;
    }
    if (this.view.won && (event.code === "Enter" || event.code === "Escape")) this.continueOn();
  }

  private drawGlow(): void {
    const glow = this.add.graphics();
    if (this.view.won) {
      glow.fillStyle(0xffe2a0, 0.22);
      glow.fillCircle(235, 520, 120);
      glow.lineStyle(10, 0xffe2a0, 0.28);
      for (let ray = 0; ray < 14; ray += 1) {
        const angle = (Math.PI * 2 * ray) / 14;
        glow.beginPath();
        glow.moveTo(235 + Math.cos(angle) * 36, 520 + Math.sin(angle) * 36);
        glow.lineTo(235 + Math.cos(angle) * 280, 520 + Math.sin(angle) * 280);
        glow.strokePath();
      }
    } else {
      glow.fillStyle(0xc1dde2, 0.4);
      glow.fillCircle(235, 520, 220);
    }
    this.finishing.push(glow);
  }

  private drawHero(): void {
    // Feet on the art mark. Outfit pieces come from the actor sheet; cosmetics stay on this pack.
    const hero = new ClassSideSprite(
      this,
      235,
      646,
      savedClassId(getSave()),
      0.7,
      this.view.equippedCosmeticIds,
      this.view.equippedOutfitId,
    );
    hero.play(this.view.won ? "victory" : "idle");
    this.finishing.push(hero.root);
  }

  private drawTitle(): void {
    const view = this.view;
    const boss = view.won && view.boss;
    const title = view.won
      ? boss
        ? uiLabel(bossVictoryBanner(view.bossName))
        : uiLabel("胜利！")
      : uiLabel("差一点点！");
    const banner = this.add.image(boss ? 340 : 380, boss ? 0 : 14, "atlas_results", boss ? "result_banner_boss" : "result_banner");
    banner.setOrigin(0, 0).setDisplaySize(boss ? 600 : 520, boss ? 99 : 82);
    if (!view.won) banner.setTint(0xb6d9e2);
    const size = boss || [...title].length > 5 ? 34 : 40;
    this.add.text(640, boss ? 53.5 : 55, title, {
      fontFamily: FONT_TITLE,
      fontSize: `${size}px`,
      color: CREAM,
    }).setOrigin(0.5);
    if (view.won && view.stars) {
      const spots = [
        { x: 161, y: 200, size: 56 },
        { x: 235, y: 194, size: 68 },
        { x: 309, y: 200, size: 56 },
      ];
      spots.forEach((spot, index) => {
        const frame = index < (view.stars ?? 0) ? "result_star_on" : "result_star_off";
        const star = this.add.image(spot.x, spot.y, "atlas_results", frame).setDisplaySize(spot.size, spot.size);
        this.finishing.push(star);
      });
      const praise = view.stars === 3
        ? uiLabel("太棒了！")
        : view.stars === 2
          ? uiLabel("打得真好！")
          : uiLabel("赢啦！继续加油！");
      this.capsule(235, 300, praise, 28, BROWN, CREAM, FONT_TITLE);
      if (view.newRecord) {
        const plate = this.add.image(185, 240, "atlas_results", "result_new_record").setOrigin(0, 0).setDisplaySize(100, 32);
        const label = this.add.text(235, 254, "新纪录！", {
          fontFamily: FONT_BODY,
          fontSize: "16px",
          fontStyle: "700",
          color: INK,
        }).setOrigin(0.5);
        this.finishing.push(plate, label);
      }
    } else {
      this.capsule(235, 300, uiLabel("没关系，再来一次！"), 26, BROWN, CREAM, FONT_TITLE);
    }
    if (boss && view.firstChapterClear) {
      const subtitle = this.add.text(640, 103, "这一章走完啦！", {
        fontFamily: FONT_BODY,
        fontSize: "18px",
        fontStyle: "700",
        color: CREAM,
      }).setOrigin(0.5);
      this.fixedCapsule(640, 103, Math.max(subtitle.width + 28, 80), 26, BROWN);
      subtitle.setDepth(12);
      this.finishing.push(subtitle);
    }
  }

  private capsule(x: number, y: number, label: string, fontSize: number, fill: number, color: string, font: string): void {
    const text = this.add.text(x, y, label, {
      fontFamily: font,
      fontSize: `${fontSize}px`,
      color,
    }).setOrigin(0.5);
    const width = text.width + 44;
    const height = fontSize + 18;
    this.fixedCapsule(x, y, width, height, fill);
    text.setDepth(12);
    this.finishing.push(text);
  }

  private fixedCapsule(x: number, y: number, width: number, height: number, fill: number): void {
    const plate = this.add.graphics();
    plate.fillStyle(fill, 1);
    plate.lineStyle(1.5, 0x3b2a20, 1);
    plate.fillRoundedRect(x - width / 2, y - height / 2, width, height, height / 2);
    plate.strokeRoundedRect(x - width / 2, y - height / 2, width, height, height / 2);
    plate.setDepth(11);
    this.finishing.push(plate);
  }

  private drawWords(): void {
    const view = this.view;
    if (!(view.won === false && view.correct === 0)) {
      this.add.image(480, this.wy(130), "atlas_ui_core", "icon_check").setOrigin(0, 0).setDisplaySize(40, 40);
      this.add.text(530, this.wy(150), `答对 ${view.correct} 题`, {
        fontFamily: FONT_BODY,
        fontSize: "32px",
        fontStyle: "700",
        color: INK,
      }).setOrigin(0, 0.5);
      if (view.won) {
        this.add.text(700, this.wy(154), `一共 ${view.total} 题`, {
          fontFamily: FONT_BODY,
          fontSize: "18px",
          color: MUTED,
        }).setOrigin(0, 0.5);
      } else if (view.correct > 0) {
        this.add.text(700, this.wy(154), "这些词你答对了！", {
          fontFamily: FONT_BODY,
          fontSize: "18px",
          fontStyle: "700",
          color: TEAL_DEEP,
        }).setOrigin(0, 0.5);
      }
    } else {
      this.add.text(530, this.wy(150), "这次的词有点难，下次一起再试试。", {
        fontFamily: FONT_BODY,
        fontSize: "22px",
        fontStyle: "700",
        color: INK,
      }).setOrigin(0, 0.5);
    }
    if (view.words.length > 0) {
      this.add.text(480, this.wy(186), "本场单词", {
        fontFamily: FONT_BODY,
        fontSize: "16px",
        fontStyle: "700",
        color: INK,
      }).setOrigin(0, 0.5);
    }
    view.words.forEach((word, index) => {
      const x = 477 + (index % 4) * RESULTS_WORD_CHIP.pitchX;
      const y = this.wy(220 + Math.floor(index / 4) * RESULTS_WORD_CHIP.pitchY);
      const frame = word.correct ? "word_chip_correct" : "word_chip_plain";
      const chip = this.add.image(x, y, "atlas_results", frame).setOrigin(0, 0).setDisplaySize(RESULTS_WORD_CHIP.width, RESULTS_WORD_CHIP.height);
      chip.setInteractive({ useHandCursor: true });
      chip.on("pointerup", () => speakWord(word.english, browserSpeaker()));
      const english = this.add.text(word.correct ? x + 38 : x + 14, y + 6, word.english, {
        fontFamily: FONT_LATIN,
        fontSize: "22px",
        fontStyle: "700",
        color: INK,
      }).setOrigin(0, 0);
      if (english.width > 120) english.setScale(120 / english.width);
      if (word.correct) {
        this.add.image(x + 10, y + 8, "atlas_ui_core", "icon_check").setOrigin(0, 0).setDisplaySize(22, 22);
        const gloss = this.add.text(x + RESULTS_WORD_CHIP.glossX, y + RESULTS_WORD_CHIP.glossY, "", {
          fontFamily: FONT_BODY,
          fontSize: "16px",
          color: INK,
        }).setOrigin(0, 0);
        applyFittedText(gloss, word.gloss, resultsGlossBox());
      } else {
        this.add.text(x + 158, y + 39, "下次再见", {
          fontFamily: FONT_BODY,
          fontSize: "13px",
          color: MUTED,
        }).setOrigin(1, 0);
      }
    });
    if (view.extraWords > 0 && view.words.length > 0) {
      const rows = Math.ceil(view.words.length / 4);
      const chipBottom = 220 + (rows - 1) * RESULTS_WORD_CHIP.pitchY + RESULTS_WORD_CHIP.height;
      this.add.text(480, this.wy(chipBottom + 16), `还有 ${view.extraWords} 个词也练到了`, {
        fontFamily: FONT_BODY,
        fontSize: "16px",
        color: INK,
      }).setOrigin(0, 0.5);
    }
  }

  /** Reward and encouragement blocks sit one gap under the words, even when the list is a single row. */
  private dy(y: number): number {
    return y + resultsRewardDrop() - resultsLowerShift(this.view.words.length, this.view.extraWords) + this.stackNudge();
  }

  /** Word rows share the same nudge, so a short stack stays together while it centers. */
  private wy(y: number): number {
    return y + this.stackNudge();
  }

  private stackNudge(): number {
    const view = this.view;
    const mode = !view.won || view.card || view.items.length > 0 ? "tall" : view.practiceOnly ? "practice" : "xp";
    return resultsStackNudge(view.words.length, view.extraWords, mode);
  }

  private drawWinBody(): void {
    const view = this.view;
    if (view.practiceOnly) {
      this.practiceCard(view.items.length > 0 ? 110 : 120);
      if (view.items.length > 0) this.drawPracticeItems();
      return;
    }
    this.add.text(480, this.dy(430), "经验", {
      fontFamily: FONT_BODY,
      fontSize: "22px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0.5);
    this.drawXpBar();
    this.goldCapsule(1080, this.dy(430), uiLabel("+经验"));
    if (view.thirdReplayReward) {
      this.add.text(540, this.dy(460), PRACTICE_NOTICE, {
        fontFamily: FONT_BODY,
        fontSize: "16px",
        color: NOTE,
      }).setOrigin(0, 0.5);
    }
    if (view.card) this.drawCard();
    if (view.items.length > 0) this.drawItemBox(845, this.dy(476), 348, 200, false);
  }

  private practiceCard(height: number): void {
    this.topLeftRow(495, this.dy(420), 680, height);
    this.add.image(523, this.dy(452), "atlas_ui_core", "icon_hint").setOrigin(0, 0).setDisplaySize(56, 56);
    this.add.text(597, this.dy(450), PRACTICE_LINE_1, {
      fontFamily: FONT_BODY,
      fontSize: "22px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0);
    this.add.text(597, this.dy(486), PRACTICE_LINE_2, {
      fontFamily: FONT_BODY,
      fontSize: "18px",
      color: INK,
    }).setOrigin(0, 0);
  }

  private drawPracticeItems(): void {
    this.topLeftRow(495, this.dy(546), 680, 140);
    this.add.text(517, this.dy(556), "获得物品", {
      fontFamily: FONT_BODY,
      fontSize: "20px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0);
    this.add.text(617, this.dy(560), practiceItemLine(this.view.items), {
      fontFamily: FONT_BODY,
      fontSize: "16px",
      color: TEAL_DEEP,
    }).setOrigin(0, 0);
    const { shown, extra } = visibleItems(this.view.items, true);
    if (extra > 0) this.moreBadge(1159, this.dy(568), extra);
    shown.forEach((item, index) => {
      const left = index === 0 ? 505 : 840;
      this.thumb(item, left + 8, this.dy(604));
      this.add.text(left + 68, this.dy(606), item.heading, {
        fontFamily: FONT_BODY,
        fontSize: "18px",
        fontStyle: "700",
        color: INK,
      }).setOrigin(0, 0);
      this.add.text(left + 68, this.dy(631), item.line, {
        fontFamily: FONT_BODY,
        fontSize: "14px",
        color: MUTED,
      }).setOrigin(0, 0);
    });
  }

  private drawXpBar(): void {
    const x = 540;
    const y = this.dy(416);
    const width = 470;
    const height = 28;
    warmSlice(this, "atlas_ui_core", "progress_frame", width, height).setPosition(x + width / 2, y + height / 2);
    this.xpSegments = xpBarSegments(this.view.xpBefore, this.view.xpAfter);
    this.xpFills = {
      leaf: warmSlice(this, "atlas_ui_core", "progress_fill_leaf", 16, 16),
      gold: warmSlice(this, "atlas_ui_core", "progress_fill_gold", 16, 16),
      x,
      y,
      width,
      height,
    };
    if (motionOff()) this.snapXp();
    else {
      const start = this.xpSegments[0]?.from ?? 0;
      this.paintXp(start, start);
    }
  }

  /** After the 700ms fade. Reduced motion already snapped to the final fill. */
  private startXpGrow(): void {
    if (this.settled || !this.xpFills) {
      this.settled = true;
      this.noteFinal();
      return;
    }
    probeNote("battle:results:xp");
    this.growSegment(0);
  }

  private growSegment(index: number): void {
    if (this.settled) return;
    const segment = this.xpSegments[index];
    if (!segment) {
      this.settled = true;
      this.noteFinal();
      return;
    }
    const gold = this.xpGold(index);
    const state = { value: segment.from };
    this.xpRunning = state;
    this.paintXp(gold, segment.from);
    const holding = segment.from === 1 && segment.to === 1 && segment.ms > 0;
    if (holding) probeNote("battle:results:xp-hold");
    if (!holding && (segment.ms <= 0 || segment.from === segment.to)) {
      this.paintXp(gold, segment.to);
      this.growSegment(index + 1);
      return;
    }
    if (holding) {
      this.xpHold = this.time.delayedCall(segment.ms, () => {
        this.xpHold = null;
        if (!this.settled) this.growSegment(index + 1);
      });
      return;
    }
    this.tweens.add({
      targets: state,
      value: segment.to,
      duration: segment.ms,
      ease: "Linear",
      onUpdate: () => {
        if (!this.settled) this.paintXp(gold, state.value);
      },
      onComplete: () => {
        if (this.settled) return;
        this.paintXp(gold, segment.to);
        this.growSegment(index + 1);
      },
    });
  }

  /** Gold is the progress already banked. After the full-bar hold it goes back to zero. */
  private xpGold(index: number): number {
    const start = this.xpSegments[0]?.from ?? 0;
    const holdAt = this.xpSegments.findIndex((segment) => segment.from === 1 && segment.to === 1);
    if (holdAt >= 0 && index > holdAt) return 0;
    return start;
  }

  private snapXp(): void {
    this.xpHold?.remove(false);
    this.xpHold = null;
    if (this.xpRunning) this.tweens.killTweensOf(this.xpRunning);
    const last = this.xpSegments[this.xpSegments.length - 1];
    if (!last) return;
    const gold = this.xpSegments.length > 1 ? 0 : (this.xpSegments[0]?.from ?? 0);
    this.paintXp(gold, last.to);
  }

  private paintXp(gold: number, leaf: number): void {
    const bar = this.xpFills;
    if (!bar) return;
    this.resizeFill(bar.leaf, bar, leaf);
    this.resizeFill(bar.gold, bar, gold);
  }

  private resizeFill(
    slice: Phaser.GameObjects.NineSlice,
    bar: { x: number; y: number; width: number; height: number },
    ratio: number,
  ): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped <= 0) {
      slice.setVisible(false);
      return;
    }
    const inner = Math.max(16, (bar.width - 8) * clamped);
    slice.setVisible(true);
    slice.setSize(inner * 2, 32);
    slice.setPosition(bar.x + 4 + inner / 2, bar.y + bar.height / 2);
  }

  private goldCapsule(x: number, y: number, label: string): void {
    const text = this.add.text(x, y, label, {
      fontFamily: FONT_TITLE,
      fontSize: "22px",
      color: INK,
    }).setOrigin(0.5);
    this.fixedCapsule(x, y, text.width + 36, 40, GOLD);
    text.setDepth(12);
    this.finishing.push(text);
  }

  private drawCard(): void {
    const card = this.view.card;
    if (!card) return;
    this.topLeftRow(477, this.dy(476), 360, 200);
    const frame = skillCardFrame("ready", "equipped", card.to);
    if (this.textures.exists("atlas_battle") && this.textures.get("atlas_battle").has(frame)) {
      this.add.image(491, this.dy(488), "atlas_battle", frame).setOrigin(0, 0).setDisplaySize(140, 176);
    }
    const icon = skillIconFrame(card.id);
    if (this.textures.exists("atlas_skills") && this.textures.get("atlas_skills").has(icon)) {
      this.add.image(561, this.dy(564), "atlas_skills", icon).setDisplaySize(64, 64);
    }
    this.add.text(649, this.dy(490), "卡牌升级", {
      fontFamily: FONT_BODY,
      fontSize: "20px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0);
    const name = this.add.text(649, this.dy(528), card.name, {
      fontFamily: FONT_BODY,
      fontSize: "26px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0);
    this.add.text(649 + name.width + 12, this.dy(534), `${starMark(card.from)} 到 ${starMark(card.to)}`, {
      fontFamily: FONT_BODY,
      fontSize: "22px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0);
    this.add.text(649, this.dy(566), "升级了！", {
      fontFamily: FONT_BODY,
      fontSize: "20px",
      color: TEAL_DEEP,
    }).setOrigin(0, 0);
    this.levelBadge(653, this.dy(592), card.from);
    this.levelBadge(733, this.dy(592), card.to);
    const arrow = this.add.graphics();
    arrow.lineStyle(3, 0x3b2a20, 1);
    arrow.beginPath();
    arrow.moveTo(705, this.dy(614));
    arrow.lineTo(725, this.dy(614));
    arrow.strokePath();
  }

  private levelBadge(x: number, y: number, level: number): void {
    const frame = skillLevelFrame(level);
    if (this.textures.exists("atlas_battle") && this.textures.get("atlas_battle").has(frame)) {
      this.add.image(x, y, "atlas_battle", frame).setOrigin(0, 0).setDisplaySize(44, 44);
    }
    this.add.text(x + 22, y + 46, starMark(level), {
      fontFamily: FONT_BODY,
      fontSize: "16px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0.5, 0);
  }

  private drawItemBox(x: number, y: number, width: number, height: number, practice: boolean): void {
    this.topLeftRow(x, y, width, height);
    this.add.text(863, this.dy(488), "获得物品", {
      fontFamily: FONT_BODY,
      fontSize: "20px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0);
    const { shown, extra } = visibleItems(this.view.items, practice);
    if (extra > 0) this.moreBadge(1177, this.dy(500), extra);
    shown.forEach((item, index) => {
      const row = this.dy(520 + index * 50);
      this.thumb(item, 863, row);
      this.add.text(923, row + 2, item.heading, {
        fontFamily: FONT_BODY,
        fontSize: "18px",
        fontStyle: "700",
        color: INK,
      }).setOrigin(0, 0);
      this.add.text(923, row + 27, item.line, {
        fontFamily: FONT_BODY,
        fontSize: "14px",
        color: MUTED,
      }).setOrigin(0, 0);
    });
  }

  private thumb(item: ResultItem, x: number, y: number): void {
    if (item.atlas === "atlas_skills") {
      this.add.image(x, y, "atlas_results", "thumb_tile").setOrigin(0, 0).setDisplaySize(48, 48);
      if (this.textures.exists(item.atlas) && this.textures.get(item.atlas).has(item.frame)) {
        this.add.image(x + 24, y + 24, item.atlas, item.frame).setDisplaySize(38, 38);
      }
      return;
    }
    this.add.image(x, y, item.atlas, item.frame).setOrigin(0, 0).setDisplaySize(48, 48);
  }

  /** "+N 件". The badge is not a button, and it does not explain where the rest went. */
  private moreBadge(right: number, y: number, extra: number): void {
    const label = moreBadgeLabel(extra);
    const text = this.add.text(0, 0, label, {
      fontFamily: FONT_BODY,
      fontSize: "16px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0.5);
    const width = Math.max(84, text.width + 28);
    const badge = this.add
      .nineslice(right - width / 2, y, "atlas_results", "result_more_badge", width * 2, 52, 26, 26, 0, 0)
      .setScale(0.5)
      .setDepth(20);
    text.setPosition(badge.x, badge.y).setDepth(21);
    this.finishing.push(badge, text);
  }

  private topLeftRow(x: number, y: number, width: number, height: number): void {
    warmSlice(this, "atlas_ui_pages", "list_row", width, height).setPosition(x + width / 2, y + height / 2);
  }

  private drawLossBody(): void {
    const view = this.view;
    this.add.image(480, this.dy(414), "atlas_battle", "icon_heart").setOrigin(0, 0).setDisplaySize(32, 32);
    this.add.text(522, this.dy(430), LOSS_ENCOURAGEMENT, {
      fontFamily: FONT_BODY,
      fontSize: "22px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0.5);
    this.topLeftRow(477, this.dy(476), 716, 200);
    this.add.image(509, this.dy(540), "atlas_ui_core", "icon_hint").setOrigin(0, 0).setDisplaySize(64, 64);
    const lines = ["词灵这次赢了一点点。"];
    if (view.anyUncorrected) lines.push("没打勾的词，去复习桌看一看，下次就能答对。");
    lines.push("每答对一个词，你都在变强。");
    const tops = view.anyUncorrected ? [506, 550, 600] : [506, 600];
    lines.forEach((line, index) => {
      this.add.text(597, this.dy(tops[index] ?? 600), line, {
        fontFamily: FONT_BODY,
        fontSize: "18px",
        color: INK,
      }).setOrigin(0, 0);
    });
  }

  private drawButtons(): void {
    if (this.view.won) {
      const label = this.view.firstChapterClear ? uiLabel("看结局") : uiLabel("继续");
      const spot = RESULTS_LAYOUT.continueButton;
      const button = warmButton(this, spot.x, spot.y, label, () => {
        if (!this.keysOpen()) return;
        this.continueOn();
      }, { width: spot.w, height: spot.h });
      button.setVisible(false);
      this.buttons.push(button);
      return;
    }
    const retry = RESULTS_LAYOUT.retryButton;
    const back = RESULTS_LAYOUT.mapButton;
    const again = warmButton(this, retry.x, retry.y, uiLabel("再试一次"), () => {
      if (!this.keysOpen()) return;
      this.retry();
    }, { width: retry.w, height: retry.h });
    const map = warmButton(this, back.x, back.y, uiLabel("回地图"), () => {
      if (!this.keysOpen()) return;
      this.toMap(false);
    }, { width: back.w, height: back.h, tone: "secondary" });
    again.setVisible(false);
    map.setVisible(false);
    this.buttons.push(again, map);
  }

  private continueOn(): void {
    probeNote(`battle:results:continue:${this.view.won}:${this.view.stars ?? "none"}:${this.view.practiceOnly}:${this.view.newRecord}`);
    this.scene.stop("battle");
    if (this.view.firstChapterClear) {
      this.scene.start("ending");
      return;
    }
    this.scene.start("stages", { fromBattleEnd: true });
  }

  private retry(): void {
    probeNote(`battle:results:retry:${this.view.won}:${this.view.stars ?? "none"}:${this.view.practiceOnly}:${this.view.newRecord}`);
    this.scene.stop("battle");
    if (restPromptDue()) {
      this.scene.start("stages", { fromBattleEnd: true, retryStageId: this.view.stageId });
      return;
    }
    this.scene.start("battle", { stageId: this.view.stageId });
  }

  private toMap(retry: boolean): void {
    probeNote(`battle:results:continue:${this.view.won}:${this.view.stars ?? "none"}:${this.view.practiceOnly}:${this.view.newRecord}`);
    this.scene.stop("battle");
    this.scene.start("stages", retry ? { fromBattleEnd: true, retryStageId: this.view.stageId } : { fromBattleEnd: true });
  }
}
