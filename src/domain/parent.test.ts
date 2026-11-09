import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { DEFAULT_APPEARANCE } from "./appearance";
import { sampleWords, wordsForGrades } from "./catalog";
import {
  dueWordIds,
  ensureDailyGoal,
  goalStatusLine,
  noteDueAnswer,
  openingReminder,
  parentFacingLines,
  parentView,
  parentWordRows,
  planDailyGoal,
  recordPracticeRound,
  setGoalPreset,
  skipTodayGoal,
  struggleWords,
  studyDayKey,
} from "./parent";
import { applyBattleOutcome, createSave, learnWord, reviewWord, setSelectedGrades } from "./progress";
import { PROPOSALS } from "./proposals";
import { PROVISIONAL } from "./provisional";
import type { MemoryRecord, SaveData } from "./types";

const START = new Date("2026-03-01T02:00:00Z");

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
    wordCards[wordId] = { wordId, collectedAt: now.getTime(), masteryBadge: false };
  }
  return { ...save, memory, wordCards };
}

describe("DES-05 parent progress and daily goal proposals", () => {
  it("keeps the proposal numbers out of the decided v1 module", () => {
    expect(PROPOSALS.label).toBe("PROPOSAL");
    expect(PROPOSALS.dailyGoal.goalMax).toEqual({ light: 8, standard: 15, more: 25 });
    expect(PROPOSALS.dailyGoal.learnFallback).toEqual({ light: 2, standard: 3, more: 5 });
    expect(PROPOSALS.dailyGoal.practiceRounds).toBe(3);
    expect(PROPOSALS.dailyGoal.dayBoundaryHour).toBe(4);
    expect(PROVISIONAL.mastery.label).toBe("v1");
    expect(JSON.stringify(PROVISIONAL)).not.toContain("GOAL_MAX");
  });

  it("rolls the study day at 04:00 Asia/Shanghai and resets today's count", () => {
    const early = new Date("2026-03-02T03:59:00+08:00");
    const late = new Date("2026-03-02T04:00:00+08:00");
    expect(studyDayKey(early)).toBe("2026-03-01");
    expect(studyDayKey(late)).toBe("2026-03-02");
    let save = learnWord(newSave(), "tree", early);
    expect(parentView(save, early).learnedToday).toBe(1);
    expect(learnWord(save, "tree", early).wordCards).toBe(save.wordCards);
    expect(parentView(learnWord(save, "tree", early), early).learnedToday).toBe(1);
    save = ensureDailyGoal(save, late);
    expect(save.dailyGoal?.dayKey).toBe("2026-03-02");
    expect(save.dailyGoal?.progress).toBe(0);
    expect(parentView(save, late).learnedToday).toBe(0);
    expect(parentView(save, late).learned7d).toBe(1);
  });

  it("sets the review target to min(due, the tier cap) and does not raise it later that day", () => {
    let save = learnWord(newSave(), "tree", START);
    save = addExtraDue(save, 9, START);
    save = withDue(save, ["tree"], START, true);
    save = { ...save, dailyGoal: null };
    save = ensureDailyGoal(save, START);
    expect(dueWordIds(save, START)).toHaveLength(10);
    expect(save.dailyGoal).toMatchObject({ mode: "review", target: 10, snapshotDue: 10 });

    save = addExtraDue(save, 29, START);
    save = withDue(save, ["tree"], START, true);
    const raised = ensureDailyGoal(save, START);
    expect(raised.dailyGoal?.target).toBe(10);
    expect(raised.dailyGoal?.snapshotDue).toBe(10);

    const standard = planDailyGoal(addExtraDue(learnWord(newSave(), "tree", START), 30, START), START);
    expect(standard.target).toBe(15);
    const light = planDailyGoal(setGoalPreset(addExtraDue(learnWord(newSave(), "tree", START), 30, START), "light"), START);
    expect(light.target).toBe(8);
    const more = planDailyGoal(setGoalPreset(addExtraDue(learnWord(newSave(), "tree", START), 30, START), "more"), START);
    expect(more.target).toBe(25);
    expect(planDailyGoal(withDue(learnWord(newSave(), "tree", START), ["tree"], START, true), START).target).toBe(1);

    const snapped = setGoalPreset(raised, "light");
    expect(ensureDailyGoal(snapped, START).dailyGoal?.target).toBe(10);
    const logged = noteDueAnswer(snapped, {
      wordId: "tree",
      track: "meaning",
      rating: "again",
      at: new Date(START.getTime() - 3 * 86_400_000),
      dueFirst: true,
    });
    expect(logged.dailyGoal?.target).toBe(10);
    expect(logged.dailyGoal?.dayKey).toBe(studyDayKey(START));
    const tomorrow = ensureDailyGoal(snapped, day(1));
    expect(tomorrow.dailyGoal).toMatchObject({ mode: "review", target: 8 });
  });

  it("falls back to new words, then to practice rounds that do not change FSRS", () => {
    const fresh = ensureDailyGoal(newSave(), START);
    expect(fresh.dailyGoal).toMatchObject({ mode: "learn", target: 3, snapshotDue: 0 });
    expect(ensureDailyGoal(setGoalPreset(newSave(), "light"), START).dailyGoal?.target).toBe(2);
    expect(ensureDailyGoal(setGoalPreset(newSave(), "more"), START).dailyGoal?.target).toBe(5);

    let save = newSave();
    for (const word of wordsForGrades(["G3"])) save = learnWord(save, word.id, START);
    expect(save.cosmeticTokens).toBe(1);
    expect(save.dailyGoal?.mode).toBe("learn");
    const next = day(1);
    save = withDue(save, Object.keys(save.memory), next, false);
    save = { ...save, dailyGoal: null };
    save = ensureDailyGoal(save, next);
    expect(save.dailyGoal).toMatchObject({ mode: "practice", target: 3, progress: 0 });
    const memory = save.memory;
    const xp = save.xp;
    const cards = save.wordCards;
    save = recordPracticeRound(save, next);
    save = recordPracticeRound(save, next);
    save = recordPracticeRound(save, next);
    expect(save.memory).toBe(memory);
    expect(save.wordCards).toBe(cards);
    expect(save.xp).toBe(xp);
    expect(save.battlesWon).toBe(0);
    expect(save.cosmeticTokens).toBe(2);
    expect(save.dailyGoal?.completed).toBe(true);
    expect(save.goalCalendar[save.dailyGoal?.dayKey ?? ""]).toBe("completed");
    const again = recordPracticeRound(save, next);
    expect(again.cosmeticTokens).toBe(2);
    expect(again.goalDaysTotal).toBe(2);
  });

  it("pays only an appearance token for a finished review goal, once per study day", () => {
    let save = setSelectedGrades(newSave(), ["G3"]);
    save = learnWord(save, "tree", START);
    save = learnWord(save, "fish", START);
    save = learnWord(save, "map", START);
    save = withDue(save, ["tree", "fish"], START, true);
    save = withDue(save, ["map"], START, false);
    save = { ...save, dailyGoal: null };
    save = ensureDailyGoal(save, START);
    expect(save.dailyGoal).toMatchObject({ mode: "review", target: 2 });
    const held = save.memory.map;
    const xp = save.xp;
    const tokens = save.cosmeticTokens;
    save = reviewWord(save, "tree", Rating.Again, START);
    expect(save.cosmeticTokens).toBe(tokens);
    expect(parentView(save, START).reviewedToday).toBe(1);
    save = reviewWord(save, "fish", Rating.Again, START);
    expect(save.memory.map).toBe(held);
    expect(save.xp).toBe(xp);
    expect(save.battlesWon).toBe(save.battlesLost);
    expect(save.cosmeticTokens).toBe(tokens + 1);
    expect(save.goalDaysTotal).toBe(save.cosmeticTokens);
    expect(save.dailyGoal?.rewardClaimed).toBe(true);
    const paid = save.cosmeticTokens;
    save = reviewWord(save, "tree", Rating.Good, new Date(START.getTime() + 1000));
    expect(save.cosmeticTokens).toBe(paid);
    expect(parentView(save, START).reviewedToday).toBe(2);
    const fought = applyBattleOutcome(save, "win", START.getTime());
    expect(fought.cosmeticTokens).toBe(paid);
    expect(fought.memory.map).toBe(held);
  });

  it("skips today with no reward and keeps the running day total across a gap", () => {
    let save = ensureDailyGoal(newSave(), START);
    const skipped = skipTodayGoal(save, START);
    expect(skipped.dailyGoal?.skipped).toBe(true);
    expect(skipped.cosmeticTokens).toBe(0);
    expect(skipped.goalCalendar[studyDayKey(START)]).toBe("skipped");
    save = learnWord(skipped, "tree", START);
    save = learnWord(save, "fish", START);
    save = learnWord(save, "map", START);
    expect(save.cosmeticTokens).toBe(0);
    expect(save.dailyGoal?.completed).toBe(false);

    let finished = newSave();
    finished = learnWord(finished, "tree", START);
    finished = learnWord(finished, "fish", START);
    finished = learnWord(finished, "map", START);
    expect(finished.goalDaysTotal).toBe(1);
    const later = day(5);
    finished = withDue(finished, ["tree", "fish", "map"], later, false);
    finished = ensureDailyGoal(finished, later);
    expect(finished.goalDaysTotal).toBe(1);
    expect(finished.dailyGoal?.completed).toBe(false);
    const remaining = wordsForGrades(["G3"]).map((word) => word.id).filter((id) => !finished.wordCards[id]);
    finished = learnWord(finished, remaining[0]!, later);
    finished = learnWord(finished, remaining[1]!, later);
    finished = learnWord(finished, remaining[2]!, later);
    expect(finished.goalDaysTotal).toBe(2);
    const lines = parentFacingLines(parentView(finished, later));
    expect(lines.join("\n")).toContain("累计完成 2 天");
    expect(lines.join("\n")).not.toMatch(/连续|断签/);
    const away = { ...finished, dailyGoal: { ...finished.dailyGoal!, completed: false, skipped: false }, lastGoalCompletedDayKey: studyDayKey(START) };
    expect(openingReminder(away, day(8))).toContain("欢迎回来");
    expect(goalStatusLine(finished.dailyGoal)).toContain("完成了，真棒");
  });

  it("merges meaning and spelling into one word and lists the 14-day struggle set", () => {
    let save = learnWord(setSelectedGrades(newSave(), ["G3", "G4", "G5", "G6"]), "tree", START);
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

    const quiet = noteDueAnswer(save, { wordId: "tree", track: "meaning", rating: "again", at: START, dueFirst: false });
    expect(quiet.dueAnswers).toEqual([]);
    expect(struggleWords(quiet, START)).toEqual([]);

    let counted = save;
    for (const offset of [0, 1, 2]) {
      counted = noteDueAnswer(counted, {
        wordId: "tree",
        track: "meaning",
        rating: "again",
        at: day(offset),
        dueFirst: true,
      });
    }
    expect(struggleWords(counted, day(2)).map((word) => word.wordId)).toEqual(["tree"]);
    expect(parentView(counted, day(2)).rows).toHaveLength(1);

    let rated = learnWord(setSelectedGrades(newSave(), ["G3", "G4", "G5", "G6"]), "tree", START);
    const pattern: Array<"again" | "good"> = ["again", "good", "again", "good"];
    pattern.forEach((rating, index) => {
      rated = noteDueAnswer(rated, { wordId: "tree", track: "spelling", rating, at: day(index), dueFirst: true });
    });
    expect(struggleWords(rated, day(3)).map((word) => word.wordId)).toContain("tree");

    let mild = learnWord(newSave(), "fish", START);
    for (const [rating, index] of [["again", 0], ["good", 1], ["good", 2]] as const) {
      mild = noteDueAnswer(mild, { wordId: "fish", track: "meaning", rating, at: day(index), dueFirst: true });
    }
    expect(struggleWords(mild, day(2))).toEqual([]);

    let grey = learnWord(newSave(), "map", START);
    grey = withDue(grey, ["map"], START, true);
    grey = {
      ...grey,
      wordCards: { ...grey.wordCards, map: { ...grey.wordCards.map!, masteryBadge: true } },
    };
    grey = noteDueAnswer(grey, { wordId: "map", track: "meaning", rating: "again", at: START, dueFirst: true });
    expect(struggleWords(grey, START).map((word) => word.wordId)).toEqual(["map"]);

    let crowd = setSelectedGrades(newSave(), ["G3", "G4", "G5", "G6"]);
    const words = sampleWords().slice(0, 12);
    for (const word of words) crowd = learnWord(crowd, word.id, START);
    words.forEach((word, index) => {
      const agains = index + 3;
      for (let time = 0; time < agains; time += 1) {
        crowd = noteDueAnswer(crowd, {
          wordId: word.id,
          track: time % 2 === 0 ? "meaning" : "spelling",
          rating: "again",
          at: day(time),
          dueFirst: true,
        });
      }
    });
    const listed = struggleWords(crowd, day(13));
    expect(listed).toHaveLength(PROPOSALS.parentProgress.struggleListLimit);
    expect(listed[0]?.wordId).toBe(words[11]?.id);
    expect(listed[0]?.againCount).toBeGreaterThan(listed[9]?.againCount ?? 0);
    expect(parentView(crowd, day(13)).struggleTotal).toBe(12);
  });

  it("keeps history after a grade is turned off and uses the empty-state copy", () => {
    let save = learnWord(newSave(), "tree", START);
    save = setSelectedGrades(save, ["G6"]);
    const view = parentView(save, START);
    expect(view.learnedToday).toBe(1);
    expect(view.gradesLabel).toBe("六年级");
    expect(view.rows).toHaveLength(1);
    const empty = parentView(newSave(), START);
    expect(empty.emptyLine).toContain("还没有学习记录");
    const text = parentFacingLines(view).concat(parentFacingLines(empty), [openingReminder(save, day(8))]).join("\n");
    expect(text).not.toMatch(/FSRS|稳定度|断签|连续|排行|正确率|落后|忘光/);
  });

  it("does not count a review that was not due", () => {
    let save = learnWord(newSave(), "tree", START);
    save = withDue(save, ["tree"], START, false);
    save = reviewWord(save, "tree", Rating.Again, START);
    expect(parentView(save, START).reviewedToday).toBe(0);
    expect(save.dueAnswers).toEqual([]);
    expect(save.cosmeticTokens).toBe(0);
  });
});
