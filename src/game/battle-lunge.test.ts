import { describe, expect, it } from "vitest";
import {
  shouldLunge,
  lungeTargetX,
  emptyLungeState,
  isInputLocked,
  actionTriggersLunge,
  LUNGE_STOP_OFFSET,
  PLAYER_BATTLE_X,
  MONSTER_BATTLE_X,
} from "./battle-lunge";

describe("shouldLunge", () => {
  it("returns false for healing actions", () => {
    expect(shouldLunge({ isHealing: true })).toBe(false);
  });

  it("returns false for ranged attacks", () => {
    expect(shouldLunge({ isHealing: false, isRanged: true })).toBe(false);
  });

  it("returns true for melee attacks", () => {
    expect(shouldLunge({ isHealing: false })).toBe(true);
    expect(shouldLunge({ isHealing: false, isRanged: false })).toBe(true);
  });
});

describe("lungeTargetX", () => {
  it("calculates target position for player attacking monster", () => {
    const target = lungeTargetX(PLAYER_BATTLE_X, MONSTER_BATTLE_X);
    expect(target).toBe(MONSTER_BATTLE_X - LUNGE_STOP_OFFSET);
  });

  it("calculates target position for monster attacking player", () => {
    const target = lungeTargetX(MONSTER_BATTLE_X, PLAYER_BATTLE_X);
    expect(target).toBe(PLAYER_BATTLE_X + LUNGE_STOP_OFFSET);
  });

  it("stops short of the target by LUNGE_STOP_OFFSET", () => {
    const playerTarget = lungeTargetX(100, 500);
    expect(playerTarget).toBe(500 - LUNGE_STOP_OFFSET);

    const monsterTarget = lungeTargetX(500, 100);
    expect(monsterTarget).toBe(100 + LUNGE_STOP_OFFSET);
  });
});

describe("emptyLungeState", () => {
  it("starts not animating", () => {
    const state = emptyLungeState();
    expect(state.isAnimating).toBe(false);
    expect(state.activeContainer).toBeNull();
    expect(state.originalX).toBe(0);
    expect(state.tweens).toHaveLength(0);
  });
});

describe("isInputLocked", () => {
  it("returns true when animating", () => {
    const state = { ...emptyLungeState(), isAnimating: true };
    expect(isInputLocked(state, false)).toBe(true);
  });

  it("returns true when resolving", () => {
    const state = emptyLungeState();
    expect(isInputLocked(state, true)).toBe(true);
  });

  it("returns true when both animating and resolving", () => {
    const state = { ...emptyLungeState(), isAnimating: true };
    expect(isInputLocked(state, true)).toBe(true);
  });

  it("returns false when neither animating nor resolving", () => {
    const state = emptyLungeState();
    expect(isInputLocked(state, false)).toBe(false);
  });
});

describe("actionTriggersLunge", () => {
  it("returns false for heal action", () => {
    expect(actionTriggersLunge("heal")).toBe(false);
  });

  it("returns false for block action", () => {
    expect(actionTriggersLunge("block")).toBe(false);
  });

  it("returns true for attack action", () => {
    expect(actionTriggersLunge("attack")).toBe(true);
  });

  it("returns true for damage skill", () => {
    expect(actionTriggersLunge("skill", "damage")).toBe(true);
  });

  it("returns true for strike-guard skill", () => {
    expect(actionTriggersLunge("skill", "strike-guard")).toBe(true);
  });

  it("returns false for heal skill", () => {
    expect(actionTriggersLunge("skill", "heal")).toBe(false);
  });

  it("returns false for guard skill", () => {
    expect(actionTriggersLunge("skill", "guard")).toBe(false);
  });

  it("returns true for skill with no kind specified", () => {
    expect(actionTriggersLunge("skill")).toBe(true);
  });
});
