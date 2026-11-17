import { describe, expect, it } from "vitest";
import {
  BATTLE_ANSWER_REVEAL,
  EXAM_ANSWER_REVEAL,
  answerRevealLayout,
  type ScreenBox,
} from "./answer-reveal-layout";

/**
 * Screen boxes from the placed art, in the same coordinates as the answer plate.
 * Warrior plume: cls_warrior_side idle_00, foot (300, 520), scale 0.72.
 * Mage hat is the tallest class head at that scale.
 * Forest boss: canopy manifest screenBBoxUnionAllFrames.
 * Exam bosses: idle frames at (980, 520), scale 0.5. The grade-6 crown is the high point.
 */
const WARRIOR_PLUME: ScreenBox = { x: 244, y: 262, w: 55, h: 36 };
const MAGE_HAT: ScreenBox = { x: 245, y: 236, w: 115, h: 91 };
const BATTLE_NOTE: ScreenBox = { x: 150, y: 156, w: 680, h: 52 };
const FOREST_BOSS: ScreenBox = { x: 813, y: 197, w: 308, h: 323 };
const EXAM_MID_TOP: ScreenBox = { x: 799, y: 274, w: 363, h: 80 };
const EXAM_G6_CROWN: ScreenBox = { x: 951, y: 254, w: 59, h: 46 };

function overlaps(a: ScreenBox, b: ScreenBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function inflate(box: ScreenBox, pad: number): ScreenBox {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

function inside(inner: ScreenBox, outer: ScreenBox): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

describe("answer reveal plate", () => {
  it("keeps the cream plate off the warrior plume and the boss tops", () => {
    const battle = answerRevealLayout(BATTLE_ANSWER_REVEAL);
    const exam = answerRevealLayout(EXAM_ANSWER_REVEAL);
    const gap = 4;
    for (const box of [WARRIOR_PLUME, MAGE_HAT, BATTLE_NOTE, FOREST_BOSS]) {
      expect(overlaps(inflate(battle.plate, gap), inflate(box, gap)), JSON.stringify(box)).toBe(false);
      expect(overlaps(inflate(battle.button, gap), inflate(box, gap)), JSON.stringify(box)).toBe(false);
    }
    for (const box of [EXAM_MID_TOP, EXAM_G6_CROWN]) {
      expect(overlaps(inflate(exam.plate, gap), inflate(box, gap)), JSON.stringify(box)).toBe(false);
      expect(overlaps(inflate(exam.button, gap), inflate(box, gap)), JSON.stringify(box)).toBe(false);
    }
    expect(inside(battle.button, battle.plate)).toBe(true);
    expect(inside(exam.button, exam.plate)).toBe(true);
    expect(battle.plate.y).toBeGreaterThan(BATTLE_NOTE.y + BATTLE_NOTE.h);
    expect(exam.plate.y + exam.plate.h).toBeLessThan(EXAM_G6_CROWN.y);
    expect(exam.plate.y + exam.plate.h).toBeLessThan(EXAM_MID_TOP.y);
  });
});
