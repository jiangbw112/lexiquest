import Phaser from "phaser";
import { CLASSES, classById } from "../../domain/classes";
import { CLASS_SWITCH_BUTTON, CLASS_SWITCH_HINT } from "../../domain/class-copy";
import {
  INVENTOR_LOCK_BUTTON,
  INVENTOR_LOCK_NOTE,
  INVENTOR_LOCK_TIP,
  INVENTOR_LOCK_TITLE,
  isClassUnlocked,
} from "../../domain/class-unlock";
import { equipSkill, switchClass, unequipSkill } from "../../domain/progress";
import { MAX_EQUIPPED_SKILLS, showNoDamageHint, skillEnergyCost, skillsInEquipOrder } from "../../domain/skills";
import { skillIconFrame, skillLevelFrame, skillListFace, skillOrderFrame, starMark } from "../../domain/skill-card-face";
import { PORTRAIT_LOCKED_ATLAS, PORTRAIT_LOCKED_FRAME, portraitFrame } from "../art/class-atlas";
import { queueClassPortraits } from "../art/class-load";
import { cjkWrap, parchmentTitleY } from "../layout";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, paper } from "../ui";
import { warmButton, warmPanel, warmSlice, warmToast } from "../warm/kit";
import { paintRoom, queueWarm } from "../warm/load";
import { INK, MUTED, NOTE, PLUM } from "../warm/theme";

export class SkillsScene extends Phaser.Scene {
  private message = "";
  private switching = false;
  private lockOpen = false;

  constructor() {
    super("skills");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_battle", "atlas_skills", "atlas_ui_pages"], ["bg_room"]);
    queueClassPortraits(this);
  }

  create(): void {
    if (!getSave()) {
      this.scene.start("title");
      return;
    }
    probeEnter("skills");
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.lockOpen) {
        this.lockOpen = false;
        this.draw();
        return;
      }
      if (this.switching) {
        this.switching = false;
        this.draw();
        return;
      }
      this.scene.start("overworld");
    });
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
    warmButton(this, 470, 730, CLASS_SWITCH_BUTTON, () => {
      this.switching = true;
      this.lockOpen = false;
      this.draw();
    }, { width: 160, height: 56 });
    this.add.text(620, 714, CLASS_SWITCH_HINT, {
      fontFamily: FONT,
      fontSize: "15px",
      color: MUTED,
      wordWrap: cjkWrap(420),
    });
    if (this.switching) this.drawSwitch();
    if (this.lockOpen) this.drawLockTip();
  }

  private drawSwitch(): void {
    const save = getSave();
    if (!save) return;
    const dim = this.add.rectangle(640, 400, 1280, 800, 0x2a2118, 0.5);
    dim.setInteractive();
    warmPanel(this, 640, 400, 1160, 560);
    this.add.text(640, 170, CLASS_SWITCH_BUTTON, { fontFamily: FONT, fontSize: "32px", color: INK }).setOrigin(0.5);
    this.add.text(640, 214, CLASS_SWITCH_HINT, { fontFamily: FONT, fontSize: "16px", color: MUTED }).setOrigin(0.5);
    CLASSES.forEach((def, index) => {
      const cx = 160 + index * 190;
      const unlocked = isClassUnlocked(def.id, save);
      const selected = unlocked && def.id === save.player.classId;
      const box = this.add.rectangle(cx, 400, 170, 250, unlocked ? 0xfff4dc : 0xc8bfb0, selected ? 0.96 : 0.55);
      box.setStrokeStyle(selected ? 6 : 2, selected ? 0xc4533a : 0x3b2a20);
      if (this.textures.exists(unlocked ? "cls:portraits" : PORTRAIT_LOCKED_ATLAS)) {
        const portrait = unlocked
          ? this.add.image(cx, 360, "cls:portraits", portraitFrame(def.id, "side"))
          : this.add.image(cx, 360, PORTRAIT_LOCKED_ATLAS, PORTRAIT_LOCKED_FRAME);
        portrait.setOrigin(0.5, 0.875);
        portrait.setScale(0.16);
      }
      this.add.text(cx, 430, unlocked ? def.name : INVENTOR_LOCK_TITLE, {
        fontFamily: FONT,
        fontSize: "18px",
        color: INK,
      }).setOrigin(0.5);
      this.add.text(cx, 462, unlocked ? def.blurb : INVENTOR_LOCK_NOTE, {
        fontFamily: FONT,
        fontSize: "13px",
        color: MUTED,
        align: "center",
        wordWrap: cjkWrap(150),
      }).setOrigin(0.5, 0);
      const zone = this.add.zone(cx, 400, 170, 250).setInteractive({ useHandCursor: true });
      zone.on("pointerup", () => this.pickClass(def.id));
    });
    probeNote("switch:open");
    warmButton(this, 640, 620, "返回", () => {
      this.switching = false;
      this.draw();
    }, { width: 160, tone: "secondary" });
  }

  private pickClass(id: Parameters<typeof switchClass>[1]): void {
    const save = getSave();
    if (!save) return;
    if (!isClassUnlocked(id, save)) {
      this.lockOpen = true;
      this.draw();
      return;
    }
    mutate((current) => switchClass(current, id, false));
    this.switching = false;
    this.message = "";
    this.draw();
  }

  /** 1.0.0 uses the long lock.tip. The later exam line stays unused on this page. */
  private drawLockTip(): void {
    probeNote("switch:lock");
    const dim = this.add.rectangle(640, 400, 1280, 800, 0x2a2118, 0.55).setDepth(20);
    dim.setInteractive();
    const panel = warmPanel(this, 640, 400, 760, 320);
    panel.setDepth(21);
    const copy = this.add.text(640, 360, INVENTOR_LOCK_TIP, {
      fontFamily: FONT,
      fontSize: "24px",
      color: INK,
      align: "center",
      wordWrap: cjkWrap(640),
    }).setOrigin(0.5).setDepth(22);
    const button = warmButton(this, 640, 490, INVENTOR_LOCK_BUTTON, () => {
      this.lockOpen = false;
      this.draw();
    }, { width: 160 });
    button.setDepth(22);
    copy.setDepth(22);
  }
}
