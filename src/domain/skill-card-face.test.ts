import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  battleControlOpen,
  skillCardFace,
  skillCardFrame,
  skillCardInput,
  skillCardInteractive,
  skillIconFrame,
  skillLevelFrame,
  skillListFace,
  skillOrderFrame,
  skillSlotIndexForKey,
  starMark,
} from "./skill-card-face";

describe("skill card faces", () => {
  it("writes a card level as a star, not Lv", () => {
    expect(starMark(1)).toBe("★1");
    expect(starMark(2)).toBe("★2");
    expect(starMark(3)).toBe("★3");
    const page = readFileSync(new URL("../game/scenes/SkillsScene.ts", import.meta.url), "utf8");
    expect(page).toContain("starMark(mark.level)");
    expect(page).not.toContain("Lv ");
  });

  it("keeps a low-energy card clickable and ignores a disabled card", () => {
    const low = skillCardFace({ phase: "choose", energy: 0, energyCost: 2 });
    const blocked = skillCardFace({ phase: "question", energy: 6, energyCost: 1 });
    expect(low).toBe("low_energy");
    expect(blocked).toBe("disabled");
    expect(skillCardInteractive(low)).toBe(true);
    expect(skillCardInteractive(blocked)).toBe(false);
    expect(skillCardInput(low, "click")).toBe("low-energy");
    expect(skillCardInput(blocked, "click")).toBe("ignore");
    expect(skillCardFrame(low, "equipped", 2)).toBe("card_frame_disabled");
    expect(skillCardFrame(blocked, "equipped", 3)).toBe("card_frame_disabled");
  });

  it("treats keys 4, 5 and 6 like a click in both states", () => {
    expect(skillSlotIndexForKey("Digit4")).toBe(0);
    expect(skillSlotIndexForKey("Digit5")).toBe(1);
    expect(skillSlotIndexForKey("Digit6")).toBe(2);
    const low = skillCardFace({ phase: "choose", energy: 1, energyCost: 3 });
    for (const phase of ["question", "won", "lost"] as const) {
      const face = skillCardFace({ phase, energy: 6, energyCost: 0 });
      expect(skillCardInput(face, "key")).toBe("ignore");
      expect(skillCardInput(face, "click")).toBe("ignore");
    }
    expect(skillCardInput(low, "key")).toBe("low-energy");
    expect(skillCardInput(low, "click")).toBe("low-energy");
    const ready = skillCardFace({ phase: "choose", energy: 2, energyCost: 2 });
    expect(skillCardInput(ready, "key")).toBe("cast");
    expect(skillCardInput(ready, "click")).toBe("cast");
    const resolving = skillCardFace({ phase: "choose", energy: 6, energyCost: 1, resolving: true });
    expect(resolving).toBe("disabled");
    expect(skillCardFrame(resolving, "equipped", 2)).toBe("card_frame_disabled");
    expect(skillCardInteractive(resolving)).toBe(false);
    expect(skillCardInput(resolving, "click")).toBe("ignore");
    expect(skillCardInput(resolving, "key")).toBe("ignore");
    expect(battleControlOpen("choose", "skill", true)).toBe(false);
    expect(battleControlOpen("choose", "action", true)).toBe(false);
    expect(battleControlOpen("lost", "leave", false)).toBe(true);
    expect(battleControlOpen("won", "skill")).toBe(false);
  });

  it("shows a lock and no level until a card is owned, then the saved level", () => {
    expect(skillListFace({ unlocked: false, level: 1 })).toEqual({ showLevel: false, showLock: true, level: null });
    expect(skillListFace({ unlocked: false, level: undefined })).toEqual({ showLevel: false, showLock: true, level: null });
    expect(skillListFace({ unlocked: true, level: 3 })).toEqual({ showLevel: true, showLock: false, level: 3 });
    expect(skillListFace({ unlocked: true, level: 2 })).toEqual({ showLevel: true, showLock: false, level: 2 });
    expect(skillListFace({ unlocked: true, level: undefined })).toEqual({ showLevel: true, showLock: false, level: 1 });
  });

  it("maps level frames, dot badges and icon names", () => {
    expect(skillCardFrame("ready", "base", null)).toBe("card_frame_base");
    expect(skillCardFrame("ready", "equipped", 1)).toBe("card_frame_bronze");
    expect(skillCardFrame("ready", "equipped", 2)).toBe("card_frame_silver");
    expect(skillCardFrame("ready", "equipped", 3)).toBe("card_frame_gold");
    expect(skillLevelFrame(1)).toBe("card_lv_badge_bronze");
    expect(skillLevelFrame(2)).toBe("card_lv_badge_silver");
    expect(skillLevelFrame(3)).toBe("card_lv_badge_gold");
    expect(skillOrderFrame(1)).toBe("equip_order_1");
    expect(skillOrderFrame(2)).toBe("equip_order_2");
    expect(skillOrderFrame(3)).toBe("equip_order_3");
    expect(skillIconFrame("warrior-bash")).toBe("skill_warrior_bash");
    expect(skillIconFrame("warrior-base")).toBe("skill_base");
  });

  it("closes the action row while a question is open and leaves only the answers", () => {
    for (const control of ["action", "skill", "leave"] as const) {
      expect(battleControlOpen("question", control)).toBe(false);
    }
    expect(battleControlOpen("question", "answer")).toBe(true);
    expect(battleControlOpen("choose", "action")).toBe(true);
    expect(battleControlOpen("choose", "skill")).toBe(true);
    expect(battleControlOpen("choose", "answer")).toBe(false);
    expect(battleControlOpen("won", "leave")).toBe(true);
    expect(battleControlOpen("lost", "skill")).toBe(false);
    const scene = readBattle();
    expect(scene).toContain("blocker.setInteractive()");
    expect(scene).toContain('blocker.input.cursor = "default"');
    expect(scene).toContain('battleControlOpen(this.state.phase, "answer", inputLocked)');
    expect(scene).toContain('battleControlOpen(this.state.phase, "action", inputLocked)');
    expect(scene).toContain("this.resolving || this.lunging");
    expect(scene).not.toContain("外形暂用墨团");
  });
});

function readBattle(): string {
  return readFileSync(new URL("../game/scenes/BattleScene.ts", import.meta.url), "utf8");
}
