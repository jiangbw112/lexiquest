import Phaser from "phaser";
import { GRADE_BANDS, lessonUnits, posGloss, wordById } from "../../domain/catalog";
import { uiLabel } from "../../domain/ui-label";
import { learnWord, studyNow } from "../../domain/progress";
import { badgeTone } from "../../domain/review";
import {
  checkSpelling,
  listeningQuestion,
  quizForWord,
  spellingAllowed,
  spellingChildLabel,
  spellingQuestion,
  type QuizQuestion,
} from "../../domain/questions";
import { hashSeed } from "../../domain/rng";
import { browserSpeaker, speakWord } from "../../domain/speech";
import { destroyDrawn } from "../destroy-drawn";
import { redirectUngraded } from "../grade-route";
import { STUDY_CARD, cjkWrap, meaningScale, studyNoticeGap, studyRowY } from "../layout";
import { probeEnter, probeNote, probeQuestion } from "../probe";
import { showSpellingHint, spellingInstruction } from "../spelling-form";
import { getSave, mutate } from "../session";
import { FONT, listenKeys } from "../ui";
import { warmButton, warmChip, warmOption, warmPanel, warmTitlePlank, type WarmOption } from "../warm/kit";
import { queueWarm, warmBackground } from "../warm/load";
import { ERR_TEXT, FONT_LATIN, FONT_TITLE, INK, MUTED, whenGlyphsReady } from "../warm/theme";

type Phase = "study" | "quiz" | "listen" | "spell" | "got";

export class LearnScene extends Phaser.Scene {
  private unitIndex = 0;
  private phase: Phase = "study";
  private retry = 0;
  private missed = false;
  private justId: string | null = null;
  private question: QuizQuestion | null = null;
  private options: WarmOption[] = [];
  private busy = false;
  private fontSample = "";
  private answerTimer = 0;

  constructor() {
    super("learn");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core"], ["bg_learn"]);
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    if (redirectUngraded(this, save)) return;
    probeEnter("learn");
    this.input.setDefaultCursor("default");
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
      window.clearTimeout(this.answerTimer);
    });
    this.draw();
    probeNote("learn:ready");
  }

  private units() {
    return lessonUnits(getSave()?.selectedGrades);
  }

  private badgeLit(wordId: string): boolean {
    const save = getSave();
    if (!save) return false;
    return badgeTone(save.wordCards[wordId], save.memory[wordId], studyNow(save)) === "bright";
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
    showSpellingHint(null);
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
    if (!id || !word || !save || !spellingAllowed(word, this.badgeLit(id))) return;
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
    const prompt = spellingQuestion(id, this.badgeLit(id));
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
    if (!id || !this.question || this.busy) return;
    const correct = choiceId === this.question.answerId;
    this.busy = true;
    this.options.forEach((option) => {
      if (option.id === choiceId) option.setResult(correct ? "correct" : "wrong");
      else option.setResult("disabled");
    });
    this.answerTimer = window.setTimeout(() => {
      this.busy = false;
      if (!this.scene.isActive()) return;
      if (!correct) {
        this.missed = true;
        this.retry += 1;
        this.showStudy();
        return;
      }
      this.grant(id);
    }, 420);
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
    showSpellingHint(null);
    this.draw();
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    destroyDrawn(this.children.list);
    this.options = [];
    probeNote(this.phase === "study" ? "learn:actions:open" : "learn:actions:closed");
    if (this.phase !== "spell") {
      document.getElementById("spell-form")?.classList.remove("open");
      showSpellingHint(null);
    }
    warmBackground(this, "bg_learn");
    const units = this.units();
    if (this.unitIndex >= units.length) this.unitIndex = 0;
    const unit = units[this.unitIndex];
    warmButton(this, 180, 48, uiLabel("返回"), () => this.scene.start("overworld"), { width: 140, tone: "secondary" });
    if (!unit) {
      warmPanel(this, 640, 400, 860, 360);
      this.add.text(280, 320, "所选年级里没有这一章的词。", { fontFamily: FONT, fontSize: "28px", color: INK });
      this.add.text(280, 380, "去给家长再选一个年级。已经收下的词卡和复习都还在。", {
        fontFamily: FONT,
        fontSize: "20px",
        color: MUTED,
        wordWrap: cjkWrap(760),
      });
      return;
    }
    warmTitlePlank(this, 500, 48, 440, uiLabel(`学堂 · ${unit.title}`));
    units.forEach((item, index) => {
      const gradeLabel = GRADE_BANDS.find((grade) => grade.id === item.grade)?.label ?? item.grade;
      warmChip(this, 280 + index * 180, 116, gradeLabel, index === this.unitIndex, () => {
        this.unitIndex = index;
        this.showStudy();
      }, { width: 160 });
    });
    const word = wordById(this.currentId() ?? "");
    probeNote(`learn:word:${word?.id ?? "none"}`);
    const sample = [word?.chinese, this.question?.prompt, ...(this.question?.choices.map((choice) => choice.label) ?? [])].filter(Boolean).join("");
    if (sample && sample !== this.fontSample && document.fonts && !document.fonts.check('700 46px "Noto Sans SC"', sample)) {
      this.fontSample = sample;
      whenGlyphsReady(sample, () => {
        if (this.scene.isActive()) this.draw();
      });
    }
    const collected = `${unit.wordIds.filter((id) => save.wordCards[id]).length}/${unit.wordIds.length}`;
    this.add.text(1100, 36, collected, { fontFamily: FONT_LATIN, fontSize: "22px", fontStyle: "800", color: INK }).setOrigin(0.5);
    if (this.phase === "got") {
      const got = wordById(this.justId ?? "");
      warmPanel(this, 640, 400, 860, 420);
      this.add.text(640, 250, uiLabel("词卡入手"), { fontFamily: FONT_TITLE, fontSize: "36px", color: INK }).setOrigin(0.5);
      if (got) this.meaningRow(640, 340, got.english, got.pos, got.chinese, 64);
      this.add.text(640, 430, "词卡已经在册子里。熟练徽章还没亮，收集不等于熟练。", {
        fontFamily: FONT,
        fontSize: "20px",
        color: MUTED,
      }).setOrigin(0.5);
      warmButton(this, 640, 520, uiLabel("继续"), () => this.showStudy(), { width: 200 });
      return;
    }
    if (!word) {
      warmPanel(this, 640, 420, 860, 320);
      this.add.text(280, 340, "这一组词卡都收集了。", { fontFamily: FONT, fontSize: "28px", color: INK });
      this.add.text(280, 400, "点上面选中的年级，或按 ]。要学别的年级，去给家长里再选。已经收下的词卡还在。", {
        fontFamily: FONT,
        fontSize: "20px",
        color: MUTED,
        wordWrap: cjkWrap(760),
      });
      return;
    }
    if (this.phase === "study") {
      warmPanel(this, 640, 400, 900, 460);
      if (this.missed) {
        this.add.text(640, STUDY_CARD.noticeY, "再看一次。答对才会收下词卡。", {
          fontFamily: FONT,
          fontSize: `${STUDY_CARD.noticeFont}px`,
          color: ERR_TEXT,
        }).setOrigin(0.5);
        probeNote(`learn:notice-gap:${studyNoticeGap()}`);
      }
      this.meaningRow(640, studyRowY(this.missed), word.english, word.pos, word.chinese, STUDY_CARD.englishSize);
      const gloss = posGloss(word.pos);
      const gradeLabel = GRADE_BANDS.find((grade) => grade.id === word.grade)?.label ?? String(word.grade);
      const spellingLine = spellingChildLabel(word.spelling, this.badgeLit(word.id));
      const meta = [gloss, gradeLabel, spellingLine].filter(Boolean).join(" · ");
      this.add.text(640, 430, meta, { fontFamily: FONT, fontSize: "18px", color: MUTED }).setOrigin(0.5);
      warmButton(this, 360, 540, uiLabel("听一听"), () => this.startListening(), { width: 180, tone: "secondary" });
      warmButton(this, 580, 540, uiLabel("选意思"), () => this.startMeaning(), { width: 180 });
      if (spellingAllowed(word, this.badgeLit(word.id))) {
        warmButton(this, 820, 540, uiLabel("键盘拼写"), () => this.startSpelling(), { width: 200, tone: "secondary" });
      }
      return;
    }
    if (this.question) {
      warmPanel(this, 640, 250, 900, 120);
      this.add.text(640, 250, this.question.prompt, {
        fontFamily: FONT,
        fontSize: "28px",
        fontStyle: "700",
        color: INK,
        wordWrap: cjkWrap(820),
        align: "center",
      }).setOrigin(0.5);
      probeQuestion(this.question.answerId, this.question.choices.map((choice) => choice.id));
      this.question.choices.forEach((choice, index) => {
        this.options.push(warmOption(this, 640, 380 + index * 72, index, choice.id, choice.label, () => this.answer(choice.id)));
      });
      if (this.phase === "listen") {
        warmButton(this, 640, 640, uiLabel("再听一次"), () => {
          if (this.question?.speakText) speakWord(this.question.speakText, browserSpeaker());
        }, { width: 200, tone: "secondary" });
      }
      return;
    }
    if (this.phase === "spell") {
      warmPanel(this, 640, 360, 860, 280);
      const prompt = spellingQuestion(word.id, this.badgeLit(word.id));
      this.add.text(640, 280, prompt?.prompt ?? "", { fontFamily: FONT, fontSize: "32px", fontStyle: "700", color: INK }).setOrigin(0.5);
      this.add.text(640, 350, spellingInstruction(prompt?.answer ?? null), {
        fontFamily: FONT,
        fontSize: "20px",
        color: MUTED,
        wordWrap: cjkWrap(760),
        align: "center",
      }).setOrigin(0.5);
      document.getElementById("spell-form")?.classList.add("open");
      showSpellingHint(prompt?.answer ?? null);
      const input = document.getElementById("spell-input");
      if (input instanceof HTMLInputElement) {
        input.value = "";
        window.setTimeout(() => input.focus(), 30);
      }
    }
  }

  private meaningRow(x: number, y: number, english: string, pos: string | undefined, chinese: string, englishSize: number): void {
    const word = this.add.text(x, y - 70, english, {
      fontFamily: FONT_LATIN,
      fontSize: `${englishSize}px`,
      fontStyle: "900",
      color: INK,
    }).setOrigin(0.5);
    if (word.width > 760) word.setScale(760 / word.width);
    const meaning = this.add.text(0, 0, chinese, {
      fontFamily: FONT,
      fontSize: "46px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0.5);
    meaning.setScale(meaningScale(meaning.width));
    if (!pos) {
      meaning.setOrigin(0.5);
      meaning.setPosition(x, y + 20);
      return;
    }
    const tagText = this.add.text(0, 0, pos, {
      fontFamily: FONT_LATIN,
      fontSize: "24px",
      fontStyle: "800",
      color: INK,
    }).setOrigin(0, 0.5);
    const tagW = tagText.width + 24;
    const tag = this.add.graphics();
    tag.fillStyle(0x8ecae6, 1);
    tag.fillRoundedRect(0, -20, tagW, 40, 14);
    tagText.setPosition(12, 0);
    meaning.setPosition(tagW + 12, 0);
    const rowWidth = tagW + 12 + meaning.displayWidth;
    this.add.container(x - rowWidth / 2, y + 20, [tag, tagText, meaning]);
  }
}
