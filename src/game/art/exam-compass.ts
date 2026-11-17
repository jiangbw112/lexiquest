/**
 * The grade-6 semester-2 compass is a separate atlas plate.
 * At the shared boss scale it lands at about 24×42 and sits on the book spine,
 * next to the gold clasp and the left-page lantern.
 * This presentation keeps every other layer at the shared scale and only moves this plate.
 *
 * Phaser draws a trimmed frame at `-origin * sourceSize + spriteSourceSize`, then scales that.
 * The origin has to be the atlas pivot (0.5, 0.875). An origin written as a fraction of the
 * trimmed plate is multiplied by the full 768 source and throws this small plate off the halo.
 */
import { EXAM_BOSS_SCALE, EXAM_BOSS_X, EXAM_BOSS_Y } from "../../domain/exams";

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const COMPASS_LAYER_KEY = "boss_exam_final_g6_compass_w";

/** Idle frame 00 in the compass atlas. The shift is measured from this plate. */
export const COMPASS_REFERENCE_FRAME = { x: 309, y: 274, w: 47, h: 84 };

/** Shared bosses stay at EXAM_BOSS_SCALE. This plate is drawn larger. */
export const COMPASS_DISPLAY_SCALE = 1.5;

/**
 * Where idle frame 00 should sit, in display pixels from the foot point.
 * Far enough right that the plate and its halo clear the green right hand.
 */
export const COMPASS_IDLE_TARGET = { x: 188, y: -176 };

/** Cream backlight. Same cream as the warm panels. Strokes only, never a filled card. */
export const COMPASS_GLOW = "#FFF4DC";
/** Outer reach of the halo past the plate, in display pixels. */
export const COMPASS_GLOW_PAD = 14;

/** Atlas pivot. Phaser multiplies this by the untrimmed source size. */
export const COMPASS_PIVOT = { x: 0.5, y: 0.875 };
export const COMPASS_SOURCE = 768;

/**
 * Soft rings around the plate. `outset` is the stroke center past the plate edge.
 * The line grows half its width further out. Alphas stay low so the book shows through.
 */
export const COMPASS_HALO_RINGS = [
  { outset: 11, line: 6, alpha: 0.14 },
  { outset: 5, line: 5, alpha: 0.28 },
] as const;

/** Ink outline. Same ink as the picture-book stroke. */
export const COMPASS_PLATE = "#3B2A20";
export const COMPASS_OUTLINE_PX = 3;

const OUTLINE_STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

export const COMPASS_OUTLINE_DELTAS: readonly { x: number; y: number }[] = OUTLINE_STEPS.map(([x, y]) => ({
  x: x * COMPASS_OUTLINE_PX,
  y: y * COMPASS_OUTLINE_PX,
}));

/**
 * Left-page gold disc on the grade-6 final body, display pixels at EXAM_BOSS_SCALE.
 * Measured from the idle body frame's connected gold component.
 */
export const G6_PAGE_LANTERN: PixelRect = { x: -93.5, y: -130, w: 20, h: 20 };

/**
 * Green knob on the right edge of the grade-6 final body, display pixels at EXAM_BOSS_SCALE.
 * Measured from the idle body frame. The halo must stay off this knob.
 */
export const G6_RIGHT_HAND: PixelRect = { x: 128, y: -126, w: 24, h: 26 };

/**
 * Gold bar on the book spine, just above where the unscaled plate used to hang.
 * Display pixels at EXAM_BOSS_SCALE.
 */
export const G6_SPINE_CLASP: PixelRect = { x: -27, y: -213, w: 54, h: 11 };

const ATLAS = 768;
const PIVOT_X = 0.5;
const PIVOT_Y = 0.875;

export function isCompassLayer(key: string): boolean {
  return key === COMPASS_LAYER_KEY;
}

export function cssHex(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

/** Foot-planted rectangle. Scale is display pixels per source pixel. */
export function plantedRect(frame: { x: number; y: number; w: number; h: number }, scale: number): PixelRect {
  const footX = ATLAS * PIVOT_X;
  const footY = ATLAS * PIVOT_Y;
  return {
    x: (frame.x - footX) * scale,
    y: (frame.y - footY) * scale,
    w: frame.w * scale,
    h: frame.h * scale,
  };
}

/** Extra display shift so the reference plate lands on COMPASS_IDLE_TARGET. */
export function compassShift(): { x: number; y: number } {
  const planted = plantedRect(COMPASS_REFERENCE_FRAME, COMPASS_DISPLAY_SCALE);
  return {
    x: COMPASS_IDLE_TARGET.x - planted.x,
    y: COMPASS_IDLE_TARGET.y - planted.y,
  };
}

/** Plate rectangle after the larger scale and the shift off the spine. */
export function compassBattleRect(frame: { x: number; y: number; w: number; h: number }): PixelRect {
  const planted = plantedRect(frame, COMPASS_DISPLAY_SCALE);
  const shift = compassShift();
  return {
    x: planted.x + shift.x,
    y: planted.y + shift.y,
    w: planted.w,
    h: planted.h,
  };
}

/**
 * Drawn quad of a trimmed frame.
 * Matches Phaser's batchSprite: top-left is `-origin * sourceSize + trim`, then scale about the sprite position.
 */
export function phaserTrimmedDrawRect(
  frame: { x: number; y: number; w: number; h: number },
  origin: { x: number; y: number },
  scale: number,
  position: { x: number; y: number },
): PixelRect {
  const localX = -origin.x * COMPASS_SOURCE + frame.x;
  const localY = -origin.y * COMPASS_SOURCE + frame.y;
  return {
    x: position.x + localX * scale,
    y: position.y + localY * scale,
    w: frame.w * scale,
    h: frame.h * scale,
  };
}

/** Visible plate when the sprite origin is the atlas pivot and the position is the shared shift. */
export function compassSpriteDrawRect(
  frame: { x: number; y: number; w: number; h: number },
  delta: { x: number; y: number } = { x: 0, y: 0 },
): PixelRect {
  const shift = compassShift();
  return phaserTrimmedDrawRect(frame, COMPASS_PIVOT, COMPASS_DISPLAY_SCALE, {
    x: shift.x + delta.x,
    y: shift.y + delta.y,
  });
}

/** Outer edge of the halo strokes. */
export function compassHaloRect(frame: { x: number; y: number; w: number; h: number }): PixelRect {
  const plate = compassBattleRect(frame);
  return {
    x: plate.x - COMPASS_GLOW_PAD,
    y: plate.y - COMPASS_GLOW_PAD,
    w: plate.w + COMPASS_GLOW_PAD * 2,
    h: plate.h + COMPASS_GLOW_PAD * 2,
  };
}

/** Halo bounds. The old name was the solid card; the reach is the same pad. */
export function compassCardRect(frame: { x: number; y: number; w: number; h: number }): PixelRect {
  return compassHaloRect(frame);
}

/** Same rectangles after the boss container is planted on the battle screen. */
export function compassWorldRect(local: PixelRect): PixelRect {
  return { x: EXAM_BOSS_X + local.x, y: EXAM_BOSS_Y + local.y, w: local.w, h: local.h };
}

export function rectsOverlap(a: PixelRect, b: PixelRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** The shared scale still draws this plate at about 24×42. The battle view does not use that size. */
export function bakedCompassRect(frame: { x: number; y: number; w: number; h: number } = COMPASS_REFERENCE_FRAME): PixelRect {
  return plantedRect(frame, EXAM_BOSS_SCALE);
}
