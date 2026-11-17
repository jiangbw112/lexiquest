import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { answerQuestion, armExamShaken, resumeExamBattle, startBattle, takeAction, type BattleState } from "./battle";
import { formatMeaning, wordById } from "./catalog";
import { gradeChapters } from "./chapter-plan";
import { EXAM_SHAKEN_AFTER, examById, examSpellingCounter, type ExamDef } from "./exams";
import {
  examCardPool,
  phaseRunFromSchedule,
  readPhaseRun,
  scheduleForPhase,
  scheduleFromPhaseRun,
  storedSession,
  writePhaseRun,
  type ExamWord,
} from "./exam-questions";
import { noteExamAnswer, settleExamAttempt, type ExamAttemptResult } from "./exam-settlement";
import { createSave, gradeIsOpen, learnWord } from "./progress";
import { serialize } from "./storage";
import type { ExamPhaseRunRecord, SaveData } from "./types";

const NOW = Date.parse("2026-03-01T02:00:00Z");
const YESTERDAY = NOW - 24 * 60 * 60 * 1000;
const EXAM_ID = "exam_g3_s1_mid";
const SEED = 909090;

function learned(): { save: SaveData; exam: ExamDef; words: ExamWord[] } {
  const exam = examById(EXAM_ID);
  if (!exam) throw new Error(EXAM_ID);
  let save = createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3", "G4", "G5", "G6"],
  });
  const ids = exam.chapters.flatMap((id) => gradeChapters(exam.grade).find((chapter) => chapter.id === id)?.wordIds ?? []).slice(0, 16);
  for (const id of ids) save = learnWord(save, id, new Date(YESTERDAY));
  for (const id of ids) {
    const card = save.wordCards[id];
    const memory = save.memory[id];
    if (!card || !memory) continue;
    save = {
      ...save,
      wordCards: { ...save.wordCards, [id]: { ...card, masteryBadge: true } },
      memory: {
        ...save.memory,
        [id]: { ...memory, fsrs: { ...memory.fsrs, due: "2099-01-01T00:00:00.000Z" } },
      },
    };
  }
  return { save, exam, words: examCardPool(save, exam, new Date(NOW), gradeIsOpen) };
}

function openPhase(save: SaveData, exam: ExamDef, words: ExamWord[]): BattleState {
  return startBattle({
    encounterId: exam.id,
    classId: save.player.classId,
    learnedIds: words.map((word) => word.id),
    equippedSkillIds: save.equippedSkillIds,
    skillLevels: save.skillLevels,
    unlockedSkillIds: save.unlockedSkillIds,
    seed: SEED,
    enemy: { name: "期中守护者", maxHp: 400, attack: 1, sprite: exam.id },
    phases: [{ hp: 400, note: "" }],
    examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: examSpellingCounter(exam.grade) },
    examSchedule: scheduleForPhase(exam, storedSession(save, exam.id, false), 0, words),
  });
}

function deal(state: BattleState): BattleState {
  const asked = takeAction(state, { type: "attack" });
  if (!asked.ok || !asked.state.question) throw new Error(asked.reason ?? "deal");
  return asked.state;
}

function wrongChoice(state: BattleState): string {
  const question = state.question;
  if (!question) throw new Error("no question");
  if (question.kind === "spelling") return "miss";
  return question.choices.find((item) => item.id !== question.answerId)?.id ?? "miss";
}

function quiet(state: BattleState): BattleState {
  return { ...state, answerReveal: null };
}

interface Fight {
  save: SaveData;
  exam: ExamDef;
  words: ExamWord[];
  cursor: BattleState;
  draft: SaveData;
  shown: { kind: string; english: string; chinese: string }[];
}

function fight(base: { save: SaveData; exam: ExamDef; words: ExamWord[] }, keepReveal: boolean): Fight {
  let cursor = openPhase(base.save, base.exam, base.words);
  let draft = base.save;
  const shown: Fight["shown"] = [];
  let meaning = false;
  let spelling = false;
  for (let i = 0; i < 12 && (!meaning || !spelling); i += 1) {
    cursor = deal(cursor);
    expect(cursor.phase).toBe("question");
    expect(cursor.answerReveal).toBeNull();
    const question = cursor.question;
    if (!question) throw new Error("question");
    cursor = answerQuestion(cursor, wrongChoice(cursor));
    const word = wordById(question.wordId);
    if (!word) throw new Error(question.wordId);
    const reveal = { english: word.english, chinese: formatMeaning(word) };
    expect(cursor.answerReveal).toEqual(reveal);
    expect(reveal.chinese).toContain(word.chinese);
    shown.push({ kind: question.kind, english: reveal.english, chinese: reveal.chinese });
    if (question.kind === "spelling") spelling = true;
    else meaning = true;
    if (!keepReveal) cursor = quiet(cursor);
    cursor = armExamShaken(cursor);
    draft = noteExamAnswer(draft, {
      wordId: question.wordId,
      correct: false,
      now: new Date(NOW),
      dueAtStart: [],
      spelling: question.kind === "spelling",
    });
  }
  expect(meaning).toBe(true);
  expect(spelling).toBe(true);
  return { save: base.save, exam: base.exam, words: base.words, cursor, draft, shown };
}

function runOf(cursor: BattleState): ExamPhaseRunRecord {
  const schedule = cursor.examSchedule;
  if (!schedule) throw new Error("schedule");
  return phaseRunFromSchedule(schedule, { phaseNo: 1, seed: SEED, casts: cursor.casts, pending: null });
}

function settleWon(draft: SaveData, run: ExamPhaseRunRecord, exam: ExamDef, words: ExamWord[], won: boolean): ExamAttemptResult {
  const withRun = writePhaseRun(draft, exam.id, run);
  const schedule = scheduleFromPhaseRun(run, words);
  return settleExamAttempt(withRun, {
    examId: exam.id,
    phaseNo: 1,
    now: NOW,
    won,
    schedule,
    persistedRaw: serialize(withRun),
  });
}

describe("exam wrong answer reveal", () => {
  it("shows English and Chinese after a miss, including spelling, and clears it on the next question", () => {
    const base = learned();
    expect(base.words.length).toBeGreaterThanOrEqual(8);
    const kept = fight(base, true);
    const hidden = fight(base, false);
    expect(kept.shown.some((item) => item.kind === "meaning")).toBe(true);
    expect(kept.shown.some((item) => item.kind === "spelling")).toBe(true);
    expect(kept.shown).toEqual(hidden.shown);
    expect(kept.cursor.answerReveal).toEqual({
      english: kept.shown.at(-1)?.english,
      chinese: kept.shown.at(-1)?.chinese,
    });
    expect(hidden.cursor.answerReveal).toBeNull();
    const next = deal(kept.cursor);
    expect(next.phase).toBe("question");
    expect(next.answerReveal).toBeNull();
    expect(next.question).not.toBeNull();

    const scene = readFileSync(new URL("../game/scenes/ExamBattleScene.ts", import.meta.url), "utf8");
    const painter = readFileSync(new URL("../game/answer-reveal.ts", import.meta.url), "utf8");
    const draw = scene.slice(scene.indexOf("private drawFight"), scene.indexOf("private act("));
    expect(draw).toContain("paintAnswerReveal");
    expect(draw).toContain("parent: this.view");
    expect(draw).toContain('hidden: state.phase === "question"');
    const speakAt = painter.indexOf("speakWord(reveal.english, browserSpeaker())");
    const listenAt = painter.indexOf("听一听");
    const arrow = `() =${String.fromCodePoint(0x3e)}`;
    expect(listenAt).toBeGreaterThan(-1);
    expect(speakAt).toBeGreaterThan(listenAt);
    expect(painter.slice(listenAt, speakAt)).toContain(arrow);
    expect(scene).not.toContain("speakWord");
  });

  it("keeps the score, the settlement, and the ledger the same when the reveal is dropped", () => {
    const base = learned();
    const kept = fight(base, true);
    const hidden = fight(base, false);
    expect(quiet(kept.cursor)).toEqual(hidden.cursor);
    expect(kept.draft).toEqual(hidden.draft);
    expect(kept.draft.xp).toBe(base.save.xp);
    expect(kept.draft.battlesWon).toBe(base.save.battlesWon);
    expect(kept.draft.battlesLost).toBe(base.save.battlesLost);
    const keptRun = runOf(kept.cursor);
    const hiddenRun = runOf(hidden.cursor);
    expect(keptRun).toEqual(hiddenRun);
    const keptWon = settleWon(kept.draft, keptRun, kept.exam, kept.words, true);
    const hiddenWon = settleWon(hidden.draft, hiddenRun, hidden.exam, hidden.words, true);
    expect(keptWon.ok).toBe(true);
    expect(keptWon.xpGained).toBeGreaterThan(0);
    expect(keptWon.xpGained).toBe(hiddenWon.xpGained);
    expect(keptWon.alreadyPassed).toBe(false);
    expect(keptWon.save.xp).toBe(base.save.xp + keptWon.xpGained);
    expect(keptWon.save).toEqual(hiddenWon.save);
    expect(keptWon.save.examProgress?.[EXAM_ID]?.phaseRecords).toEqual(hiddenWon.save.examProgress?.[EXAM_ID]?.phaseRecords);
    expect(keptWon.save.titleGrantLedger).toEqual(hiddenWon.save.titleGrantLedger);
    expect(keptWon.save.titleReceipts).toEqual(hiddenWon.save.titleReceipts);
    const keptLoss = settleWon(kept.draft, keptRun, kept.exam, kept.words, false);
    const hiddenLoss = settleWon(hidden.draft, hiddenRun, hidden.exam, hidden.words, false);
    expect(keptLoss.xpGained).toBe(0);
    expect(keptLoss.save.xp).toBe(base.save.xp);
    expect(keptLoss.save).toEqual(hiddenLoss.save);
    const again = settleExamAttempt(keptWon.save, {
      examId: kept.exam.id,
      phaseNo: 1,
      now: NOW,
      won: true,
      schedule: scheduleFromPhaseRun(keptRun, kept.words),
      persistedRaw: serialize(keptWon.save),
    });
    const againHidden = settleExamAttempt(hiddenWon.save, {
      examId: hidden.exam.id,
      phaseNo: 1,
      now: NOW,
      won: true,
      schedule: scheduleFromPhaseRun(hiddenRun, hidden.words),
      persistedRaw: serialize(hiddenWon.save),
    });
    expect(again.alreadyPassed).toBe(true);
    expect(again.xpGained).toBe(0);
    expect(again.save.xp).toBe(keptWon.save.xp);
    expect(again.save.examProgress?.[EXAM_ID]?.phaseRecords).toEqual(keptWon.save.examProgress?.[EXAM_ID]?.phaseRecords);
    expect(again.save.titleGrantLedger).toEqual(keptWon.save.titleGrantLedger);
    expect(again.save).toEqual(againHidden.save);
    expect(again.save.examProgress?.[EXAM_ID]?.session?.fightQuestions).toBe(keptWon.save.examProgress?.[EXAM_ID]?.session?.fightQuestions);
    expect(again.save.examProgress?.[EXAM_ID]?.session?.fightSpelling).toBe(keptWon.save.examProgress?.[EXAM_ID]?.session?.fightSpelling);
  });

  it("resumes the same remaining order with the reveal cleared, and still settles once", () => {
    const base = learned();
    const kept = fight(base, true);
    const hidden = fight(base, false);
    const run = runOf(kept.cursor);
    expect(run).toEqual(runOf(hidden.cursor));
    const resumed = resumeExamBattle({ ...openPhase(base.save, base.exam, base.words), answerReveal: kept.cursor.answerReveal }, run, base.words);
    const resumedHidden = resumeExamBattle(openPhase(base.save, base.exam, base.words), runOf(hidden.cursor), base.words);
    expect(resumed.phase).toBe("choose");
    expect(resumed.answerReveal).toBeNull();
    expect(resumedHidden.answerReveal).toBeNull();
    expect(quiet(resumed)).toEqual(quiet(resumedHidden));
    const asked = deal(quiet(kept.cursor));
    const pendingRun = phaseRunFromSchedule(asked.examSchedule!, {
      phaseNo: 1,
      seed: SEED,
      casts: asked.casts,
      pending: { wordId: asked.question!.wordId, kind: asked.question!.kind === "spelling" ? "spelling" : "meaning" },
    });
    const continued = resumeExamBattle(
      { ...openPhase(base.save, base.exam, base.words), answerReveal: { english: "tree", chinese: "n. 树" } },
      pendingRun,
      base.words,
    );
    expect(continued.phase).toBe("question");
    expect(continued.question?.wordId).toBe(asked.question?.wordId);
    expect(continued.answerReveal).toBeNull();
    expect(readPhaseRun(writePhaseRun(base.save, EXAM_ID, pendingRun), EXAM_ID, 1)?.pending).toEqual(pendingRun.pending);
    const paid = settleWon(kept.draft, run, kept.exam, kept.words, true);
    const paidAgain = settleExamAttempt(paid.save, {
      examId: kept.exam.id,
      phaseNo: 1,
      now: NOW,
      won: true,
      schedule: scheduleFromPhaseRun(run, kept.words),
      persistedRaw: serialize(paid.save),
    });
    expect(paidAgain.alreadyPassed).toBe(true);
    expect(paidAgain.xpGained).toBe(0);
    expect(paidAgain.save.xp).toBe(paid.save.xp);
    expect(paidAgain.save.titleGrantLedger).toEqual(paid.save.titleGrantLedger);
    expect(paidAgain.save.examProgress?.[EXAM_ID]?.phaseRecords).toEqual(paid.save.examProgress?.[EXAM_ID]?.phaseRecords);
  });

  it("does not create a card or write learning and review data", () => {
    const base = learned();
    const kept = fight(base, true);
    expect(kept.draft.wordCards).toEqual(base.save.wordCards);
    expect(kept.draft.memory).toEqual(base.save.memory);
    expect(kept.draft.dueAnswers).toEqual(base.save.dueAnswers);
    expect(Object.keys(kept.draft.wordCards).sort()).toEqual(Object.keys(base.save.wordCards).sort());
    const stranger = "not-a-word";
    expect(base.save.wordCards[stranger]).toBeUndefined();
    expect(kept.draft.wordCards[stranger]).toBeUndefined();
    expect(kept.draft.memory[stranger]).toBeUndefined();
    const scene = readFileSync(new URL("../game/scenes/ExamBattleScene.ts", import.meta.url), "utf8");
    const choose = scene.slice(scene.indexOf("private choose"), scene.indexOf("private submitSpelling"));
    const finish = scene.slice(scene.indexOf("private finishPhase"), scene.indexOf("private persistPhase"));
    expect(choose).not.toContain("answerReveal");
    expect(finish).not.toContain("answerReveal");
    expect(choose.indexOf("noteExamAnswer")).toBeGreaterThan(-1);
    expect(choose.indexOf("noteExamAnswer")).toBeLessThan(choose.indexOf("persistPhase"));
    expect(choose.indexOf("persistPhase")).toBeLessThan(choose.indexOf("this.persist("));
    expect(finish).toContain("settleExamAttempt");
  });
});
