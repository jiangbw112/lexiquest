import Phaser from "phaser";
import { FONT_BODY, motionOff } from "./warm/theme";

/** Duration of the float animation in milliseconds. */
export const FLOATER_DURATION_MS = 800;

/** Vertical distance the floater rises in logical pixels. */
export const FLOATER_RISE_PX = 50;

/** Gap between stacked floaters to prevent overlap. */
export const FLOATER_STACK_OFFSET = 24;

export interface FloaterEntry {
  /** Negative for damage, positive for healing. */
  amount: number;
  /** Monotonically increasing id to stagger multiple floaters. */
  index: number;
  /** Timestamp when this floater started. */
  startTime: number;
}

export interface FloaterState {
  entries: FloaterEntry[];
  nextIndex: number;
}

export function emptyFloaterState(): FloaterState {
  return { entries: [], nextIndex: 0 };
}

/**
 * Compute the actual HP change after applying shield, max HP cap, and floor at zero.
 * Returns the signed change (negative for damage, positive for healing).
 */
export function computeActualHpChange(input: {
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
}): number {
  const before = Math.max(0, Math.min(input.maxHp, input.hpBefore));
  const after = Math.max(0, Math.min(input.maxHp, input.hpAfter));
  return after - before;
}

/**
 * Formats the number for display: "-N" for damage, "+N" for healing.
 * Returns null if amount is zero (nothing to display).
 */
export function formatFloaterText(amount: number): string | null {
  if (amount === 0) return null;
  if (amount < 0) return String(amount);
  return `+${amount}`;
}

/** Returns the color for the floater text. */
export function floaterColor(amount: number): string {
  return amount < 0 ? "#E76F51" : "#2A9D8F";
}

/** Light outline so the number stays readable on the forest background. */
export function floaterStroke(amount: number): string {
  return amount === 0 ? "#FFF4DC" : "#FFF4DC";
}

/** Scene child name. `draw()` keeps this container and everything inside it. */
export const FLOATER_LAYER_NAME = "battle-floaters";

export function isFloaterLayer(node: { name?: string }): boolean {
  return node.name === FLOATER_LAYER_NAME;
}

/** Objects `draw()` must destroy. The floater layer is not among them. */
export function droppedAcrossDraw<T extends { name?: string }>(nodes: readonly T[]): T[] {
  return nodes.filter((node) => !isFloaterLayer(node));
}

/** Objects `draw()` must leave on screen, including floaters already spawned. */
export function keptAcrossDraw<T extends { name?: string }>(nodes: readonly T[]): T[] {
  return nodes.filter((node) => isFloaterLayer(node));
}

/**
 * Push a new floater entry if the amount is non-zero.
 * Returns the updated state.
 */
export function pushFloater(state: FloaterState, amount: number, now: number): FloaterState {
  if (amount === 0) return state;
  const entry: FloaterEntry = {
    amount,
    index: state.nextIndex,
    startTime: now,
  };
  return {
    entries: [...state.entries, entry],
    nextIndex: state.nextIndex + 1,
  };
}

/**
 * Remove expired floaters from the state.
 */
export function pruneFloaters(state: FloaterState, now: number): FloaterState {
  const entries = state.entries.filter((e) => now - e.startTime < FLOATER_DURATION_MS);
  return { ...state, entries };
}

/**
 * Count active floaters for a given timestamp.
 */
export function activeFloaterCount(state: FloaterState, now: number): number {
  return state.entries.filter((e) => now - e.startTime < FLOATER_DURATION_MS).length;
}

/**
 * Compute the y-offset for a new floater based on how many are currently active.
 * Newer floaters appear lower to prevent overlap with rising older floaters.
 */
export function floaterStackOffset(activeCount: number): number {
  return activeCount * FLOATER_STACK_OFFSET;
}

/**
 * Create and animate a floating damage/heal number in the scene.
 * The floater rises and fades out over FLOATER_DURATION_MS.
 */
export function spawnFloater(
  scene: Phaser.Scene,
  x: number,
  y: number,
  amount: number,
  stackOffset = 0,
  layer?: Phaser.GameObjects.Container,
): Phaser.GameObjects.Text | null {
  const text = formatFloaterText(amount);
  if (!text) return null;

  const color = floaterColor(amount);
  const stroke = floaterStroke(amount);

  const floater = scene.add.text(0, 0, text, {
    fontFamily: FONT_BODY,
    fontSize: "32px",
    fontStyle: "700",
    color,
    stroke,
    strokeThickness: 6,
  }).setOrigin(0.5);
  floater.setPosition(x, y + stackOffset);
  if (layer) layer.add(floater);
  floater.setDepth(1000);

  if (motionOff()) {
    scene.time.delayedCall(FLOATER_DURATION_MS, () => floater.destroy());
  } else {
    scene.tweens.add({
      targets: floater,
      y: y + stackOffset - FLOATER_RISE_PX,
      alpha: 0,
      duration: FLOATER_DURATION_MS,
      ease: "Quad.easeOut",
      onComplete: () => floater.destroy(),
    });
  }

  return floater;
}
