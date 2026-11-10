import { describe, expect, it } from "vitest";
import { createSave, learnWord, reviewWord } from "./progress";
import { ensureDailyGoal, notePracticeAnswer, parentView, studyDayKey } from "./parent";
import { calendarDay, introduceMemory, isDue, masteryDecision } from "./review";
import { localDayKey } from "./local-day";
import { DEFAULT_APPEARANCE } from "./appearance";
import { PROVISIONAL } from "./provisional";
import { Rating } from "ts-fsrs";

const ZONE = "Asia/Shanghai";

describe("local calendar day", () => {
  it("counts every Beijing hour from 00:00 through 08:00 as that local date", () => {
    const hours = ["00:15", "02:00", "03:59", "04:00", "07:45"];
    for (const hour of hours) {
      const now = new Date(`2026-11-10T${hour}:00+08:00`);
      expect(now.toISOString().slice(0, 10)).toBe("2026-11-09");
      expect(localDayKey(now, ZONE)).toBe("2026-11-10");
      expect(studyDayKey(now, ZONE)).toBe(localDayKey(now, ZONE));
      expect(calendarDay(now.getTime(), ZONE)).toBe("2026-11-10");
    }
  });

  it("uses that date for the daily goal, parent today, mastery days, and a practice reward", () => {
    const now = new Date("2026-11-10T02:00:00+08:00");
    const later = new Date("2026-11-10T07:30:00+08:00");
    let save = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: now.getTime(),
      grades: ["G3"],
    });
    save = learnWord(save, "tree", now, ZONE);
    expect(save.dailyGoal?.dayKey).toBe("2026-11-10");
    expect(parentView(save, now, 10, ZONE).learnedToday).toBe(1);
    expect(parentView(save, later, 10, ZONE).learnedToday).toBe(1);

    const memory = introduceMemory("tree", now);
    const sameMorning = {
      ...memory,
      reviewInstants: [now.getTime(), later.getTime()],
      fsrs: { ...memory.fsrs, stability: 20 },
    };
    expect(masteryDecision(sameMorning, PROVISIONAL.mastery, ZONE).reason).toBe("single-day");
    const due = new Date(memory.fsrs.due);
    expect(localDayKey(due, ZONE)).toBe(calendarDay(due.getTime(), ZONE));
    expect(isDue({ ...memory, fsrs: { ...memory.fsrs, due: later.toISOString() } }, now)).toBe(false);

    const practiced = notePracticeAnswer(
      {
        ...save,
        cosmeticTokens: 0,
        goalCalendar: {},
        lastGoalCompletedDayKey: null,
        dailyGoal: {
          dayKey: localDayKey(now, ZONE),
          snapshotDue: 0,
          mode: "practice_fallback",
          targetReview: 0,
          targetLearn: 0,
          targetPractice: 1,
          progressReview: 0,
          progressLearn: 0,
          progressPractice: 0,
          completed: false,
          rewardClaimed: false,
        },
      },
      "tree",
      now,
      ZONE,
    );
    expect(practiced.dailyGoal?.dayKey).toBe("2026-11-10");
    expect(practiced.cosmeticTokens).toBe(1);

    const reviewed = reviewWord(save, "tree", Rating.Good, later, ZONE);
    expect(calendarDay(reviewed.memory.tree!.reviewInstants.at(-1)!, ZONE)).toBe("2026-11-10");
    const legacy = {
      ...save,
      dailyGoal: save.dailyGoal ? { ...save.dailyGoal, dayKey: "2026-11-09" } : null,
      dailyStats: { "2026-11-09": save.dailyStats["2026-11-10"]! },
    };
    const kept = ensureDailyGoal(legacy, now, ZONE);
    expect(kept.dailyGoal?.dayKey).toBe("2026-11-10");
    expect(kept.dailyStats["2026-11-09"]).toEqual(legacy.dailyStats["2026-11-09"]);
    expect(kept.dailyStats["2026-11-10"]).toBeUndefined();
  });
});
