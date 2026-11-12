import Phaser from "phaser";
import type { ClassId } from "../domain/types";
import { DASH_RULES } from "./art/class-atlas";
import { motionOff } from "./warm/theme";

/** Duration of the lunge forward in milliseconds. */
export const LUNGE_FORWARD_MS = 160;

/** Duration of the return lunge in milliseconds. */
export const LUNGE_RETURN_MS = 160;

/** Pause at the target position (for hit effect) in milliseconds. */
export const LUNGE_PAUSE_MS = 80;

/** Ranged step, projectile, and return. Together with an enemy lunge this stays within 0.8s. */
export const RANGED_STEP_MS = 120;
export const PROJECTILE_MS = 160;
export const RANGED_RETURN_MS = 120;

/** Share of the gap a ranged class steps before the projectile flies. */
export const RANGED_STEP_FRACTION = 1 / 3;

/** Total animation duration including forward, pause, and return. */
export const LUNGE_TOTAL_MS = LUNGE_FORWARD_MS + LUNGE_PAUSE_MS + LUNGE_RETURN_MS;

/** Default x position of the player character in battle. */
export const PLAYER_BATTLE_X = 300;

/** Default x position of the monster in battle. */
export const MONSTER_BATTLE_X = 980;

/** How close to the target the attacker moves. */
export const LUNGE_STOP_OFFSET = 120;

export interface LungeConfig {
  /** Whether this is a healing action (no lunge). */
  isHealing: boolean;
  /** Whether remote attacks should skip the lunge (future extension). */
  isRanged?: boolean;
}

/**
 * Determines if an action should trigger a lunge animation.
 */
export function shouldLunge(config: LungeConfig): boolean {
  if (config.isHealing) return false;
  if (config.isRanged) return false;
  return true;
}

/**
 * Computes the target x position for a lunge.
 * The attacker moves close to but not overlapping the target.
 */
export function lungeTargetX(attackerX: number, targetX: number): number {
  const direction = targetX > attackerX ? 1 : -1;
  return targetX - direction * LUNGE_STOP_OFFSET;
}

export interface LungeState {
  /** Whether the lunge animation is currently playing. */
  isAnimating: boolean;
  /** The container being animated, if any. */
  activeContainer: Phaser.GameObjects.Container | null;
  /** Original x position to return to. */
  originalX: number;
  /** Tween instances for cleanup. */
  tweens: Phaser.Tweens.Tween[];
}

export function emptyLungeState(): LungeState {
  return {
    isAnimating: false,
    activeContainer: null,
    originalX: 0,
    tweens: [],
  };
}

/**
 * Performs a lunge animation on a container.
 * Returns a promise that resolves when the animation completes.
 * The onHit callback fires when the attacker reaches the target position.
 */
export function performLunge(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  targetX: number,
  onHit?: () => void,
  onComplete?: () => void,
): { cancel: () => void } {
  const startX = container.x;
  const destinationX = lungeTargetX(startX, targetX);

  if (motionOff()) {
    onHit?.();
    scene.time.delayedCall(50, () => onComplete?.());
    return { cancel: () => {} };
  }

  const tweens: Phaser.Tweens.Tween[] = [];

  const forwardTween = scene.tweens.add({
    targets: container,
    x: destinationX,
    duration: LUNGE_FORWARD_MS,
    ease: "Quad.easeOut",
    onComplete: () => {
      onHit?.();
      scene.time.delayedCall(LUNGE_PAUSE_MS, () => {
        const returnTween = scene.tweens.add({
          targets: container,
          x: startX,
          duration: LUNGE_RETURN_MS,
          ease: "Quad.easeIn",
          onComplete: () => onComplete?.(),
        });
        tweens.push(returnTween);
      });
    },
  });
  tweens.push(forwardTween);

  return {
    cancel: () => {
      for (const tween of tweens) {
        if (tween.isPlaying()) tween.stop();
      }
      container.x = startX;
    },
  };
}

/**
 * Determines if inputs should be locked based on animation state.
 */
export function isInputLocked(lungeState: LungeState, resolving: boolean): boolean {
  return lungeState.isAnimating || resolving;
}

export type ActionType = "attack" | "block" | "heal" | "skill";

/**
 * Determines if an action type should trigger a lunge.
 */
export function actionTriggersLunge(
  actionType: ActionType,
  skillKind?: "damage" | "guard" | "heal" | "strike-guard" | "strike-heal" | "delay-damage",
): boolean {
  if (actionType === "heal") return false;
  if (actionType === "block") return false;
  if (actionType === "skill") {
    if (skillKind === "heal" || skillKind === "guard") return false;
  }
  return true;
}

export type BattleSide = "player" | "enemy";

export type AttackReach = "melee" | "ranged" | "still";

/**
 * Reach comes from DASH_RULES. A full dash closes to the monster.
 * A third-step class stops at that fraction, then the scene fires the projectile.
 * Healing never moves, including the healer's explicit stay.
 */
export function attackReach(classId: ClassId, actionMoves: boolean): AttackReach {
  if (!actionMoves) return "still";
  return DASH_RULES[classId].attack === "dashToEnemy" ? "melee" : "ranged";
}

export function stepFractionFor(classId: ClassId): number {
  return DASH_RULES[classId].stepFraction ?? RANGED_STEP_FRACTION;
}

export function stepTargetX(attackerX: number, targetX: number, reach: AttackReach, fraction = RANGED_STEP_FRACTION): number {
  if (reach === "still") return attackerX;
  if (reach === "ranged") return attackerX + (targetX - attackerX) * fraction;
  return lungeTargetX(attackerX, targetX);
}

/** Scheduled time for the player's motion plus the enemy's counter lunge. */
export function exchangeDurationMs(reach: AttackReach, enemyLunge: boolean): number {
  const player = reach === "melee"
    ? LUNGE_FORWARD_MS + LUNGE_PAUSE_MS + LUNGE_RETURN_MS
    : reach === "ranged"
      ? RANGED_STEP_MS + PROJECTILE_MS + RANGED_RETURN_MS
      : 0;
  const enemy = enemyLunge ? LUNGE_FORWARD_MS + LUNGE_PAUSE_MS + LUNGE_RETURN_MS : 0;
  return player + enemy;
}

export function performApproach(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  targetX: number,
  duration: number,
  onArrive?: () => void,
): void {
  if (motionOff()) {
    container.x = targetX;
    onArrive?.();
    return;
  }
  scene.tweens.add({
    targets: container,
    x: targetX,
    duration,
    ease: "Quad.easeOut",
    onComplete: () => onArrive?.(),
  });
}

export function performReturn(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  homeX: number,
  duration: number,
  onDone?: () => void,
): void {
  if (motionOff()) {
    container.x = homeX;
    onDone?.();
    return;
  }
  scene.tweens.add({
    targets: container,
    x: homeX,
    duration,
    ease: "Quad.easeIn",
    onComplete: () => onDone?.(),
  });
}

export type MotionBeat =
  | { kind: "lunge"; attacker: BattleSide }
  | { kind: "step"; attacker: "player" }
  | { kind: "projectile"; attacker: "player" }
  | { kind: "hit"; attacker: BattleSide; target: BattleSide; amount: number }
  | { kind: "return"; attacker: BattleSide }
  | { kind: "floater"; target: BattleSide; amount: number };

/**
 * Visual order for one resolved turn.
 * A melee lunge spawns the defender's number on the hit beat, before the return.
 * A ranged attack steps, then spawns the number when the projectile hits, before the return.
 * Healing and other non-lunges spawn immediately, with no return beat.
 * A zero amount never becomes a floater beat.
 */
export function battleMotionBeats(input: {
  playerLunge: boolean;
  playerReach?: AttackReach;
  enemyLunge: boolean;
  /** Damage dealt to the enemy by this action. */
  enemyAmount: number;
  /** The player's own heal or other self effect. Not the counterattack. */
  playerEffect: number;
  /** Damage the enemy's counterattack actually dealt. */
  playerHit: number;
  /** Gear damage that lands after the counter, as its own floater. */
  enemyFollowup?: number;
}): MotionBeat[] {
  const beats: MotionBeat[] = [];
  const reach = input.playerReach ?? (input.playerLunge ? "melee" : "still");
  if (reach === "melee") {
    beats.push({ kind: "lunge", attacker: "player" });
    beats.push({ kind: "hit", attacker: "player", target: "enemy", amount: input.enemyAmount });
    beats.push({ kind: "return", attacker: "player" });
  } else if (reach === "ranged" && input.enemyAmount !== 0) {
    beats.push({ kind: "step", attacker: "player" });
    beats.push({ kind: "projectile", attacker: "player" });
    beats.push({ kind: "hit", attacker: "player", target: "enemy", amount: input.enemyAmount });
    beats.push({ kind: "return", attacker: "player" });
  } else if (input.enemyAmount !== 0) {
    beats.push({ kind: "floater", target: "enemy", amount: input.enemyAmount });
  }
  if (input.playerEffect !== 0) beats.push({ kind: "floater", target: "player", amount: input.playerEffect });
  if (input.enemyLunge) {
    beats.push({ kind: "lunge", attacker: "enemy" });
    beats.push({ kind: "hit", attacker: "enemy", target: "player", amount: input.playerHit });
    beats.push({ kind: "return", attacker: "enemy" });
  } else if (input.playerHit !== 0) {
    beats.push({ kind: "floater", target: "player", amount: input.playerHit });
  }
  if (input.enemyFollowup) beats.push({ kind: "floater", target: "enemy", amount: input.enemyFollowup });
  return beats;
}

