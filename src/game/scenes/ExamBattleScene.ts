import Phaser from "phaser";
import { answerQuestion, armExamShaken, resumeExamBattle, startBattle, takeAction, type BattleState } from "../../domain/battle";
import {
  INVENTOR_UNLOCK_GO,
  INVENTOR_UNLOCK_LATER,
  INVENTOR_UNLOCK_MAIN,
  INVENTOR_UNLOCK_SUB,
} from "../../domain/class-unlock";
import {
  EXAM_NO_QUESTION,
  examCardPool,
  lossesForPhase,
  phaseRunFromSchedule,
  readPhaseRun,
  scheduleForPhase,
  scheduleFromPhaseRun,
  storedSession,
  writePhaseRun,
  type ExamSchedule,
  type ExamSession,
  type ExamWord,
} from "../../domain/exam-questions";
import {
  EXAM_LOCK_HELD,
  EXAM_REVIEW_BLOCK,
  EXAM_SAVE_FAILED,
  claimExamLock,
  commitExamSnapshot,
  examRewardBlocked,
  markInventorUnlockPresented,
  noteExamAnswer,
  releaseExamLock,
  settleExamAttempt,
  type ExamStore,
} from "../../domain/exam-settlement";
import type { ExamPhaseRunRecord } from "../../domain/types";
import {
  EXAM_ATTACK,
  EXAM_BOSS_X,
  EXAM_BOSS_Y,
  EXAM_INTRO_MS,
  EXAM_SHAKEN_AFTER,
  battleEnemyName,
  deliverExamPointer,
  examBannerTitle,
  examById,
  examEnemyName,
  examIntroParts,
  examShakenLine,
  examPhaseHp,
  examSpellingCounter,
  examUnlocked,
  resumeExamPhase,
  type ExamDef,
} from "../../domain/exams";
import { gradeIsOpen } from "../../domain/progress";
import { checkSpelling } from "../../domain/questions";
import { SAVE_KEY, serialize } from "../../domain/storage";
import { equipTitleParts, markTitleReceiptPresented, titlePartText } from "../../domain/titles";
import type { SaveData } from "../../domain/types";
import { EXAM_ANSWER_REVEAL, paintAnswerReveal } from "../answer-reveal";
import { ExamBossSprite } from "../art/exam-boss-sprite";
import { examBackground, queueExamArt, EXAM_UI_KEY } from "../art/exam-art";
import { cjkWrap } from "../layout";
import { attachExamDev, detachExamDev } from "./exam-battle-dev";
import { commit, getSave } from "../session";
import { showSpellingHint, spellingInstruction } from "../spelling-form";
import { FONT_BODY, INK } from "../warm/theme";

const TAB_KEY = "lexiquest.exam.tab";

const browserStore: ExamStore = {
  get(key) {
    return localStorage.getItem(key);
  },
  set(key, value) {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  },
};

function tabId(): string {
  const existing = sessionStorage.getItem(TAB_KEY);
  if (existing) return existing;
  const next = `tab-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(TAB_KEY, next);
  return next;
}

export class ExamBattleScene extends Phaser.Scene {
  private examId = "";
  private exam: ExamDef | null = null;
  private phaseNo = 1;
  private introOpen = false;
  private state: BattleState | null = null;
  private schedule: ExamSchedule | null = null;
  private session: ExamSession | null = null;
  private phaseSeed = 0;
  private words: ExamWord[] = [];
  private draft: SaveData | null = null;
  private checkpoint: SaveData | null = null;
  private baseRaw = "";
  private lockToken = "";
  private freshSitting = true;
  private fxFrom: number | null = null;
  private resultIds: string[] = [];
  private inventorFresh = false;
  private view: Phaser.GameObjects.Container | null = null;
  private spellingSubmit: ((event: Event) => void) | null = null;

  constructor() {
    super("exam-battle");
  }

  init(data: { examId?: string } = {}): void {
    this.examId = data.examId ?? "";
    this.exam = examById(this.examId) ?? null;
    this.phaseNo = 1;
    this.introOpen = false;
    this.state = null;
    this.schedule = null;
    this.session = null;
    this.phaseSeed = 0;
    this.words = [];
    this.draft = null;
    this.checkpoint = null;
    this.baseRaw = "";
    this.lockToken = "";
    this.freshSitting = true;
    this.fxFrom = null;
    this.resultIds = [];
    this.inventorFresh = false;
  }

  preload(): void {
    if (this.exam) queueExamArt(this, this.exam);
  }

  create(): void {
    const save = getSave();
    const exam = this.exam;
    if (!save || !exam) {
      this.scene.start("stages");
      return;
    }
    const form = document.getElementById("spell-form");
    if (this.spellingSubmit) form?.removeEventListener("submit", this.spellingSubmit);
    const submit = (event: Event) => {
      event.preventDefault();
      this.submitSpelling();
    };
    this.spellingSubmit = submit;
    form?.addEventListener("submit", submit);
    this.events.off("shutdown", this.leave, this);
    this.events.off("destroy", this.leave, this);
    this.events.once("shutdown", this.leave, this);
    this.events.once("destroy", this.leave, this);
    this.lockToken = `exam-${Math.random().toString(36).slice(2)}`;
    if (!this.holdLock()) {
      this.notice(EXAM_LOCK_HELD, true);
      return;
    }
    this.time.addEvent({ delay: 8000, loop: true, callback: () => this.holdLock() });
    if (!this.alignDisk(save)) {
      this.notice(EXAM_SAVE_FAILED, true);
      return;
    }
    if (examRewardBlocked(this.checkpoint!, exam.id)) {
      this.notice(EXAM_REVIEW_BLOCK, true);
      return;
    }
    if (!examUnlocked(this.checkpoint!, exam)) {
      this.notice("先打败前面的章节守护者。", true);
      return;
    }
    const now = new Date();
    this.words = examCardPool(this.checkpoint!, exam, now, gradeIsOpen);
    if (this.words.length === 0) {
      this.notice(EXAM_NO_QUESTION, true, true);
      return;
    }
    this.phaseNo = resumeExamPhase(this.checkpoint!, exam);
    this.beginPhase();
    if (import.meta.env.DEV) {
      attachExamDev({
        closeIntro: () => this.closeIntro(),
        act: () => this.act(),
        continuePhase: () => this.continuePhase(),
        answerCorrect: () => {
          const question = this.state?.question;
          if (!question || this.introOpen) return;
          if (question.kind === "spelling") this.choose(question.answer);
          else this.choose(question.answerId);
        },
      });
    }
  }

  private holdLock(): boolean {
    const save = this.checkpoint ?? getSave();
    if (!save?.profileId || !this.lockToken) return false;
    return claimExamLock(browserStore, save.profileId, tabId(), Date.now(), this.lockToken) === this.lockToken;
  }

  private alignDisk(save: SaveData): boolean {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return false;
    const stamped = serialize(save);
    if (raw !== stamped) {
      if (!commitExamSnapshot(browserStore, SAVE_KEY, raw, stamped)) return false;
      commit(save);
    }
    this.baseRaw = localStorage.getItem(SAVE_KEY) ?? stamped;
    this.checkpoint = getSave();
    this.draft = this.checkpoint;
    return this.checkpoint !== null;
  }

  private beginPhase(): void {
    const exam = this.exam;
    const save = this.checkpoint;
    if (!exam || !save) return;
    const cleared = save.examProgress?.[exam.id]?.cleared === true;
    this.session = this.freshSitting ? storedSession(save, exam.id, cleared) : this.session ?? storedSession(save, exam.id, false);
    const losses = lossesForPhase(save, exam.id, this.phaseNo);
    const hp = examPhaseHp(save.player.classId, exam.kind, losses);
    const run = readPhaseRun(save, exam.id, this.phaseNo);
    this.phaseSeed = run ? run.seed : (Date.now() + this.phaseNo * 17) % 1_000_000;
    this.schedule = run ? scheduleFromPhaseRun(run, this.words) : scheduleForPhase(exam, this.session, losses, this.words);
    this.state = startBattle({
      encounterId: exam.id,
      classId: save.player.classId,
      learnedIds: this.words.map((word) => word.id),
      equippedSkillIds: save.equippedSkillIds,
      skillLevels: save.skillLevels,
      unlockedSkillIds: save.unlockedSkillIds,
      seed: this.phaseSeed,
      enemy: { name: examEnemyName(exam.kind), maxHp: hp, attack: EXAM_ATTACK, sprite: exam.id },
      phases: [{ hp, note: "" }],
      examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: examSpellingCounter(exam.grade) },
      examSchedule: this.schedule,
    });
    if (run) this.state = resumeExamBattle(this.state, run, this.words);
    else {
      this.persistPhase(null);
      if (this.draft) this.persist(this.draft);
    }
    this.introOpen = true;
    this.drawIntro();
    this.time.delayedCall(EXAM_INTRO_MS, () => this.closeIntro());
  }

  private drawIntro(): void {
    const exam = this.exam;
    if (!exam) return;
    const parts = examIntroParts(true);
    this.wipe();
    const bg = examBackground(exam.kind);
    if (this.textures.exists(bg.key)) this.view?.add(this.add.image(640, 400, bg.key).setDisplaySize(1280, 800));
    else this.view?.add(this.add.rectangle(640, 400, 1280, 800, 0x143d2c));
    if (parts.hud || parts.phase || parts.question || parts.answers) return;
    const banner = exam.kind === "mid" ? "ui_exam_banner_midterm" : "ui_exam_banner_final";
    if (this.textures.exists(EXAM_UI_KEY)) {
      this.view?.add(this.add.image(640, 280, EXAM_UI_KEY, banner).setDisplaySize(880, 128));
    }
    const title = this.add.text(640, 280, examBannerTitle(exam), {
      fontFamily: FONT_BODY,
      fontSize: "36px",
      fontStyle: "700",
      color: "#fff8e8",
    }).setOrigin(0.5);
    this.view?.add(title);
    const zone = this.add.zone(640, 400, 1280, 800).setInteractive();
    zone.on("pointerup", () => {
      deliverExamPointer(this.introOpen, () => this.closeIntro());
    });
    this.view?.add(zone);
  }

  private closeIntro(): void {
    if (!this.introOpen) return;
    this.introOpen = false;
    this.time.delayedCall(0, () => {
      if (!this.introOpen) this.drawFight();
    });
  }

  private drawFight(): void {
    const exam = this.exam;
    const state = this.state;
    if (!exam || !state || this.introOpen) return;
    const parts = examIntroParts(false);
    this.wipe();
    const bg = examBackground(exam.kind);
    if (this.textures.exists(bg.key)) this.view?.add(this.add.image(640, 400, bg.key).setDisplaySize(1280, 800));
    else this.view?.add(this.add.rectangle(640, 400, 1280, 800, 0x143d2c));
    const boss = new ExamBossSprite(this, EXAM_BOSS_X, EXAM_BOSS_Y, exam);
    const pose = state.phase === "won" ? "defeat" : state.phase === "lost" ? "hit" : "idle";
    boss.show(this.phaseNo, pose, this.fxFrom);
    this.fxFrom = null;
    this.view?.add(boss.root);
    if (parts.hud) {
      const name = battleEnemyName(state.enemyName, 0, exam.phases, true);
      this.view?.add(this.add.text(760, 56, name, {
        fontFamily: FONT_BODY,
        fontSize: "28px",
        fontStyle: "700",
        color: "#fff8e8",
      }).setOrigin(0, 0.5));
    }
    if (parts.phase && this.textures.exists(EXAM_UI_KEY)) {
      for (let index = 1; index <= exam.phases; index += 1) {
        const frame = index < this.phaseNo ? "ui_exam_phase_dot_done" : index === this.phaseNo ? "ui_exam_phase_dot_active" : "ui_exam_phase_dot_idle";
        this.view?.add(this.add.image(760 + (index - 1) * 40, 100, EXAM_UI_KEY, frame).setDisplaySize(28, 28));
      }
      this.view?.add(this.add.text(760, 132, `第 ${this.phaseNo} 段`, {
        fontFamily: FONT_BODY,
        fontSize: "18px",
        color: "#fff8e8",
      }));
    }
    if (state.shaken && state.phase === "question") {
      this.view?.add(this.add.text(760, 168, examShakenLine(state.enemyName, this.phaseNo >= exam.phases), {
        fontFamily: FONT_BODY,
        fontSize: "18px",
        color: "#fff8e8",
        wordWrap: cjkWrap(420),
      }));
    }
    if (this.view) {
      paintAnswerReveal(this, state.answerReveal, {
        hidden: state.phase === "question",
        parent: this.view,
        plate: true,
        x: EXAM_ANSWER_REVEAL.x,
        y: EXAM_ANSWER_REVEAL.y,
        width: EXAM_ANSWER_REVEAL.width,
      });
    }
    if (state.phase === "choose") this.textButton(640, 700, "攻击", () => this.act());
    if (parts.question && parts.answers && state.phase === "question" && state.question) {
      this.view?.add(this.add.text(160, 560, state.question.prompt, {
        fontFamily: FONT_BODY,
        fontSize: "28px",
        fontStyle: "700",
        color: "#fff8e8",
        wordWrap: cjkWrap(960),
      }));
      if (state.question.kind === "spelling") {
        this.view?.add(this.add.text(160, 620, spellingInstruction(state.question.answer), {
          fontFamily: FONT_BODY,
          fontSize: "18px",
          color: "#fff8e8",
          wordWrap: cjkWrap(700),
        }));
        document.getElementById("spell-form")?.classList.add("open");
        showSpellingHint(state.question.answer);
        const input = document.getElementById("spell-input");
        if (input instanceof HTMLInputElement) window.setTimeout(() => input.focus(), 30);
      } else {
        state.question.choices.forEach((choice, index) => {
          this.textButton(320 + (index % 2) * 360, 640 + Math.floor(index / 2) * 70, choice.label, () => this.choose(choice.id));
        });
      }
    }
  }

  private act(): void {
    if (this.introOpen || !this.state || this.state.phase !== "choose") return;
    const asked = takeAction(this.state, { type: "attack" });
    if (!asked.ok || !asked.state.question) {
      this.notice(asked.reason === EXAM_NO_QUESTION ? EXAM_NO_QUESTION : (asked.reason ?? EXAM_NO_QUESTION), true, true);
      return;
    }
    this.state = asked.state;
    this.schedule = asked.state.examSchedule;
    const question = this.state.question;
    this.persistPhase(question ? { wordId: question.wordId, kind: question.kind === "spelling" ? "spelling" : "meaning" } : null);
    if (this.draft) this.persist(this.draft);
    this.drawFight();
  }

  private choose(choiceId: string): void {
    if (this.introOpen || !this.state || this.state.phase !== "question" || !this.state.question || !this.draft) return;
    const question = this.state.question;
    this.state = answerQuestion(this.state, choiceId);
    this.schedule = this.state.examSchedule;
    const correct = question.kind === "spelling" ? checkSpelling(question.answer, choiceId) : choiceId === question.answerId;
    this.draft = noteExamAnswer(this.draft, {
      wordId: question.wordId,
      correct,
      now: new Date(),
      dueAtStart: this.words.filter((word) => word.due).map((word) => word.id),
      spelling: question.kind === "spelling",
    });
    this.persistPhase(null);
    this.persist(this.draft);
    document.getElementById("spell-form")?.classList.remove("open");
    showSpellingHint(null);
    if (this.state.phase === "won" || this.state.phase === "lost" || this.state.playerHp <= 0) {
      this.finishPhase(this.state.phase === "won" && this.state.playerHp > 0);
      return;
    }
    this.state = armExamShaken(this.state);
    this.drawFight();
  }

  private submitSpelling(): void {
    const question = this.state?.question;
    if (!question || question.kind !== "spelling" || this.introOpen) return;
    const input = document.getElementById("spell-input");
    const typed = input instanceof HTMLInputElement ? input.value : "";
    if (input instanceof HTMLInputElement) input.value = "";
    const correct = checkSpelling(question.answer, typed);
    this.choose(correct ? question.answer : "miss");
  }

  private finishPhase(won: boolean): void {
    const exam = this.exam;
    const schedule = this.schedule;
    const draft = this.draft;
    if (!exam || !schedule || !draft) return;
    const result = settleExamAttempt(draft, {
      examId: exam.id,
      phaseNo: this.phaseNo,
      now: Date.now(),
      won,
      schedule,
      persistedRaw: this.baseRaw,
    });
    if (!result.ok || !this.persist(result.save)) {
      this.notice(result.reason === "review" ? EXAM_REVIEW_BLOCK : EXAM_SAVE_FAILED, true);
      return;
    }
    this.session = result.save.examProgress?.[exam.id]?.session ?? this.session;
    this.freshSitting = false;
    if (!won) {
      this.notice("休息一下", true);
      return;
    }
    this.resultIds = result.titleNewIds;
    this.inventorFresh = result.inventorFresh;
    if (result.titleNewIds.length > 0 || this.phaseNo >= exam.phases) {
      this.results(result.xpGained, result.alreadyPassed);
      return;
    }
    this.intermission();
  }

  private persistPhase(pending: ExamPhaseRunRecord["pending"]): void {
    const exam = this.exam;
    const draft = this.draft;
    const schedule = this.schedule;
    if (!exam || !draft || !schedule) return;
    this.draft = writePhaseRun(draft, exam.id, phaseRunFromSchedule(schedule, {
      phaseNo: this.phaseNo,
      seed: this.phaseSeed,
      casts: this.state?.casts ?? 0,
      pending,
    }));
  }

  private persist(next: SaveData): boolean {
    const raw = serialize(next);
    if (!commitExamSnapshot(browserStore, SAVE_KEY, this.baseRaw, raw)) return false;
    commit(next);
    this.baseRaw = localStorage.getItem(SAVE_KEY) ?? raw;
    this.checkpoint = next;
    this.draft = next;
    return true;
  }

  private intermission(): void {
    this.wipe();
    this.view?.add(this.add.rectangle(640, 400, 1280, 800, 0x143d2c, 0.92));
    this.view?.add(this.add.text(640, 300, "休息一下", {
      fontFamily: FONT_BODY,
      fontSize: "36px",
      color: "#fff8e8",
    }).setOrigin(0.5));
    this.textButton(460, 460, "继续", () => this.continuePhase());
    this.textButton(820, 460, "休息一下", () => this.scene.start("stages"));
  }

  private continuePhase(): void {
    const exam = this.exam;
    if (!exam || this.phaseNo >= exam.phases) return;
    this.fxFrom = this.phaseNo;
    this.phaseNo += 1;
    this.beginPhase();
  }

  private results(xpGained: number, alreadyPassed: boolean): void {
    const save = this.checkpoint;
    this.wipe();
    this.view?.add(this.add.rectangle(640, 400, 1280, 800, 0x143d2c, 0.94));
    const done = this.exam !== null && this.phaseNo >= this.exam.phases;
    const headline = done
      ? this.exam?.kind === "mid" ? "期中挑战完成啦！" : "学期挑战完成啦！"
      : "新称号收好啦！";
    const line = alreadyPassed || this.resultIds.length === 0 ? "又完成一次挑战！" : "新称号收好啦！";
    this.view?.add(this.add.text(640, 150, headline, {
      fontFamily: FONT_BODY,
      fontSize: "40px",
      fontStyle: "700",
      color: "#fff8e8",
    }).setOrigin(0.5));
    this.view?.add(this.add.text(640, 220, `${line}  经验 +${xpGained}`, {
      fontFamily: FONT_BODY,
      fontSize: "24px",
      color: "#fff8e8",
    }).setOrigin(0.5));
    this.resultIds.forEach((id, index) => {
      const text = titlePartText(id) ?? "";
      this.view?.add(this.add.text(640, 280 + index * 36, text, {
        fontFamily: FONT_BODY,
        fontSize: "28px",
        color: "#ffe08a",
      }).setOrigin(0.5));
    });
    if (this.resultIds.length > 0 && save) {
      this.view?.add(this.add.text(640, 460, "要戴上这个称号？", {
        fontFamily: FONT_BODY,
        fontSize: "22px",
        color: "#fff8e8",
      }).setOrigin(0.5));
      this.textButton(460, 540, "现在戴上", () => this.wear());
      this.textButton(820, 540, "先收好", () => this.afterTitle());
    } else if (done) {
      this.textButton(640, 540, "回地图", () => this.afterTitle());
    } else {
      this.textButton(640, 540, "继续", () => this.afterTitle());
    }
  }

  private wear(): void {
    const save = this.checkpoint;
    if (!save) return;
    const prefix = this.resultIds.find((id) => id.startsWith("p_")) ?? save.titleParts?.equipped.prefixId ?? null;
    const suffix = this.resultIds.find((id) => id.startsWith("s_")) ?? save.titleParts?.equipped.suffixId ?? null;
    const equipped = equipTitleParts(save, prefix, suffix);
    if (!this.persist(this.presentReceipts(equipped))) {
      this.notice(EXAM_SAVE_FAILED, true);
      return;
    }
    this.wipe();
    this.view?.add(this.add.text(640, 320, "称号换好啦！", {
      fontFamily: FONT_BODY,
      fontSize: "36px",
      color: "#fff8e8",
    }).setOrigin(0.5));
    this.textButton(640, 460, "继续", () => this.afterTitle());
  }

  private afterTitle(): void {
    const save = this.checkpoint;
    if (save) {
      const presented = this.presentReceipts(save);
      if (presented !== save) this.persist(presented);
    }
    if (this.inventorFresh) {
      this.inventorCard();
      return;
    }
    if (this.exam && this.phaseNo < this.exam.phases) {
      this.intermission();
      return;
    }
    this.scene.start("stages");
  }

  private inventorCard(): void {
    this.wipe();
    this.view?.add(this.add.rectangle(640, 400, 760, 360, 0xf6efe2));
    this.view?.add(this.add.text(640, 300, INVENTOR_UNLOCK_MAIN, {
      fontFamily: FONT_BODY,
      fontSize: "28px",
      color: INK,
      align: "center",
      wordWrap: cjkWrap(640),
    }).setOrigin(0.5));
    this.view?.add(this.add.text(640, 380, INVENTOR_UNLOCK_SUB, {
      fontFamily: FONT_BODY,
      fontSize: "20px",
      color: INK,
    }).setOrigin(0.5));
    this.textButton(480, 500, INVENTOR_UNLOCK_GO, () => this.finishInventor("skills"));
    this.textButton(800, 500, INVENTOR_UNLOCK_LATER, () => this.finishInventor("stages"));
  }

  private finishInventor(next: string): void {
    const save = this.checkpoint;
    if (save) {
      const marked = markInventorUnlockPresented(save);
      if (!this.persist(marked)) {
        this.notice(EXAM_SAVE_FAILED, true);
        return;
      }
    }
    this.inventorFresh = false;
    this.scene.start(next);
  }

  private presentReceipts(save: SaveData): SaveData {
    let next = save;
    for (const receipt of Object.values(save.titleReceipts ?? {})) {
      if (receipt.status === "pending" && receipt.newPartIds.some((id) => this.resultIds.includes(id))) {
        next = markTitleReceiptPresented(next, receipt.eventId);
      }
    }
    return next;
  }

  private notice(message: string, map: boolean, academy = false): void {
    this.wipe();
    this.view?.add(this.add.rectangle(640, 400, 1280, 800, 0x143d2c));
    this.view?.add(this.add.text(640, 300, message, {
      fontFamily: FONT_BODY,
      fontSize: "28px",
      color: "#fff8e8",
      align: "center",
      wordWrap: cjkWrap(880),
    }).setOrigin(0.5));
    if (map) this.textButton(academy ? 460 : 640, 520, "回地图", () => this.scene.start("stages"));
    if (academy) this.textButton(820, 520, "去学堂", () => this.scene.start("learn"));
  }

  private textButton(x: number, y: number, label: string, onClick: () => void): void {
    const width = Math.max(180, label.length * 28);
    const rect = this.add.rectangle(x, y, width, 56, 0xf4e2b8).setStrokeStyle(3, 0x6b4a2a).setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, { fontFamily: FONT_BODY, fontSize: "22px", color: INK }).setOrigin(0.5);
    rect.on("pointerup", onClick);
    this.view?.add(rect);
    this.view?.add(text);
  }

  private wipe(): void {
    document.getElementById("spell-form")?.classList.remove("open");
    showSpellingHint(null);
    this.view?.destroy(true);
    this.view = this.add.container(0, 0);
  }

  private leave(): void {
    const form = document.getElementById("spell-form");
    if (this.spellingSubmit) form?.removeEventListener("submit", this.spellingSubmit);
    this.spellingSubmit = null;
    form?.classList.remove("open");
    showSpellingHint(null);
    if (this.lockToken) {
      releaseExamLock(browserStore, this.lockToken);
      this.lockToken = "";
    }
    if (import.meta.env.DEV) {
      detachExamDev();
    }
  }
}
