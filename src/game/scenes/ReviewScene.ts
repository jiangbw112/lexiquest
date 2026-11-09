import Phaser from "phaser";
import { wordById } from "../../domain/catalog";
import { PROVISIONAL } from "../../domain/provisional";
import { resetClock, reviewWord, shiftClock, studyNow } from "../../domain/progress";
import { badgeTone, formatDue, isDue } from "../../domain/review";
import { checkSpelling, spellingAllowed, spellingQuestion } from "../../domain/questions";
import { probeEnter } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, paper } from "../ui";
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
      const rating = RATINGS.find((item) => item.code === event.code);
      const due = this.firstDue();
      if (rating && due) this.rate(due, rating.rating);
    });
    this.draw();
  }

  private firstDue(): string | undefined {
    const save = getSave();
    if (!save) return undefined;
    const now = studyNow(save);
    return Object.values(save.memory).find((memory) => isDue(memory, now))?.wordId;
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
    const prompt = spellingQuestion(this.spellId, Boolean(save.wordCards[this.spellId]?.masteryBadge));
    this.spellNote = prompt && checkSpelling(prompt.answer, input.value) ? "拼对了。这不改变复习时间。" : "还不对。复习时间没有变。";
    input.value = "";
    this.draw();
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    document.getElementById("spell-form")?.classList.remove("open");
    paper(this);
    const mastery = PROVISIONAL.mastery;
    const now = studyNow(save);
    this.add.text(160, 36, "复习桌", { fontFamily: FONT, fontSize: "34px", color: "#17352a" });
    this.add.text(160, 78, `暂定：至少 ${mastery.minDistinctCalendarDays} 个不同的日子，稳定度 ${mastery.minStability}。同一天反复练习不会点亮徽章。`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#8a5a12",
      wordWrap: { width: 960 },
    });
    button(this, 250, 140, "沙漏 +10 分钟 T", () => this.shift(10 * 60 * 1000), { width: 230, fill: 0x5c6b62 });
    button(this, 500, 140, "沙漏 +1 天 Y", () => this.shift(24 * 60 * 60 * 1000), { width: 200, fill: 0x5c6b62 });
    button(this, 720, 140, "回到真实时间 R", () => {
      mutate((current) => resetClock(current));
      this.draw();
    }, { width: 220, fill: 0x5c6b62 });
    const memories = Object.values(save.memory).sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());
    memories.slice(0, 4).forEach((memory, index) => {
      const word = wordById(memory.wordId);
      const card = save.wordCards[memory.wordId];
      if (!word || !card) return;
      const y = 210 + index * 110;
      const tone = badgeTone(card, memory, now);
      const due = isDue(memory, now);
      this.add.text(170, y, `${word.english}  ${word.chinese}`, { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
      this.add.text(520, y, tone === "none" ? "未熟练" : tone === "bright" ? "熟练" : "熟练·待复习", { fontFamily: FONT, fontSize: "18px", color: "#8a5a12" });
      this.add.text(170, y + 32, formatDue(new Date(memory.fsrs.due).getTime(), now.getTime()), { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e" });
      if (due) {
        RATINGS.forEach((item, ratingIndex) => {
          button(this, 760 + (ratingIndex % 2) * 150, y + 16 + Math.floor(ratingIndex / 2) * 40, item.label, () => this.rate(memory.wordId, item.rating), {
            width: 140,
            height: 34,
          });
        });
      }
      if (spellingAllowed(word, card.masteryBadge)) {
        button(this, 430, y + 36, "拼写", () => {
          this.spellId = memory.wordId;
          this.draw();
          document.getElementById("spell-form")?.classList.add("open");
          const input = document.getElementById("spell-input");
          if (input instanceof HTMLInputElement) input.focus();
        }, { width: 90, height: 34, fill: 0x8a5a12 });
      }
    });
    if (this.spellNote) this.add.text(170, 680, this.spellNote, { fontFamily: FONT, fontSize: "16px", color: "#1f7a4d" });
    button(this, 250, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
  }
}
