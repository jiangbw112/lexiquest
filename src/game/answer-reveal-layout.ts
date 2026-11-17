/** Cream row. Height stays 76 so the listen button fits inside it. */
export const ANSWER_REVEAL_PLATE_H = 76;
export const ANSWER_REVEAL_BUTTON = { width: 140, height: 48 } as const;

/**
 * Battle row sits in the gap under the note and to the right of the warrior plume.
 * A full-width row at the old y covers the plume and the forest boss canopy.
 */
export const BATTLE_ANSWER_REVEAL = { x: 592, y: 254, width: 416 } as const;

/**
 * Exam row stays wide and sits above the grade-6 crown.
 * The crown top is y 254 at the exam boss scale. The plate bottom is y 246.
 */
export const EXAM_ANSWER_REVEAL = { x: 640, y: 208, width: 1080 } as const;

export interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function answerRevealLayout(spec: { x: number; y: number; width: number }): { plate: ScreenBox; button: ScreenBox } {
  const plate = {
    x: spec.x - spec.width / 2,
    y: spec.y - ANSWER_REVEAL_PLATE_H / 2,
    w: spec.width,
    h: ANSWER_REVEAL_PLATE_H,
  };
  const button = {
    x: plate.x + plate.w - 16 - ANSWER_REVEAL_BUTTON.width,
    y: spec.y - ANSWER_REVEAL_BUTTON.height / 2,
    w: ANSWER_REVEAL_BUTTON.width,
    h: ANSWER_REVEAL_BUTTON.height,
  };
  return { plate, button };
}
