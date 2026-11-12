import Phaser from "phaser";
import { classById } from "../../domain/classes";
import { equipSkill, unequipSkill } from "../../domain/progress";
import { MAX_EQUIPPED_SKILLS, showNoDamageHint, skillEnergyCost, skillsInEquipOrder } from "../../domain/skills";
import { skillIconFrame, skillLevelFrame, skillListFace, skillOrderFrame, starMark } from "../../domain/skill-card-face";
import { cjkWrap, parchmentTitleY } from "../layout";
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
    const titleY = parchmentTitleY(400, 740);
    this.add.text(160, titleY, "技能卡", { fontFamily: FONT, fontSize: "36px", color: INK });
    this.add.text(160, titleY + 48, `技能卡不绑定单词。最多带 ${MAX_EQUIPPED_SKILLS} 张。空位会补上基础招式。基础招式更弱，不花能量。答错时，效果只有答对的一半。`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: MUTED,
      wordWrap: cjkWrap(960),
    });
    if (showNoDamageHint(save.player.classId, save.equippedSkillIds)) {
      this.add.text(160, 158, "带一张攻击卡会更好打哦", { fontFamily: FONT, fontSize: "18px", color: NOTE });
    }
    skillsInEquipOrder(save.player.classId, save.equippedSkillIds).forEach((skill, index) => {
      const top = 196 + index * 116;
      const y = top + 52;
      warmSlice(this, "atlas_ui_pages", "list_row", 980, 104).setPosition(640, y);
      const unlocked = save.unlockedSkillIds.includes(skill.id);
      const equippedIndex = save.equippedSkillIds.indexOf(skill.id);
      const equipped = equippedIndex >= 0;
      const mark = skillListFace({ unlocked, level: save.skillLevels[skill.id] });
      const icon = skillIconFrame(skill.id);
      if (this.textures.get("atlas_skills").has(icon)) {
        this.add.image(174 + 34, top + 14 + 34, "atlas_skills", icon).setScale(68 / 96);
      }
      if (mark.showLock) {
        this.add.image(224 + 16, top + 62 + 16, "atlas_ui_core", "icon_lock").setScale(32 / 96);
      } else if (mark.showLevel && mark.level != null) {
        this.add.image(224 + 16, top + 62 + 16, "atlas_battle", skillLevelFrame(mark.level)).setScale(32 / 80);
      }
      const nameText = this.add.text(270, top + 16, skill.name, { fontFamily: FONT, fontSize: "24px", fontStyle: "700", color: unlocked ? INK : PLUM });
      if (mark.showLevel && mark.level != null) {
        this.add.text(nameText.x + nameText.width + 10, top + 22, starMark(mark.level), { fontFamily: FONT, fontSize: "18px", color: NOTE });
      }
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
