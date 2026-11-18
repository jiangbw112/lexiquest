import Phaser from "phaser";
import { unlockedWordIds } from "../../domain/chapter-plan";
import type { PlayChapter } from "../../domain/chapter-plan";
import {
  LEARN_LOAD_FAILED,
  LEARN_PICK,
  LEARN_RESELECT,
  assessLearnSelection,
  changeLearnDraftGrade,
  academyGradeChoices,
  confirmLearnSelection,
  initialLearnDraft,
  learnChipLabel,
  learnDraftLine,
  learnGradeEmptyLine,
  learnSceneTitle,
  legalLearnChapters,
  type LearnDraft,
} from "../../domain/chapter-route";
import { GRADE_BANDS, posGloss, wordById, type WordDef } from "../../domain/catalog";
import {
  LEARN_BACK_VILLAGE,
  LEARN_CARDS_DONE,
  LEARN_CARDS_DONE_CLEARED,
  LEARN_GO_MAP,
  chapterLearnScope,
  chapterWordsRemaining,
  confirmLearnSettlement,
  learnAdvance,
  learnBatchView,
  learnRemainingLine,
  resumeChapterLearn,
  type LearnBatchView,
} from "../../domain/learn-batch";
import { uiLabel } from "../../domain/ui-label";
import { NEW_WORD_GOAL_NOTICE, dailyNewWordTargetMet, learnDayMeter, reviewFirstNotice } from "../../domain/parent";
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
import { LEARN_CHIP_ROW, LEARN_DAY_METER, LEARN_TITLE_PLANK, STUDY_CARD, cjkTextWidth, cjkWrap, learnGradeChipRow, meaningScale, studyNoticeGap, studyRowY } from "../layout";
import { recordPlayAnswer } from "../play-timer";
import { probeEnter, probeNote, probeQuestion } from "../probe";
import { showSpellingHint, spellingInstruction } from "../spelling-form";
import { getSave, mutate } from "../session";
import { FONT, listenKeys } from "../ui";
import { warmBar, warmButton, warmChip, warmOption, warmPanel, warmTitlePlank, type WarmOption } from "../warm/kit";
import { queueWarm, warmBackground } from "../warm/load";
import { ERR_TEXT, FONT_LATIN, INK, MUTED, TEAL_DEEP, whenGlyphsReady } from "../warm/theme";

type Phase = "study" | "quiz" | "listen" | "spell" | "settle";

export class LearnScene extends Phaser.Scene {
  private batchIds: string[] = [];
  private learnedThisBatch: string[] = [];
  private phase: Phase = "study";
  private retry = 0;
  private missed = false;
  private question: QuizQuestion | null = null;
  private options: WarmOption[] = [];
  private busy = false;
  private fontSample = "";
  private answerTimer = 0;
  private picking = false;
  private draft: LearnDraft = { grade: "G3", chapterId: null };

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
    this.draft = initialLearnDraft(save);
    const assessed = assessLearnSelection(save);
    this.picking = assessed.status !== "ready";
    const resume = resumeChapterLearn(save);
    this.batchIds = assessed.status === "ready" ? resume.batchIds : [];
    this.learnedThisBatch = [];
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

  private distractors(save: NonNullable<ReturnType<typeof getSave>>): WordDef[] {
    return unlockedWordIds(save).map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word));
  }

  private badgeLit(wordId: string): boolean {
    const save = getSave();
    if (!save) return false;
    return badgeTone(save.wordCards[wordId], save.memory[wordId], studyNow(save)) === "bright";
  }

  private currentId(): string | undefined {
    const save = getSave();
    if (!save) return undefined;
    return this.batchIds.find((id) => !save.wordCards[id]);
  }

  private onKey(event: KeyboardEvent): void {
    if (event.code === "Escape") {
      if (this.phase === "quiz" || this.phase === "listen" || this.phase === "spell") this.showStudy();
      else this.backToVillage();
      return;
    }
    if (this.phase === "settle" && event.code === "Enter") {
      this.chooseSettlement();
      return;
    }
    if (this.phase === "study") {
      if (event.code === "Enter") this.startMeaning();
      if (event.code === "KeyL") this.startListening();
      if (event.code === "KeyP") this.startSpelling();
      return;
    }
    if ((this.phase === "quiz" || this.phase === "listen") && this.question) {
      const index = Number(event.code.replace("Digit", "")) - 1;
      const choice = this.question.choices[index];
      if (choice) this.answer(choice.id);
    }
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
    const save = getSave();
    this.question = quizForWord(id, hashSeed(`${id}:${this.retry}`), "zh-to-en", save ? this.distractors(save) : undefined);
    this.phase = "quiz";
    this.draw();
  }

  private startListening(): void {
    const id = this.currentId();
    if (!id) return;
    const save = getSave();
    this.question = listeningQuestion(id, hashSeed(`listen:${id}:${this.retry}`), save ? this.distractors(save) : undefined);
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
    recordPlayAnswer();
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
    recordPlayAnswer();
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
    const before = getSave();
    mutate((current) => learnWord(current, id, studyNow(current)));
    const after = getSave();
    const added = Boolean(before && after && !before.wordCards[id] && after.wordCards[id]);
    if (added && !this.learnedThisBatch.includes(id)) this.learnedThisBatch.push(id);
    if (!added || !after) {
      this.showStudy();
      return;
    }
    this.missed = false;
    const chapter = this.lessonChapter(after);
    if (!chapter) {
      this.picking = true;
      this.phase = "study";
      this.draw();
      return;
    }
    const view = learnBatchView(after, this.batchIds, this.learnedThisBatch, chapter);
    const step = learnAdvance(view);
    this.missed = false;
    document.getElementById("spell-form")?.classList.remove("open");
    showSpellingHint(null);
    if (step.kind === "next") {
      if (step.resetBatch) {
        this.batchIds = [...step.batchIds];
        this.learnedThisBatch = [];
      }
      this.phase = "study";
      this.question = null;
      this.draw();
      probeNote("learn:next");
      return;
    }
    this.phase = "settle";
    probeNote("learn:settle");
    this.draw();
  }

  private backToVillage(): void {
    const save = getSave();
    if (save && confirmLearnSettlement(save) !== save) return;
    this.scene.start("overworld");
  }

  private goToChapterMap(): void {
    const save = getSave();
    if (save && confirmLearnSettlement(save) !== save) return;
    this.scene.start("stages");
  }

  private chooseSettlement(): void {
    const save = getSave();
    if (!save) return;
    if (confirmLearnSettlement(save) !== save) return;
    const chapter = this.lessonChapter(save);
    if (!chapter) return;
    const view = learnBatchView(save, this.batchIds, this.learnedThisBatch, chapter);
    if (view.kind === "continue-batch") {
      this.showStudy();
      return;
    }
    if (view.kind === "continue-chapter") {
      this.batchIds = view.nextBatchIds;
      this.learnedThisBatch = [];
      this.showStudy();
      return;
    }
    this.scene.start("stages");
  }

  private drawSettlement(view: LearnBatchView): void {
    probeNote(`learn:settle:${view.kind}`);
    warmPanel(this, 640, 420, 860, 420);
    let y = 280;
    const headline = view.kind === "cards-done"
      ? (view.chapterCleared ? LEARN_CARDS_DONE_CLEARED : LEARN_CARDS_DONE)
      : null;
    if (headline) {
      this.add.text(640, y, headline, {
        fontFamily: FONT,
        fontSize: "28px",
        color: INK,
        wordWrap: cjkWrap(760),
        align: "center",
      }).setOrigin(0.5);
      y += 72;
    }
    warmButton(this, 500, y + 88, LEARN_GO_MAP, () => this.goToChapterMap(), { width: 240 });
    warmButton(this, 780, y + 88, uiLabel(LEARN_BACK_VILLAGE), () => this.backToVillage(), { width: 200, tone: "secondary" });
  }

  /** Leaf while today's 3/5/8 target is open. Gold plus one line once it is met. Learning is not stopped. */
  private paintDayMeter(save: NonNullable<ReturnType<typeof getSave>>, now: Date): void {
    const meter = learnDayMeter(save, now);
    this.add.text(LEARN_DAY_METER.labelX, LEARN_DAY_METER.y, `今日 ${meter.label}`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: meter.met ? TEAL_DEEP : INK,
    }).setOrigin(1, 0.5);
    warmBar(this, LEARN_DAY_METER.barX, LEARN_DAY_METER.y, LEARN_DAY_METER.width, meter.ratio, meter.met ? "gold" : "leaf");
    if (!meter.hint) return;
    this.add.text(LEARN_DAY_METER.hintX, LEARN_DAY_METER.hintY, meter.hint, {
      fontFamily: FONT,
      fontSize: `${LEARN_DAY_METER.hintFont}px`,
      color: TEAL_DEEP,
    }).setOrigin(0.5);
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
    warmButton(this, 160, 48, uiLabel("返回"), () => this.backToVillage(), { width: 140, tone: "secondary" });
    const assessed = assessLearnSelection(save);
    if (assessed.status !== "ready") {
      this.drawLearnGate(save, assessed.status, assessed.status === "reselect" ? assessed.remembered : null);
      return;
    }
    const chapter = assessed.chapter;
    this.drawLessonHeading(save, chapter);
    warmButton(this, 980, 48, LEARN_PICK, () => this.openPicker(save), { width: 140, tone: "secondary" });
    if (this.picking) {
      this.drawPicker(save);
      return;
    }
    const word = wordById(this.currentId() ?? "");
    probeNote(`learn:word:${word?.id ?? "none"}`);
    const sample = [word?.chinese, this.question?.prompt, ...(this.question?.choices.map((choice) => choice.label) ?? [])].filter(Boolean).join("");
    if (sample && sample !== this.fontSample && document.fonts && !document.fonts.check('700 46px "Noto Sans SC"', sample)) {
      this.fontSample = sample;
      whenGlyphsReady(sample, () => {
        if (this.scene.isActive()) this.draw();
      });
    }
    const scope = chapterLearnScope(save, chapter);
    const collected = `${scope.filter((id) => save.wordCards[id]).length}/${scope.length}`;
    this.add.text(1100, 36, collected, { fontFamily: FONT_LATIN, fontSize: "22px", fontStyle: "800", color: INK }).setOrigin(0.5);
    this.paintDayMeter(save, studyNow(save));
    const batchView = learnBatchView(save, this.batchIds, this.learnedThisBatch, chapter);
    if (this.phase === "settle" || !word) {
      this.phase = "settle";
      this.drawSettlement(batchView);
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
      const now = studyNow(save);
      const reviewNote = reviewFirstNotice(save, now);
      const goalNote = dailyNewWordTargetMet(save, now) ? NEW_WORD_GOAL_NOTICE : "";
      if (reviewNote) {
        this.add.text(640, STUDY_CARD.reviewHintY, reviewNote, {
          fontFamily: FONT,
          fontSize: "18px",
          color: MUTED,
          wordWrap: cjkWrap(760),
          align: "center",
        }).setOrigin(0.5);
      }
      if (goalNote) probeNote("learn:goal-open");
      this.meaningRow(640, studyRowY(this.missed), word.english, word.pos, word.chinese, STUDY_CARD.englishSize);
      const gloss = posGloss(word.pos);
      const gradeLabel = GRADE_BANDS.find((grade) => grade.id === word.grade)?.label ?? String(word.grade);
      const spellingLine = spellingChildLabel(word.spelling, this.badgeLit(word.id));
      const meta = [gloss, gradeLabel, spellingLine].filter(Boolean).join(" · ");
      this.add.text(640, 430, meta, { fontFamily: FONT, fontSize: "18px", color: MUTED }).setOrigin(0.5);
      this.add.text(640, 472, learnRemainingLine(chapterWordsRemaining(save, chapter)), {
        fontFamily: FONT,
        fontSize: "18px",
        color: MUTED,
      }).setOrigin(0.5);
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

  private lessonChapter(save: NonNullable<ReturnType<typeof getSave>>): PlayChapter | null {
    const assessed = assessLearnSelection(save);
    return assessed.status === "ready" ? assessed.chapter : null;
  }

  private drawLessonHeading(save: NonNullable<ReturnType<typeof getSave>>, chapter: PlayChapter): void {
    const grade = chapter.grade === "mixed" ? "mixed" : chapter.grade;
    warmTitlePlank(
      this,
      LEARN_TITLE_PLANK.x,
      LEARN_TITLE_PLANK.y,
      LEARN_TITLE_PLANK.width,
      this.lessonTitle(save, grade, chapter.name),
    );
  }

  /** The title font subset reads the template inside learnSceneTitle. */
  private lessonTitle(save: NonNullable<ReturnType<typeof getSave>>, grade: PlayChapter["grade"], name: string): string {
    return learnSceneTitle(save, grade, name);
  }

  private openPicker(save: NonNullable<ReturnType<typeof getSave>>): void {
    this.draft = initialLearnDraft(save);
    this.picking = true;
    this.draw();
  }

  private cancelPick(save: NonNullable<ReturnType<typeof getSave>>): void {
    this.draft = initialLearnDraft(save);
    this.picking = assessLearnSelection(save).status !== "ready";
    this.draw();
  }

  private confirmPick(save: NonNullable<ReturnType<typeof getSave>>): void {
    const chapterId = this.draft.chapterId;
    if (!chapterId) return;
    const next = confirmLearnSelection(save, this.draft.grade, chapterId);
    const rejected = next === save && (save.learnSelection?.grade !== this.draft.grade || save.learnSelection?.chapterId !== chapterId);
    if (rejected) return;
    if (next !== save) mutate(() => next);
    const updated = getSave();
    if (!updated) return;
    const assessed = assessLearnSelection(updated);
    if (assessed.status !== "ready") return;
    this.picking = false;
    this.batchIds = resumeChapterLearn(updated).batchIds;
    this.learnedThisBatch = [];
    this.missed = false;
    this.phase = this.batchIds.some((id) => !updated.wordCards[id]) ? "study" : "settle";
    this.draw();
  }

  private drawLearnGate(
    save: NonNullable<ReturnType<typeof getSave>>,
    status: "choose" | "reselect" | "load-failed",
    remembered: { grade: LearnDraft["grade"]; name: string } | null,
  ): void {
    if (remembered) warmTitlePlank(this, LEARN_TITLE_PLANK.x, LEARN_TITLE_PLANK.y, LEARN_TITLE_PLANK.width, this.lessonTitle(save, remembered.grade, remembered.name));
    else warmTitlePlank(this, 560, 48, 360, uiLabel("学堂"));
    const message = status === "load-failed" ? LEARN_LOAD_FAILED : status === "reselect" ? LEARN_RESELECT : LEARN_PICK;
    probeNote(`learn:gate:${status}`);
    if (!this.picking) {
      warmPanel(this, 640, 400, 860, 280);
      this.add.text(640, 360, message, {
        fontFamily: FONT,
        fontSize: "28px",
        color: INK,
        align: "center",
      }).setOrigin(0.5);
      warmButton(this, 640, 460, LEARN_PICK, () => this.openPicker(save), { width: 220 });
      return;
    }
    this.add.text(640, 150, message, { fontFamily: FONT, fontSize: "22px", color: INK }).setOrigin(0.5);
    this.drawPicker(save);
  }

  private drawPicker(save: NonNullable<ReturnType<typeof getSave>>): void {
    const gradeChoices: LearnDraft["grade"][] = academyGradeChoices(save);
    const chipLabels = gradeChoices.map((grade) => learnChipLabel(grade, save));
    const chips = learnGradeChipRow(chipLabels, (label) => cjkTextWidth(label, LEARN_CHIP_ROW.fontSize));
    gradeChoices.forEach((grade, index) => {
      const chip = chips[index];
      if (!chip) return;
      warmChip(this, chip.x, LEARN_CHIP_ROW.y, chipLabels[index] ?? "", this.draft.grade === grade, () => {
        this.draft = changeLearnDraftGrade(this.draft, grade);
        this.draw();
      }, { width: chip.width });
    });
    const chapters = legalLearnChapters(save, this.draft.grade);
    const picked = chapters.find((chapter) => chapter.id === this.draft.chapterId);
    const pair = learnDraftLine(this.draft.grade, save, picked ? picked.name : null);
    const pairText = this.add.text(640, 270, pair, { fontFamily: FONT, fontSize: "20px", color: INK }).setOrigin(0.5);
    if (pairText.width > 960) pairText.setScale(960 / pairText.width);
    if (chapters.length === 0) {
      this.add.text(640, 360, learnGradeEmptyLine(), {
        fontFamily: FONT,
        fontSize: "22px",
        color: MUTED,
      }).setOrigin(0.5);
    }
    chapters.forEach((chapter, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = column === 0 ? 460 : 820;
      const y = 330 + row * 62;
      warmButton(this, x, y, chapter.name, () => {
        if (!legalLearnChapters(save, this.draft.grade).some((item) => item.id === chapter.id)) return;
        this.draft = { grade: this.draft.grade, chapterId: chapter.id };
        this.draw();
      }, {
        width: 320,
        height: 52,
        tone: this.draft.chapterId === chapter.id ? "primary" : "secondary",
      });
    });
    const canConfirm = Boolean(picked);
    warmButton(this, 500, 730, "确认", () => this.confirmPick(save), { width: 200, disabled: !canConfirm });
    warmButton(this, 780, 730, "取消", () => this.cancelPick(save), { width: 200, tone: "secondary" });
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
