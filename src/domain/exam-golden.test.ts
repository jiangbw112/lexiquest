import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answerQuestion, armExamShaken, startBattle, takeAction, type BattleState } from "./battle";
import { classById } from "./classes";
import { wordsForGrades } from "./catalog";
import { emptySession, scheduleForPhase, type ExamWord } from "./exam-questions";
import {
  EXAM_ATTACK,
  EXAM_SHAKEN_AFTER,
  examById,
  examEnemyName,
  examPhaseHp,
  examSpellingCounter,
  type ExamDef,
} from "./exams";
import { quizForWord, spellingAllowed, spellingQuestion } from "./questions";
import { castEffect, starterSkillId } from "./skills";
import type { ClassId } from "./types";

/**
 * Question-by-question comparison with the paper model.
 * The full exam_r2prime_v2_trajectories.json is not committed.
 * The fixture is the twelve-row extract. Its numbers are not edited.
 */
const FIXTURE = new URL("./fixtures/exam-r2prime-golden-samples.json", import.meta.url);
const SOURCE_SHA = "797db3fa7c923ffffa6db653c24a86bbc326aec5f837aad786bafe439cc175f7";

type Snap = [number, number, number, number, number, number, boolean, number];
type TraceRow = [number, boolean, boolean, number, string, number, Snap, Snap | null, string];

interface PaperPhase {
  phase: number;
  result: string;
  q: number;
  spell: number;
  hp: number;
  used: [number, number];
  t: TraceRow[];
}

interface PaperRow {
  result: string;
  phases: PaperPhase[];
}

interface PaperFile {
  source: string;
  source_sha256: string;
  model_main: string;
  rows: Record<string, PaperRow>;
}

interface Gap {
  key: string;
  phase: number;
  q: number;
  field: string;
  expected: string;
  actual: string;
}

const WORDS = wordsForGrades(["G3"])
  .filter((word) => word.spelling === "basic" && spellingAllowed(word, false))
  .map((word) => word.id)
  .sort()
  .slice(0, 16);

function paper(): PaperFile {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as PaperFile;
}

function examFor(kind: "mid" | "final", band: "G3G4" | "G5G6"): ExamDef {
  const id = kind === "mid"
    ? band === "G3G4" ? "exam_g3_s1_mid" : "exam_g5_s1_mid"
    : band === "G3G4" ? "exam_g3_s1_final" : "exam_g5_s1_final";
  const exam = examById(id);
  if (!exam) throw new Error(id);
  return exam;
}

function wordPool(eligibleAll: boolean): ExamWord[] {
  return WORDS.map((id) => ({
    id,
    mastered: false,
    learnedToday: false,
    due: false,
    canSpell: eligibleAll,
    badgeLit: false,
  }));
}

function snap(state: BattleState): Snap {
  return [
    state.enemyHp,
    state.playerHp,
    state.energy,
    state.guard,
    0,
    state.supportStreak,
    state.shaken,
    0,
  ];
}

function withScriptedKind(state: BattleState, spell: boolean): BattleState {
  const question = state.question;
  if (!question) throw new Error("no question");
  if ((question.kind === "spelling") === spell) return state;
  if (spell) {
    const next = spellingQuestion(WORDS[0] ?? "", false);
    if (!next) throw new Error("no spelling question");
    return { ...state, question: next };
  }
  const wordId = question.wordId || WORDS[0] || "";
  return { ...state, question: quizForWord(wordId, 1, "zh-to-en") };
}

function answerScripted(state: BattleState, correct: boolean): BattleState {
  const question = state.question;
  if (!question) throw new Error("no question");
  if (question.kind === "spelling") return answerQuestion(state, correct ? question.answer : "nope");
  if (correct) return answerQuestion(state, question.answerId);
  const wrong = question.choices.find((choice) => choice.id !== question.answerId)?.id ?? "nope";
  return answerQuestion(state, wrong);
}

function replay(key: string, row: PaperRow): Gap[] {
  const [classId, kind, starText, band, lossText, eligible] = key.split("|");
  if (!classId || !kind || !starText || !band || !lossText || !eligible) throw new Error(key);
  const star = Number(starText.slice("star".length));
  const losses = Number(lossText.slice("loss".length));
  const exam = examFor(kind as "mid" | "final", band as "G3G4" | "G5G6");
  const words = wordPool(eligible === "eligible_all");
  const starter = starterSkillId(classId as ClassId);
  const gaps: Gap[] = [];
  let asked = 0;
  let spelled = 0;
  for (const phase of row.phases) {
    const tableHp = examPhaseHp(classId as ClassId, exam.kind, losses);
    if (tableHp !== phase.hp) {
      gaps.push({
        key,
        phase: phase.phase,
        q: 0,
        field: "hp",
        expected: String(phase.hp),
        actual: String(tableHp),
      });
    }
    let state = startBattle({
      encounterId: exam.id,
      classId: classId as ClassId,
      learnedIds: words.map((word) => word.id),
      equippedSkillIds: [starter],
      skillLevels: { [starter]: star },
      seed: 1,
      enemy: {
        name: examEnemyName(exam.kind),
        maxHp: phase.hp,
        attack: EXAM_ATTACK,
        sprite: exam.id,
      },
      phases: [{ hp: phase.hp, note: "" }],
      examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: examSpellingCounter(exam.grade) },
      examSchedule: scheduleForPhase(exam, emptySession(), losses, words),
    });
    if (state.playerHp !== classById(classId as ClassId).maxHp || state.energy !== 0) {
      gaps.push({
        key,
        phase: phase.phase,
        q: 0,
        field: "opening",
        expected: `hp ${classById(classId as ClassId).maxHp} energy 0`,
        actual: `hp ${state.playerHp} energy ${state.energy}`,
      });
    }
    for (const turn of phase.t) {
      const [q, spell, correct, slot, kind, damage, before, after, result] = turn;
      asked += 1;
      if (spell) spelled += 1;
      const actualBefore = snap(state);
      if (JSON.stringify(actualBefore) !== JSON.stringify(before)) {
        gaps.push({
          key,
          phase: phase.phase,
          q,
          field: "before",
          expected: JSON.stringify(before),
          actual: JSON.stringify(actualBefore),
        });
      }
      const askedAction = takeAction(state, { type: "skill", slotIndex: slot });
      if (!askedAction.ok || !askedAction.state.question) {
        gaps.push({
          key,
          phase: phase.phase,
          q,
          field: "action",
          expected: `slot ${slot}`,
          actual: askedAction.reason ?? "no question",
        });
        break;
      }
      state = withScriptedKind(askedAction.state, spell);
      const played = state.slots[slot];
      if (!played || played.kind !== kind) {
        gaps.push({
          key,
          phase: phase.phase,
          q,
          field: "kind",
          expected: kind,
          actual: played?.kind ?? "missing",
        });
      }
      const dealt = played ? castEffect(played, correct, state.rules.wrongAnswerMultiplier) : -1;
      if (dealt !== damage) {
        gaps.push({
          key,
          phase: phase.phase,
          q,
          field: "damage",
          expected: String(damage),
          actual: String(dealt),
        });
      }
      const enemyBeforeHit = state.enemyHp;
      state = answerScripted(state, correct);
      if (result === "won") {
        if (state.phase !== "won") {
          gaps.push({
            key,
            phase: phase.phase,
            q,
            field: "result",
            expected: "won",
            actual: `${state.phase} enemy ${state.enemyHp} player ${state.playerHp}`,
          });
        }
        if (after !== null) {
          gaps.push({
            key,
            phase: phase.phase,
            q,
            field: "after",
            expected: "null",
            actual: JSON.stringify(after),
          });
        }
      } else {
        const enemyDrop = enemyBeforeHit - state.enemyHp;
        if (enemyDrop !== damage) {
          gaps.push({
            key,
            phase: phase.phase,
            q,
            field: "damage",
            expected: String(damage),
            actual: String(enemyDrop),
          });
        }
        if (after) {
          const actualAfter = snap(state);
          if (JSON.stringify(actualAfter) !== JSON.stringify(after)) {
            gaps.push({
              key,
              phase: phase.phase,
              q,
              field: "after",
              expected: JSON.stringify(after),
              actual: JSON.stringify(actualAfter),
            });
          }
        }
        if (state.phase !== "choose") {
          gaps.push({
            key,
            phase: phase.phase,
            q,
            field: "result",
            expected: "go",
            actual: state.phase,
          });
          break;
        }
      }
      state = armExamShaken(state);
    }
    if (state.phase !== phase.result) {
      gaps.push({
        key,
        phase: phase.phase,
        q: phase.q,
        field: "phase",
        expected: phase.result,
        actual: state.phase,
      });
    }
    if (phase.q !== phase.t.length || phase.spell !== phase.t.filter((turn) => turn[1]).length) {
      gaps.push({
        key,
        phase: phase.phase,
        q: phase.q,
        field: "q/spell",
        expected: `${phase.q}/${phase.spell}`,
        actual: `${phase.t.length}/${phase.t.filter((turn) => turn[1]).length}`,
      });
    }
    if (phase.used[0] !== asked || phase.used[1] !== spelled) {
      gaps.push({
        key,
        phase: phase.phase,
        q: phase.q,
        field: "used",
        expected: phase.used.join(","),
        actual: `${asked},${spelled}`,
      });
    }
  }
  if (row.result !== "won") {
    gaps.push({ key, phase: 0, q: 0, field: "result", expected: "won", actual: row.result });
  }
  return gaps;
}

describe("paper golden exam samples", () => {
  it("keeps the twelve-row extract tied to the full trajectory file", () => {
    const file = paper();
    expect(file.source).toBe("exam_r2prime_v2_trajectories.json");
    expect(file.source_sha256).toBe(SOURCE_SHA);
    expect(file.model_main).toBe("4a34add23274b15790ff12b397818d2bcdb5e95c");
    expect(Object.keys(file.rows)).toHaveLength(12);
  });

  it("replays twelve paper golden samples including shaken", () => {
    const file = paper();
    const gaps = Object.entries(file.rows).flatMap(([key, row]) => replay(key, row));
    expect(gaps).toEqual([]);
  });
});
