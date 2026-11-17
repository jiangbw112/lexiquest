/**
 * The grade-6 semester-2 compass is one plate on the same 768 canvas as the book.
 * It uses the shared boss scale and the atlas pivot, so the idle plate is about
 * 24×42 and hangs on the left page against the spine.
 */
import { EXAM_BOSS_SCALE, EXAM_BOSS_X, EXAM_BOSS_Y } from "../../domain/exams";

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const COMPASS_LAYER_KEY = "boss_exam_final_g6_compass_w";

/** Idle frame 00. At the shared scale this trim is about 24×42. */
export const COMPASS_REFERENCE_FRAME = { x: 309, y: 274, w: 47, h: 84 };

/** Atlas pivot. Phaser multiplies this by the untrimmed source size. */
export const COMPASS_PIVOT = { x: 0.5, y: 0.875 };
export const COMPASS_SOURCE = 768;

export function isCompassLayer(key: string): boolean {
  return key === COMPASS_LAYER_KEY;
}

/** Visible plate at the shared scale, in display pixels from the foot point. */
export function compassDesignRect(frame: { x: number; y: number; w: number; h: number }): PixelRect {
  return {
    x: (frame.x - COMPASS_PIVOT.x * COMPASS_SOURCE) * EXAM_BOSS_SCALE,
    y: (frame.y - COMPASS_PIVOT.y * COMPASS_SOURCE) * EXAM_BOSS_SCALE,
    w: frame.w * EXAM_BOSS_SCALE,
    h: frame.h * EXAM_BOSS_SCALE,
  };
}

/** Same rectangle after the boss container stands at the manifest point. */
export function compassWorldRect(local: PixelRect): PixelRect {
  return { x: EXAM_BOSS_X + local.x, y: EXAM_BOSS_Y + local.y, w: local.w, h: local.h };
}
