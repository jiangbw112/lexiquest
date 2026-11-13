import { describe, expect, it } from "vitest";
import { CLASS_IDS } from "../domain/classes";
import type { ClassId } from "../domain/types";
import { DASH_RULES } from "./art/class-atlas";
import {
  shouldLunge,
  lungeTargetX,
  emptyLungeState,
  isInputLocked,
  actionTriggersLunge,
  attackReach,
  stepFractionFor,
  stepTargetX,
  exchangeDurationMs,
  battleMotionBeats,
  LUNGE_STOP_OFFSET,
  PLAYER_BATTLE_X,
  MONSTER_BATTLE_X,
  RANGED_STEP_FRACTION,
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

describe("attack reach by class", () => {
  const melee = new Set<ClassId>(["warrior", "explorer"]);
  const ranged = new Set<ClassId>(["mage", "ranger", "healer", "inventor"]);

  it("maps every class to a full lunge, a short step plus projectile, or no movement", () => {
    expect(new Set(CLASS_IDS)).toEqual(new Set<ClassId>([...melee, ...ranged]));
    for (const classId of CLASS_IDS) {
      expect(attackReach(classId, false), classId).toBe("still");
      expect(attackReach(classId, true), classId).toBe(melee.has(classId) ? "melee" : "ranged");
    }
  });

  it("steps the inventor a third of the gap before the gear flies", () => {
    const rule = DASH_RULES.inventor;
    expect(rule).toEqual({ attack: "stepThird", stepFraction: 1 / 3, firesProjectile: true, projectileHint: "gear" });
    expect(attackReach("inventor", true)).toBe("ranged");
    expect(stepFractionFor("inventor")).toBe(1 / 3);
    const gap = MONSTER_BATTLE_X - PLAYER_BATTLE_X;
    const landed = stepTargetX(PLAYER_BATTLE_X, MONSTER_BATTLE_X, "ranged", stepFractionFor("inventor"));
    expect(landed - PLAYER_BATTLE_X).toBeCloseTo(gap / 3, 5);
    expect(landed).toBeLessThan(lungeTargetX(PLAYER_BATTLE_X, MONSTER_BATTLE_X));
  });

  it("steps a ranged class about a third of the gap and a melee class to the existing stop", () => {
    expect(stepTargetX(PLAYER_BATTLE_X, MONSTER_BATTLE_X, "melee")).toBe(lungeTargetX(PLAYER_BATTLE_X, MONSTER_BATTLE_X));
    expect(stepTargetX(PLAYER_BATTLE_X, MONSTER_BATTLE_X, "ranged")).toBeCloseTo(
      PLAYER_BATTLE_X + (MONSTER_BATTLE_X - PLAYER_BATTLE_X) * RANGED_STEP_FRACTION,
      5,
    );
    expect(stepTargetX(PLAYER_BATTLE_X, MONSTER_BATTLE_X, "still")).toBe(PLAYER_BATTLE_X);
  });

  it("keeps a player attack plus the enemy lunge within about 0.8s", () => {
    expect(exchangeDurationMs("melee", true)).toBeLessThanOrEqual(800);
    expect(exchangeDurationMs("ranged", true)).toBeLessThanOrEqual(800);
    expect(exchangeDurationMs("still", true)).toBeLessThanOrEqual(800);
  });

  it("spawns the ranged floater when the projectile hits, before the return", () => {
    const beats = battleMotionBeats({
      playerLunge: false,
      playerReach: "ranged",
      enemyLunge: true,
      enemyAmount: -7,
      playerEffect: 0,
      playerHit: -5,
    });
    const log = beats.map((beat) => beat.kind);
    const projectile = log.indexOf("projectile");
    const hit = log.indexOf("hit");
    const back = log.indexOf("return");
    expect(log.slice(0, 4)).toEqual(["step", "projectile", "hit", "return"]);
    expect(projectile).toBeLessThan(hit);
    expect(hit).toBeLessThan(back);
    expect(beats[hit]).toEqual({ kind: "hit", attacker: "player", target: "enemy", amount: -7 });
  });

  it("shows the rest of a delayed hit after the enemy has returned", () => {
    const beats = battleMotionBeats({
      playerLunge: false,
      playerReach: "ranged",
      enemyLunge: true,
      enemyAmount: -5,
      playerEffect: 0,
      playerHit: -4,
      enemyFollowup: -5,
    });
    const returned = beats.map((beat) => beat.kind).lastIndexOf("return");
    const follow = beats.findIndex((beat) => beat.kind === "floater" && beat.target === "enemy");
    expect(follow).toBe(beats.length - 1);
    expect(returned).toBeLessThan(follow);
    expect(beats[follow]).toEqual({ kind: "floater", target: "enemy", amount: -5 });
  });
});
