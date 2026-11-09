import Phaser from "phaser";
import { classById } from "../../domain/classes";
import { PROVISIONAL } from "../../domain/provisional";
import { equipSkill, unequipSkill } from "../../domain/progress";
import { MAX_EQUIPPED_SKILLS, skillEnergyCost, skillsForClass } from "../../domain/skills";
import { probeEnter } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, paper } from "../ui";

export class SkillsScene extends Phaser.Scene {
  private message = "";

  constructor() {
    super("skills");
  }

  create(): void {
    if (!getSave()) {
      this.scene.start("title");
      return;
    }
    probeEnter("skills");
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("overworld"));
    this.draw();
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    paper(this);
    const hero = classById(save.player.classId);
    const rules = PROVISIONAL.skillCards;
    this.add.text(160, 40, "技能卡", { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
    this.add.text(160, 90, `技能卡不绑定单词。最多带 ${MAX_EQUIPPED_SKILLS} 张。空位会补上更弱的基础招式，比例 ${rules.baseSkillPowerScale}，能量 ${rules.baseSkillEnergyCost}。答错效果 ×${rules.wrongAnswerMultiplier}。这些数字还没定稿。`, {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#3d5c4e",
      wordWrap: { width: 960 },
    });
    if (save.equippedSkillIds.length >= MAX_EQUIPPED_SKILLS) {
      this.add.text(160, 160, "已经装备 3 张。要换一张，先卸下一张。", { fontFamily: FONT, fontSize: "18px", color: "#8a5a12" });
    }
    if (this.message) this.add.text(160, 190, this.message, { fontFamily: FONT, fontSize: "18px", color: "#a33b24" });
    skillsForClass(save.player.classId).forEach((skill, index) => {
      const y = 240 + index * 90;
      const unlocked = save.unlockedSkillIds.includes(skill.id);
      const equipped = save.equippedSkillIds.includes(skill.id);
      this.add.text(180, y, `${skill.name}  能量 ${skillEnergyCost(skill, hero)}`, { fontFamily: FONT, fontSize: "24px", color: unlocked ? "#17352a" : "#8a918c" });
      this.add.text(180, y + 32, skill.description, { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e" });
      if (!unlocked) return;
      button(this, 980, y + 16, equipped ? "卸下" : "装备", () => {
        if (equipped) {
          mutate((current) => unequipSkill(current, skill.id));
          this.message = "";
        } else {
          const result = equipSkill(getSave()!, skill.id);
          if (!result.ok) this.message = "已经装备 3 张。要换一张，先卸下一张。";
          else mutate(() => result.save);
        }
        this.draw();
      }, { width: 120, height: 44, fill: equipped ? 0x5c6b62 : 0x1f7a4d });
    });
    button(this, 250, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
  }
}
