import Phaser from "phaser";
import { GRADE_BANDS, sampleUnits, wordById } from "../../domain/catalog";
import { learnWord, studyNow } from "../../domain/progress";
import {
  checkSpelling,
  listeningQuestion,
  quizForWord,
  spellingAllowed,
  spellingQuestion,
  type QuizQuestion,
} from "../../domain/questions";
import { hashSeed } from "../../domain/rng";
import { browserSpeaker, speakWord } from "../../domain/speech";
import { probeEnter, probeNote, probeQuestion } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, hint, listenKeys, paper } from "../ui";

type Phase = "study" | "quiz" | "listen" | "spell" | "got";

export class LearnScene extends Phaser.Scene {
  private unitIndex = 0;
  private phase: Phase = "study";
  private retry = 0;
  private missed = false;
  private justId: string | null = null;
  private question: QuizQuestion | null = null;

  constructor() {
    super("learn");
  }

  create(): void {
    if (!getSave()) {
      this.scene.start("title");
      return;
    }
    probeEnter("learn");
    this.phase = "study";
    listenKeys(this, (event) => this.onKey(event));
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
    this.draw();
    probeNote("learn:ready");
  }

  private units() {
    const grades = new Set(getSave()?.selectedGrades ?? ["G3"]);
    return sampleUnits().filter((unit) => grades.has(unit.grade));
  }

  private currentId(): string | undefined {
    const unit = this.units()[this.unitIndex];
    const save = getSave();
    if (!unit || !save) return undefined;
    return unit.wordIds.find((id) => !save.wordCards[id]);
  }

  private onKey(event: KeyboardEvent): void {
    if (event.code === "Escape") {
      if (this.phase === "study") this.scene.start("overworld");
      else this.showStudy();
      return;
    }
    if (this.phase === "got" && event.code === "Enter") {
      this.showStudy();
      return;
    }
    if (this.phase === "study") {
      if (event.code === "Enter") this.startMeaning();
      if (event.code === "KeyL") this.startListening();
      if (event.code === "KeyP") this.startSpelling();
      if (event.code === "BracketLeft") this.shiftUnit(-1);
      if (event.code === "BracketRight") this.shiftUnit(1);
      return;
    }
    if ((this.phase === "quiz" || this.phase === "listen") && this.question) {
      const index = Number(event.code.replace("Digit", "")) - 1;
      const choice = this.question.choices[index];
      if (choice) this.answer(choice.id);
    }
  }

  private shiftUnit(delta: number): void {
    const count = this.units().length;
    if (count === 0) return;
    this.unitIndex = (this.unitIndex + delta + count) % count;
    this.showStudy();
  }

  private showStudy(): void {
    this.phase = "study";
    this.question = null;
    document.getElementById("spell-form")?.classList.remove("open");
    this.draw();
  }

  private startMeaning(): void {
    const id = this.currentId();
    if (!id) return;
    this.question = quizForWord(id, hashSeed(`${id}:${this.retry}`), "zh-to-en");
    this.phase = "quiz";
    this.draw();
  }

  private startListening(): void {
    const id = this.currentId();
    if (!id) return;
    this.question = listeningQuestion(id, hashSeed(`listen:${id}:${this.retry}`));
    this.phase = "listen";
    if (this.question.speakText) speakWord(this.question.speakText, browserSpeaker());
    this.draw();
  }

  private startSpelling(): void {
    const id = this.currentId();
    const save = getSave();
    const word = id ? wordById(id) : undefined;
    if (!id || !word || !save || !spellingAllowed(word, Boolean(save.wordCards[id]?.masteryBadge))) return;
    this.phase = "spell";
    this.question = null;
    this.draw();
  }

  private submitSpelling(): void {
    const id = this.currentId();
    const save = getSave();
    const input = document.getElementById("spell-input");
    const error = document.getElementById("spell-error");
    if (!id || !save || !(input instanceof HTMLInputElement)) return;
    const prompt = spellingQuestion(id, Boolean(save.wordCards[id]?.masteryBadge));
    if (!prompt || !checkSpelling(prompt.answer, input.value)) {
      if (error) error.textContent = "再试一次。词卡还没收下。";
      this.missed = true;
      this.retry += 1;
      return;
    }
    this.grant(id);
  }

  private answer(choiceId: string): void {
    const id = this.currentId();
    if (!id || !this.question) return;
    if (choiceId !== this.question.answerId) {
      this.missed = true;
      this.retry += 1;
      this.showStudy();
      return;
    }
    this.grant(id);
  }

  private grant(id: string): void {
    const save = getSave();
    if (!save) return;
    mutate((current) => learnWord(current, id, studyNow(current)));
    this.justId = id;
    this.missed = false;
    this.phase = "got";
    probeNote("learn:got");
    document.getElementById("spell-form")?.classList.remove("open");
    this.draw();
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    if (this.phase !== "spell") document.getElementById("spell-form")?.classList.remove("open");
    paper(this);
    const units = this.units();
    if (this.unitIndex >= units.length) this.unitIndex = 0;
    const unit = units[this.unitIndex];
    if (!unit) {
      this.add.text(180, 250, "所选年级里没有可以学的示例词。", { fontFamily: FONT, fontSize: "28px", color: "#17352a" });
      this.add.text(180, 310, "去给家长再选一个年级。已经收下的词卡和复习都还在。", {
        fontFamily: FONT,
        fontSize: "20px",
        color: "#3d5c4e",
        wordWrap: { width: 760 },
      });
      button(this, 250, 680, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
      return;
    }
    this.add.text(180, 48, `学堂 · ${unit.title}`, { fontFamily: FONT, fontSize: "34px", color: "#17352a" });
    this.add.text(180, 92, "SAMPLE DATA · 键盘 Enter 答题，L 听，P 拼写，[ ] 换年级", {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#8a5a12",
    });
    units.forEach((item, index) => {
      const gradeLabel = GRADE_BANDS.find((grade) => grade.id === item.grade)?.label ?? item.grade;
      button(this, 250 + index * 170, 150, gradeLabel, () => {
        this.unitIndex = index;
        this.showStudy();
      }, { width: 150, fill: index === this.unitIndex ? 0x1f7a4d : 0x5c6b62 });
    });
    const word = wordById(this.currentId() ?? "");
    probeNote(`learn:word:${word?.id ?? "none"}`);
    if (this.phase === "got") {
      const got = wordById(this.justId ?? "");
      this.add.text(180, 240, "词卡入手", { fontFamily: FONT, fontSize: "28px", color: "#1f7a4d" });
      this.add.text(180, 300, got ? `${got.english}  ${got.chinese}` : "", { fontFamily: FONT, fontSize: "40px", color: "#17352a" });
      this.add.text(180, 370, "词卡已经在册子里。熟练徽章还没亮，收集不等于熟练。", { fontFamily: FONT, fontSize: "20px", color: "#3d5c4e" });
      button(this, 320, 470, "继续 Enter", () => this.showStudy());
    } else if (!word) {
      this.add.text(180, 250, "这一组词卡都收集了。", { fontFamily: FONT, fontSize: "28px", color: "#17352a" });
      this.add.text(180, 310, "点上面选中的年级，或按 ]。要学别的年级，去给家长里再选。已经收下的词卡还在。", {
        fontFamily: FONT,
        fontSize: "20px",
        color: "#3d5c4e",
        wordWrap: { width: 760 },
      });
    } else if (this.phase === "study") {
      if (this.missed) this.add.text(180, 200, "再看一次。答对才会收下词卡。", { fontFamily: FONT, fontSize: "18px", color: "#a33b24" });
      this.add.text(180, 250, word.english, { fontFamily: FONT, fontSize: "64px", color: "#17352a" });
      this.add.text(180, 330, `${word.chinese} · 估计 ${word.grade} · 拼写 ${word.spelling}`, { fontFamily: FONT, fontSize: "24px", color: "#3d5c4e" });
      button(this, 300, 460, "听一听 L", () => this.startListening(), { width: 200, fill: 0x3d6ea8 });
      button(this, 540, 460, "选意思 Enter", () => this.startMeaning(), { width: 220 });
      if (spellingAllowed(word, false)) button(this, 800, 460, "键盘拼写 P", () => this.startSpelling(), { width: 220, fill: 0x8a5a12 });
    } else if (this.question) {
      this.add.text(180, 220, this.question.prompt, { fontFamily: FONT, fontSize: "32px", color: "#17352a" });
      probeQuestion(this.question.answerId, this.question.choices.map((choice) => choice.id));
      this.question.choices.forEach((choice, index) => {
        button(this, 640, 320 + index * 80, `${index + 1}  ${choice.label}`, () => this.answer(choice.id), { width: 520 });
      });
      if (this.phase === "listen") button(this, 300, 600, "再听一次", () => {
        if (this.question?.speakText) speakWord(this.question.speakText, browserSpeaker());
      }, { width: 200, fill: 0x3d6ea8 });
    } else if (this.phase === "spell") {
      const prompt = spellingQuestion(word.id, false);
      this.add.text(180, 240, prompt?.prompt ?? "", { fontFamily: FONT, fontSize: "32px", color: "#17352a" });
      this.add.text(180, 310, "在画面上的输入框里用键盘拼写，然后 Enter。", { fontFamily: FONT, fontSize: "20px", color: "#3d5c4e" });
      document.getElementById("spell-form")?.classList.add("open");
      const input = document.getElementById("spell-input");
      if (input instanceof HTMLInputElement) {
        input.value = "";
        window.setTimeout(() => input.focus(), 30);
      }
    }
    button(this, 250, 680, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
    hint(this, `已收集 ${unit.wordIds.filter((id) => save.wordCards[id]).length}/${unit.wordIds.length}`);
  }
}
