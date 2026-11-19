import Phaser from "phaser";
import { findPlayChapter, unlockedWordIds, type PlayChapter } from "../../domain/chapter-plan";
import {
  LEARN_LOAD_FAILED,
  LEARN_PICK,
  LEARN_RESELECT,
  LEARN_SWITCH,
  assessLearnSelection,
  openAcademyForStage,
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
  LEARN_GO_MAP,
  LEARN_PRACTICE_DONE,
  LEARN_RETURN_CHAPTERS,
  chapterLearnScope,
  chapterWordsRemaining,
  confirmLearnSettlement,
  learnAdvance,
  learnBatchView,
  learnChapterFinishRoute,
  learnRemainingLine,
  resumeChapterLearn,
  type LearnBatchView,
  type LearnSettlement,
} from "../../domain/learn-batch";
import { academyProgressLabel } from "../../domain/study-copy";
import type { GradeBand, SaveData } from "../../domain/types";
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
import { commit, getSave, mutate, mutateCommitted } from "../session";
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
  private forestStageId: number | null = null;
  private practiceWordIds: string[] | null = null;
  private practiceGrade: GradeBand | null = null;
  private practiceChapterId: string | null = null;
  private chapterDoneHint: string | null = null;
  private chapterDoneTimer = 0;

  constructor() {
    super("learn");
  }

  init(data: { forestStageId?: number; practiceWordIds?: string[]; practiceGrade?: GradeBand; practiceChapterId?: string } = {}): void {
    this.forestStageId = typeof data.forestStageId === "number" ? data.forestStageId : null;
    this.practiceWordIds = Array.isArray(data.practiceWordIds)
      ? data.practiceWordIds.filter((id) => typeof id === "string" && id.length > 0)
      : null;
    this.practiceGrade = data.practiceGrade === "G3" || data.practiceGrade === "G4" || data.practiceGrade === "G5" || data.practiceGrade === "G6"
      ? data.practiceGrade
      : null;
    this.practiceChapterId = typeof data.practiceChapterId === "string" ? data.practiceChapterId : null;
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core"], ["bg_learn"]);
  }

  create(): void {
    let save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    if (redirectUngraded(this, save)) return;
    const stageId = this.forestStageId;
    this.forestStageId = null;
    if (this.practiceGrade && this.practiceChapterId) {
      const next = confirmLearnSelection(save, this.practiceGrade, this.practiceChapterId);
      if (next !== save) mutate(() => next);
      save = getSave() ?? next;
    } else if (stageId !== null) {
      const chapter = findPlayChapter(save);
      const stage = chapter.grade === "mixed" ? chapter.stages.find((item) => item.id === stageId) : undefined;
      if (stage) {
        const next = openAcademyForStage(save, stage);
        if (next !== save) mutate(() => next);
        save = getSave() ?? save;
      }
    }
    probeEnter("learn");
    window.clearTimeout(this.chapterDoneTimer);
    this.chapterDoneHint = null;
    this.input.setDefaultCursor("default");
    this.phase = "study";
    this.draft = initialLearnDraft(save);
    const assessed = assessLearnSelection(save);
    this.picking = assessed.status !== "ready";
    const resume = resumeChapterLearn(save);
    const practice = this.practiceWordIds?.filter((id) => !save.wordCards[id]) ?? null;
    this.batchIds = practice ? practice : assessed.status === "ready" ? resume.batchIds : [];
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
      window.clearTimeout(this.chapterDoneTimer);
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
    if (!before) return;
    const lessonBefore = this.lessonChapter(before);
    const remainingBefore = lessonBefore ? chapterWordsRemaining(before, lessonBefore) : 0;
    const committed = mutateCommitted((current) => learnWord(current, id, studyNow(current)));
    const after = committed.save;
    const added = Boolean(before && after && !before.wordCards[id] && after.wordCards[id]);
    if (added && !this.learnedThisBatch.includes(id)) this.learnedThisBatch.push(id);
    if (!added || !after) {
      this.showStudy();
      return;
    }
    this.missed = false;
    document.getElementById("spell-form")?.classList.remove("open");
    showSpellingHint(null);
    const lesson = this.lessonChapter(after);
    const remainingAfter = lesson ? chapterWordsRemaining(after, lesson) : remainingBefore;
    const route = learnChapterFinishRoute({
      saved: committed.saved,
      cardAdded: added,
      remainingBefore,
      remainingAfter,
    });
    if (route.kind === "chapter-select") {
      this.openChapterSelect(after, route.hint, true);
      probeNote("learn:chapter-select");
      return;
    }
    if (
      lesson
      && this.practiceWordIds
      && this.practiceWordIds.length > 0
      && this.practiceWordIds.every((wordId) => after.wordCards[wordId])
    ) {
      this.phase = "settle";
      this.question = null;
      this.draw();
      return;
    }
    const chapter = lesson ? this.studyChapter(after, lesson) : null;
    if (!chapter) {
      this.picking = true;
      this.phase = "study";
      this.draw();
      return;
    }
    const view = learnBatchView(after, this.batchIds, this.learnedThisBatch, chapter);
    const step = learnAdvance(view);
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

  private goToChapterMap(chapterId?: string, focusBoss?: boolean): void {
    const save = getSave();
    if (save && confirmLearnSettlement(save) !== save) return;
    this.scene.start("stages", { chapterId, focusBoss });
  }

  private startGradePractice(settlement: LearnSettlement): void {
    const save = getSave();
    if (!save || !settlement.grade || !settlement.wordIds || settlement.wordIds.length === 0) return;
    const chapterId = settlement.mapChapterId ?? "forest_adventure";
    const next = confirmLearnSelection(save, settlement.grade, chapterId);
    if (next !== save) mutate(() => next);
    this.practiceGrade = settlement.grade;
    this.practiceChapterId = chapterId;
    this.practiceWordIds = [...settlement.wordIds];
    const current = getSave() ?? next;
    this.batchIds = settlement.wordIds.filter((id) => !current.wordCards[id]);
    this.learnedThisBatch = [];
    this.phase = "study";
    this.picking = false;
    this.question = null;
    this.missed = false;
    this.draw();
  }

  private chooseSettlement(): void {
    this.activateSettlement();
  }

  /** Chapter select after a stored card. A failed cache write stays on this screen and keeps the card. */
  private openChapterSelect(save: SaveData, hint: string | null, saved: boolean): void {
    if (!saved && !commit(save)) return;
    this.practiceWordIds = null;
    this.practiceGrade = null;
    this.practiceChapterId = null;
    this.question = null;
    this.missed = false;
    this.phase = "study";
    this.picking = true;
    this.draft = initialLearnDraft(save);
    this.armChapterHint(hint);
    this.draw();
  }

  private armChapterHint(hint: string | null): void {
    window.clearTimeout(this.chapterDoneTimer);
    this.chapterDoneHint = hint;
    if (!hint) return;
    this.chapterDoneTimer = window.setTimeout(() => {
      this.chapterDoneHint = null;
      if (this.scene.isActive() && this.picking) this.draw();
    }, 5000);
  }

  private practiceListDone(save: NonNullable<ReturnType<typeof getSave>>): boolean {
    const lesson = this.lessonChapter(save);
    return Boolean(
      lesson
      && this.practiceWordIds
      && this.practiceWordIds.length > 0
      && this.practiceWordIds.every((id) => save.wordCards[id])
      && chapterWordsRemaining(save, lesson) > 0,
    );
  }

  private activateSettlement(): void {
    const save = getSave();
    if (!save) return;
    if (confirmLearnSettlement(save) !== save) return;
    if (this.practiceListDone(save)) {
      this.openChapterSelect(save, null, false);
      return;
    }
    const lesson = this.lessonChapter(save);
    const chapter = lesson ? this.studyChapter(save, lesson) : null;
    const settlement = chapter ? learnBatchView(save, this.batchIds, this.learnedThisBatch, chapter).settlement : null;
    if (settlement?.primary === "grade") this.startGradePractice(settlement);
    else if (settlement?.primary === "village") this.backToVillage();
    else if (settlement?.primary === "chapters") this.openChapterSelect(save, null, false);
    else this.goToChapterMap(settlement?.mapChapterId, settlement?.focusBoss);
  }

  private drawSettlement(view: LearnBatchView): void {
    probeNote(`learn:settle:${view.kind}`);
    const settlement = view.settlement;
    warmPanel(this, 640, 430, 900, 460);
    const headline = settlement?.message ?? null;
    let y = 280;
    if (headline) {
      const text = this.add.text(640, y, headline, {
        fontFamily: FONT,
        fontSize: "24px",
        color: INK,
        wordWrap: cjkWrap(780),
        align: "center",
      }).setOrigin(0.5, 0);
      y += Math.max(72, text.height + 28);
    }
    const primary = settlement?.primaryLabel ?? LEARN_GO_MAP;
    const secondary = settlement?.secondaryLabel ?? uiLabel(LEARN_BACK_VILLAGE);
    const primaryWidth = settlement?.primary === "chapters" ? 260 : 240;
    warmButton(this, secondary ? 500 : 640, y + 40, primary, () => {
      this.activateSettlement();
    }, { width: primaryWidth });
    if (secondary) {
      warmButton(this, 780, y + 40, secondary, () => this.backToVillage(), { width: 200, tone: "secondary" });
    }
  }

  private drawPracticeDone(): void {
    probeNote("learn:practice-done");
    warmPanel(this, 640, 420, 860, 320);
    this.add.text(640, 340, LEARN_PRACTICE_DONE, {
      fontFamily: FONT,
      fontSize: "28px",
      color: INK,
    }).setOrigin(0.5);
    warmButton(this, 500, 460, LEARN_RETURN_CHAPTERS, () => this.activateSettlement(), { width: 260 });
    warmButton(this, 780, 460, uiLabel(LEARN_BACK_VILLAGE), () => this.backToVillage(), { width: 200, tone: "secondary" });
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
    const studied = this.studyChapter(save, chapter);
    if (
      this.practiceWordIds
      && this.practiceWordIds.length > 0
      && this.practiceWordIds.every((id) => save.wordCards[id])
      && chapterWordsRemaining(save, chapter) > 0
    ) {
      this.drawLessonHeading(save, chapter);
      this.drawPracticeDone();
      return;
    }
    this.drawLessonHeading(save, chapter);
    warmButton(this, 980, 48, LEARN_SWITCH, () => this.openPicker(save), { width: 140, tone: "secondary" });
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
    const batchView = learnBatchView(save, this.batchIds, this.learnedThisBatch, studied);
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

  /** While a scene entry named specific words, the academy practices only those. */
  private studyChapter(save: NonNullable<ReturnType<typeof getSave>>, chapter: PlayChapter): PlayChapter {
    if (!this.practiceWordIds || this.practiceWordIds.length === 0) return chapter;
    const left = this.practiceWordIds.filter((id) => !save.wordCards[id]);
    if (left.length === 0) return chapter;
    const allowed = new Set(this.practiceWordIds);
    return {
      ...chapter,
      wordIds: chapter.wordIds.filter((id) => allowed.has(id)),
      stages: chapter.stages.map((stage) => ({
        ...stage,
        new_words: stage.new_words.filter((id) => allowed.has(id)),
      })),
    };
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
    if (this.chapterDoneHint) {
      this.add.text(LEARN_DAY_METER.hintX, LEARN_DAY_METER.hintY, this.chapterDoneHint, {
        fontFamily: FONT,
        fontSize: `${LEARN_DAY_METER.hintFont}px`,
        color: TEAL_DEEP,
      }).setOrigin(0.5);
    }
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
      const y = 336 + row * 74;
      const caption = academyProgressLabel(save, chapter);
      warmButton(this, x, y, chapter.name, () => {
        if (!legalLearnChapters(save, this.draft.grade).some((item) => item.id === chapter.id)) return;
        this.draft = { grade: this.draft.grade, chapterId: chapter.id };
        this.draw();
      }, {
        width: 320,
        height: caption ? 64 : 52,
        caption: caption || undefined,
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
