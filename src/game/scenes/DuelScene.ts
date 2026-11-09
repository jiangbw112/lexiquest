import Phaser from "phaser";
import { sampleWords } from "../../domain/catalog";
import { compareRounds, type DuelAnswer } from "../../domain/duel";
import { practiceDuel } from "../../domain/progress";
import { quizForWord, type QuizQuestion } from "../../domain/questions";
import { hashSeed } from "../../domain/rng";
import { probeEnter, probeQuestion } from "../probe";
import { getSave } from "../session";
import { FONT, button, paper } from "../ui";

type Step = { name: "cover"; round: number; player: 0 | 1 } | { name: "ask"; round: number; player: 0 | 1 } | { name: "result" };

export class DuelScene extends Phaser.Scene {
  private seats: { name: string; answers: DuelAnswer[] }[] = [
    { name: "小朋友甲", answers: [] },
    { name: "小朋友乙", answers: [] },
  ];
  private step: Step = { name: "cover", round: 0, player: 0 };
  private questions: QuizQuestion[] = [];
  private started = 0;

  constructor() {
    super("duel");
  }

  create(): void {
    if (!getSave()) {
      this.scene.start("title");
      return;
    }
    probeEnter("duel");
    this.questions = sampleWords().slice(0, 4).map((word, index) => quizForWord(word.id, hashSeed(`duel:${word.id}:${index}`), index % 2 === 0 ? "zh-to-en" : "en-to-zh"));
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.code === "Escape") this.scene.start("overworld");
      if (this.step.name === "cover" && event.code === "Enter") this.reveal();
      if (this.step.name === "ask") {
        const index = Number(event.code.replace("Digit", "")) - 1;
        const choice = this.questions[this.step.round]?.choices[index];
        if (choice) this.answer(choice.id);
      }
    });
    this.draw();
  }

  private reveal(): void {
    if (this.step.name !== "cover") return;
    this.started = performance.now();
    this.step = { name: "ask", round: this.step.round, player: this.step.player };
    this.draw();
  }

  private answer(choiceId: string): void {
    if (this.step.name !== "ask") return;
    const question = this.questions[this.step.round];
    if (!question) return;
    const responseMs = Math.max(0, performance.now() - this.started);
    const player = this.step.player;
    this.seats = this.seats.map((seat, index) =>
      index === player ? { ...seat, answers: [...seat.answers, { correct: choiceId === question.answerId, responseMs }] } : seat,
    );
    if (player === 0) {
      this.step = { name: "cover", round: this.step.round, player: 1 };
    } else if (this.step.round >= this.questions.length - 1) {
      const save = getSave();
      if (save) practiceDuel(save, this.seats[0]!.answers, this.seats[1]!.answers);
      this.step = { name: "result" };
    } else {
      this.step = { name: "cover", round: this.step.round + 1, player: 0 };
    }
    this.draw();
  }

  private draw(): void {
    this.children.removeAll(true);
    paper(this);
    this.add.text(160, 40, "同机练习", { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
    this.add.text(160, 88, "两个朋友轮流用这一台电脑。答对题数多的赢；题数一样，答对用时更少的赢。答错不计分也不计时。不会写入复习记忆，也不是联网对战。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#3d5c4e",
      wordWrap: { width: 960 },
    });
    if (this.step.name === "cover") {
      this.add.text(160, 220, `请把电脑交给 ${this.seats[this.step.player]?.name}`, { fontFamily: FONT, fontSize: "32px", color: "#17352a" });
      this.add.text(160, 280, `第 ${this.step.round + 1} / ${this.questions.length} 题`, { fontFamily: FONT, fontSize: "20px", color: "#3d5c4e" });
      button(this, 360, 380, "我准备好了 Enter", () => this.reveal(), { width: 280 });
    }
    if (this.step.name === "ask") {
      const question = this.questions[this.step.round];
      if (!question) return;
      probeQuestion(question.answerId, question.choices.map((choice) => choice.id));
      this.add.text(160, 200, question.prompt, { fontFamily: FONT, fontSize: "32px", color: "#17352a" });
      question.choices.forEach((choice, index) => {
        button(this, 640, 300 + index * 80, `${index + 1}  ${choice.label}`, () => this.answer(choice.id), { width: 520 });
      });
    }
    if (this.step.name === "result") {
      const result = compareRounds(this.seats[0]!.answers, this.seats[1]!.answers);
      const title = result.winner === "tie" ? "这一局打平" : `${this.seats[result.winner === "a" ? 0 : 1]?.name} 赢了`;
      this.add.text(160, 200, title, { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
      this.add.text(160, 270, `${this.seats[0]?.name}：答对 ${result.tallyA.correctCount}，用时 ${(result.tallyA.correctTimeMs / 1000).toFixed(1)} 秒`, {
        fontFamily: FONT,
        fontSize: "22px",
        color: "#17352a",
      });
      this.add.text(160, 310, `${this.seats[1]?.name}：答对 ${result.tallyB.correctCount}，用时 ${(result.tallyB.correctTimeMs / 1000).toFixed(1)} 秒`, {
        fontFamily: FONT,
        fontSize: "22px",
        color: "#17352a",
      });
    }
    button(this, 250, 700, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
  }
}
