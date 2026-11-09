import Phaser from "phaser";
import { PROVISIONAL } from "../../domain/provisional";
import { SAVE_CACHE_NOTICE, commit } from "../session";
import { DESKTOP_NOTE } from "../p0";
import { probeEnter } from "../probe";
import { FONT, button, paper } from "../ui";

export class GuideScene extends Phaser.Scene {
  private confirming = false;

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
    this.add.text(160, 40, "给家长", { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
    this.add.text(160, 100, lines.join("\n\n"), { fontFamily: FONT, fontSize: "16px", color: "#17352a", wordWrap: { width: 960 }, lineSpacing: 4 });
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
