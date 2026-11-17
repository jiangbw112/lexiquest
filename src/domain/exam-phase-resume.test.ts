import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { answerQuestion, armExamShaken, resumeExamBattle, startBattle, takeAction, type BattleState } from "./battle";
import { gradeChapters } from "./chapter-plan";
import { examById, EXAM_SHAKEN_AFTER, type ExamDef } from "./exams";
import {
  emptySession,
  examCardPool,
  pendingExamQuestion,
  phaseRunFromSchedule,
  pickExamQuestion,
  readPhaseRun,
  scheduleForPhase,
  scheduleFromPhaseRun,
  storedSession,
  writePhaseRun,
  type ExamWord,
} from "./exam-questions";
import { commitExamSnapshot, noteExamAnswer, settleExamAttempt, type ExamStore } from "./exam-settlement";
import { createSave, gradeIsOpen, learnWord } from "./progress";
import { SAVE_KEY, deserialize, serialize } from "./storage";
import type { ExamPhaseRunRecord, ExamSessionRecord, SaveData } from "./types";

const NOW = Date.parse("2026-03-01T02:00:00Z");
const YESTERDAY = NOW - 24 * 60 * 60 * 1000;
const EXAM_ID = "exam_g3_s1_mid";

function fresh(): SaveData {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3", "G4", "G5", "G6"],
  });
}

function memoryStore(): ExamStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get(key) {
      return map.get(key) ?? null;
    },
    set(key, value) {
      map.set(key, value);
    },
  };
}

function learned(): { save: SaveData; exam: ExamDef; words: ExamWord[] } {
  const exam = examById(EXAM_ID);
  if (!exam) throw new Error(EXAM_ID);
  let save = fresh();
  const ids = exam.chapters.flatMap((id) => gradeChapters(exam.grade).find((chapter) => chapter.id === id)?.wordIds ?? []).slice(0, 16);
  for (const id of ids) save = learnWord(save, id, new Date(YESTERDAY));
  const words = examCardPool(save, exam, new Date(NOW), gradeIsOpen);
  return { save, exam, words };
}

function openPhase(save: SaveData, exam: ExamDef, words: ExamWord[], seed: number): BattleState {
  return startBattle({
    encounterId: exam.id,
    classId: save.player.classId,
    learnedIds: words.map((word) => word.id),
    equippedSkillIds: save.equippedSkillIds,
    skillLevels: save.skillLevels,
    unlockedSkillIds: save.unlockedSkillIds,
    seed,
    enemy: { name: "boss", maxHp: 120, attack: 8, sprite: exam.id },
    phases: [{ hp: 120, note: "" }],
    examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: null },
    examSchedule: scheduleForPhase(exam, storedSession(save, exam.id, false), 0, words),
  });
}

function deal(state: BattleState): BattleState {
  const asked = takeAction(state, { type: "attack" });
  if (!asked.ok || !asked.state.question || !asked.state.examSchedule) throw new Error(asked.reason ?? "deal");
  return asked.state;
}

function answer(state: BattleState): BattleState {
  const question = state.question;
  if (!question) throw new Error("no question");
  const choice = question.kind === "spelling" ? question.answer : question.answerId;
  return armExamShaken(answerQuestion(state, choice));
}

function capture(state: BattleState, seed: number, pending: boolean): ExamPhaseRunRecord {
  const schedule = state.examSchedule;
  const question = state.question;
  if (!schedule) throw new Error("schedule");
  return phaseRunFromSchedule(schedule, {
    phaseNo: 1,
    seed,
    casts: state.casts,
    pending: pending && question
      ? { wordId: question.wordId, kind: question.kind === "spelling" ? "spelling" : "meaning" }
      : null,
  });
}

function park(save: SaveData, run: ExamPhaseRunRecord): string {
  const store = memoryStore();
  const base = serialize(save);
  store.set(SAVE_KEY, base);
  const next = writePhaseRun(save, EXAM_ID, run);
  if (!commitExamSnapshot(store, SAVE_KEY, base, serialize(next))) throw new Error("snapshot");
  return store.get(SAVE_KEY) ?? "";
}

function reload(raw: string, save: SaveData, exam: ExamDef, words: ExamWord[]) {
  const loaded = deserialize(raw);
  if (!loaded) throw new Error("reload");
  const run = readPhaseRun(loaded, exam.id, 1);
  if (!run) throw new Error("run");
  const schedule = scheduleFromPhaseRun(run, words);
  const state = resumeExamBattle(openPhase(save, exam, words, run.seed), run, words);
  state.examSchedule = schedule;
  return { loaded, run, state };
}

function upcoming(state: BattleState, count: number): string[] {
  const ids: string[] = [];
  let cursor = state;
  if (cursor.phase === "question" && cursor.question) {
    ids.push(cursor.question.wordId);
    cursor = answer(cursor);
  }
  while (ids.length < count) {
    cursor = deal(cursor);
    if (!cursor.question) throw new Error("missing");
    ids.push(cursor.question.wordId);
    cursor = answer(cursor);
  }
  return ids;
}

describe("exam phase resume", () => {
  it("reloads the same remaining order and does not redraw answered words", () => {
    const { save, exam, words } = learned();
    expect(words.length).toBeGreaterThanOrEqual(8);
    const seed = 424242;
    const control = openPhase(save, exam, words, seed);
    const dealt: BattleState[] = [];
    let cursor = control;
    for (let i = 0; i < 6; i += 1) {
      cursor = deal(cursor);
      dealt.push(cursor);
      cursor = answer(cursor);
    }
    const order = dealt.map((state) => state.question?.wordId);
    expect(new Set(order).size).toBe(order.length);

    const opened = park(save, capture(control, seed, false));
    const fromStart = reload(opened, save, exam, words);
    expect(fromStart.state.phase).toBe("choose");
    expect(fromStart.state.question).toBeNull();
    expect(upcoming(fromStart.state, 6)).toEqual(order);

    const shown = dealt[0];
    if (!shown?.question) throw new Error("shown");
    const justShown = park(save, capture(shown, seed, true));
    const fromShown = reload(justShown, save, exam, words);
    expect(fromShown.state.phase).toBe("question");
    expect(fromShown.state.question).toEqual(shown.question);
    expect(pendingExamQuestion(fromShown.run, words)).toEqual(shown.question);
    expect(upcoming(fromShown.state, 6)).toEqual(order);

    let answered = control;
    const answeredIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      answered = deal(answered);
      const question = answered.question;
      if (!question) throw new Error("answer");
      answeredIds.push(question.wordId);
      answered = answer(answered);
    }
    const afterAnswers = park(save, capture(answered, seed, false));
    const first = reload(afterAnswers, save, exam, words);
    const second = reload(afterAnswers, save, exam, words);
    expect(first.state.phase).toBe("choose");
    expect(upcoming(first.state, 3)).toEqual(order.slice(3));
    expect(upcoming(second.state, 3)).toEqual(order.slice(3));
    for (const id of answeredIds) {
      expect(order.slice(3)).not.toContain(id);
      expect(first.run.phaseWords).toContain(id);
    }
    expect(first.loaded.xp).toBe(save.xp);
    expect(readPhaseRun(first.loaded, exam.id, 1)?.casts).toBe(3);
    expect(readPhaseRun(deserialize(afterAnswers) ?? save, exam.id, 1)?.casts).toBe(3);
  });

  it("pays xp and fight counts once when the same snapshot is settled twice", () => {
    const { save, exam, words } = learned();
    const seed = 424242;
    let cursor = openPhase(save, exam, words, seed);
    let draft = save;
    for (let i = 0; i < 3; i += 1) {
      cursor = deal(cursor);
      const question = cursor.question;
      if (!question) throw new Error("deal");
      cursor = answer(cursor);
      draft = noteExamAnswer(draft, {
        wordId: question.wordId,
        correct: true,
        now: new Date(NOW),
        dueAtStart: [],
        spelling: question.kind === "spelling",
      });
    }
    const run = capture(cursor, seed, false);
    const raw = park(draft, run);
    const loaded = deserialize(raw);
    if (!loaded) throw new Error("reload");
    expect(loaded.xp).toBe(save.xp);
    expect(loaded.examProgress?.[EXAM_ID]?.phaseRecords).toBeUndefined();
    const schedule = scheduleFromPhaseRun(readPhaseRun(loaded, exam.id, 1) ?? run, words);
    const once = settleExamAttempt(loaded, {
      examId: exam.id,
      phaseNo: 1,
      now: NOW,
      won: true,
      schedule,
      persistedRaw: raw,
    });
    expect(once.ok).toBe(true);
    expect(once.xpGained).toBeGreaterThan(0);
    expect(once.save.xp).toBe(save.xp + once.xpGained);
    expect(once.save.examProgress?.[EXAM_ID]?.phaseRun).toBeUndefined();
    expect(once.save.examProgress?.[EXAM_ID]?.session?.fightQuestions).toBe(schedule.phaseQuestions);
    expect(once.save.examProgress?.[EXAM_ID]?.session?.fightSpelling).toBe(schedule.phaseSpelling);
    const settledRaw = serialize(once.save);
    const twice = settleExamAttempt(once.save, {
      examId: exam.id,
      phaseNo: 1,
      now: NOW,
      won: true,
      schedule,
      persistedRaw: settledRaw,
    });
    expect(twice.xpGained).toBe(0);
    expect(twice.alreadyPassed).toBe(true);
    expect(twice.save.xp).toBe(once.save.xp);
    expect(twice.save.examProgress?.[EXAM_ID]?.session?.fightQuestions).toBe(once.save.examProgress?.[EXAM_ID]?.session?.fightQuestions);
    expect(twice.save.examProgress?.[EXAM_ID]?.session?.fightSpelling).toBe(once.save.examProgress?.[EXAM_ID]?.session?.fightSpelling);
    expect(twice.save.examProgress?.[EXAM_ID]?.session?.asks).toEqual(once.save.examProgress?.[EXAM_ID]?.session?.asks);
    const store = memoryStore();
    store.set(SAVE_KEY, serialize(save));
    store.set(SAVE_KEY, serialize({ ...save, xp: save.xp + 1 }));
    expect(commitExamSnapshot(store, SAVE_KEY, serialize(save), serialize(writePhaseRun(save, EXAM_ID, run)))).toBe(false);
    expect(deserialize(store.get(SAVE_KEY) ?? "")?.examProgress?.[EXAM_ID]?.phaseRun).toBeUndefined();
  });

  it("drops a broken phase run and a broken session without a NaN question", () => {
    const { exam, words } = learned();
    const save = fresh();
    save.examProgress = {
      [EXAM_ID]: {
        session: { asks: { w: null } } as unknown as ExamSessionRecord,
        phaseRun: { asks: { w: null }, phaseNo: 1, seed: Number.NaN } as unknown as ExamPhaseRunRecord,
      },
    };
    expect(() => storedSession(save, EXAM_ID, false)).not.toThrow();
    expect(() => readPhaseRun(save, EXAM_ID, 1)).not.toThrow();
    expect(storedSession(save, EXAM_ID, false)).toEqual(emptySession());
    expect(readPhaseRun(save, EXAM_ID, 1)).toBeNull();
    const schedule = scheduleForPhase(exam, storedSession(save, EXAM_ID, false), 0, words);
    const question = pickExamQuestion(schedule, 1);
    expect(question?.prompt ?? "").not.toContain("NaN");
    expect(Number.isInteger(schedule.sessionIndex)).toBe(true);
    const raw = serialize(save);
    const loaded = deserialize(raw);
    expect(loaded).not.toBeNull();
    expect(readPhaseRun(loaded ?? save, EXAM_ID, 1)).toBeNull();
    expect(storedSession(loaded ?? save, EXAM_ID, false)).toEqual(emptySession());
    const scene = readFileSync(new URL("../game/scenes/ExamBattleScene.ts", import.meta.url), "utf8");
    const begin = scene.slice(scene.indexOf("private beginPhase"), scene.indexOf("private drawIntro"));
    const act = scene.slice(scene.indexOf("private act("), scene.indexOf("private choose"));
    const choose = scene.slice(scene.indexOf("private choose"), scene.indexOf("private submitSpelling"));
    expect(begin).toContain("readPhaseRun");
    expect(begin).toContain("resumeExamBattle");
    expect(begin).toContain("Date.now()");
    expect(act).toContain("persistPhase");
    expect(choose.indexOf("noteExamAnswer")).toBeGreaterThan(-1);
    expect(choose.indexOf("noteExamAnswer")).toBeLessThan(choose.indexOf("persistPhase"));
    expect(choose.indexOf("persistPhase")).toBeLessThan(choose.indexOf("this.persist("));
    expect(scene).toContain("commitExamSnapshot");
  });
});
