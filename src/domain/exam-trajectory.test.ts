import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { answerQuestion, armExamShaken, startBattle, takeAction, type BattleAction, type BattleState } from "./battle";
import { classById } from "./classes";
import { wordsForGrades } from "./catalog";
import {
  emptySession,
  scheduleForPhase,
  sessionFromSchedule,
  type ExamSession,
  type ExamWord,
} from "./exam-questions";
import { savedProfileId, settleExamAttempt } from "./exam-settlement";
import {
  EXAM_ATTACK,
  EXAM_SHAKEN_AFTER,
  examById,
  examEnemyName,
  examPhaseHp,
  examSpellingCounter,
  type ExamDef,
} from "./exams";
import { createSave } from "./progress";
import { spellingAllowed } from "./questions";
import { serialize } from "./storage";
import { starterSkillId } from "./skills";
import type { ClassId, SaveData } from "./types";

/**
 * Engine replay of IMPL_SPEC v0.2.1 items 13 and 14.
 * The full paper file is not in this repo. Twelve extracted rows are compared
 * turn by turn in exam-golden.test.ts. This file reruns the whole matrix on
 * the game battle and the exam save, with a fixed seed and clock.
 */
const NOW = Date.parse("2026-03-01T02:00:00Z");
const CLASSES: readonly ClassId[] = ["warrior", "mage", "ranger", "healer", "inventor", "explorer"];
const KINDS = ["mid", "final"] as const;
const STARS = [1, 2, 3] as const;
const BANDS = ["G3G4", "G5G6"] as const;
const LOSSES = [0, 2, 3] as const;
const ELIGIBILITY = ["all", "none"] as const;
const OFFSETS = [0, 1, 2, 3, 4] as const;

const WORD_IDS = wordsForGrades(["G3"])
  .filter((word) => word.spelling === "basic" && spellingAllowed(word, false))
  .map((word) => word.id)
  .sort()
  .slice(0, 16);

function cellSeed(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function examFor(kind: "mid" | "final", band: "G3G4" | "G5G6"): ExamDef {
  const id = kind === "mid"
    ? band === "G3G4" ? "exam_g3_s1_mid" : "exam_g5_s1_mid"
    : band === "G3G4" ? "exam_g3_s1_final" : "exam_g5_s1_final";
  const exam = examById(id);
  if (!exam) throw new Error(id);
  return exam;
}

function wordPool(eligible: "all" | "none"): ExamWord[] {
  return WORD_IDS.map((id) => ({
    id,
    mastered: false,
    learnedToday: false,
    due: false,
    canSpell: eligible === "all",
    badgeLit: false,
  }));
}

function firstPayable(state: BattleState): BattleAction {
  const slot = state.slots.find((item) => state.energy >= item.energyCost);
  if (!slot) return { type: "attack" };
  return { type: "skill", slotIndex: slot.index };
}

function answerOf(state: BattleState, correct: boolean): string {
  const question = state.question;
  if (!question) throw new Error("no question");
  if (question.kind === "spelling") return correct ? question.answer : "nope";
  if (correct) return question.answerId;
  return question.choices.find((choice) => choice.id !== question.answerId)?.id ?? "nope";
}

interface TurnLog {
  q: number;
  slot: number;
  skillId: string;
  kind: string;
  correct: boolean;
  energyBefore: number;
  energyAfter: number;
  enemyBefore: number;
  enemyAfter: number;
  playerBefore: number;
  playerAfter: number;
}

function playPhase(
  exam: ExamDef,
  classId: ClassId,
  star: number,
  losses: number,
  session: ExamSession,
  words: ExamWord[],
  seed: number,
  offset: number | null,
): { state: BattleState; turns: TurnLog[]; openingEnergy: number; openingHp: number; openingEnemy: number } {
  const hp = examPhaseHp(classId, exam.kind, losses);
  const starter = starterSkillId(classId);
  let state = startBattle({
    encounterId: exam.id,
    classId,
    learnedIds: words.map((word) => word.id),
    equippedSkillIds: [starter],
    skillLevels: { [starter]: star },
    seed,
    enemy: { name: examEnemyName(exam.kind), maxHp: hp, attack: EXAM_ATTACK, sprite: exam.id },
    phases: [{ hp, note: "" }],
    examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: examSpellingCounter(exam.grade) },
    examSchedule: scheduleForPhase(exam, session, losses, words),
  });
  if (state.energy !== 0 || state.playerHp !== state.playerMaxHp || state.supportStreak !== 0) {
    throw new Error("phase did not open fresh");
  }
  const openingEnergy = state.energy;
  const openingHp = state.playerHp;
  const openingEnemy = state.enemyHp;
  const turns: TurnLog[] = [];
  for (let guard = 0; guard < 40 && state.phase !== "won" && state.phase !== "lost"; guard += 1) {
    if (state.phase !== "choose") throw new Error(`phase ${state.phase}`);
    const action = firstPayable(state);
    if (action.type !== "skill") throw new Error("first payable action was not a slot");
    const asked = takeAction(state, action);
    if (!asked.ok || !asked.state.question) throw new Error(asked.reason ?? "no question");
    state = asked.state;
    const question = state.question;
    if (!question) throw new Error("question dropped");
    const q = turns.length + 1;
    const correct = offset === null || (q - 1) % 5 !== offset;
    const slotIndex = action.slotIndex ?? -1;
    const skillId = slotIndex >= 0 ? state.slots[slotIndex]?.skillId ?? action.type : action.type;
    const energyBefore = state.energy;
    const enemyBefore = state.enemyHp;
    const playerBefore = state.playerHp;
    state = answerQuestion(state, answerOf(state, correct));
    state = armExamShaken(state);
    turns.push({
      q,
      slot: slotIndex,
      skillId,
      kind: question.kind,
      correct,
      energyBefore,
      energyAfter: state.energy,
      enemyBefore,
      enemyAfter: state.enemyHp,
      playerBefore,
      playerAfter: state.playerHp,
    });
  }
  return { state, turns, openingEnergy, openingHp, openingEnemy };
}

interface Campaign {
  key: string;
  won: boolean;
  phases: string[];
  questions: number[];
  spellings: number[];
  trace: string;
  xp: number;
  cleared: boolean;
  eventHasProfile: boolean;
  paidPhases: number;
  bossUnequipped: boolean;
}

function replay(input: {
  classId: ClassId;
  kind: "mid" | "final";
  star: 1 | 2 | 3;
  band: "G3G4" | "G5G6";
  losses: 0 | 2 | 3;
  eligible: "all" | "none";
  offset: number | null;
}): Campaign {
  const exam = examFor(input.kind, input.band);
  const words = wordPool(input.eligible);
  const key = [
    input.classId,
    input.kind,
    `star${input.star}`,
    input.band,
    `loss${input.losses}`,
    input.eligible,
    input.offset === null ? "all-correct" : `offset${input.offset}`,
  ].join("|");
  const seed = cellSeed(key);
  let session = emptySession();
  let save = freshSave(input.classId, input.star);
  const phases: string[] = [];
  const questions: number[] = [];
  const spellings: number[] = [];
  const trace: string[] = [];
  for (let phase = 1; phase <= exam.phases; phase += 1) {
    const losses = phase === 1 ? input.losses : 0;
    const played = playPhase(exam, input.classId, input.star, losses, session, words, seed + phase, input.offset);
    if (played.openingEnergy !== 0 || played.openingHp !== classById(input.classId).maxHp) {
      throw new Error(`${key} phase ${phase} did not open fresh`);
    }
    if (played.openingEnemy !== examPhaseHp(input.classId, exam.kind, losses)) {
      throw new Error(`${key} phase ${phase} hp`);
    }
    phases.push(played.state.phase);
    questions.push(played.turns.length);
    spellings.push(played.turns.filter((turn) => turn.kind === "spelling").length);
    if (played.turns[0]?.kind === "spelling") throw new Error(`${key} phase ${phase} opened on spelling`);
    trace.push(played.turns.map((turn) => `${turn.q}:${turn.slot}:${turn.kind}:${turn.correct ? 1 : 0}:${turn.enemyAfter}:${turn.playerAfter}`).join(","));
    for (const turn of played.turns) {
      if (turn.energyBefore < 0 || turn.energyAfter < 0 || turn.energyAfter > played.state.maxEnergy) {
        throw new Error(`${key} energy`);
      }
      if (turn.enemyAfter > turn.enemyBefore) throw new Error(`${key} enemy healed`);
    }
    if (played.state.phase !== "won" || !played.state.examSchedule) break;
    const schedule = played.state.examSchedule;
    const persisted = serialize(save);
    const settled = settleExamAttempt(save, {
      examId: exam.id,
      phaseNo: phase,
      now: NOW + phase,
      won: true,
      schedule,
      persistedRaw: persisted,
    });
    if (!settled.ok) throw new Error(`${key} settle ${settled.reason}`);
    save = settled.save;
    session = sessionFromSchedule(schedule, true);
  }
  const won = phases.length === exam.phases && phases.every((phase) => phase === "won");
  const entry = save.examProgress?.[exam.id];
  const profileId = savedProfileId(serialize(save)) ?? "";
  const proof = entry?.firstClearProof?.clearEventId ?? "";
  const records = Object.values(entry?.phaseRecords ?? {});
  const paid = records.filter((record) => (
    record.passed === true
    && record.xpDisposition === "paid"
    && record.xpAmount === 20
    && record.settlementKey?.includes(profileId)
  )).length;
  const bossId = exam.kind === "mid" ? "p_060" : "p_074";
  return {
    key,
    won,
    phases,
    questions,
    spellings,
    trace: trace.join("/"),
    xp: save.xp,
    cleared: entry?.cleared === true,
    eventHasProfile: won && proof.includes(profileId) && profileId.length > 0,
    paidPhases: paid,
    bossUnequipped: save.titleParts?.equipped.prefixId !== bossId,
  };
}

function freshSave(classId: ClassId, star: number): SaveData {
  const save = createSave({
    name: "小林",
    classId: classId === "inventor" ? "warrior" : classId,
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3", "G5"],
  });
  const starter = starterSkillId(classId);
  save.player = { ...save.player, classId };
  save.skillLevels = { [starter]: star };
  save.equippedSkillIds = [starter];
  save.unlockedSkillIds = [starter];
  save.xp = 0;
  return save;
}

function expectSchedule(row: Campaign): void {
  let spells = 0;
  let asks = 0;
  const relief = row.key.includes("|loss3|");
  for (let index = 0; index < row.questions.length; index += 1) {
    const asked = row.questions[index] ?? 0;
    const spelled = row.spellings[index] ?? 0;
    expect(spelled).toBeLessThanOrEqual(4);
    if (relief && index === 0) expect(asked === 0 || spelled / asked <= 0.3 + 1e-9).toBe(true);
    spells += spelled;
    asks += asked;
  }
  const share = row.key.includes("|mid|") ? 0.4 : 0.5;
  const cap = row.key.includes("|mid|") ? 8 : 12;
  expect(spells).toBeLessThanOrEqual(cap);
  expect(asks === 0 || spells / asks <= share + 1e-9).toBe(true);
}

function cells(offset: number | null) {
  const rows: Parameters<typeof replay>[0][] = [];
  for (const classId of CLASSES) {
    for (const kind of KINDS) {
      for (const star of STARS) {
        for (const band of BANDS) {
          for (const losses of LOSSES) {
            for (const eligible of ELIGIBILITY) {
              rows.push({ classId, kind, star, band, losses, eligible, offset });
            }
          }
        }
      }
    }
  }
  return rows;
}

describe("exam trajectory replay", () => {
  it("keeps a fixed word pool for the matrix", () => {
    expect(WORD_IDS).toHaveLength(16);
    expect(new Set(WORD_IDS).size).toBe(16);
  });

  it("replays the 432 all-correct first-slot trajectories and their saves", () => {
    const rows = cells(null);
    expect(rows).toHaveLength(432);
    const again = replay(rows[0]!);
    expect(replay(rows[0]!)).toEqual(again);
    const played = rows.map((row) => replay(row));
    const lost = played.filter((row) => !row.won);
    expect(lost.map((row) => `${row.key} ${row.phases.join(",")}`)).toEqual([]);
    for (const row of played) {
      expect(row.questions.every((count) => count > 0)).toBe(true);
      expect(row.xp).toBe(20 * row.phases.length);
      expect(row.cleared).toBe(true);
      expect(row.eventHasProfile).toBe(true);
      expect(row.paidPhases).toBe(row.phases.length);
      expect(row.bossUnequipped).toBe(true);
      if (row.key.includes("|none|")) expect(row.spellings.every((count) => count === 0)).toBe(true);
      if (row.key.includes("|all|")) expect(row.spellings.some((count) => count > 0)).toBe(true);
      expectSchedule(row);
    }
  }, 120_000);

  it("replays the 2160 offset trajectories and their saves", () => {
    const rows = OFFSETS.flatMap((offset) => cells(offset));
    expect(rows).toHaveLength(2160);
    const sample = replay(rows[10]!);
    expect(replay(rows[10]!)).toEqual(sample);
    const played = rows.map((row) => replay(row));
    const lost = played.filter((row) => !row.won);
    expect(lost.map((row) => `${row.key} ${row.phases.join(",")}`)).toEqual([]);
    for (const row of played) {
      expect(row.questions.every((count) => count > 0)).toBe(true);
      expect(row.xp).toBe(20 * row.phases.length);
      expect(row.cleared).toBe(true);
      expect(row.eventHasProfile).toBe(true);
      expect(row.paidPhases).toBe(row.phases.length);
      expect(row.bossUnequipped).toBe(true);
      if (row.key.includes("|none|")) expect(row.spellings.every((count) => count === 0)).toBe(true);
      if (row.key.includes("|all|")) expect(row.spellings.some((count) => count > 0)).toBe(true);
      expectSchedule(row);
    }
  }, 180_000);
});
