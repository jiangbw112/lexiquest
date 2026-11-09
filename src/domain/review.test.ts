import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { PROVISIONAL } from "./provisional";
import {
  applyReview,
  calendarDay,
  introduceMemory,
  masteryDecision,
  type MasteryDecision,
} from "./review";

const TZ = "Asia/Shanghai";

describe("adaptive review", () => {
  it("uses the Shanghai calendar day, including the midnight boundary", () => {
    expect(calendarDay(Date.parse("2026-03-01T02:00:00Z"), TZ)).toBe("2026-03-01");
    expect(calendarDay(Date.parse("2026-03-01T16:30:00Z"), TZ)).toBe("2026-03-02");
  });

  it("schedules from rating and history instead of a fixed 1/3/7 ladder", () => {
    const start = new Date("2026-03-01T02:00:00Z");
    const good = introduceMemory("lantern", start, Rating.Good);
    const easy = introduceMemory("lantern", start, Rating.Easy);
    const hard = introduceMemory("lantern", start, Rating.Hard);
    expect(good.fsrs.due).not.toBe(easy.fsrs.due);
    expect(good.fsrs.stability).not.toBe(hard.fsrs.stability);

    const scheduled: number[] = [good.fsrs.scheduled_days];
    let memory = good;
    for (let step = 0; step < 2; step += 1) {
      const due = new Date(memory.fsrs.due);
      memory = applyReview(memory, Rating.Good, due);
      scheduled.push(memory.fsrs.scheduled_days);
    }
    expect(scheduled).not.toEqual([1, 3, 7]);
    expect(new Set(scheduled).size).toBeGreaterThan(1);
  });

  it("does not award mastery for same-day repetition, even when stability is already high", () => {
    const day = new Date("2026-03-01T02:00:00Z");
    let memory = introduceMemory("river", day, Rating.Easy);
    for (let hour = 1; hour <= 5; hour += 1) {
      memory = applyReview(memory, Rating.Easy, new Date(day.getTime() + hour * 60 * 60 * 1000));
    }
    const decision = masteryDecision(memory, PROVISIONAL.mastery, TZ);
    expect(decision.distinctDays).toBe(1);
    expect(decision.award).toBe(false);
    expect(decision.reason).toBe("single-day");
    expect(decision.stability).toBeGreaterThanOrEqual(PROVISIONAL.mastery.minStability);
  });

  it("awards mastery only after another calendar day once stability reaches the provisional threshold", () => {
    const start = new Date("2026-03-01T02:00:00Z");
    let memory = introduceMemory("map", start, Rating.Good);
    expect(masteryDecision(memory, PROVISIONAL.mastery, TZ).award).toBe(false);

    let awarded: MasteryDecision | null = null;
    for (let day = 0; day < 8 && !awarded?.award; day += 1) {
      const due = new Date(memory.fsrs.due);
      const when = due.getTime() > start.getTime() ? due : new Date(start.getTime() + (day + 1) * 86_400_000);
      memory = applyReview(memory, Rating.Good, when);
      const decision = masteryDecision(memory, PROVISIONAL.mastery, TZ);
      if (!decision.award) {
        expect(decision.distinctDays < 2 || decision.stability < PROVISIONAL.mastery.minStability).toBe(true);
      } else {
        awarded = decision;
      }
    }
    expect(awarded?.award).toBe(true);
    expect(awarded?.distinctDays).toBeGreaterThanOrEqual(PROVISIONAL.mastery.minDistinctCalendarDays);
    expect(awarded?.stability).toBeGreaterThanOrEqual(PROVISIONAL.mastery.minStability);
  });
});
