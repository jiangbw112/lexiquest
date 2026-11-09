import Phaser from "phaser";
import { GRADE_BANDS, normalizeGrades } from "../../domain/catalog";
import { setSelectedGrades } from "../../domain/progress";
import { PROVISIONAL } from "../../domain/provisional";
import type { GradeBand } from "../../domain/types";
import { SAVE_CACHE_NOTICE, commit, getSave, mutate } from "../session";
import { DESKTOP_NOTE } from "../p0";
import { probeEnter, probeNote } from "../probe";
import { FONT, button, paper } from "../ui";

export class GuideScene extends Phaser.Scene {
  private confirming = false;
  private notice = "";

  constructor() {
    super("guide");
  }

  create(): void {
    probeEnter("guide");
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.code === "Escape") this.scene.start("overworld");
      if (event.code === "KeyY" && this.confirming) this.clearSave();
    });
    this.draw();
  }

  private toggleGrade(grade: GradeBand): void {
    const save = getSave();
    if (!save) return;
    const current = normalizeGrades(save.selectedGrades);
    let next = current.includes(grade) ? current.filter((item) => item !== grade) : [...current, grade];
    if (next.length === 0) {
      next = ["G3"];
      this.notice = "至少选一个年级。现在留下三年级。";
    } else {
      this.notice = "";
    }
    mutate((currentSave) => setSelectedGrades(currentSave, next));
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
    const mastery = PROVISIONAL.mastery;
    const skills = PROVISIONAL.skillCards;
    const lines = [
      DESKTOP_NOTE + "。这一版不做平板触摸。",
      "没有自由聊天，也没有真实货币购买。",
      SAVE_CACHE_NOTICE,
      "学会一个词立刻得到词卡。熟练徽章后来才亮，到了复习时间或答错 lapse 会变灰，答对后再亮。词卡不会被删掉。",
      `徽章阈值还没批准：至少 ${mastery.minDistinctCalendarDays} 个不同的日子（${mastery.timeZone}），稳定度 ≥ ${mastery.minStability}。同一天反复练习不会点亮。`,
      "技能卡不绑定单词，最多带 3 张。空位补基础招式。打出技能卡时，先从到期的已学单词抽题，没有到期就从学过的词里抽，不会用没学过的词。",
      `基础招式强度比例 ${skills.baseSkillPowerScale}，能量 ${skills.baseSkillEnergyCost}。PvE 答错只给基础效果 × ${skills.wrongAnswerMultiplier}。这些数字还没定稿。`,
      "好友 1v1：答对题数多的赢；题数相同，答对用时更少的赢。答错没有速度收益。同机练习不更新 FSRS。真正的联网对战要由服务器判房间、对错、时间和奖励。",
      "现在的词是 Forest Adventure 的 28 个 SAMPLE DATA，年级是估计，不是教材原文。发音用浏览器朗读，没有外购录音。",
    ];
    const save = getSave();
    this.add.text(160, 36, "给家长", { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
    this.add.text(160, 88, "学习年级可以多选。暂定：关掉年级后，已经收下的词卡和到期复习都还在。新的学堂和战斗出题只用现在选中的年级。", {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#8a5a12",
      wordWrap: { width: 960 },
    });
    const selected = save?.selectedGrades ?? ["G3"];
    GRADE_BANDS.forEach((grade, index) => {
      const on = selected.includes(grade.id);
      button(this, 250 + index * 200, 175, `${on ? "✓ " : ""}${grade.label}`, () => this.toggleGrade(grade.id), {
        width: 180,
        fill: on ? 0x1f7a4d : 0x5c6b62,
      });
    });
    if (this.notice) this.add.text(160, 214, this.notice, { fontFamily: FONT, fontSize: "16px", color: "#a33b24" });
    this.add.text(160, 248, lines.join("\n"), { fontFamily: FONT, fontSize: "15px", color: "#17352a", wordWrap: { width: 960 }, lineSpacing: 6 });
    button(this, 360, 700, this.confirming ? "再按一次清除 Y" : "清除这台浏览器的缓存", () => {
      if (!this.confirming) {
        this.confirming = true;
        this.draw();
        return;
      }
      this.clearSave();
    }, { width: 320, fill: 0x8c4a3a });
    button(this, 700, 700, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
  }
}
