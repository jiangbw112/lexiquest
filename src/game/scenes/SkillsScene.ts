import Phaser from "phaser";
import { classById } from "../../domain/classes";
import { PROVISIONAL } from "../../domain/provisional";
import { equipSkill, unequipSkill } from "../../domain/progress";
import { MAX_EQUIPPED_SKILLS, skillEnergyCost, skillsInEquipOrder } from "../../domain/skills";
import { skillIconFrame, skillLevelFrame, skillOrderFrame } from "../../domain/skill-card-face";
import { probeEnter } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, paper } from "../ui";
import { warmButton, warmPanel, warmSlice, warmToast } from "../warm/kit";
import { paintRoom, queueWarm } from "../warm/load";
import { INK, MUTED, NOTE, PLUM } from "../warm/theme";

export class SkillsScene extends Phaser.Scene {
  private message = "";

  constructor() {
    super("skills");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_battle", "atlas_skills", "atlas_ui_pages"], ["bg_room"]);
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
    if (!paintRoom(this)) paper(this);
    warmPanel(this, 640, 400, 1040, 740);
    const hero = classById(save.player.classId);
    const rules = PROVISIONAL.skillCards;
    this.add.text(160, 48, "技能卡", { fontFamily: FONT, fontSize: "36px", color: INK });
    this.add.text(160, 96, `技能卡不绑定单词。最多带 ${MAX_EQUIPPED_SKILLS} 张。空位会补上更弱的基础招式，比例 ${rules.baseSkillPowerScale}，能量 ${rules.baseSkillEnergyCost}。答错效果 ×${rules.wrongAnswerMultiplier}。这是这一版定下的数字。`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: MUTED,
      wordWrap: { width: 960 },
    });
    skillsInEquipOrder(save.player.classId, save.equippedSkillIds).forEach((skill, index) => {
      const top = 196 + index * 116;
      const y = top + 52;
      warmSlice(this, "atlas_ui_pages", "list_row", 980, 104).setPosition(640, y);
      const unlocked = save.unlockedSkillIds.includes(skill.id);
      const equippedIndex = save.equippedSkillIds.indexOf(skill.id);
      const equipped = equippedIndex >= 0;
      const level = Math.min(3, Math.max(1, save.skillLevels[skill.id] ?? 1));
      const icon = skillIconFrame(skill.id);
      if (this.textures.get("atlas_skills").has(icon)) {
        this.add.image(174 + 34, top + 14 + 34, "atlas_skills", icon).setScale(68 / 96);
      }
      this.add.image(224 + 16, top + 62 + 16, "atlas_battle", skillLevelFrame(level)).setScale(32 / 80);
      const nameText = this.add.text(270, top + 16, skill.name, { fontFamily: FONT, fontSize: "24px", fontStyle: "700", color: unlocked ? INK : PLUM });
      this.add.text(nameText.x + nameText.width + 10, top + 22, `Lv ${level}`, { fontFamily: FONT, fontSize: "18px", color: NOTE });
      const cost = skillEnergyCost(skill, hero);
      for (let i = 0; i < cost; i += 1) {
        this.add.image(280 + i * 22, top + 78, "atlas_battle", "energy_pip_cost").setScale(0.5);
      }
      this.add.text(280 + cost * 22 + 8, top + 68, skill.description, { fontFamily: FONT, fontSize: "16px", color: MUTED });
      if (equipped) {
        this.add.image(150 + 980 - 36, top + 28, "atlas_battle", skillOrderFrame(equippedIndex + 1)).setScale(48 / 88);
      }
      if (!unlocked) return;
      warmButton(this, 1040, y, equipped ? "卸下" : "装备", () => {
        if (equipped) {
          mutate((current) => unequipSkill(current, skill.id));
          this.message = "";
        } else {
          const result = equipSkill(getSave()!, skill.id);
          if (!result.ok) this.message = "已经装备 3 张。要换一张，先卸下一张。";
          else {
            mutate(() => result.save);
            this.message = "";
          }
        }
        this.draw();
      }, { width: 120, height: 56, tone: equipped ? "secondary" : "primary" });
    });
    if (this.message) warmToast(this, this.message, "err");
    warmButton(this, 250, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, tone: "secondary" });
  }
}
