import Phaser from "phaser";
import { GRADE_BANDS, normalizeGrades } from "../../domain/catalog";
import { ensureDailyGoal, parentView, setGoalPreset } from "../../domain/parent";
import {
  applyIfParentUnlocked,
  browserParentPinVault,
  cooldownLabel,
  createParentPinSession,
  pbkdf2PinGate,
  pinFormTitle,
  type ParentPinSession,
} from "../../domain/parent-pin";
import { gradePauseNotice, learnedCountInGrade, setSelectedGrades, studyNow } from "../../domain/progress";
import { PROVISIONAL } from "../../domain/provisional";
import type { GoalPreset, GradeBand } from "../../domain/types";
import { SAVE_CACHE_NOTICE, commit, getSave, mutate } from "../session";
import { DESKTOP_NOTE } from "../p0";
import { probeEnter, probeNote } from "../probe";
import { FONT, button, paper } from "../ui";

type GuideTab = "progress" | "notes";

const PRESETS: { id: GoalPreset; label: string }[] = [
  { id: "easy", label: "轻松" },
  { id: "normal", label: "标准" },
  { id: "more", label: "多一点" },
];

export class GuideScene extends Phaser.Scene {
  private confirming = false;
  private notice = "";
  private tab: GuideTab = "progress";
  private showAllStruggle = false;
  private pinSession!: ParentPinSession;
  private pinBusy = false;
  private pinNotice = "";

  constructor() {
    super("guide");
  }

  create(): void {
    probeEnter("guide");
    this.pinSession = createParentPinSession({ gate: pbkdf2PinGate, vault: browserParentPinVault() });
    this.pinBusy = false;
    mutate((save) => ensureDailyGoal(save, studyNow(save)));
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.code === "Escape") this.scene.start("overworld");
      if (event.code === "KeyY" && this.pinSession.unlocked && this.confirming && this.tab === "notes") this.clearSave();
    });
    this.bindPinForm();
    this.renderPinForm();
    const clock = window.setInterval(() => this.renderPinClock(), 1000);
    this.events.once("shutdown", () => window.clearInterval(clock));
    this.draw();
  }

  private bindPinForm(): void {
    const form = document.getElementById("pin-form");
    const forgot = document.getElementById("pin-forgot-button");
    const submit = (event: Event) => {
      event.preventDefault();
      void this.submitPin();
    };
    const startForgot = () => {
      this.pinSession.beginForgot();
      const error = document.getElementById("pin-error");
      if (error) error.textContent = "";
      for (const id of ["pin-input", "pin-confirm", "pin-answer"]) {
        const field = document.getElementById(id);
        if (field instanceof HTMLInputElement) field.value = "";
      }
      this.renderPinForm();
    };
    form?.addEventListener("submit", submit);
    forgot?.addEventListener("click", startForgot);
    this.events.once("shutdown", () => {
      form?.removeEventListener("submit", submit);
      forgot?.removeEventListener("click", startForgot);
      form?.classList.remove("open");
    });
  }

  private renderPinForm(): void {
    const form = document.getElementById("pin-form");
    const title = document.getElementById("pin-title");
    const error = document.getElementById("pin-error");
    const confirmLabel = document.getElementById("pin-confirm-label");
    const entry = document.getElementById("pin-entry");
    const forgot = document.getElementById("pin-forgot");
    const challenge = document.getElementById("pin-challenge");
    if (this.pinSession.unlocked) {
      form?.classList.remove("open");
      return;
    }
    form?.classList.add("open");
    if (title) title.textContent = pinFormTitle(this.pinSession.phase);
    confirmLabel?.classList.toggle("hidden", this.pinSession.phase !== "setup");
    entry?.classList.toggle("hidden", this.pinSession.phase === "forgot");
    forgot?.classList.toggle("hidden", this.pinSession.phase !== "forgot");
    if (challenge) challenge.textContent = this.pinSession.challenge ? `请计算 ${this.pinSession.challenge.prompt}` : "";
    if (error && !error.textContent) error.textContent = this.pinSession.notice ?? "";
    this.renderPinClock();
  }

  private renderPinClock(): void {
    const cooldown = document.getElementById("pin-cooldown");
    const submit = document.getElementById("pin-submit");
    const remaining = this.pinSession.cooldownRemaining(Date.now());
    const waiting = remaining > 0 && this.pinSession.phase !== "forgot";
    if (cooldown) cooldown.textContent = waiting ? cooldownLabel(remaining) : "";
    const error = document.getElementById("pin-error");
    if (!waiting && error?.textContent.startsWith("请等")) error.textContent = "";
    if (submit instanceof HTMLButtonElement) submit.disabled = waiting || this.pinBusy;
  }

  private async submitPin(): Promise<void> {
    if (this.pinBusy || this.pinSession.unlocked) return;
    const input = document.getElementById("pin-input");
    const confirm = document.getElementById("pin-confirm");
    const answer = document.getElementById("pin-answer");
    const error = document.getElementById("pin-error");
    const pin = input instanceof HTMLInputElement ? input.value.trim() : "";
    const again = confirm instanceof HTMLInputElement ? confirm.value.trim() : "";
    const typed = answer instanceof HTMLInputElement ? answer.value.trim() : "";
    this.pinBusy = true;
    this.renderPinClock();
    const result = this.pinSession.phase === "forgot"
      ? this.pinSession.submitForgot(typed, Date.now())
      : await this.pinSession.submitPin(pin, again, Date.now());
    this.pinBusy = false;
    if (error) error.textContent = result.ok ? (this.pinSession.notice ?? "") : result.message;
    if (input instanceof HTMLInputElement) input.value = "";
    if (confirm instanceof HTMLInputElement) confirm.value = "";
    if (answer instanceof HTMLInputElement) answer.value = "";
    if (result.ok && this.pinSession.unlocked) {
      if (this.pinSession.notice) this.pinNotice = this.pinSession.notice;
      this.draw();
    }
    this.renderPinForm();
  }

  private toggleGrade(grade: GradeBand): void {
    const save = getSave();
    if (!save) return;
    const current = normalizeGrades(save.selectedGrades);
    const turningOff = current.includes(grade);
    const learned = turningOff ? learnedCountInGrade(save, grade) : 0;
    let next = turningOff ? current.filter((item) => item !== grade) : [...current, grade];
    if (next.length === 0) {
      next = ["G3"];
      this.notice = "至少选一个年级。现在留下三年级。";
    } else if (turningOff && learned > 0) {
      const label = GRADE_BANDS.find((item) => item.id === grade)?.label ?? grade;
      this.notice = gradePauseNotice(label, learned);
    } else {
      this.notice = "";
    }
    mutate((currentSave) => applyIfParentUnlocked(this.pinSession.unlocked, currentSave, (save) => setSelectedGrades(save, next)));
    probeNote(`grades:${normalizeGrades(next).join(",")}`);
    this.draw();
  }

  private clearSave(): void {
    commit(null);
    this.scene.start("title");
  }

  private draw(): void {
    this.children.removeAll(true);
    paper(this);
    this.add.text(160, 40, "给家长", { fontFamily: FONT, fontSize: "32px", color: "#17352a" });
    if (!this.pinSession.unlocked) {
      this.add.text(160, 120, "改年级和改每日目标前要先输入家长密码。这是为了避免孩子不小心改掉。清掉浏览器数据后要重新设置。这不是安全登录。", {
        fontFamily: FONT,
        fontSize: "20px",
        color: "#17352a",
        wordWrap: { width: 960, useAdvancedWrap: true },
      });
      button(this, 280, 220, "返回 Esc", () => this.scene.start("overworld"), { width: 180, height: 48, fill: 0x5c6b62 });
      return;
    }
    button(this, 430, 48, "学习进度", () => this.show("progress"), {
      width: 170,
      height: 42,
      fill: this.tab === "progress" ? 0x1f7a4d : 0x5c6b62,
    });
    button(this, 620, 48, "说明与年级", () => this.show("notes"), {
      width: 190,
      height: 42,
      fill: this.tab === "notes" ? 0x1f7a4d : 0x5c6b62,
    });
    if (this.tab === "progress") this.drawProgress();
    else this.drawNotes();
  }

  private show(tab: GuideTab): void {
    this.tab = tab;
    this.draw();
  }

  private drawProgress(): void {
    const save = getSave();
    if (!save) return;
    const now = studyNow(save);
    const view = parentView(save, now, this.showAllStruggle ? 100 : undefined);
    probeNote(`parent:ready:${view.learnedToday}:${view.reviewedToday}:${view.dueNow}`);
    this.add.text(160, 88, "今天的学习", { fontFamily: FONT, fontSize: "28px", color: "#17352a" });
    this.add.text(360, 98, "数据只保存在这台电脑", { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e" });
    const cards = [
      `今天新学 ${view.learnedToday} 个`,
      `今天复习 ${view.reviewedToday} 个`,
      `现在待复习 ${view.dueNow} 个`,
    ];
    cards.forEach((label, index) => {
      this.add.rectangle(300 + index * 280, 168, 250, 58, 0xe7f6ee).setStrokeStyle(3, 0x17352a);
      this.add.text(300 + index * 280, 168, label, { fontFamily: FONT, fontSize: "20px", color: "#17352a" }).setOrigin(0.5);
    });
    this.add.text(160, 214, `${view.goalLine}  ·  ${view.daysLine}`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#1f7a4d",
      wordWrap: { width: 960 },
    });
    const note = this.pinNotice || view.clockNote || view.emptyLine || view.todayLine || (view.dueNow === 0 ? "太好了，暂时没有到期要复习的词。" : view.reminderLine);
    this.add.text(160, 246, note, { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e", wordWrap: { width: 960 } });
    this.add.text(160, 278, view.weekLine, { fontFamily: FONT, fontSize: "18px", color: "#17352a" });
    this.add.text(160, 308, `${view.firstMasteredLine}  ·  ${view.restoredMasteredLine}`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#17352a",
    });
    this.add.text(160, 338, `${view.masteredLine}  ${view.masteredNote}`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#17352a",
      wordWrap: { width: 960 },
    });
    this.add.text(160, 370, view.gradesLine, { fontFamily: FONT, fontSize: "18px", color: "#17352a" });
    this.add.text(160, 402, "每日目标从明天的新一天起改档。今天的数量不会变多。", {
      fontFamily: FONT,
      fontSize: "15px",
      color: "#8a5a12",
    });
    PRESETS.forEach((preset, index) => {
      const on = save.parentGoalPreset === preset.id;
      button(this, 230 + index * 150, 452, preset.label, () => {
        mutate((current) => applyIfParentUnlocked(this.pinSession.unlocked, current, (save) => setGoalPreset(save, preset.id)));
        this.draw();
      }, { width: 130, height: 42, fill: on ? 0x1f7a4d : 0x5c6b62 });
    });
    this.add.text(160, 498, view.struggleLine, { fontFamily: FONT, fontSize: "18px", color: "#17352a" });
    view.struggle.slice(0, this.showAllStruggle ? view.struggle.length : 4).forEach((word, index) => {
      this.add.text(180, 524 + index * 28, `${word.english}  ${word.meaning}  ·  ${word.hint}`, {
        fontFamily: FONT,
        fontSize: "16px",
        color: "#17352a",
      });
    });
    if (view.struggleTotal > 4) {
      button(this, 980, 500, this.showAllStruggle ? "收起" : "查看全部", () => {
        this.showAllStruggle = !this.showAllStruggle;
        this.draw();
      }, { width: 150, height: 40, fill: 0x5c6b62 });
    }
    button(this, 300, 700, "去复习", () => this.scene.start("review"), { width: 160, height: 48 });
    button(this, 500, 700, "修改年级", () => this.show("notes"), { width: 170, height: 48, fill: 0x8a5a12 });
    button(this, 720, 700, "返回 Esc", () => this.scene.start("overworld"), { width: 170, height: 48, fill: 0x5c6b62 });
  }


  private drawNotes(): void {
    const mastery = PROVISIONAL.mastery;
    const skills = PROVISIONAL.skillCards;
    const lines = [
      DESKTOP_NOTE + "。这一版不做平板触摸。",
      "没有自由聊天，也没有真实货币购买。",
      SAVE_CACHE_NOTICE,
      "学会一个词立刻得到词卡。熟练徽章后来才亮，到了复习时间或答错 lapse 会变灰，答对后再亮。词卡不会被删掉。",
      `熟练徽章：至少 ${mastery.minDistinctCalendarDays} 个不同的日子（${mastery.timeZone}），稳定度 ≥ ${mastery.minStability} 天。同一天反复练习不会点亮。`,
      "技能卡不绑定单词，最多带 3 张。空位补基础招式。打出技能卡时，只从现在选中的年级里抽题：先抽到期的，没有到期再从学过的词里抽。",
      `基础招式强度比例 ${skills.baseSkillPowerScale}，能量 ${skills.baseSkillEnergyCost}。PvE 答错只给基础效果 × ${skills.wrongAnswerMultiplier}。这是这一版定下的数字。`,
      "好友 1v1：答对题数多的赢；题数相同，答对用时更少的赢。答错没有速度收益。同机练习不更新 FSRS。真正的联网对战要由服务器判房间、对错、时间和奖励。",
      "森林冒险分五关。每关学完新词并赢一场小战斗才算通过。第五关是林心守护者，打败才通关。亮着的熟练徽章单独显示，不够 28 也不挡住通关。",
      "每天的学习目标按这台电脑当地时间凌晨 4 点换一天。完成目标只加一枚外观代币，不改战斗数值。改档和改年级共用一个家长密码，只为避免孩子不小心修改。清掉浏览器数据后要重新设置。这不是安全登录。忘记密码时答一道算术题即可重设，学习记录不会被清掉。",
      "现在的词是 Forest Adventure 的 28 个 SAMPLE DATA，年级是估计，不是教材原文。发音用浏览器朗读，这是这一版定下的做法。",
    ];
    const save = getSave();
    this.add.text(160, 96, this.notice || "学习年级可以多选。取消某个年级后，已学词卡还在册子里，战斗和到期复习会暂停，重新勾选就恢复。", {
      fontFamily: FONT,
      fontSize: "16px",
      color: this.notice ? "#a33b24" : "#8a5a12",
      wordWrap: { width: 960 },
    });
    const selected = save?.selectedGrades ?? ["G3"];
    GRADE_BANDS.forEach((grade, index) => {
      const on = selected.includes(grade.id);
      button(this, 250 + index * 200, 175, `${on ? "✓ " : ""}${grade.label}`, () => this.toggleGrade(grade.id), {
        width: 180,
        height: 46,
        fill: on ? 0x1f7a4d : 0x5c6b62,
      });
    });
    this.add.text(160, 230, lines.join("\n"), { fontFamily: FONT, fontSize: "15px", color: "#17352a", wordWrap: { width: 960, useAdvancedWrap: true }, lineSpacing: 5 });
    button(this, 360, 700, this.confirming ? "再按一次清除 Y" : "清除这台浏览器的缓存", () => {
      if (!this.confirming) {
        this.confirming = true;
        this.draw();
        return;
      }
      this.clearSave();
    }, { width: 320, height: 48, fill: 0x8c4a3a });
    button(this, 700, 700, "返回 Esc", () => this.scene.start("overworld"), { width: 180, height: 48, fill: 0x5c6b62 });
  }
}
