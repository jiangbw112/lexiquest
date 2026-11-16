import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { answerQuestion, armExamShaken, startBattle, takeAction } from "./battle";
import { isMastered } from "./cards";
import { gradeChapters, isChapterUnlocked, spellingSkipIds } from "./chapter-plan";
import { isClassSelectable } from "./class-unlock";
import {
  EXAM_NO_QUESTION,
  examAnswerSpelling,
  examCardPool,
  noteExamAsk,
  pickExamQuestion,
  scheduleForPhase,
  sessionFromSchedule,
  spellingExclusionIds,
  storedSession,
  emptySession,
} from "./exam-questions";
import {
  backfillInventorRecord,
  claimExamLock,
  commitExamSnapshot,
  migrateExamRewards,
  noteExamAnswer,
  savedProfileId,
  settleExamAttempt,
  type ExamStore,
} from "./exam-settlement";
import {
  EXAM_BOSS_SCALE,
  EXAM_ID_LIST,
  EXAM_SHAKEN_AFTER,
  battleEnemyName,
  deliverExamPointer,
  examById,
  examEnemyName,
  examIntroParts,
  examShakenLine,
  examNodeStatus,
  examPhaseHp,
  examShowsCompass,
  examUnlocked,
} from "./exams";
import { examAtlases, examLayers } from "../game/art/exam-art";
import { applyBattleOutcome, createSave, gradeIsOpen, learnWord } from "./progress";
import { PROVISIONAL } from "./provisional";
import { SAVE_KEY, deserialize, serialize } from "./storage";
import { configuredPartIds, migrateTitleSave } from "./titles";
import { wordById } from "./catalog";
import type { ExamSessionRecord, SaveData } from "./types";

const NOW = Date.parse("2026-03-01T02:00:00Z");
const YESTERDAY = NOW - 24 * 60 * 60 * 1000;

function fresh(classId: "warrior" | "mage" | "ranger" | "healer" | "inventor" | "explorer" = "warrior") {
  return createSave({
    name: "小林",
    classId,
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3", "G4", "G5", "G6"],
  });
}

function settleSaved(
  save: SaveData,
  input: Omit<Parameters<typeof settleExamAttempt>[1], "persistedRaw">,
) {
  return settleExamAttempt(save, { ...input, persistedRaw: serialize(save) });
}

function withoutDev(source: string): string {
  const marker = "if (import.meta.env.DEV)";
  let next = source;
  let at = next.indexOf(marker);
  while (at >= 0) {
    const open = next.indexOf("{", at);
    if (open < at) break;
    let depth = 0;
    let end = open;
    for (; end < next.length; end += 1) {
      const char = next[end];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    next = `${next.slice(0, at)}${next.slice(end)}`;
    at = next.indexOf(marker);
  }
  return next;
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

function learnedExam(examId: string) {
  const exam = examById(examId);
  if (!exam) throw new Error(examId);
  let save = fresh();
  const ids = exam.chapters.flatMap((id) => gradeChapters(exam.grade).find((chapter) => chapter.id === id)?.wordIds ?? []).slice(0, 8);
  for (const id of ids) save = learnWord(save, id, new Date(YESTERDAY));
  const words = examCardPool(save, exam, new Date(NOW), gradeIsOpen);
  return { save, exam, words };
}

describe("exam bosses", () => {
  it("lists fifteen exams and leaves out the grade-6 semester-2 midterm", () => {
    expect(EXAM_ID_LIST).toHaveLength(15);
    expect(EXAM_ID_LIST).not.toContain("exam_g6_s2_mid");
    expect(examById("exam_g6_s2_final")?.phases).toBe(3);
    expect(examById("exam_g3_s1_mid")?.phases).toBe(2);
  });

  it("hides a node when its grade is off and keeps the saved progress", () => {
    const save = fresh();
    save.selectedGrades = ["G3"];
    const exam = examById("exam_g6_s2_final");
    if (!exam) throw new Error("missing");
    save.examProgress = { [exam.id]: { cleared: true, bestPhase: 3 } };
    expect(examNodeStatus(save, exam)).toBe("hidden");
    expect(save.examProgress[exam.id]?.cleared).toBe(true);
  });

  it("does not let chapter unlock read exam progress", () => {
    const source = readFileSync(new URL("./chapter-plan.ts", import.meta.url), "utf8");
    expect(source).not.toContain("examProgress");
    const save = fresh();
    const chapter = gradeChapters("G6").find((item) => item.id === "pep_g6_06");
    if (!chapter) throw new Error("missing chapter");
    save.examProgress = { exam_g6_s2_final: { cleared: true } };
    expect(isChapterUnlocked(save, chapter)).toBe(false);
    expect(examUnlocked(save, examById("exam_g3_s1_mid")!)).toBe(false);
  });

  it("keeps lower-semester formal words in the grade-3 semester-1 pool", () => {
    const chapter = gradeChapters("G3").find((item) => item.id === "pep_g3_04");
    const ids = ["about", "after", "also", "boy", "canada", "china"];
    for (const id of ids) expect(chapter?.wordIds).toContain(id);
    const questions = readFileSync(new URL("./exam-questions.ts", import.meta.url), "utf8");
    expect(questions).not.toContain(".semester");
    let save = fresh();
    for (const id of ids) {
      if (wordById(id)) save = learnWord(save, id, new Date(YESTERDAY));
    }
    const pool = examCardPool(save, examById("exam_g3_s1_final")!, new Date(NOW), gradeIsOpen);
    for (const id of ids) {
      if (wordById(id)) expect(pool.some((word) => word.id === id)).toBe(true);
    }
  });

  it("filters spelling with the exclusion list and leaves the card in place", () => {
    expect(spellingExclusionIds()).toHaveLength(20);
    expect(spellingExclusionIds()).toEqual(expect.arrayContaining(["next", "t-shirt", "was", "win"]));
    expect(spellingSkipIds()).not.toContain("t-shirt");
    expect(readFileSync(new URL("./chapter-plan.ts", import.meta.url), "utf8")).not.toContain("spelling-exclusion");
    const save = fresh();
    save.wordCards.next = { wordId: "next", collectedAt: YESTERDAY, masteryBadge: false };
    const gloss = wordById("next")?.chinese;
    const noted = noteExamAnswer(save, {
      wordId: "next",
      correct: true,
      now: new Date(NOW),
      dueAtStart: [],
      spelling: true,
    });
    expect(examAnswerSpelling("next", true)).toBe(false);
    expect(noted.wordCards.next?.spelledAloneAt).toBeUndefined();
    expect(noted.wordCards.next).toBeDefined();
    expect(wordById("next")?.chinese).toBe(gloss);
    const recognized = noteExamAnswer(save, {
      wordId: "tree",
      correct: true,
      now: new Date(NOW),
      dueAtStart: [],
      spelling: false,
    });
    recognized.wordCards.tree = { wordId: "tree", collectedAt: YESTERDAY, masteryBadge: false };
    const again = noteExamAnswer(recognized, {
      wordId: "tree",
      correct: true,
      now: new Date(NOW),
      dueAtStart: [],
      spelling: false,
    });
    expect(again.wordCards.tree?.spelledAloneAt).toBeUndefined();
    expect(isMastered(again.wordCards.tree!)).toBe(false);
  });

  it("caps spelling, keeps the first question as a choice, and still asks when only repeats remain", () => {
    const { exam, words } = learnedExam("exam_g3_s1_mid");
    expect(words.length).toBeGreaterThan(0);
    let schedule = scheduleForPhase(exam, emptySession(), 0, words);
    const first = pickExamQuestion(schedule, 3);
    expect(first?.kind).not.toBe("spelling");
    let spelling = 0;
    for (let step = 0; step < 20 && words.length > 0; step += 1) {
      const question = pickExamQuestion(schedule, step + 9);
      if (!question) break;
      const spell = question.kind === "spelling";
      if (spell) spelling += 1;
      schedule = noteExamAsk(schedule, question.wordId, spell);
    }
    expect(spelling).toBeLessThanOrEqual(4);
    expect(spelling).toBeLessThanOrEqual(8);
    const one = words[0];
    if (!one) throw new Error("pool");
    let tight = scheduleForPhase(exam, emptySession(), 0, [one]);
    for (let step = 0; step < 3; step += 1) {
      const question = pickExamQuestion(tight, step + 1);
      expect(question?.wordId).toBe(one.id);
      if (!question) break;
      tight = noteExamAsk(tight, question.wordId, false);
    }
    const empty = pickExamQuestion(scheduleForPhase(exam, emptySession(), 0, []), 1);
    expect(empty).toBeNull();
    const kept = sessionFromSchedule(tight, false);
    expect(kept.fightQuestions).toBe(0);
    expect(kept.asks[one.id]?.count).toBe(3);
    const final = examById("exam_g3_s1_final");
    if (!final) throw new Error("final");
    const relief = scheduleForPhase(final, emptySession(), 3, words);
    expect(relief.relief).toBe(true);
    expect(relief.fightShare).toBe(0.5);
    expect(relief.fightSpellingMax).toBe(12);
    const mid = scheduleForPhase(exam, emptySession(), 0, words);
    expect(mid.fightShare).toBe(0.4);
    expect(mid.fightSpellingMax).toBe(8);
  });

  it("uses the exam health table and a softer counter on grade 3 and 4 spelling turns", () => {
    expect(examPhaseHp("warrior", "mid", 0)).toBe(120);
    expect(examPhaseHp("warrior", "mid", 2)).toBe(Math.round(120 * 0.85));
    expect(examPhaseHp("mage", "mid", 3)).toBe(Math.round(144 * 0.7));
    expect(examPhaseHp("healer", "final", 0)).toBe(67);
    expect(examPhaseHp("explorer", "final", 1)).toBe(105);
    const openedPool = learnedExam("exam_g3_s1_mid");
    let save = openedPool.save;
    for (const word of openedPool.words) {
      const card = save.wordCards[word.id];
      const memory = save.memory[word.id];
      if (!card || !memory) continue;
      save = {
        ...save,
        wordCards: { ...save.wordCards, [word.id]: { ...card, masteryBadge: true } },
        memory: {
          ...save.memory,
          [word.id]: { ...memory, fsrs: { ...memory.fsrs, due: "2099-01-01T00:00:00.000Z" } },
        },
      };
    }
    const exam = openedPool.exam;
    const words = examCardPool(save, exam, new Date(NOW), gradeIsOpen);
    const spellable = words.filter((word) => word.canSpell && !word.mastered);
    expect(spellable.length).toBeGreaterThan(0);
    const schedule = { ...scheduleForPhase(exam, emptySession(), 0, spellable), phaseQuestions: 3 };
    const opened = startBattle({
      encounterId: exam.id,
      classId: "warrior",
      learnedIds: spellable.map((word) => word.id),
      equippedSkillIds: save.equippedSkillIds,
      skillLevels: save.skillLevels,
      seed: 4,
      enemy: { name: examEnemyName("mid"), maxHp: 5000, attack: 4, sprite: exam.id },
      phases: [{ hp: 5000, note: "" }],
      examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: 2 },
      examSchedule: schedule,
    });
    expect(opened.energy).toBe(0);
    expect(opened.supportStreak).toBe(0);
    expect(opened.questionsAsked).toBe(0);
    expect(opened.enemyHp).toBe(5000);
    const asked = takeAction(opened, { type: "attack" });
    expect(asked.ok).toBe(true);
    expect(asked.state.question?.kind).toBe("spelling");
    const question = asked.state.question;
    if (!question || question.kind !== "spelling") throw new Error("spelling");
    const right = answerQuestion(asked.state, question.answer);
    expect(asked.state.playerHp - right.playerHp).toBe(2);
    expect(right.enemyAttack).toBe(4);
    const wrong = answerQuestion(asked.state, "miss");
    expect(asked.state.playerHp - wrong.playerHp).toBe(2);
    let upperSave = learnedExam("exam_g5_s1_mid").save;
    const upperExam = learnedExam("exam_g5_s1_mid").exam;
    for (const word of examCardPool(upperSave, upperExam, new Date(NOW), gradeIsOpen)) {
      const card = upperSave.wordCards[word.id];
      const memory = upperSave.memory[word.id];
      if (!card || !memory) continue;
      upperSave = {
        ...upperSave,
        wordCards: { ...upperSave.wordCards, [word.id]: { ...card, masteryBadge: true } },
        memory: {
          ...upperSave.memory,
          [word.id]: { ...memory, fsrs: { ...memory.fsrs, due: "2099-01-01T00:00:00.000Z" } },
        },
      };
    }
    const upperWords = examCardPool(upperSave, upperExam, new Date(NOW), gradeIsOpen).filter((word) => word.canSpell);
    const upperSchedule = { ...scheduleForPhase(upperExam, emptySession(), 0, upperWords), phaseQuestions: 3 };
    const upperOpen = startBattle({
      encounterId: upperExam.id,
      classId: "warrior",
      learnedIds: upperWords.map((word) => word.id),
      equippedSkillIds: upperSave.equippedSkillIds,
      skillLevels: upperSave.skillLevels,
      seed: 8,
      enemy: { name: examEnemyName("mid"), maxHp: 5000, attack: 4, sprite: upperExam.id },
      phases: [{ hp: 5000, note: "" }],
      examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: null },
      examSchedule: upperSchedule,
    });
    const upperAsked = takeAction(upperOpen, { type: "attack" });
    const upperQuestion = upperAsked.state.question;
    if (!upperQuestion || upperQuestion.kind !== "spelling") throw new Error("g5 spelling");
    const upperHit = answerQuestion(upperAsked.state, upperQuestion.answer);
    expect(upperAsked.state.playerHp - upperHit.playerHp).toBe(4);
  });

  it("shakes an exam after 10 answers and a chapter boss after 11", () => {
    const { save, exam, words } = learnedExam("exam_g3_s1_mid");
    let state = startBattle({
      encounterId: exam.id,
      classId: "warrior",
      learnedIds: words.map((word) => word.id),
      equippedSkillIds: save.equippedSkillIds,
      skillLevels: save.skillLevels,
      seed: 11,
      enemy: { name: examEnemyName("mid"), maxHp: 9000, attack: 1, sprite: exam.id },
      phases: [{ hp: 9000, note: "" }],
      examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: 2 },
      examSchedule: scheduleForPhase(exam, emptySession(), 0, words),
    });
    for (let step = 0; step < 10; step += 1) {
      const asked = takeAction(state, { type: "attack" });
      const question = asked.state.question;
      if (!question) throw new Error(asked.reason ?? "no question");
      state = answerQuestion(asked.state, question.kind === "spelling" ? question.answer : question.answerId);
    }
    expect(state.questionsAsked).toBe(10);
    expect(state.shaken).toBe(false);
    expect(state.phase).not.toBe("won");
    state = armExamShaken(state);
    expect(state.shaken).toBe(true);
    expect(examShakenLine(state.enemyName, false)).toBe(`${state.enemyName}动摇了！答对并出手攻击，就能突破！`);
    expect(examShakenLine(state.enemyName, true)).toBe(`${state.enemyName}动摇了！答对并出手攻击，就能赢！`);
    const finisher = takeAction(state, { type: "attack" });
    const finisherQuestion = finisher.state.question;
    if (!finisherQuestion) throw new Error(finisher.reason ?? "finisher");
    expect(finisher.state.shaken).toBe(true);
    const ended = answerQuestion(
      finisher.state,
      finisherQuestion.kind === "spelling" ? finisherQuestion.answer : finisherQuestion.answerId,
    );
    expect(ended.phase).toBe("won");
    const resumed = startBattle({
      encounterId: exam.id,
      classId: "warrior",
      learnedIds: words.map((word) => word.id),
      equippedSkillIds: save.equippedSkillIds,
      skillLevels: save.skillLevels,
      seed: 11,
      enemy: { name: examEnemyName("mid"), maxHp: 9000, attack: 1, sprite: exam.id },
      phases: [{ hp: 9000, note: "" }],
      examTuning: { shakenAfter: EXAM_SHAKEN_AFTER, spellingCounter: 2 },
      examSchedule: scheduleForPhase(exam, emptySession(), 0, words),
    });
    expect(resumed.shaken).toBe(false);
    expect(resumed.questionsAsked).toBe(0);
    let chapter = startBattle({
      encounterId: "forest-stage-1",
      classId: "warrior",
      learnedIds: words.map((word) => word.id),
      equippedSkillIds: save.equippedSkillIds,
      skillLevels: save.skillLevels,
      seed: 11,
      phases: [{ hp: 9000, note: "" }],
      enemy: { name: "林心", maxHp: 9000, attack: 1, sprite: "forest" },
    });
    for (let step = 0; step < 10; step += 1) {
      const asked = takeAction(chapter, { type: "attack" });
      const question = asked.state.question;
      if (!question) throw new Error(asked.reason ?? "chapter");
      chapter = answerQuestion(asked.state, question.kind === "spelling" ? question.answer : question.answerId);
    }
    expect(chapter.shaken).toBe(false);
    const last = takeAction(chapter, { type: "attack" });
    const lastQuestion = last.state.question;
    if (!lastQuestion) throw new Error("last");
    chapter = answerQuestion(last.state, lastQuestion.kind === "spelling" ? lastQuestion.answer : lastQuestion.answerId);
    expect(chapter.questionsAsked).toBe(PROVISIONAL.chapterEnding.shakenAfterQuestions);
    expect(chapter.shaken).toBe(true);
    expect(chapter.phase).not.toBe("won");
  });

  it("pays a new phase once, grants the boss title on the clear, and does not equip it", () => {
    const save = fresh();
    save.xp = 0;
    const exam = examById("exam_g3_s1_mid");
    if (!exam) throw new Error("exam");
    const schedule = scheduleForPhase(exam, emptySession(), 0, []);
    const first = settleSaved(save, { examId: exam.id, phaseNo: 1, now: NOW, won: true, schedule });
    expect(first.ok).toBe(true);
    expect(first.xpGained).toBe(20);
    expect(first.save.xp).toBe(20);
    expect(first.titleNewIds).toEqual([]);
    expect(first.save.examProgress?.[exam.id]?.phaseRecords?.["1"]?.xpDisposition).toBe("paid");
    expect(first.save.examProgress?.[exam.id]?.cleared).not.toBe(true);
    const second = settleSaved(first.save, { examId: exam.id, phaseNo: 2, now: NOW + 1, won: true, schedule });
    expect(second.xpGained).toBe(20);
    expect(second.clearedNow).toBe(true);
    expect(second.save.xp).toBe(40);
    const bossParts = configuredPartIds(`boss:${exam.id}:firstClear`);
    expect(second.titleNewIds.slice(0, bossParts?.length ?? 0)).toEqual([...(bossParts ?? [])]);
    expect(second.save.examProgress?.[exam.id]?.firstClearProof?.kind).toBe("finalPhaseVictory");
    expect(second.save.examProgress?.[exam.id]?.titleGrantedAt).toBe(NOW + 1);
    expect(second.save.titleParts?.equipped).toEqual(save.titleParts?.equipped);
    const replay = settleSaved(second.save, { examId: exam.id, phaseNo: 1, now: NOW + 2, won: true, schedule });
    expect(replay.xpGained).toBe(0);
    expect(replay.alreadyPassed).toBe(true);
    expect(replay.save.xp).toBe(40);
  });

  it("keeps a loss from paying and keeps the answer note on that snapshot", () => {
    const { save, exam, words } = learnedExam("exam_g3_s1_mid");
    const word = words[0];
    if (!word) throw new Error("word");
    const drafted = noteExamAnswer(save, {
      wordId: word.id,
      correct: true,
      now: new Date(NOW),
      dueAtStart: [],
      spelling: true,
    });
    const lost = settleSaved(drafted, {
      examId: exam.id,
      phaseNo: 1,
      now: NOW,
      won: false,
      schedule: scheduleForPhase(exam, emptySession(), 0, words),
    });
    expect(lost.xpGained).toBe(0);
    expect(lost.save.xp).toBe(drafted.xp);
    expect(lost.save.examProgress?.[exam.id]?.phaseLosses?.["1"]).toBe(1);
    expect(lost.save.examProgress?.[exam.id]?.sawLoss).toBe(true);
    expect(lost.save.wordCards[word.id]?.spelledAloneAt).toBe(drafted.wordCards[word.id]?.spelledAloneAt);
  });

  it("migrates an old clear without paying, and refuses a version-1 save with no ledger", () => {
    const save = fresh();
    const old = { ...save, examRewardSchemaVersion: undefined, examProgress: { exam_g3_s1_mid: { cleared: true, bestPhase: 2 } } };
    const migrated = migrateExamRewards(old, NOW);
    expect(migrated.xp).toBe(save.xp);
    expect(migrated.examProgress?.exam_g3_s1_mid?.phaseRecords?.["1"]?.xpDisposition).toBe("legacyNoGrant");
    expect(migrated.examProgress?.exam_g3_s1_mid?.phaseRecords?.["2"]?.xpAmount).toBe(0);
    const again = migrateExamRewards(migrated, NOW + 50);
    expect(again.xp).toBe(save.xp);
    expect(again.examProgress?.exam_g3_s1_mid?.rewardMigration?.migratedAt).toBe(NOW);
    const partial = migrateExamRewards({
      ...save,
      examRewardSchemaVersion: undefined,
      examProgress: { exam_g3_s1_mid: { bestPhase: 2, cleared: false } },
    }, NOW);
    expect(partial.examProgress?.exam_g3_s1_mid?.phaseRecords?.["1"]?.origin).toBe("legacyProgress");
    expect(partial.examProgress?.exam_g3_s1_mid?.phaseRecords?.["2"]).toBeUndefined();
    const paid = settleSaved(partial, {
      examId: "exam_g3_s1_mid",
      phaseNo: 2,
      now: NOW + 3,
      won: true,
      schedule: scheduleForPhase(examById("exam_g3_s1_mid")!, emptySession(), 0, []),
    });
    expect(paid.xpGained).toBe(20);
    const replay = settleSaved(paid.save, {
      examId: "exam_g3_s1_mid",
      phaseNo: 2,
      now: NOW + 4,
      won: true,
      schedule: scheduleForPhase(examById("exam_g3_s1_mid")!, emptySession(), 0, []),
    });
    expect(replay.xpGained).toBe(0);
    const broken = migrateExamRewards({
      ...save,
      examRewardSchemaVersion: undefined,
      examProgress: { exam_g3_s1_mid: { bestPhase: 9, cleared: false } },
    }, NOW);
    expect(broken.examProgress?.exam_g3_s1_mid?.migrationReviewRequired).toBe(true);
    expect(broken.xp).toBe(save.xp);
    const conflict = migrateExamRewards({
      ...save,
      examProgress: { exam_g3_s1_mid: { cleared: true, bestPhase: 2 } },
    }, NOW);
    expect(conflict.examProgress?.exam_g3_s1_mid?.migrationReviewRequired).toBe(true);
    expect(conflict.examProgress?.exam_g3_s1_mid?.phaseRecords).toBeUndefined();
    const blocked = settleSaved(conflict, {
      examId: "exam_g3_s1_mid",
      phaseNo: 1,
      now: NOW,
      won: true,
      schedule: scheduleForPhase(examById("exam_g3_s1_mid")!, emptySession(), 0, []),
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.save.xp).toBe(conflict.xp);
  });

  it("writes a snapshot only when the stored text is still the checkpoint", () => {
    const store = memoryStore();
    store.set("save", "base");
    expect(commitExamSnapshot(store, "save", "base", "next")).toBe(true);
    expect(store.get("save")).toBe("next");
    expect(commitExamSnapshot(store, "save", "base", "other")).toBe(false);
    expect(store.get("save")).toBe("next");
    expect(claimExamLock(store, "profile", "tab-a", 1_000, "token-a")).toBe("token-a");
    expect(claimExamLock(store, "profile", "tab-b", 1_000, "token-b")).toBeNull();
    expect(claimExamLock(store, "profile", "tab-a", 1_000, "token-a2")).toBe("token-a2");
  });

  it("unlocks inventor from any whitelist final and backfills without a receipt", () => {
    const finals = EXAM_ID_LIST.filter((id) => id.endsWith("_final"));
    expect(finals).toHaveLength(8);
    for (const id of finals) {
      expect(isClassSelectable("inventor", { examProgress: { [id]: { cleared: true } } })).toBe(true);
    }
    expect(isClassSelectable("inventor", { examProgress: { exam_g3_s1_mid: { cleared: true } } })).toBe(false);
    expect(isClassSelectable("inventor", { examProgress: { garbage_final: { cleared: true } } })).toBe(false);
    expect(isClassSelectable("inventor", { unlockedClassIds: ["inventor"] })).toBe(false);
    const save = fresh();
    const filled = backfillInventorRecord({
      ...save,
      unlockedClassIds: undefined,
      inventorUnlockedAt: undefined,
      inventorUnlockedBy: undefined,
      examProgress: { exam_g3_s1_final: { cleared: true } },
    });
    expect(filled.unlockedClassIds).toEqual(["inventor"]);
    expect(filled.inventorUnlockedBy).toBe("exam_g3_s1_final");
    expect(filled.inventorUnlockedAt).toBeUndefined();
    expect(filled.inventorUnlockReceipt).toBeUndefined();
    const kept = backfillInventorRecord({
      ...filled,
      inventorUnlockedAt: 5,
      inventorUnlockedBy: "exam_g4_s1_final",
    });
    expect(kept.inventorUnlockedAt).toBe(5);
    expect(kept.inventorUnlockedBy).toBe("exam_g4_s1_final");
    const unknown = migrateExamRewards({
      ...save,
      examRewardSchemaVersion: undefined,
      examProgress: { garbage_final: { cleared: true } },
    }, NOW);
    expect(unknown.examProgress?.garbage_final?.cleared).toBe(true);
    expect(isClassSelectable("inventor", unknown)).toBe(false);
  });

  it("queues the inventor card only on the first natural final clear", () => {
    let save = fresh();
    const exam = examById("exam_g3_s1_final");
    if (!exam) throw new Error("final");
    const schedule = scheduleForPhase(exam, emptySession(), 0, []);
    for (let phase = 1; phase <= exam.phases; phase += 1) {
      const result = settleSaved(save, { examId: exam.id, phaseNo: phase, now: NOW + phase, won: true, schedule });
      expect(result.ok).toBe(true);
      save = result.save;
      if (phase < exam.phases) expect(result.inventorFresh).toBe(false);
      else expect(result.inventorFresh).toBe(true);
    }
    expect(save.inventorUnlockReceipt?.status).toBe("pending");
    const other = examById("exam_g3_s2_final");
    if (!other) throw new Error("other");
    let follow = save;
    for (let phase = 1; phase <= other.phases; phase += 1) {
      const result = settleSaved(follow, { examId: other.id, phaseNo: phase, now: NOW + 10 + phase, won: true, schedule });
      follow = result.save;
      expect(result.inventorFresh).toBe(false);
    }
    expect(follow.inventorUnlockReceipt?.eventId).toBe(save.inventorUnlockReceipt?.eventId);
  });

  it("shows the compass only on the grade-6 semester-2 final", () => {
    expect(examShowsCompass("exam_g6_s2_final")).toBe(true);
    expect(examShowsCompass("exam_g6_s1_final")).toBe(false);
    const compass = examById("exam_g6_s2_final");
    const other = examById("exam_g6_s1_final");
    if (!compass || !other) throw new Error("g6");
    expect(examAtlases(compass).some((file) => file.key.includes("compass"))).toBe(true);
    expect(examAtlases(other).some((file) => file.key.includes("compass"))).toBe(false);
    expect(examLayers(compass, 2, "idle").some((layer) => layer.key.includes("compass"))).toBe(true);
    expect(examLayers(other, 3, "idle").some((layer) => layer.key.includes("compass"))).toBe(false);
    expect(EXAM_BOSS_SCALE).toBe(0.5);
    const boot = readFileSync(new URL("../game/scenes/BootScene.ts", import.meta.url), "utf8");
    const budget = readFileSync(new URL("../../tools/boot-budget.mjs", import.meta.url), "utf8");
    expect(boot).not.toContain("atlas_exam_ui");
    expect(boot).not.toContain("exam_final");
    expect(budget).not.toContain("atlas_exam_ui");
    expect(budget).not.toContain("bg_exam_");
  });

  it("drops the phase suffix on exam names and eats the banner click", () => {
    expect(battleEnemyName("林心", 1, 3, false)).toBe("林心  阶段 2/3");
    expect(battleEnemyName("期中守护者", 1, 2, true)).toBe("期中守护者");
    expect(battleEnemyName("期末守护者", 0, 1, true)).toBe("期末守护者");
    expect(examIntroParts(true)).toEqual({ hud: false, phase: false, question: false, answers: false });
    let closed = 0;
    deliverExamPointer(true, () => { closed += 1; });
    expect(closed).toBe(1);
    deliverExamPointer(false, () => { closed += 1; });
    expect(closed).toBe(1);
    const scene = readFileSync(new URL("../game/scenes/BattleScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("battleEnemyName(this.state.enemyName, this.state.phaseIndex, phaseCount, false)");
  });

  it("a banner click leaves the question and the score untouched", () => {
    const score = { asked: 0, xp: 10, cleared: false };
    let closed = 0;
    deliverExamPointer(true, () => { closed += 1; });
    expect(closed).toBe(1);
    expect(score).toEqual({ asked: 0, xp: 10, cleared: false });
    deliverExamPointer(false, () => { closed += 1; });
    expect(closed).toBe(1);
    expect(score).toEqual({ asked: 0, xp: 10, cleared: false });
    const scene = readFileSync(new URL("../game/scenes/ExamBattleScene.ts", import.meta.url), "utf8");
    const handler = scene.slice(scene.indexOf("zone.on"), scene.indexOf("this.view?.add(zone)"));
    expect(handler).toContain("deliverExamPointer(this.introOpen");
    expect(handler).toContain("this.closeIntro()");
    expect(handler).not.toContain("answerCorrect");
    expect(withoutDev(scene)).not.toContain("answerCorrect");
    expect(scene).toContain("answerCorrect");
  });

  it("keeps answered learning notes when the window closes before the phase pays", () => {
    let save = fresh();
    save = learnWord(save, "tree", new Date(YESTERDAY));
    save = learnWord(save, "bird", new Date(YESTERDAY));
    const bird = save.memory.bird;
    if (!bird) throw new Error("bird");
    save = {
      ...save,
      memory: {
        ...save.memory,
        bird: { ...bird, fsrs: { ...bird.fsrs, due: "2020-01-01T00:00:00.000Z" } },
      },
    };
    const xp = save.xp;
    const store = memoryStore();
    const base = serialize(save);
    store.set(SAVE_KEY, base);
    let draft = noteExamAnswer(save, {
      wordId: "tree",
      correct: true,
      now: new Date(NOW),
      dueAtStart: ["bird"],
      spelling: true,
    });
    draft = noteExamAnswer(draft, {
      wordId: "bird",
      correct: true,
      now: new Date(NOW),
      dueAtStart: ["bird"],
      spelling: false,
    });
    expect(commitExamSnapshot(store, SAVE_KEY, base, serialize(draft))).toBe(true);
    const reloaded = deserialize(store.get(SAVE_KEY) ?? "");
    if (!reloaded) throw new Error("reload");
    expect(reloaded.wordCards.tree?.spelledAloneAt).toBe(NOW);
    expect(reloaded.dueAnswers.some((answer) => answer.wordId === "bird")).toBe(true);
    expect(reloaded.xp).toBe(xp);
    expect(reloaded.examProgress?.exam_g3_s1_mid?.cleared).not.toBe(true);
    expect(reloaded.examProgress?.exam_g3_s1_mid?.phaseRecords).toBeUndefined();
    const scene = readFileSync(new URL("../game/scenes/ExamBattleScene.ts", import.meta.url), "utf8");
    const noteAt = scene.indexOf("this.draft = noteExamAnswer");
    expect(scene.indexOf("this.persist(this.draft)", noteAt)).toBeGreaterThan(noteAt);
  });

  it("drops an exam session that has no asks", () => {
    const save = fresh();
    save.examProgress = {
      exam_g3_s1_mid: {
        session: { nextIndex: 4, fightQuestions: 2, fightSpelling: 1 } as unknown as ExamSessionRecord,
      },
    };
    expect(storedSession(save, "exam_g3_s1_mid", false)).toEqual(emptySession());
    save.examProgress = {
      exam_g3_s1_mid: {
        session: {
          asks: { tree: { count: 1, lastIndex: 0 } },
          nextIndex: 1,
          fightQuestions: 1,
          fightSpelling: 0,
        },
      },
    };
    expect(storedSession(save, "exam_g3_s1_mid", false).asks.tree).toEqual({ count: 1, lastIndex: 0 });
  });

  it("grants level words when a normal win crosses a level and leaves them unequipped", () => {
    const save = fresh();
    save.xp = 30;
    const equipped = save.titleParts?.equipped;
    const won = applyBattleOutcome(save, "win", NOW);
    expect(won.xp).toBe(50);
    expect(won.titleParts?.unlockedPrefixIds).toContain("p_001");
    expect(won.titleParts?.unlockedSuffixIds).toContain("s_001");
    expect(won.titleParts?.equipped).toEqual(equipped);
    const quiet = fresh();
    const still = applyBattleOutcome(quiet, "win", NOW);
    expect(still.titleParts?.unlockedPrefixIds).not.toContain("p_001");
    const lost = applyBattleOutcome({ ...save, xp: 30 }, "loss", NOW);
    expect(lost.xp).toBe(30);
    expect(lost.titleParts?.unlockedPrefixIds).not.toContain("p_001");
  });

  it("returns the empty-pool sentence from the exam composer", () => {
    const { save, exam } = learnedExam("exam_g3_s1_mid");
    const state = startBattle({
      encounterId: exam.id,
      classId: "warrior",
      learnedIds: [],
      equippedSkillIds: save.equippedSkillIds,
      skillLevels: save.skillLevels,
      seed: 1,
      enemy: { name: examEnemyName("mid"), maxHp: 120, attack: 4, sprite: exam.id },
      phases: [{ hp: 120, note: "" }],
      examSchedule: scheduleForPhase(exam, emptySession(), 0, []),
    });
    const asked = takeAction(state, { type: "attack" });
    expect(asked.ok).toBe(false);
    expect(asked.reason).toBe(EXAM_NO_QUESTION);
    expect(EXAM_NO_QUESTION).toBe("当前没有可用题目，请返回学堂学习或稍后再试");
  });

  it("builds exam events from the profileId already stored", () => {
    const born = fresh();
    delete born.profileId;
    delete born.titleRulesVersion;
    delete born.titleParts;
    delete born.titleGrantLedger;
    delete born.titleReceipts;
    const old = { ...born, xp: 0 };
    const minted = migrateTitleSave(old, NOW);
    const reminted = migrateTitleSave(old, NOW);
    expect(minted.profileId).toBeTruthy();
    expect(reminted.profileId).not.toBe(minted.profileId);
    const settlement = readFileSync(new URL("./exam-settlement.ts", import.meta.url), "utf8");
    expect(settlement).not.toContain("createProfileId");
    const refused = settleExamAttempt(minted, {
      examId: "exam_g3_s1_mid",
      phaseNo: 2,
      now: NOW,
      won: true,
      schedule: scheduleForPhase(examById("exam_g3_s1_mid")!, emptySession(), 0, []),
      persistedRaw: serialize(old),
    });
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe("profile");
    expect(refused.save.xp).toBe(minted.xp);
    expect(refused.save.titleGrantLedger?.["boss:exam_g3_s1_mid:firstClear"]).toBeUndefined();
    const stored = serialize(minted);
    expect(savedProfileId(stored)).toBe(minted.profileId);
    const loaded = deserialize(stored);
    expect(loaded?.profileId).toBe(minted.profileId);
    const granted = settleExamAttempt(loaded!, {
      examId: "exam_g3_s1_mid",
      phaseNo: 2,
      now: NOW + 2,
      won: true,
      schedule: scheduleForPhase(examById("exam_g3_s1_mid")!, emptySession(), 0, []),
      persistedRaw: stored,
    });
    expect(granted.ok).toBe(true);
    const evidence = granted.save.titleGrantLedger?.["boss:exam_g3_s1_mid:firstClear"]?.evidenceId;
    expect(evidence).toContain(loaded!.profileId);
    expect(evidence).not.toContain(reminted.profileId);
    expect(granted.save.examProgress?.exam_g3_s1_mid?.firstClearProof?.clearEventId).toContain(loaded!.profileId);
    expect(granted.save.titleParts?.unlockedPrefixIds).toContain("p_060");
    expect(granted.save.titleParts?.equipped?.prefixId).not.toBe("p_060");
  });

  it("grants level words for a level crossed after migration", () => {
    const born = fresh();
    delete born.profileId;
    delete born.titleRulesVersion;
    delete born.titleParts;
    delete born.titleGrantLedger;
    delete born.titleReceipts;
    const minted = migrateTitleSave({ ...born, xp: 30 }, NOW);
    expect(minted.titleGrantLedger?.["level:1"]).toBeTruthy();
    expect(minted.titleGrantLedger?.["level:2"]).toBeUndefined();
    const stored = serialize(minted);
    const loaded = deserialize(stored);
    expect(loaded?.profileId).toBe(savedProfileId(stored));
    const won = applyBattleOutcome(loaded!, "win", NOW + 8);
    expect(won.xp).toBe(50);
    expect(won.titleParts?.unlockedPrefixIds).toContain("p_001");
    expect(won.titleParts?.unlockedSuffixIds).toContain("s_001");
    expect(won.titleGrantLedger?.["level:2"]?.evidenceId).toContain(loaded!.profileId);
    expect(won.titleParts?.equipped?.prefixId).not.toBe("p_001");
    const exam = examById("exam_g3_s1_mid");
    if (!exam || !loaded) throw new Error("setup");
    const crossed = settleExamAttempt({ ...loaded, xp: 30 }, {
      examId: exam.id,
      phaseNo: 1,
      now: NOW + 9,
      won: true,
      schedule: scheduleForPhase(exam, emptySession(), 0, []),
      persistedRaw: stored,
    });
    expect(crossed.ok).toBe(true);
    expect(crossed.save.xp).toBe(50);
    expect(crossed.titleNewIds).toEqual(expect.arrayContaining(["p_001", "s_001"]));
    expect(crossed.save.titleGrantLedger?.["level:2"]?.evidenceId).toContain(savedProfileId(stored));
    expect(crossed.save.titleParts?.unlockedPrefixIds).toContain("p_001");
  });
});
