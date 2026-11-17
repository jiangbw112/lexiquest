import type { ScreenBox } from "./sprite-screen-box";

export type { ScreenBox } from "./sprite-screen-box";

/** Listen button. It stays in its own column, beside the words. */
export const ANSWER_REVEAL_BUTTON = { width: 140, height: 48 } as const;

const PAD_X = 16;
const PAD_Y = 10;
const COL_GAP = 12;
const LINE_GAP = 8;

export interface AnswerRevealSpec {
  /** Plate center. */
  x: number;
  y: number;
  width: number;
  height: number;
  labelPx: number;
  englishPx: number;
  chinesePx: number;
}

export interface AnswerRevealLayout {
  plate: ScreenBox;
  button: ScreenBox;
  label: ScreenBox;
  english: ScreenBox;
  chinese: ScreenBox;
}

/**
 * Choose-phase plate under the fighters and left of the skill cards.
 * English, Chinese, and the label each keep one fixed size. The listen
 * button is a separate column, so a long word cannot shrink the Chinese.
 */
export const BATTLE_ANSWER_REVEAL: AnswerRevealSpec = {
  x: 350,
  y: 592,
  width: 620,
  height: 104,
  labelPx: 18,
  englishPx: 24,
  chinesePx: 22,
};

/**
 * Exam plate on the open left. The boss stands on the right, on the shared atlas pivot.
 * The grade-6 compass hangs on the left page against the spine. This plate stays
 * clear of that compass and does not move it.
 */
export const EXAM_ANSWER_REVEAL: AnswerRevealSpec = {
  x: 398,
  y: 224,
  width: 700,
  height: 112,
  labelPx: 18,
  englishPx: 28,
  chinesePx: 22,
};

export function answerRevealLayout(spec: AnswerRevealSpec): AnswerRevealLayout {
  const plate: ScreenBox = {
    x: spec.x - spec.width / 2,
    y: spec.y - spec.height / 2,
    w: spec.width,
    h: spec.height,
  };
  const button: ScreenBox = {
    x: plate.x + plate.w - PAD_X - ANSWER_REVEAL_BUTTON.width,
    y: plate.y + (plate.h - ANSWER_REVEAL_BUTTON.height) / 2,
    w: ANSWER_REVEAL_BUTTON.width,
    h: ANSWER_REVEAL_BUTTON.height,
  };
  const textX = plate.x + PAD_X;
  const textW = button.x - COL_GAP - textX;
  const label: ScreenBox = { x: textX, y: plate.y + PAD_Y, w: textW, h: spec.labelPx };
  const english: ScreenBox = { x: textX, y: label.y + label.h + LINE_GAP, w: textW, h: spec.englishPx };
  const chinese: ScreenBox = { x: textX, y: english.y + english.h + LINE_GAP, w: textW, h: spec.chinesePx };
  return { plate, button, label, english, chinese };
}
