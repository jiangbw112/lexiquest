import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { DEFAULT_APPEARANCE } from "./appearance";
import { sampleWords, wordsForGrades } from "./catalog";
import {
  dueWordIds,
  ensureDailyGoal,
  goalStatusLine,
  noteDueAnswer,
  notePracticeAnswer,
  openingReminder,
  parentFacingLines,
  parentView,
  parentWordRows,
  planDailyGoal,
  setGoalPreset,
  struggleWords,
  studyDayKey,
  withParentDefaults,
} from "./parent";
import { applyBattleOutcome, createSave, learnWord, reviewWord, setSelectedGrades } from "./progress";
import { PROPOSALS } from "./proposals";
import { PROVISIONAL } from "./provisional";
import type { DailyGoal, MemoryRecord, SaveData } from "./types";

const START = new Date("2026-03-01T02:00:00Z");
const ZONE = "Asia/Shanghai";

function newSave() {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades: ["G3"],
  });
}

function day(offset: number): Date {
  return new Date(START.getTime() + offset * 24 * 60 * 60 * 1000);
}

function view(save: SaveData, now: Date, zone = ZONE) {
  return parentView(save, now, 10, zone);
}

function learn(save: SaveData, wordId: string, now: Date, zone = ZONE) {
  return learnWord(save, wordId, now, zone);
}

function answer(
  save: SaveData,
  wordId: string,
  rating: "again" | "good",
  at: Date,
  track: "meaning" | "spelling" = "meaning",
  dueFirst = true,
  beforeTone?: "none" | "grey" | "bright",
) {
  return noteDueAnswer(save, { wordId, track, rating, at, dueFirst, beforeTone, timeZone: ZONE });
}

function withDue(save: SaveData, wordIds: readonly string[], now: Date, due: boolean): SaveData {
  const memory = { ...save.memory };
  const stamp = new Date(now.getTime() + (due ? -60_000 : 7 * 86_400_000)).toISOString();
  for (const wordId of wordIds) {
    const current = memory[wordId];
    if (!current) continue;
    memory[wordId] = { ...current, fsrs: { ...current.fsrs, due: stamp } };
  }
  return { ...save, memory };
}

function addExtraDue(save: SaveData, count: number, now: Date): SaveData {
  const sample = Object.values(save.memory)[0] as MemoryRecord;
  const memory = { ...save.memory };
  const wordCards = { ...save.wordCards };
  for (let index = 0; index < count; index += 1) {
    const wordId = `extra-${index}`;
    memory[wordId] = {
      wordId,
      reviewInstants: [],
      fsrs: { ...sample.fsrs, due: new Date(now.getTime() - 60_000).toISOString() },
    };
    wordCards[wordId] = { wordId, collectedAt: now.getTime(), masteryBadge: false, badgeEverOn: false };
  }
  return { ...save, memory, wordCards };
}

function bright(save: SaveData, wordId: string, now: Date, ever: boolean): SaveData {
  const current = save.memory[wordId];
  if (!current) return save;
  return {
    ...save,
    memory: {
      ...save.memory,
      [wordId]: { ...current, fsrs: { ...current.fsrs, due: new Date(now.getTime() + 86_400_000).toISOString() } },
    },
    wordCards: {
      ...save.wordCards,
      [wordId]: { ...save.wordCards[wordId]!, masteryBadge: true, badgeEverOn: ever },
    },
  };
}

describe("DES-05 parent progress and daily goal", () => {
  it("keeps the confirmed numbers in one module", () => {
    expect(PROPOSALS.label).toBe("v1");
    expect(PROPOSALS.dailyGoal.goalMax).toEqual({ easy: 8, normal: 15, more: 25 });
    expect(PROPOSALS.dailyGoal.learnFallback).toEqual({ easy: 2, normal: 3, more: 5 });
    expect(PROPOSALS.dailyGoal.practiceQuestions).toBe(3);
    expect(PROPOSALS.dailyGoal.dayBoundaryHour).toBe(4);
    expect(PROPOSALS.dailyGoal).not.toHaveProperty("timeZone");
    expect(PROVISIONAL.mastery.timeZone).toBe("Asia/Shanghai");
    expect(PROVISIONAL.skillCards.baseSkillPowerScale).toBe(0.45);
    expect(PROVISIONAL.skillCards.baseSkillEnergyCost).toBe(0);
    expect(PROVISIONAL.skillCards.wrongAnswerMultiplier).toBe(0.5);
  });

  it("uses the local calendar date through Beijing 00:00-08:00, when UTC is still the previous day", () => {
    for (const iso of [
      "2026-03-10T00:30:00+08:00",
      "2026-03-10T03:59:00+08:00",
      "2026-03-10T04:00:00+08:00",
      "2026-03-10T07:30:00+08:00",
    ]) {
      const now = new Date(iso);
      expect(now.toISOString().slice(0, 10)).toBe("2026-03-09");
      expect(studyDayKey(now, ZONE)).toBe("2026-03-10");
    }
    expect(studyDayKey(new Date("2026-03-02T03:59:00+08:00"), ZONE)).toBe("2026-03-02");
    expect(studyDayKey(new Date("2026-03-02T03:59:00Z"), "UTC")).toBe("2026-03-02");
    expect(studyDayKey(new Date("2026-03-08T03:30:00-04:00"), "America/New_York")).toBe("2026-03-08");
    expect(studyDayKey(new Date("2026-11-01T03:30:00-05:00"), "America/New_York")).toBe("2026-11-01");

    const early = new Date("2026-03-10T02:00:00+08:00");
    const late = new Date("2026-03-10T07:30:00+08:00");
    let save = learn(newSave(), "tree", early);
    expect(save.dailyGoal?.dayKey).toBe("2026-03-10");
    expect(view(save, early).learnedToday).toBe(1);
    expect(view(save, late).learnedToday).toBe(1);
    save = ensureDailyGoal(save, late, ZONE);
    expect(save.dailyGoal?.dayKey).toBe("2026-03-10");
    expect(save.dailyGoal?.progressLearn).toBe(1);

    const stored = {
      ...save,
      dailyGoal: save.dailyGoal ? { ...save.dailyGoal, dayKey: "2026-03-09" } : save.dailyGoal,
      dailyStats: { "2026-03-09": save.dailyStats["2026-03-10"]! },
    };
    const next = ensureDailyGoal(stored, early, ZONE);
    expect(next.dailyGoal?.dayKey).toBe("2026-03-10");
    expect(next.dailyStats["2026-03-09"]).toEqual(stored.dailyStats["2026-03-09"]);
    expect(next.goalCalendar["2026-03-09"]).toBeUndefined();
  });

  it("does not take tokens back, rewrite history, or fill skipped days when the clock or zone moves", () => {
    const instant = new Date("2026-03-02T03:00:00Z");
    let save = learn(newSave(), "tree", instant);
    save = learn(save, "fish", instant);
    save = learn(save, "map", instant);
    expect(studyDayKey(instant, ZONE)).toBe("2026-03-02");
    expect(save.dailyGoal?.dayKey).toBe("2026-03-02");
    expect(save.cosmeticTokens).toBe(1);
    const stats = save.dailyStats["2026-03-02"];
    const tokens = save.cosmeticTokens;
    const days = save.goalDaysTotal;

    const behind = ensureDailyGoal(save, instant, "America/Los_Angeles");
    expect(studyDayKey(instant, "America/Los_Angeles")).toBe("2026-03-01");
    expect(behind.clockAnomaly).toBe(true);
    expect(behind.dailyGoal?.dayKey).toBe("2026-03-02");
    expect(behind.dailyGoal?.completed).toBe(true);
    expect(behind.cosmeticTokens).toBe(tokens);
    expect(behind.goalDaysTotal).toBe(days);
    expect(behind.dailyStats["2026-03-02"]).toEqual(stats);
    expect(behind.goalCalendar["2026-03-01"]).toBeUndefined();
    const parentLines = parentFacingLines(view(behind, instant, "America/Los_Angeles"));
    expect(parentLines.join("\n")).toContain("这台电脑的时间比学习记录更早");
    const child = `${goalStatusLine(behind.dailyGoal)}\n${openingReminder(behind, instant, "America/Los_Angeles")}`;
    expect(child).not.toContain("时间比学习记录");
    expect(child).not.toMatch(/连续|断签|落后/);

    const ahead = ensureDailyGoal(save, instant, ZONE);
    expect(ahead.clockAnomaly).toBe(false);
    expect(ahead.dailyGoal?.dayKey).toBe("2026-03-02");
    expect(ahead.dailyStats["2026-03-02"]).toEqual(stats);
    expect(ahead.cosmeticTokens).toBe(tokens);

    const jumped = ensureDailyGoal(save, new Date(instant.getTime() + 5 * 86_400_000), ZONE);
    expect(jumped.dailyGoal?.dayKey).toBe("2026-03-07");
    expect(jumped.dailyGoal?.completed).toBe(false);
    expect(jumped.cosmeticTokens).toBe(tokens);
    expect(jumped.goalDaysTotal).toBe(days);
    expect(jumped.dailyStats["2026-03-02"]).toEqual(stats);
    expect(Object.keys(jumped.goalCalendar)).toEqual(["2026-03-02"]);
    expect(jumped.goalCalendar["2026-03-03"]).toBeUndefined();

    const same = new Date("2026-06-15T12:00:00Z");
    const held = ensureDailyGoal(learn(newSave(), "tree", same, "UTC"), same, "UTC");
    const shifted = ensureDailyGoal(held, same, ZONE);
    expect(studyDayKey(same, "UTC")).toBe(studyDayKey(same, ZONE));
    expect(shifted.dailyGoal?.dayKey).toBe(held.dailyGoal?.dayKey);
    expect(shifted.dailyGoal?.snapshotDue).toBe(held.dailyGoal?.snapshotDue);
    expect(shifted.dailyGoal?.progressLearn).toBe(held.dailyGoal?.progressLearn);
    expect(shifted.clockAnomaly).toBe(false);
    expect(shifted.lastTimezone).toBe(ZONE);
  });

  it("sets the review target to min(due, the tier cap) and does not raise it later that day", () => {
    let save = learn(newSave(), "tree", START);
    save = addExtraDue(save, 9, START);
    save = withDue(save, ["tree"], START, true);
    save = { ...save, dailyGoal: null };
    save = ensureDailyGoal(save, START, ZONE);
    expect(dueWordIds(save, START)).toHaveLength(10);
    expect(save.dailyGoal).toMatchObject({ mode: "review", targetReview: 10, snapshotDue: 10 });

    save = addExtraDue(save, 29, START);
    save = withDue(save, ["tree"], START, true);
    const raised = ensureDailyGoal(save, START, ZONE);
    expect(raised.dailyGoal?.targetReview).toBe(10);
    expect(raised.dailyGoal?.snapshotDue).toBe(10);

    const standard = planDailyGoal(addExtraDue(learn(newSave(), "tree", START), 30, START), START, ZONE);
    expect(standard.targetReview).toBe(15);
    const easy = planDailyGoal(setGoalPreset(addExtraDue(learn(newSave(), "tree", START), 30, START), "easy"), START, ZONE);
    expect(easy.targetReview).toBe(8);
    const more = planDailyGoal(setGoalPreset(addExtraDue(learn(newSave(), "tree", START), 30, START), "more"), START, ZONE);
    expect(more.targetReview).toBe(25);
    expect(planDailyGoal(withDue(learn(newSave(), "tree", START), ["tree"], START, true), START, ZONE).targetReview).toBe(1);

    const snapped = setGoalPreset(raised, "easy");
    expect(ensureDailyGoal(snapped, START, ZONE).dailyGoal?.targetReview).toBe(10);
    const logged = answer(snapped, "tree", "again", new Date(START.getTime() - 3 * 86_400_000));
    expect(logged.dailyGoal?.targetReview).toBe(10);
    expect(logged.dailyGoal?.dayKey).toBe(studyDayKey(START, ZONE));
    expect(logged.clockAnomaly).toBe(true);
    expect(logged.cosmeticTokens).toBe(snapped.cosmeticTokens);
    const tomorrow = ensureDailyGoal(snapped, day(1), ZONE);
    expect(tomorrow.dailyGoal).toMatchObject({ mode: "review", targetReview: 8 });
    expect(tomorrow.dailyGoal).not.toHaveProperty("skipped");
  });

  it("falls back to new words, then counts each answered question without changing FSRS", () => {
    const fresh = ensureDailyGoal(newSave(), START, ZONE);
    expect(fresh.dailyGoal).toMatchObject({ mode: "learn_fallback", targetLearn: 3, snapshotDue: 0 });
    expect(ensureDailyGoal(setGoalPreset(newSave(), "easy"), START, ZONE).dailyGoal?.targetLearn).toBe(2);
    expect(ensureDailyGoal(setGoalPreset(newSave(), "more"), START, ZONE).dailyGoal?.targetLearn).toBe(5);

    let save = newSave();
    for (const word of wordsForGrades(["G3"])) save = learn(save, word.id, START);
    expect(save.cosmeticTokens).toBe(1);
    expect(save.dailyGoal?.mode).toBe("learn_fallback");
    const next = day(1);
    save = withDue(save, Object.keys(save.memory), next, false);
    save = { ...save, dailyGoal: null };
    save = ensureDailyGoal(save, next, ZONE);
    expect(save.dailyGoal).toMatchObject({ mode: "practice_fallback", targetPractice: 3, progressPractice: 0 });
    expect(goalStatusLine(save.dailyGoal)).toContain("暂时没有新词可学，做 3 次练习也算完成今日目标");
    const memory = save.memory;
    const xp = save.xp;
    const cards = save.wordCards;
    save = notePracticeAnswer(save, "tree", next, ZONE);
    save = notePracticeAnswer(save, "fish", next, ZONE);
    save = reviewWord(save, "map", Rating.Again, next, ZONE);
    expect(save.memory).toBe(memory);
    expect(save.wordCards).toBe(cards);
    expect(save.xp).toBe(xp);
    expect(save.battlesWon).toBe(0);
    expect(save.cosmeticTokens).toBe(2);
    expect(save.dailyGoal?.completed).toBe(true);
    expect(save.goalCalendar[save.dailyGoal?.dayKey ?? ""]).toBe("completed");
    const again = notePracticeAnswer(save, "tree", next, ZONE);
    expect(again.cosmeticTokens).toBe(2);
    expect(again.goalDaysTotal).toBe(2);
    expect(goalStatusLine(save.dailyGoal)).toContain("今天的练习目标完成了，真棒");
  });

  it("pays only an appearance token for a finished review goal, once per study day", () => {
    let save = setSelectedGrades(newSave(), ["G3"]);
    save = learn(save, "tree", START);
    save = learn(save, "fish", START);
    save = withDue(save, ["tree", "fish"], START, true);
    save = { ...save, dailyGoal: null };
    save = ensureDailyGoal(save, START, ZONE);
    expect(save.dailyGoal).toMatchObject({ mode: "review", targetReview: 2 });
    const xp = save.xp;
    const tokens = save.cosmeticTokens;
    save = reviewWord(save, "tree", Rating.Again, START, ZONE);
    expect(save.cosmeticTokens).toBe(tokens);
    expect(view(save, START).reviewedToday).toBe(1);
    save = reviewWord(save, "fish", Rating.Again, START, ZONE);
    expect(save.xp).toBe(xp);
    expect(save.cosmeticTokens).toBe(tokens + 1);
    expect(save.goalDaysTotal).toBe(1);
    expect(save.dailyGoal?.rewardClaimed).toBe(true);
    const paid = save.cosmeticTokens;
    save = reviewWord(save, "tree", Rating.Good, new Date(START.getTime() + 1000), ZONE);
    expect(save.cosmeticTokens).toBe(paid);
    expect(view(save, START).reviewedToday).toBe(2);
    const wiped = ensureDailyGoal({ ...save, dailyGoal: null }, START, ZONE);
    const replayed = reviewWord(withDue(wiped, ["tree", "fish"], START, true), "tree", Rating.Good, START, ZONE);
    expect(replayed.cosmeticTokens).toBe(paid);
    const fought = applyBattleOutcome(save, "win", START.getTime());
    expect(fought.cosmeticTokens).toBe(paid);
  });

  it("keeps the running day total across a gap and has no skip control", () => {
    let finished = newSave();
    finished = learn(finished, "tree", START);
    finished = learn(finished, "fish", START);
    finished = learn(finished, "map", START);
    expect(finished.goalDaysTotal).toBe(1);
    const later = day(5);
    finished = withDue(finished, ["tree", "fish", "map"], later, false);
    finished = ensureDailyGoal(finished, later, ZONE);
    expect(finished.goalDaysTotal).toBe(1);
    expect(finished.dailyGoal?.completed).toBe(false);
    expect(finished.dailyGoal).not.toHaveProperty("skipped");
    const remaining = wordsForGrades(["G3"]).map((word) => word.id).filter((id) => !finished.wordCards[id]);
    finished = learn(finished, remaining[0]!, later);
    finished = learn(finished, remaining[1]!, later);
    finished = learn(finished, remaining[2]!, later);
    expect(finished.goalDaysTotal).toBe(2);
    const lines = parentFacingLines(view(finished, later));
    expect(lines.join("\n")).toContain("累计完成 2 天");
    expect(lines.join("\n")).not.toMatch(/连续|断签|跳过今日/);
    const away = {
      ...finished,
      dailyGoal: { ...(finished.dailyGoal as DailyGoal), completed: false },
      lastGoalCompletedDayKey: studyDayKey(START, ZONE),
    };
    expect(openingReminder(away, day(8), ZONE)).toContain("欢迎回来");
    expect(goalStatusLine(finished.dailyGoal)).toContain("完成了，真棒");
  });

  it("counts a first bright badge and a later grey-to-bright badge as different rows", () => {
    let save = learn(newSave(), "tree", START);
    save = bright(save, "tree", START, false);
    save = answer(save, "tree", "good", START, "meaning", true, "none");
    expect(save.wordCards.tree?.badgeEverOn).toBe(true);
    expect(view(save, START).masteredFirst7d).toBe(1);
    expect(view(save, START).masteredRestored7d).toBe(0);

    const next = day(1);
    save = bright(save, "tree", next, true);
    save = answer(save, "tree", "good", next, "meaning", true, "grey");
    expect(view(save, next).masteredFirst7d).toBe(1);
    expect(view(save, next).masteredRestored7d).toBe(1);
    const again = answer(bright(save, "tree", day(2), true), "tree", "good", day(2), "meaning", true, "grey");
    const seen = view(again, day(2));
    expect(seen.masteredRestored7d).toBe(1);
    expect(seen.firstMasteredLine).toBe("首次掌握：1 个");
    expect(seen.restoredMasteredLine).toBe("重新掌握：1 个");
    expect(seen.weekLine).not.toContain("新掌握");
  });

  it("merges meaning and spelling into one word and lists the 14-day struggle set", () => {
    let save = learn(setSelectedGrades(newSave(), ["G3", "G4", "G5", "G6"]), "tree", START);
    const spelling: MemoryRecord = {
      ...save.memory.tree!,
      fsrs: { ...save.memory.tree!.fsrs, due: new Date(START.getTime() - 60_000).toISOString() },
    };
    save = withDue(save, ["tree"], START, true);
    save = { ...save, spellingMemory: { tree: spelling } };
    expect(dueWordIds(save, START)).toEqual(["tree"]);
    const rows = parentWordRows(save, START);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wordId: "tree", tracks: ["meaning", "spelling"], due: true });

    const quiet = answer(save, "tree", "again", START, "meaning", false);
    expect(quiet.dueAnswers).toEqual([]);
    expect(struggleWords(quiet, START, 10, ZONE)).toEqual([]);

    let counted = save;
    for (const offset of [0, 1, 2]) counted = answer(counted, "tree", "again", day(offset));
    expect(struggleWords(counted, day(2), 10, ZONE).map((word) => word.wordId)).toEqual(["tree"]);
    expect(view(counted, day(2)).rows).toHaveLength(1);

    let rated = learn(setSelectedGrades(newSave(), ["G3", "G4", "G5", "G6"]), "tree", START);
    const pattern: Array<"again" | "good"> = ["again", "good", "again", "good"];
    pattern.forEach((rating, index) => {
      rated = answer(rated, "tree", rating, day(index), "spelling");
    });
    expect(struggleWords(rated, day(3), 10, ZONE).map((word) => word.wordId)).toContain("tree");

    let mild = learn(newSave(), "fish", START);
    for (const [rating, index] of [["again", 0], ["good", 1], ["good", 2]] as const) {
      mild = answer(mild, "fish", rating, day(index));
    }
    expect(struggleWords(mild, day(2), 10, ZONE)).toEqual([]);

    let grey = learn(newSave(), "map", START);
    grey = withDue(grey, ["map"], START, true);
    grey = {
      ...grey,
      wordCards: { ...grey.wordCards, map: { ...grey.wordCards.map!, masteryBadge: true, badgeEverOn: true } },
    };
    grey = answer(grey, "map", "again", START);
    expect(struggleWords(grey, START, 10, ZONE).map((word) => word.wordId)).toEqual(["map"]);

    let crowd = setSelectedGrades(newSave(), ["G3", "G4", "G5", "G6"]);
    const words = sampleWords().slice(0, 12);
    for (const word of words) crowd = learn(crowd, word.id, START);
    words.forEach((word, index) => {
      const agains = index + 3;
      for (let time = 0; time < agains; time += 1) {
        crowd = answer(crowd, word.id, "again", day(time), time % 2 === 0 ? "meaning" : "spelling");
      }
    });
    const listed = struggleWords(crowd, day(13), 10, ZONE);
    expect(listed).toHaveLength(PROPOSALS.parentProgress.struggleListLimit);
    expect(listed[0]?.wordId).toBe(words[11]?.id);
    expect(listed[0]?.againCount).toBeGreaterThan(listed[9]?.againCount ?? 0);
    expect(view(crowd, day(13)).struggleTotal).toBe(12);
  });

  it("keeps history after a grade is turned off and uses the empty-state copy", () => {
    let save = learn(newSave(), "tree", START);
    save = setSelectedGrades(save, ["G6"]);
    const seen = view(save, START);
    expect(seen.learnedToday).toBe(1);
    expect(seen.gradesLabel).toBe("六年级");
    expect(seen.rows).toHaveLength(1);
    const empty = view(newSave(), START);
    expect(empty.emptyLine).toContain("还没有学习记录");
    const text = parentFacingLines(seen).concat(parentFacingLines(empty), [openingReminder(save, day(8), ZONE)]).join("\n");
    expect(text).not.toMatch(/FSRS|稳定度|断签|连续|排行|正确率|落后|忘光/);
  });

  it("does not count a review that was not due", () => {
    let save = learn(newSave(), "tree", START);
    save = withDue(save, ["tree"], START, false);
    save = reviewWord(save, "tree", Rating.Again, START, ZONE);
    expect(view(save, START).reviewedToday).toBe(0);
    expect(save.dueAnswers).toEqual([]);
    expect(save.cosmeticTokens).toBe(0);
  });

  it("reads an older proposal save without a skip flag or a fixed time zone", () => {
    const legacy = withParentDefaults({
      ...newSave(),
      parentGoalPreset: "light" as SaveData["parentGoalPreset"],
      dailyGoal: {
        dayKey: "2026-03-01",
        mode: "learn",
        target: 3,
        progress: 1,
        skipped: true,
      } as unknown as DailyGoal,
      dailyStats: {
        "2026-03-01": {
          learnedWordIds: ["tree"],
          reviewedDueWordIds: [],
          badgeOnGainedWordIds: ["tree"],
        },
      } as unknown as SaveData["dailyStats"],
      goalCalendar: { "2026-03-01": "skipped" } as unknown as SaveData["goalCalendar"],
    });
    expect(legacy.parentGoalPreset).toBe("easy");
    expect(legacy.dailyGoal).toMatchObject({ mode: "learn_fallback", targetLearn: 3, progressLearn: 1 });
    expect(legacy.dailyGoal).not.toHaveProperty("skipped");
    expect(legacy.dailyStats["2026-03-01"]?.badgeFirstOnWordIds).toEqual(["tree"]);
    expect(legacy.goalCalendar["2026-03-01"]).toBeUndefined();
    expect(legacy).not.toHaveProperty("parentPin");
  });
});
