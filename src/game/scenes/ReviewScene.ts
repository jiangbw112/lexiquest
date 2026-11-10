import Phaser from "phaser";
import { formatMeaning, wordById, wordsForGrades } from "../../domain/catalog";
import { PROVISIONAL } from "../../domain/provisional";
import { notePracticeAnswer } from "../../domain/parent";
import { resetClock, reviewWord, shiftClock, studyNow } from "../../domain/progress";
import { badgeTone, formatDue, isDue, reviewDesk } from "../../domain/review";
import { checkSpelling, spellingAllowed, spellingQuestion } from "../../domain/questions";
import { showSpellingHint } from "../spelling-form";
import { probeEnter } from "../probe";
import { getSave, mutate } from "../session";
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
  private spellNote = "";

  constructor() {
    super("review");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_ui_pages"], ["bg_room"]);
  }

  create(): void {
    if (!getSave()) {
      this.scene.start("title");
      return;
    }
    probeEnter("review");
    const form = document.getElementById("spell-form");
    const submit = (event: Event) => {
      event.preventDefault();
      this.submitSpelling();
    };
    form?.addEventListener("submit", submit);
    this.events.once("shutdown", () => {
      form?.removeEventListener("submit", submit);
      form?.classList.remove("open");
    });
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.code === "Escape") this.scene.start("overworld");
      if (event.code === "KeyT") this.shift(10 * 60 * 1000);
      if (event.code === "KeyY") this.shift(24 * 60 * 60 * 1000);
      if (event.code === "KeyR") {
        mutate((save) => resetClock(save));
        this.draw();
      }
      const spelling = document.getElementById("spell-form")?.classList.contains("open");
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
    const allowed = new Set(wordsForGrades(save.selectedGrades).map((word) => word.id));
    const open = Object.values(save.memory).filter((memory) => allowed.has(memory.wordId));
    return reviewDesk(open, studyNow(save)).keyTargetId;
  }

  private shift(delta: number): void {
    mutate((save) => shiftClock(save, delta));
    this.draw();
  }

  private rate(wordId: string, rating: Grade): void {
    mutate((save) => reviewWord(save, wordId, rating, studyNow(save)));
    this.draw();
  }

  private submitSpelling(): void {
    const save = getSave();
    const input = document.getElementById("spell-input");
    if (!save || !this.spellId || !(input instanceof HTMLInputElement)) return;
    const prompt = spellingQuestion(this.spellId, this.badgeLit(this.spellId));
    const wordId = this.spellId;
    mutate((current) => notePracticeAnswer(current, wordId, studyNow(current)));
    this.spellNote = prompt && checkSpelling(prompt.answer, input.value) ? "拼对了。这不改变复习时间。" : "还不对。复习时间没有变。";
    input.value = "";
    this.draw();
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    document.getElementById("spell-form")?.classList.remove("open");
    showSpellingHint(null);
    if (!paintRoom(this)) paper(this);
    warmPanel(this, 640, 400, 1040, 740);
    const mastery = PROVISIONAL.mastery;
    const now = studyNow(save);
    this.add.text(160, 36, "复习桌", { fontFamily: FONT, fontSize: "34px", color: INK });
    this.add.text(160, 78, `至少 ${mastery.minDistinctCalendarDays} 个不同的日子，稳定度 ${mastery.minStability} 天。同一天反复练习不会点亮徽章。`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: NOTE,
      wordWrap: { width: 960 },
    });
    warmButton(this, 250, 140, "沙漏 +10 分钟 T", () => this.shift(10 * 60 * 1000), { width: 230, height: 56, tone: "secondary" });
    warmButton(this, 500, 140, "沙漏 +1 天 Y", () => this.shift(24 * 60 * 60 * 1000), { width: 200, height: 56, tone: "secondary" });
    warmButton(this, 735, 140, "回到真实时间 R", () => {
      mutate((current) => resetClock(current));
      this.draw();
    }, { width: 220, height: 56, tone: "secondary" });
    const allowed = new Set(wordsForGrades(save.selectedGrades).map((word) => word.id));
    const open = Object.values(save.memory).filter((memory) => allowed.has(memory.wordId));
    const desk = reviewDesk(open, now);
    if (Object.keys(save.wordCards).length === 0) {
      this.add.text(170, 220, "还没有词卡。先去学堂认识一个词。", { fontFamily: FONT, fontSize: "22px", color: MUTED });
    } else if (desk.shown.length === 0) {
      this.add.text(170, 220, "所选年级里没有要复习的词。已经学过的词卡还在册子里，重新勾选年级后会恢复。", {
        fontFamily: FONT,
        fontSize: "22px",
        color: MUTED,
        wordWrap: { width: 860 },
      });
    } else if (!desk.keyTargetId) {
      this.add.text(170, 190, "现在没有到复习时间的词。", {
        fontFamily: FONT,
        fontSize: "18px",
        color: MUTED,
      });
    } else {
      this.add.text(170, 190, "键盘 1–4 复习第一个到时间的词。", { fontFamily: FONT, fontSize: "16px", color: NOTE });
    }
    if (desk.hiddenDue > 0) {
      this.add.text(620, 190, `还有 ${desk.hiddenDue} 个词也到了复习时间。先复习画面上的。`, {
        fontFamily: FONT,
        fontSize: "16px",
        color: NOTE,
      });
    }
    desk.shown.forEach((memory, index) => {
      const word = wordById(memory.wordId);
      const card = save.wordCards[memory.wordId];
      if (!word || !card) return;
      const y = 228 + index * 100;
      const tone = badgeTone(card, memory, now);
      const due = isDue(memory, now);
      warmSlice(this, "atlas_ui_pages", "list_row", 980, 86).setPosition(640, y + 29);
      this.add.text(170, y, `${word.english}  ${formatMeaning(word)}`, { fontFamily: FONT, fontSize: "22px", color: INK });
      this.add.text(520, y + 10, tone === "none" ? "未熟练" : tone === "bright" ? "熟练" : "熟练·待复习", { fontFamily: FONT, fontSize: "18px", color: NOTE });
      this.add.text(170, y + 32, formatDue(new Date(memory.fsrs.due).getTime(), now.getTime()), { fontFamily: FONT, fontSize: "16px", color: MUTED });
      if (due) {
        RATINGS.forEach((item, ratingIndex) => {
          warmButton(this, 706 + ratingIndex * 120, y + 40, item.label, () => this.rate(memory.wordId, item.rating), {
            width: 112,
            height: 48,
            tone: "secondary",
          });
        });
      }
      const lit = tone === "bright";
      if (spellingAllowed(word, lit)) {
        warmButton(this, 590, y + 48, "拼写", () => {
          this.spellId = memory.wordId;
          this.draw();
          document.getElementById("spell-form")?.classList.add("open");
          showSpellingHint(word.english);
          const input = document.getElementById("spell-input");
          if (input instanceof HTMLInputElement) input.focus();
        }, { width: 96, height: 48 });
      }
    });
    if (this.spellNote) this.add.text(170, 680, this.spellNote, { fontFamily: FONT, fontSize: "16px", color: NOTE });
    warmButton(this, 250, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, tone: "secondary" });
  }
}
