import { describe, expect, it } from "vitest";
import { noteForHandoff, planBattleNote, shownBattleNote } from "./battle-note";

const attack = "答对了，全力发动。攻击造成了伤害。受到了伤害。";
const wrong = "答错了，只有减弱的基础效果。攻击造成了伤害。受到了伤害。";
const heal = "答对了，全力发动。治疗恢复了体力。受到了伤害。";
const block = "答对了，全力发动。格挡挡下了下一次伤害。这次没有受到伤害。";
const strike = "答对了，全力发动。重击造成了伤害，并格挡。受到了伤害。";
const win = "答对了，全力发动。攻击造成了伤害。你赢了。";
const loss = "答对了，全力发动。攻击造成了伤害。受到了伤害。你先退下来。词卡都还在。";
const phase = "答对了，全力发动。攻击造成了伤害。林心守护者进入第二阶段。";
const fullHeal = "答对了，全力发动。体力已经满了。受到了伤害。";

describe("battle note follows the hit", () => {
  it("shows only the answer feedback when the lunge starts", () => {
    expect(shownBattleNote(attack, "start")).toBe("答对了，全力发动。");
    expect(shownBattleNote(attack, "start")).not.toContain("造成了伤害");
    expect(shownBattleNote(attack, "start")).not.toContain("受到了伤害");
    expect(shownBattleNote(wrong, "start")).toBe("答错了，只有减弱的基础效果。");
  });

  it("adds the attack sentence on the player hit and still hides the injury sentence", () => {
    const shown = shownBattleNote(attack, "player-hit");
    expect(shown).toBe("答对了，全力发动。攻击造成了伤害。");
    expect(shown).toContain("攻击造成了伤害");
    expect(shown).not.toContain("受到了伤害");
    expect(shownBattleNote(strike, "player-hit")).toBe("答对了，全力发动。重击造成了伤害，并格挡。");
    expect(shownBattleNote(strike, "player-hit")).not.toContain("受到了伤害");
  });

  it("adds the injury sentence when the monster hits", () => {
    expect(shownBattleNote(attack, "monster-hit")).toBe(attack);
    expect(shownBattleNote(attack, "monster-hit")).toContain("受到了伤害");
    expect(shownBattleNote(loss, "player-hit")).not.toContain("你先退下来");
    expect(shownBattleNote(loss, "monster-hit")).toBe(loss);
  });

  it("puts heal and block sentences on their own beat, before the counter sentence", () => {
    expect(shownBattleNote(heal, "start")).toBe("答对了，全力发动。");
    expect(shownBattleNote(heal, "player-hit")).toBe("答对了，全力发动。治疗恢复了体力。");
    expect(shownBattleNote(heal, "player-hit")).not.toContain("受到了伤害");
    expect(shownBattleNote(heal, "monster-hit")).toBe(heal);
    expect(shownBattleNote(fullHeal, "player-hit")).toContain("体力已经满了");
    expect(shownBattleNote(fullHeal, "player-hit")).not.toContain("受到了伤害");
    expect(shownBattleNote(block, "player-hit")).toContain("挡下了下一次伤害");
    expect(shownBattleNote(block, "player-hit")).not.toContain("受到了伤害");
    expect(shownBattleNote(block, "monster-hit")).toContain("这次没有受到伤害");
  });

  it("keeps the final sentence identical to the one the battle already stored", () => {
    for (const full of [attack, wrong, heal, block, strike, win, loss, phase, fullHeal]) {
      expect(shownBattleNote(full, "final"), full).toBe(full);
      const plan = planBattleNote(full);
      expect(plan.feedback + plan.action + plan.counter, full).toBe(full);
    }
  });

  it("hands the whole sentence to results even if the last hit has not been shown", () => {
    const partial = shownBattleNote(attack, "start");
    expect(partial).not.toContain("受到了伤害");
    expect(noteForHandoff(partial, attack)).toBe(attack);
    expect(noteForHandoff(shownBattleNote(win, "start"), win)).toBe(win);
    expect(shownBattleNote(win, "start")).not.toContain("你赢了");
    expect(shownBattleNote(win, "player-hit")).toBe(win);
    expect(shownBattleNote(phase, "player-hit")).toBe(phase);
  });
});
