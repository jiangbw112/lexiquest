import Phaser from "phaser";
import { motionOff } from "./warm/theme";

/** Duration of the lunge forward in milliseconds. */
export const LUNGE_FORWARD_MS = 200;

/** Duration of the return lunge in milliseconds. */
export const LUNGE_RETURN_MS = 200;

/** Pause at the target position (for hit effect) in milliseconds. */
export const LUNGE_PAUSE_MS = 100;

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
  skillKind?: "damage" | "guard" | "heal" | "strike-guard",
): boolean {
  if (actionType === "heal") return false;
  if (actionType === "block") return false;
  if (actionType === "skill") {
    if (skillKind === "heal" || skillKind === "guard") return false;
  }
  return true;
}
