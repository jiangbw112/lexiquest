import Phaser from "phaser";
import { formatMeaning, wordById } from "../../domain/catalog";
import { notePracticeAnswer } from "../../domain/parent";
import { resetClock, reviewWord, shiftClock, studyNow } from "../../domain/progress";
import { reviewWordIds } from "../../domain/chapter-plan";
import { badgeTone, formatDue, isDue, reviewDesk } from "../../domain/review";
import { checkSpelling, spellingAllowed, spellingQuestion } from "../../domain/questions";
import { reviewDeskEnglish, reviewDeskMeaning } from "../../domain/spelling-leak";
import {
  COVER_SPELL_SAVE_FAILED,
  applyCoverSpell,
  coverSpellFeedback,
  coverSpellOffered,
  coverSpellPrompt,
  type CoverSpellApplied,
} from "../../domain/cover-spell";
import { deviceTimeZone } from "../../domain/local-day";
import { browserSpeaker, speakWord } from "../../domain/speech";
import { setSpellFormLock, showCoverSpellForm, showSpellingHint, showSpellingPrompt } from "../spelling-form";
import { devModeEnabled, reviewClockCommand, reviewClockDelta, reviewDeskLayout } from "../dev-mode";
import { applyFittedText, cjkWrap, reviewEnglishBox, reviewMeaningBox, reviewRowSlice, reviewRowTextY, REVIEW_DESK, REVIEW_ROW } from "../layout";
import { recordPlayAnswer } from "../play-timer";
import { probeEnter } from "../probe";
import { armProfileWriteFailures } from "../profile-write-fault";
import { getSave, mutate, mutateCommitted } from "../session";
import { FONT, paper } from "../ui";
import { warmButton, warmPanel, warmSlice } from "../warm/kit";
import { paintRoom, queueWarm } from "../warm/load";
import { INK, MUTED, NOTE } from "../warm/theme";
import { Rating, type Grade } from "ts-fsrs";

const RATINGS: { rating: Grade; label: string; code: string }[] = [
  { rating: Rating.Again, label: "还没记住", code: "Digit1" },
  { rating: Rating.Hard, label: "有点难", code: "Digit2" },
  { rating: Rating.Good, label: "记得", code: "Digit3" },
  { rating: Rating.Easy, label: "很熟", code: "Digit4" },
];

export class ReviewScene extends Phaser.Scene {
  private spellId: string | null = null;
  private coverId: string | null = null;
  /** True only for the draw that opens the spelling panel. The next draw restores the list. */
  private spellingPanel = false;
  /** True only for the draw that opens or retries 盖住拼. English stays hidden for that draw. */
  private coverPanel = false;
  private spellNote = "";
  private dev = false;
  private revealed = new Set<string>();

  constructor() {
    super("review");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_ui_pages"], ["bg_room"]);
  }

  create(): void {
    if (!getSave()) {
      this.scene.start("profiles");
      return;
    }
    probeEnter("review");
    this.dev = devModeEnabled(window.location.search);
    // Production builds replace `import.meta.env.DEV` with false and drop this block,
    // including the `coverFail` query and the write-failure arm.
    if (import.meta.env.DEV) {
      const coverFail = new URLSearchParams(window.location.search).get("coverFail") === "1";
      if (this.dev && coverFail) armProfileWriteFailures(1);
    }
    const form = document.getElementById("spell-form");
    const submit = (event: Event) => {
      event.preventDefault();
      if (this.coverId) this.submitCover(false);
      else this.submitSpelling();
    };
    form?.addEventListener("submit", submit);
    const giveUp = (event: Event) => {
      event.preventDefault();
      if (this.coverId) this.submitCover(true);
    };
    const replay = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      this.replayCover();
    };
    const giveUpButton = document.getElementById("spell-give-up");
    const replayButton = document.getElementById("spell-replay");
    giveUpButton?.addEventListener("click", giveUp);
    replayButton?.addEventListener("click", replay);
    this.events.once("shutdown", () => {
      form?.removeEventListener("submit", submit);
      giveUpButton?.removeEventListener("click", giveUp);
      replayButton?.removeEventListener("click", replay);
      form?.classList.remove("open");
      setSpellFormLock(false);
      showSpellingHint(null);
    });
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.code === "Escape") this.scene.start("overworld");
      const target = event.target instanceof Element ? event.target : document.activeElement;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      const spelling = document.getElementById("spell-form")?.classList.contains("open");
      if (!typing && !spelling) {
        const clock = reviewClockCommand(event.code, this.dev);
        if (clock === "reset") this.resetPracticeClock();
        else if (clock) this.shift(reviewClockDelta(clock));
      }
      if (event.code === "Space" && !spelling) {
        const due = this.firstDue();
        if (due) this.revealed.add(due);
        this.draw();
        return;
      }
      const rating = RATINGS.find((item) => item.code === event.code);
      const due = this.firstDue();
      if (rating && due && !spelling) this.rate(due, rating.rating);
    });
    this.draw();
  }

  private badgeLit(wordId: string): boolean {
    const save = getSave();
    if (!save) return false;
    return badgeTone(save.wordCards[wordId], save.memory[wordId], studyNow(save)) === "bright";
  }

  private firstDue(): string | undefined {
    const save = getSave();
    if (!save) return undefined;
    const allowed = new Set(reviewWordIds(save));
    const open = Object.values(save.memory).filter((memory) => allowed.has(memory.wordId));
    return reviewDesk(open, studyNow(save)).keyTargetId;
  }

  private shift(delta: number): void {
    if (!this.dev) return;
    mutate((save) => shiftClock(save, delta));
    this.draw();
  }

  private resetPracticeClock(): void {
    if (!this.dev) return;
    mutate((save) => resetClock(save));
    this.draw();
  }

  private rate(wordId: string, rating: Grade): void {
    if (!this.revealed.has(wordId)) return;
    recordPlayAnswer();
    mutate((save) => reviewWord(save, wordId, rating, studyNow(save)));
    this.revealed.delete(wordId);
    this.draw();
  }

  private replayCover(): void {
    if (!this.coverId) return;
    const word = wordById(this.coverId);
    if (word) speakWord(word.english, browserSpeaker());
  }

  private openCover(wordId: string): void {
    const word = wordById(wordId);
    if (!word) return;
    this.coverId = wordId;
    this.spellId = null;
    this.coverPanel = true;
    this.spellNote = "";
    this.draw();
    this.presentCoverForm(wordId, true);
  }

  private presentCoverForm(wordId: string, speak: boolean): void {
    const word = wordById(wordId);
    if (!word) return;
    document.getElementById("spell-form")?.classList.add("open");
    setSpellFormLock(true);
    showCoverSpellForm(coverSpellPrompt(word));
    const input = document.getElementById("spell-input");
    if (input instanceof HTMLInputElement) {
      if (speak) input.value = "";
      input.focus();
    }
    if (speak) speakWord(word.english, browserSpeaker());
    if (!speak) {
      const error = document.getElementById("spell-error");
      if (error) error.textContent = COVER_SPELL_SAVE_FAILED;
    }
  }

  private submitCover(giveUp: boolean): void {
    const wordId = this.coverId;
    const input = document.getElementById("spell-input");
    if (!wordId || !(input instanceof HTMLInputElement)) return;
    const typed = input.value;
    let applied: CoverSpellApplied | null = null;
    recordPlayAnswer();
    const result = mutateCommitted((current) => {
      applied = applyCoverSpell(current, {
        wordId,
        typed,
        giveUp,
        now: studyNow(current),
        timeZone: deviceTimeZone(),
        badgeLit: badgeTone(current.wordCards[wordId], current.memory[wordId], studyNow(current)) === "bright",
      });
      return applied.save;
    });
    if (!applied) return;
    if (!result.saved) {
      this.spellNote = COVER_SPELL_SAVE_FAILED;
      this.coverPanel = true;
      this.draw();
      this.presentCoverForm(wordId, false);
      return;
    }
    const settled: CoverSpellApplied = applied;
    this.spellNote = coverSpellFeedback(settled);
    this.coverId = null;
    input.value = "";
    this.draw();
  }

  private submitSpelling(): void {
    const save = getSave();
    const input = document.getElementById("spell-input");
    if (!save || !this.spellId || !(input instanceof HTMLInputElement)) return;
    const prompt = spellingQuestion(this.spellId, this.badgeLit(this.spellId));
    const wordId = this.spellId;
    recordPlayAnswer();
    mutate((current) => notePracticeAnswer(current, wordId, studyNow(current)));
    this.spellNote = prompt && checkSpelling(prompt.answer, input.value) ? "拼对了。这不改变复习时间。" : "还不对。复习时间没有变。";
    input.value = "";
    this.spellId = null;
    this.draw();
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    const hideEnglish = this.spellingPanel || this.coverPanel;
    this.spellingPanel = false;
    this.coverPanel = false;
    this.children.removeAll(true);
    if (!hideEnglish) {
      document.getElementById("spell-form")?.classList.remove("open");
      setSpellFormLock(false);
      showSpellingHint(null);
    }
    if (!paintRoom(this)) paper(this);
    warmPanel(this, 640, 400, 1040, 740);
    const now = studyNow(save);
    const layout = reviewDeskLayout(this.dev);
    this.add.text(160, layout.titleY, "复习桌", { fontFamily: FONT, fontSize: "34px", color: INK });
    this.add.text(160, layout.subtitleY, "在不同的两天都记住它，就能点亮徽章。同一天反复练习不会点亮徽章。", {
      fontFamily: FONT,
      fontSize: "16px",
      color: NOTE,
      wordWrap: cjkWrap(960),
    });
    if (this.dev) {
      warmButton(this, 250, layout.clockY, "沙漏 +10 分钟 T", () => this.shift(reviewClockDelta("advance-10m")), { width: 230, height: 56, tone: "secondary" });
      warmButton(this, 500, layout.clockY, "沙漏 +1 天 Y", () => this.shift(reviewClockDelta("advance-1d")), { width: 200, height: 56, tone: "secondary" });
      warmButton(this, 735, layout.clockY, "回到真实时间 R", () => this.resetPracticeClock(), { width: 220, height: 56, tone: "secondary" });
    }
    const allowed = new Set(reviewWordIds(save));
    const open = Object.values(save.memory).filter((memory) => allowed.has(memory.wordId));
    const desk = reviewDesk(open, now);
    if (Object.keys(save.wordCards).length === 0) {
      this.add.text(170, layout.bodyY, "还没有词卡。先去学堂认识一个词。", { fontFamily: FONT, fontSize: "22px", color: MUTED });
    } else if (desk.shown.length === 0) {
      this.add.text(170, layout.bodyY, "所选年级里没有要复习的词。已经学过的词卡还在册子里，重新勾选年级后会恢复。", {
        fontFamily: FONT,
        fontSize: "22px",
        color: MUTED,
        wordWrap: cjkWrap(860),
      });
    } else if (!desk.keyTargetId) {
      this.add.text(170, layout.bodyY, "现在没有到复习时间的词。", {
        fontFamily: FONT,
        fontSize: "18px",
        color: MUTED,
      });
    } else {
      this.add.text(170, layout.bodyY, "键盘 1–4 复习第一个到时间的词。", { fontFamily: FONT, fontSize: `${REVIEW_DESK.hintFont}px`, color: NOTE });
    }
    if (desk.hiddenDue > 0 && !this.spellNote) {
      this.add.text(620, layout.bodyY, `还有 ${desk.hiddenDue} 个词也到了复习时间。先复习画面上的。`, {
        fontFamily: FONT,
        fontSize: `${REVIEW_DESK.hintFont}px`,
        color: NOTE,
      });
    }
    desk.shown.forEach((memory, index) => {
      const word = wordById(memory.wordId);
      const card = save.wordCards[memory.wordId];
      if (!word || !card) return;
      const y = reviewRowTextY(layout.bodyY, index);
      const row = reviewRowSlice(y);
      const tone = badgeTone(card, memory, now);
      const due = isDue(memory, now);
      const shown = !due || this.revealed.has(memory.wordId);
      warmSlice(this, "atlas_ui_pages", "list_row", 980, row.height).setPosition(640, row.centerY);
      const english = this.add.text(REVIEW_ROW.textX, y, "", { fontFamily: FONT, fontSize: "22px", color: INK });
      applyFittedText(english, reviewDeskEnglish(word.english, hideEnglish), reviewEnglishBox());
      if (shown) {
        const box = reviewMeaningBox(english.width);
        const meaning = this.add.text(box.x, y, "", { fontFamily: FONT, fontSize: "22px", color: INK });
        applyFittedText(meaning, reviewDeskMeaning(formatMeaning(word), hideEnglish), box);
      }
      if (due && !shown) {
        warmButton(this, REVIEW_ROW.revealCenter, y + REVIEW_ROW.revealOffset, "翻看释义", () => {
          this.revealed.add(memory.wordId);
          this.draw();
        }, { width: REVIEW_ROW.revealWidth, height: 40, tone: "secondary" });
      }
      this.add.text(400, y + REVIEW_ROW.statusOffset, tone === "none" ? "未熟练" : tone === "bright" ? "熟练" : "熟练·待复习", { fontFamily: FONT, fontSize: "18px", color: NOTE });
      this.add.text(REVIEW_ROW.textX, y + REVIEW_ROW.statusOffset, formatDue(new Date(memory.fsrs.due).getTime(), now.getTime()), { fontFamily: FONT, fontSize: "16px", color: MUTED });
      if (due && shown) {
        RATINGS.forEach((item, ratingIndex) => {
          warmButton(this, REVIEW_ROW.rateCenter + ratingIndex * REVIEW_ROW.ratePitch, y + REVIEW_ROW.rateOffset, item.label, () => this.rate(memory.wordId, item.rating), {
            width: REVIEW_ROW.rateWidth,
            height: 48,
            tone: "secondary",
          });
        });
      }
      const lit = tone === "bright";
      if (spellingAllowed(word, lit)) {
        warmButton(this, REVIEW_ROW.spellCenter, y + REVIEW_ROW.spellOffset, "拼写", () => {
          if (this.coverId || this.spellId) return;
          this.spellId = memory.wordId;
          this.coverId = null;
          this.spellingPanel = true;
          this.draw();
          document.getElementById("spell-form")?.classList.add("open");
          setSpellFormLock(true);
          showSpellingHint(word.english);
          showSpellingPrompt(spellingQuestion(memory.wordId, this.badgeLit(memory.wordId))?.prompt ?? null);
          const field = document.getElementById("spell-input");
          if (field instanceof HTMLInputElement) field.focus();
        }, { width: REVIEW_ROW.spellWidth, height: 48 });
      }
      if (coverSpellOffered(word, lit)) {
        warmButton(this, REVIEW_ROW.coverCenter, y + REVIEW_ROW.coverOffset, "盖住拼", () => {
          if (this.coverId || this.spellId) return;
          this.openCover(memory.wordId);
        }, { width: REVIEW_ROW.coverWidth, height: 48 });
      }
    });
    if (this.spellNote) {
      this.add.text(620, layout.bodyY, this.spellNote, {
        fontFamily: FONT,
        fontSize: "16px",
        color: NOTE,
        wordWrap: cjkWrap(520),
      });
    }
    warmButton(this, REVIEW_DESK.backX, REVIEW_DESK.backY, "返回 Esc", () => this.scene.start("overworld"), { width: REVIEW_DESK.backWidth, tone: "secondary" });
  }
}
