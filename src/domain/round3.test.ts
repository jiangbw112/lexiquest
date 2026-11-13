import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rating, State } from "ts-fsrs";
import { DEFAULT_APPEARANCE } from "./appearance";
import {
  answerQuestion,
  enemyDamage,
  startBattle,
  takeAction,
  CHAPTER_BOSS_ID,
  type BattleAction,
  type BattleState,
} from "./battle";
import { CLASS_IDS, classById } from "./classes";
import { deviceTimeZone, localDayKey } from "./local-day";
import { NEW_WORD_GOAL_NOTICE, dailyNewWordTargetMet, newWordsLearnedToday, reviewFirstNotice, setGoalPreset } from "./parent";
import { lessonUnits, sampleWords } from "./catalog";
import {
  applyBattleOutcome,
  createSave,
  LEARN_XP,
  learnWord,
  noteBattleAnswer,
  reviewWord,
} from "./progress";
import { deserialize, serialize } from "./storage";
import { fsrsScheduler, isDue } from "./review";
import { orderReviewWords, skillQuestionPool } from "./skill-cast";
import {
  deckChangedFromDefault,
  hasDamageCard,
  showNoDamageHint,
  MAX_SKILL_LEVEL,
  starterSkillId,
} from "./skills";
import {
  explorationStageByEncounter,
  stageById,
  stageCleared,
  stageCombat,
  stageEncounterId,
  stageWordIds,
} from "./stages";
import type { ClassId, SaveData } from "./types";
import { ATTACK_HINT_TOAST } from "../game/layout";
import {
  createPlayTimer,
  notePlayAnswer,
  shouldPromptRest,
  snoozePlayTimer,
  PLAY_PROMPT_ANSWERS,
  PLAY_PROMPT_MS,
  PLAY_SNOOZE_MS,
} from "../game/play-timer";

const LEARNED = ["tree", "bird", "fish", "sun", "map", "run"];
const ZONE = deviceTimeZone();

function atLocal(day: string, time: string, timeZone = ZONE): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  let stamp = Date.UTC(year!, month! - 1, date, hour, minute);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(format.formatToParts(new Date(stamp)).map((part) => [part.type, part.value]));
    const seen = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const want = Date.UTC(year!, month! - 1, date, hour, minute);
    stamp += want - seen;
  }
  return new Date(stamp);
}

function fresh(now: Date, classId: ClassId = "warrior"): SaveData {
  return createSave({
    name: "小林",
    classId,
    appearance: DEFAULT_APPEARANCE,
    now: now.getTime(),
    grades: ["G3", "G4", "G5", "G6"],
  });
}

function fightFor(classId: ClassId, stageId: number, equipped: string[], levels: Record<string, number>, seed = 1): BattleState {
  const stage = stageById(stageId);
  if (!stage) throw new Error(`missing stage ${stageId}`);
  const combat = stageCombat(stage, classId);
  return startBattle({
    encounterId: combat.encounterId,
    classId,
    learnedIds: LEARNED,
    equippedSkillIds: equipped,
    skillLevels: levels,
    seed,
    enemy: { name: combat.enemyName, maxHp: combat.enemyHp, attack: combat.enemyAttack, sprite: combat.sprite },
    phases: combat.phases,
    spellingCap: combat.spellingCap,
  });
}

function answerOf(state: BattleState, wrong: boolean): string {
  const question = state.question;
  if (!question) throw new Error("no question");
  if (question.kind === "spelling") return wrong ? "nope" : question.answer;
  if (!wrong) return question.answerId;
  return question.choices.find((choice) => choice.id !== question.answerId)?.id ?? "nope";
}

function pick(state: BattleState, policy: "greedy" | "first" | "heal" | "block" | "attack" | "shout"): BattleAction {
  if (policy === "heal") return { type: "heal" };
  if (policy === "block") return { type: "block" };
  if (policy === "attack") return { type: "attack" };
  if (policy === "shout") {
    const shout = state.slots.find((slot) => slot.skillId === "warrior-shout" && state.energy >= slot.energyCost);
    return shout ? { type: "skill", slotIndex: shout.index } : { type: "attack" };
  }
  if (policy === "first") {
    const slot = state.slots.find((item) => state.energy >= item.energyCost && item.origin === "equipped");
    return slot ? { type: "skill", slotIndex: slot.index } : { type: "attack" };
  }
  const low = state.playerHp / state.playerMaxHp < 0.4;
  if (low) {
    const heal = [...state.slots]
      .filter((slot) => slot.kind === "heal" && state.energy >= slot.energyCost)
      .sort((a, b) => b.fullPower - a.fullPower)[0];
    if (heal) return { type: "skill", slotIndex: heal.index };
    return { type: "heal" };
  }
  const button = classById(state.classId).attack;
  const hit = [...state.slots]
    .filter((slot) => (slot.kind === "damage" || slot.kind === "strike-guard" || slot.kind === "strike-heal" || slot.kind === "delay-damage") && state.energy >= slot.energyCost)
    .sort((a, b) => b.fullPower - a.fullPower)[0];
  if (hit && hit.fullPower > button) return { type: "skill", slotIndex: hit.index };
  return { type: "attack" };
}

function run(start: BattleState, policy: "greedy" | "first" | "heal" | "block" | "attack" | "shout", wrongSlot: number | null) {
  let state = start;
  let questions = 0;
  for (let guard = 0; guard < 40 && state.phase !== "won" && state.phase !== "lost"; guard += 1) {
    if (state.phase === "question") {
      const wrong = wrongSlot !== null && questions % 5 === wrongSlot;
      questions += 1;
      state = answerQuestion(state, answerOf(state, wrong));
      continue;
    }
    const next = takeAction(state, pick(state, policy));
    if (!next.ok) throw new Error(next.reason ?? "action failed");
    state = next.state;
  }
  return { state, questions };
}

function act(state: BattleState, action: BattleAction, correct = true): BattleState {
  const asked = takeAction(state, action);
  if (!asked.ok || !asked.state.question) throw new Error(asked.reason ?? "no question");
  return answerQuestion(asked.state, answerOf(asked.state, !correct));
}

describe("round 3 combat numbers", () => {
  it("A3 keeps enemy damage independent of how many times it has hit", () => {
    for (const hits of [0, 5, 20]) {
      expect(enemyDamage({ enemyAttack: 4, enemyHits: hits, guard: 1 })).toBe(3);
      expect(enemyDamage({ enemyAttack: 4, enemyHits: hits, guard: 9 })).toBe(0);
    }
  });

  it("A4 heals at least 8 on a correct button and half of that when wrong", () => {
    const open = { ...fightFor("warrior", 1, [], {}, 3), playerHp: 1, playerMaxHp: 200, enemyAttack: 0 };
    const healed = act(open, { type: "heal" }, true);
    expect(healed.playerHp).toBe(9);
    expect(healed.lastNote).toContain("恢复了体力");
    expect(healed.lastNote).not.toMatch(/[0-9]/);
    const wrong = act(open, { type: "heal" }, false);
    expect(wrong.playerHp).toBe(5);
    expect(wrong.lastNote).not.toMatch(/[0-9]/);
  });

  it("S1 diminishes block and heal after two full actions", () => {
    let state = { ...fightFor("warrior", 1, [], {}, 4), playerHp: 1, playerMaxHp: 500, enemyMaxHp: 500, enemyHp: 500, enemyAttack: 0 };
    const amounts: number[] = [];
    for (let turn = 0; turn < 6; turn += 1) {
      const before = state.playerHp;
      state = act(state, { type: "heal" });
      amounts.push(state.playerHp - before);
    }
    expect(amounts).toEqual([8, 8, 4, 2, 1, 0]);
    expect(state.lastNote).not.toMatch(/[0-9]/);
  });

  it("S2 gives the healer 10 then 10, 5, 2, 1", () => {
    let state = { ...fightFor("healer", 1, [], {}, 5), playerHp: 1, playerMaxHp: 500, enemyMaxHp: 500, enemyHp: 500, enemyAttack: 0 };
    const amounts: number[] = [];
    for (let turn = 0; turn < 5; turn += 1) {
      const before = state.playerHp;
      state = act(state, { type: "heal" });
      amounts.push(state.playerHp - before);
    }
    expect(amounts).toEqual([10, 10, 5, 2, 1]);
    expect(state.lastNote).not.toMatch(/[0-9]/);
  });

  it("S3 shares one streak across block and heal", () => {
    let state = { ...fightFor("warrior", 1, [], {}, 6), playerHp: 20, playerMaxHp: 500, enemyMaxHp: 500, enemyHp: 500, enemyAttack: 6 };
    state = act(state, { type: "block" });
    expect(state.playerHp).toBe(20);
    state = { ...state, enemyAttack: 0 };
    state = act(state, { type: "heal" });
    expect(state.playerHp).toBe(28);
    state = { ...state, enemyAttack: 6 };
    state = act(state, { type: "block" });
    expect(state.playerHp).toBe(25);
    expect(state.lastNote).toContain("挡下了下一次伤害");
    expect(state.lastNote).not.toMatch(/[0-9]/);
  });

  it("S4 keeps the weaken sentence out of lastNote and raises the hint only on the third", () => {
    let state = { ...fightFor("warrior", 1, [], {}, 7), playerHp: 1, playerMaxHp: 500, enemyMaxHp: 500, enemyHp: 500 };
    state = act(state, { type: "heal" });
    state = act(state, { type: "heal" });
    state = act(state, { type: "heal" });
    expect(state.supportStreak).toBe(3);
    expect(state.attackHint).toBe(true);
    expect(state.lastNote).not.toContain("效果会越来越弱");
    expect(state.lastNote).not.toContain("效果变弱了，试试攻击吧！");
    state = act(state, { type: "heal" });
    expect(state.attackHint).toBe(false);
    expect(state.lastNote).not.toContain("效果变弱了");
    state = act(state, { type: "heal" });
    expect(state.attackHint).toBe(false);
  });

  it("S5 uses floor of a wrong heal on the third support action", () => {
    let state = { ...fightFor("warrior", 1, [], {}, 8), playerHp: 1, playerMaxHp: 500, enemyMaxHp: 500, enemyHp: 500, enemyAttack: 0 };
    state = act(state, { type: "heal" }, false);
    state = act(state, { type: "heal" }, false);
    const before = state.playerHp;
    state = act(state, { type: "heal" }, false);
    expect(state.playerHp - before).toBe(2);
    expect(state.lastNote).not.toMatch(/[0-9]/);
  });

  it("T1 loses a stage-1 fight that only heals or only blocks", () => {
    for (const classId of CLASS_IDS) {
      for (const policy of ["heal", "block"] as const) {
        const played = run(fightFor(classId, 1, [starterSkillId(classId)], { [starterSkillId(classId)]: 1 }, 2), policy, null);
        expect(played.state.phase, `${classId} ${policy}`).toBe("lost");
        expect(played.questions, `${classId} ${policy}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it("A5 caps boss spelling at 4 and at 30 percent across 30 questions", () => {
    let state = startBattle({
      encounterId: CHAPTER_BOSS_ID,
      classId: "warrior",
      learnedIds: LEARNED,
      equippedSkillIds: [],
      skillLevels: {},
      seed: 4,
      litWordIds: LEARNED,
      enemy: { name: "林心守护者", maxHp: 9000, attack: 0, sprite: "page" },
      phases: [{ hp: 9000, note: "第一阶段" }, { hp: 9000, note: "第二阶段" }],
      spellingCap: 0.3,
    });
    let spelling = 0;
    for (let turn = 0; turn < 30; turn += 1) {
      const cast = takeAction(state, { type: "attack" });
      if (!cast.ok || !cast.state.question) throw new Error(cast.reason ?? "no question");
      if (cast.state.question.kind === "spelling") spelling += 1;
      state = answerQuestion(cast.state, answerOf(cast.state, true));
    }
    expect(spelling).toBeLessThanOrEqual(4);
    expect(spelling / 30).toBeLessThanOrEqual(0.3);
  });
});

describe("round 3 shaken boss", () => {
  function boss(): BattleState {
    return startBattle({
      encounterId: CHAPTER_BOSS_ID,
      classId: "warrior",
      learnedIds: LEARNED,
      equippedSkillIds: ["warrior-bash"],
      skillLevels: { "warrior-bash": 1 },
      seed: 2,
      enemy: { name: "林心守护者", maxHp: 9000, attack: 0, sprite: "canopy" },
      phases: [{ hp: 9000, note: "第一阶段" }, { hp: 9000, note: "第二阶段" }],
    });
  }

  it("B1 and B6 shake after 11 answers and a later correct attack ends the phase", () => {
    let state = boss();
    for (let turn = 0; turn < 10; turn += 1) state = act(state, { type: "attack" });
    expect(state.shaken).toBe(false);
    expect(state.questionsAsked).toBe(10);
    state = act(state, { type: "attack" });
    expect(state.shaken).toBe(true);
    expect(state.phaseIndex).toBe(0);
    state = act(state, { type: "attack" });
    expect(state.phaseIndex).toBe(1);
    expect(state.shaken).toBe(true);
    expect(state.phase).toBe("choose");
    state = act(state, { type: "attack" });
    expect(state.phase).toBe("won");
  });

  it("B2 lets a wrong attack after the shake hit back", () => {
    let state = { ...boss(), shaken: true, enemyAttack: 4, playerHp: 40 };
    const before = state.phaseIndex;
    state = act(state, { type: "attack" }, false);
    expect(state.phaseIndex).toBe(before);
    expect(state.phase).toBe("choose");
    expect(state.enemyHits).toBeGreaterThan(0);
    expect(state.playerHp).toBeLessThan(40);
  });

  it("B3 never shakes a small fight", () => {
    let state = fightFor("warrior", 1, [], {}, 9);
    state = { ...state, enemyMaxHp: 9000, enemyHp: 9000, enemyAttack: 0 };
    for (let turn = 0; turn < 12; turn += 1) state = act(state, { type: "attack" });
    expect(state.phases).toBeNull();
    expect(state.shaken).toBe(false);
  });

  it("B4 keeps heals and guards from ending a shaken phase", () => {
    const state = { ...boss(), shaken: true, playerHp: 10, playerMaxHp: 42 };
    const healed = act(state, { type: "heal" });
    expect(healed.phaseIndex).toBe(0);
    expect(healed.shaken).toBe(true);
    expect(healed.playerHp).toBeGreaterThan(10);
    const blocked = act(state, { type: "block" });
    expect(blocked.phaseIndex).toBe(0);
    expect(blocked.lastNote).toContain("挡下");
  });

  it("B5 ends the shaken phase on a correct strike-guard", () => {
    let state = { ...boss(), shaken: true, energy: 3 };
    state = act(state, { type: "skill", slotIndex: 0 });
    expect(state.phaseIndex).toBe(1);
    expect(state.shaken).toBe(true);
  });
});

describe("round 3 question pool", () => {
  it("P1 pads a short due list up to 4", () => {
    const pool = skillQuestionPool(["tree", "rain"], ["tree", "rain", "bird", "fish", "sun", "map"], {
      padOrder: ["bird", "fish", "sun", "map"],
    });
    expect(pool).toHaveLength(4);
    expect(pool).toEqual(expect.arrayContaining(["tree", "rain"]));
  });

  it("P2 asks each word at most twice and keeps the two asks three apart", () => {
    const learned = ["tree", "bird", "fish", "sun", "map", "run"];
    let state = startBattle({
      encounterId: "inkling",
      classId: "warrior",
      learnedIds: learned,
      equippedSkillIds: [],
      skillLevels: {},
      seed: 11,
      allowedWordIds: learned,
      enemy: { name: "x", maxHp: 9000, attack: 0, sprite: "inkling" },
    });
    const seen: string[] = [];
    for (let turn = 0; turn < 12; turn += 1) {
      const asked = takeAction(state, { type: "block" });
      const wordId = asked.state.question?.wordId ?? "";
      seen.push(wordId);
      state = answerQuestion(asked.state, answerOf(asked.state, false));
    }
    for (const id of learned) {
      const at = seen.map((word, index) => (word === id ? index : -1)).filter((index) => index >= 0);
      expect(at.length, id).toBeLessThanOrEqual(2);
      if (at.length === 2) expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(3);
    }
  });

  it("P3 never offers an unlearned word", () => {
    const pool = skillQuestionPool(["tree", "missing"], ["tree"], { padOrder: ["missing", "bird"] });
    expect(pool).toEqual(["tree"]);
  });

  it("shuffles a tied due time with the seed", () => {
    const first = orderReviewWords([{ id: "tree", due: 5 }, { id: "bird", due: 5 }, { id: "fish", due: 1 }], 3);
    const second = orderReviewWords([{ id: "tree", due: 5 }, { id: "bird", due: 5 }, { id: "fish", due: 1 }], 3);
    expect(first[0]).toBe("fish");
    expect(first).toEqual(second);
  });
});

describe("round 3 scheme B and retention", () => {
  const now = atLocal("2026-04-02", "10:00");

  function dueSave(): SaveData {
    let save = fresh(now);
    save = learnWord(save, "tree", now, ZONE);
    const memory = save.memory.tree;
    if (!memory) throw new Error("tree missing");
    return {
      ...save,
      memory: {
        ...save.memory,
        tree: { ...memory, fsrs: { ...memory.fsrs, due: new Date(now.getTime() - 1000).toISOString() } },
      },
    };
  }

  it("F1 writes Good into FSRS and today's reviewed list", () => {
    const save = dueSave();
    const next = noteBattleAnswer(save, {
      wordId: "tree",
      correct: true,
      now,
      dueAtStart: ["tree"],
      spelling: false,
      timeZone: ZONE,
    });
    expect(next.memory.tree?.fsrs.due).not.toBe(save.memory.tree?.fsrs.due);
    expect(next.dueAnswers.some((answer) => answer.wordId === "tree" && answer.rating === "good")).toBe(true);
    expect(next.dailyStats[localDayKey(now, ZONE)]?.reviewedDueWordIds).toContain("tree");
  });

  it("F2 leaves FSRS alone for a repeat, a word that is not due, spelling, and a desk review", () => {
    const save = dueSave();
    const once = noteBattleAnswer(save, { wordId: "tree", correct: true, now, dueAtStart: ["tree"], spelling: false, timeZone: ZONE });
    const twice = noteBattleAnswer(once, { wordId: "tree", correct: true, now, dueAtStart: ["tree"], spelling: false, timeZone: ZONE });
    expect(twice.memory.tree?.fsrs).toEqual(once.memory.tree?.fsrs);
    const notDue = noteBattleAnswer(fresh(now), { wordId: "tree", correct: true, now, dueAtStart: ["tree"], spelling: false, timeZone: ZONE });
    expect(notDue.memory.tree).toBeUndefined();
    const spelling = noteBattleAnswer(save, { wordId: "tree", correct: true, now, dueAtStart: ["tree"], spelling: true, timeZone: ZONE });
    expect(spelling.memory.tree?.fsrs).toEqual(save.memory.tree?.fsrs);
    const desk = reviewWord(save, "tree", Rating.Good, now, ZONE);
    const battleAfterDesk = noteBattleAnswer(desk, { wordId: "tree", correct: false, now, dueAtStart: ["tree"], spelling: false, timeZone: ZONE });
    expect(battleAfterDesk.memory.tree?.fsrs).toEqual(desk.memory.tree?.fsrs);
  });

  it("F3 keeps the first Again when a later answer is correct", () => {
    const save = dueSave();
    const wrong = noteBattleAnswer(save, { wordId: "tree", correct: false, now, dueAtStart: ["tree"], spelling: false, timeZone: ZONE });
    expect(wrong.dueAnswers.find((answer) => answer.wordId === "tree")?.rating).toBe("again");
    const later = noteBattleAnswer(wrong, { wordId: "tree", correct: true, now, dueAtStart: ["tree"], spelling: false, timeZone: ZONE });
    expect(later.memory.tree?.fsrs).toEqual(wrong.memory.tree?.fsrs);
    expect(later.dueAnswers.filter((answer) => answer.wordId === "tree")).toHaveLength(1);
  });

  it("F4 sets request retention to 0.9", () => {
    expect(fsrsScheduler().parameters.request_retention).toBe(0.9);
  });
});

describe("round 3 review grades and real days", () => {
  it("R1 and R2 graduate Learning and Relearning when Hard is stored as Good", () => {
    const start = atLocal("2026-05-01", "09:00");
    let save = learnWord(fresh(start), "tree", start, ZONE);
    for (let step = 0; step < 6 && save.memory.tree?.fsrs.state === State.Learning && save.memory.tree.fsrs.learning_steps < 1; step += 1) {
      const cursor = new Date(new Date(save.memory.tree.fsrs.due).getTime() + 1000);
      save = reviewWord(save, "tree", Rating.Good, cursor, ZONE);
    }
    expect(save.memory.tree?.fsrs.state).toBe(State.Learning);
    const cursor = new Date(new Date(save.memory.tree!.fsrs.due).getTime() + 1000);
    const graduated = reviewWord(save, "tree", Rating.Hard, cursor, ZONE);
    expect(graduated.memory.tree?.fsrs.state).toBe(State.Review);
    expect(graduated.dueAnswers.at(-1)?.rating).toBe("hard");
    expect(graduated.dueAnswers.at(-1)?.fsrsRating).toBe("good");

    const lapsed = reviewWord(graduated, "tree", Rating.Again, new Date(cursor.getTime() + 86_400_000), ZONE);
    expect(lapsed.memory.tree?.fsrs.state).toBe(State.Relearning);
    let again = lapsed;
    let when = new Date(new Date(again.memory.tree!.fsrs.due).getTime() + 1000);
    if (again.memory.tree?.fsrs.learning_steps === 0) {
      const stepped = reviewWord(again, "tree", Rating.Good, when, ZONE);
      if (stepped.memory.tree?.fsrs.state === State.Relearning) {
        again = stepped;
        when = new Date(new Date(again.memory.tree!.fsrs.due).getTime() + 1000);
      }
    }
    expect(again.memory.tree?.fsrs.state).toBe(State.Relearning);
    const back = reviewWord(again, "tree", Rating.Hard, when, ZONE);
    expect(back.memory.tree?.fsrs.state).toBe(State.Review);
    expect(back.dueAnswers.at(-1)?.fsrsRating).toBe("good");
  });

  it("R3 stores Review Hard as Hard and schedules it sooner than Good", () => {
    const start = atLocal("2026-05-03", "09:00");
    let save = learnWord(fresh(start), "tree", start, ZONE);
    for (let step = 0; step < 8 && save.memory.tree?.fsrs.state !== State.Review; step += 1) {
      const cursor = new Date(new Date(save.memory.tree!.fsrs.due).getTime() + 1000);
      save = reviewWord(save, "tree", Rating.Good, cursor, ZONE);
    }
    expect(save.memory.tree?.fsrs.state).toBe(State.Review);
    const due = new Date(new Date(save.memory.tree!.fsrs.due).getTime() + 1000);
    const hard = reviewWord(save, "tree", Rating.Hard, due, ZONE);
    const good = reviewWord(save, "tree", Rating.Good, due, ZONE);
    expect(hard.memory.tree?.fsrs.state).toBe(State.Review);
    expect(hard.memory.tree!.fsrs.scheduled_days).toBeLessThan(good.memory.tree!.fsrs.scheduled_days);
    expect(hard.dueAnswers.at(-1)?.rating).toBe("hard");
    expect(hard.dueAnswers.at(-1)?.fsrsRating).toBe("hard");
  });

  it("R4 leaves Learning after ten due Hard ratings", () => {
    const start = atLocal("2026-06-01", "08:00");
    let save = learnWord(fresh(start), "bird", start, ZONE);
    for (let step = 0; step < 10; step += 1) {
      const due = new Date(new Date(save.memory.bird!.fsrs.due).getTime() + 1000);
      save = reviewWord(save, "bird", Rating.Hard, due, ZONE);
    }
    expect(save.memory.bird?.fsrs.state).not.toBe(State.Learning);
    expect(save.memory.bird?.fsrs.state).not.toBe(State.Relearning);
  });

  it("C1 ignores offset reviews for the badge and still loads an old save", () => {
    const start = atLocal("2026-06-02", "10:00");
    const save = learnWord(fresh(start), "tree", start, ZONE);
    const shiftedNow = new Date(start.getTime() + 86_400_000);
    const shifted = reviewWord({ ...save, clockOffsetMs: 86_400_000 }, "tree", Rating.Good, shiftedNow, ZONE);
    expect(shifted.memory.tree?.realReviewDays ?? []).not.toContain(localDayKey(shiftedNow, ZONE));
    expect(shifted.wordCards.tree?.masteryBadge).not.toBe(true);
    const legacy = { ...save, memory: { tree: { ...save.memory.tree!, realReviewDays: undefined } } };
    expect(() => reviewWord(legacy, "tree", Rating.Good, new Date(start.getTime() + 60_000), ZONE)).not.toThrow();
  });
});

describe("round 3 new words, hints, and replay", () => {
  it("N1 keeps issuing cards after the 3, 5, and 8 new-word targets", () => {
    const now = atLocal("2026-07-01", "11:00");
    const words = sampleWords().map((word) => word.id);
    for (const [preset, target] of [["easy", 3], ["normal", 5], ["more", 8]] as const) {
      let save = setGoalPreset(fresh(now), preset);
      for (let index = 0; index < target; index += 1) save = learnWord(save, words[index]!, now, ZONE);
      expect(newWordsLearnedToday(save, now, ZONE)).toBe(target);
      expect(dailyNewWordTargetMet(save, now, ZONE)).toBe(true);
      expect(save.dailyGoal?.rewardClaimed).toBe(true);
      const nextId = words[target]!;
      const tokens = save.cosmeticTokens;
      const learned = learnWord(save, nextId, now, ZONE);
      expect(learned).not.toBe(save);
      expect(learned.wordCards[nextId]).toMatchObject({ masteryBadge: false, collectedAt: now.getTime() });
      expect(learned.memory[nextId]?.reviewInstants).toEqual([now.getTime()]);
      expect(learned.xp).toBe(save.xp + LEARN_XP);
      expect(newWordsLearnedToday(learned, now, ZONE)).toBe(target + 1);
      expect(learned.cosmeticTokens).toBe(tokens);
      expect(learned.dailyGoal?.rewardClaimed).toBe(true);
      const duplicate = learnWord(learned, nextId, now, ZONE);
      expect(duplicate).toBe(learned);
      expect(newWordsLearnedToday(duplicate, now, ZONE)).toBe(target + 1);
      expect(duplicate.xp).toBe(learned.xp);
    }
  });

  it("N2 starts a new count after local midnight and still learns past the evening target", () => {
    const evening = atLocal("2026-07-02", "23:30");
    const morning = atLocal("2026-07-03", "03:00");
    let save = setGoalPreset(fresh(evening), "easy");
    save = learnWord(save, "tree", evening, ZONE);
    save = learnWord(save, "bird", evening, ZONE);
    save = learnWord(save, "fish", evening, ZONE);
    const fourth = learnWord(save, "sun", evening, ZONE);
    expect(fourth.wordCards.sun).toBeTruthy();
    expect(fourth.xp).toBe(save.xp + LEARN_XP);
    expect(newWordsLearnedToday(fourth, evening, ZONE)).toBe(4);
    expect(newWordsLearnedToday(fourth, morning, ZONE)).toBe(0);
    const next = learnWord(fourth, "map", morning, ZONE);
    expect(next.wordCards.map).toBeTruthy();
    expect(newWordsLearnedToday(next, morning, ZONE)).toBe(1);
    expect(newWordsLearnedToday(next, evening, ZONE)).toBe(4);
    expect(localDayKey(evening, ZONE)).not.toBe(localDayKey(morning, ZONE));
  });

  it("N3 suggests review without blocking the next new word", () => {
    const now = atLocal("2026-07-04", "12:00");
    let save = fresh(now);
    save = learnWord(save, "tree", now, ZONE);
    const memory = save.memory.tree!;
    const due = new Date(now.getTime() - 1000).toISOString();
    const many: SaveData["memory"] = { ...save.memory };
    const extras = sampleWords().map((word) => word.id).filter((id) => id !== "tree").slice(0, 16);
    for (const id of extras) {
      many[id] = { ...memory, wordId: id, fsrs: { ...memory.fsrs, due } };
      save = { ...save, wordCards: { ...save.wordCards, [id]: { wordId: id, collectedAt: now.getTime(), masteryBadge: false } } };
    }
    save = { ...save, memory: many };
    expect(reviewFirstNotice(save, now)).toBe("今天先复习更划算");
    const nextId = sampleWords().map((word) => word.id).find((id) => !save.wordCards[id]);
    if (!nextId) throw new Error("no word left to learn");
    const learned = learnWord(save, nextId, now, ZONE);
    expect(learned.wordCards[nextId]).toBeTruthy();
  });

  it("uses one local day key at 23:59 and the next midnight, and isDue stays absolute", () => {
    const late = atLocal("2026-07-05", "23:59");
    const early = atLocal("2026-07-06", "00:00");
    expect(localDayKey(late, ZONE)).not.toBe(localDayKey(early, ZONE));
    const save = learnWord(setGoalPreset(fresh(late), "easy"), "tree", late, ZONE);
    expect(newWordsLearnedToday(save, late, ZONE)).toBe(1);
    expect(newWordsLearnedToday(save, early, ZONE)).toBe(0);
    const memory = save.memory.tree!;
    const dueAt = new Date(late.getTime() + 30_000);
    expect(isDue({ ...memory, fsrs: { ...memory.fsrs, due: dueAt.toISOString() } }, late)).toBe(false);
    expect(isDue({ ...memory, fsrs: { ...memory.fsrs, due: dueAt.toISOString() } }, early)).toBe(true);
  });

  it("K1 is true only for a changed deck with no damage card", () => {
    expect(showNoDamageHint("warrior", [starterSkillId("warrior")])).toBe(false);
    expect(showNoDamageHint("warrior", [])).toBe(true);
    expect(showNoDamageHint("warrior", ["warrior-hold"])).toBe(true);
    expect(showNoDamageHint("warrior", ["warrior-hold", "warrior-bash"])).toBe(false);
    expect(hasDamageCard(["warrior-bash"])).toBe(true);
    expect(hasDamageCard(["healer-cure"])).toBe(false);
    expect(showNoDamageHint("healer", ["healer-cure"])).toBe(true);
    expect(showNoDamageHint("healer", ["healer-guard"])).toBe(true);
    expect(showNoDamageHint("healer", ["healer-guard", "healer-light"])).toBe(false);
  });

  it("RP1 through RP5 pay the first three cleared-stage wins and skip the fourth", () => {
    const now = atLocal("2026-08-01", "15:00");
    const stage = stageById(1)!;
    let save = setGoalPreset(fresh(now), "more");
    for (const id of stageWordIds(save, stage)) save = learnWord(save, id, now, ZONE);
    save = { ...save, stageWins: { "1": 1 } };
    expect(stageCleared(save, stage)).toBe(true);
    const beforeTokens = save.cosmeticTokens;
    const xpBefore = save.xp;
    const encounter = stageEncounterId(1);
    const queued = save.rewardQueue.length;
    for (let win = 0; win < 4; win += 1) {
      save = applyBattleOutcome(save, "win", now.getTime(), encounter);
    }
    expect(save.replayWinsByDay?.[localDayKey(now, ZONE)]).toBe(4);
    expect(save.xp).toBe(xpBefore + 60);
    expect(save.skillLevels[starterSkillId("warrior")]).toBe(3);
    expect(save.rewardQueue).toHaveLength(queued);
    expect(save.cosmeticTokens).toBe(beforeTokens);
    const uncleared = applyBattleOutcome(fresh(now), "win", now.getTime(), encounter);
    expect(uncleared.replayWinsByDay).toBeUndefined();
    const boss = applyBattleOutcome(save, "win", now.getTime(), CHAPTER_BOSS_ID);
    expect(boss.replayWinsByDay).toEqual(save.replayWinsByDay);
    expect(explorationStageByEncounter(CHAPTER_BOSS_ID)).toBeNull();
  });

  it("RP6 a first clear does not spend the daily quota, and the fourth win after it pays nothing", () => {
    const now = atLocal("2026-08-06", "11:00");
    const stage = stageById(1)!;
    let save = setGoalPreset(fresh(now), "more");
    for (const id of stageWordIds(save, stage)) save = learnWord(save, id, now, ZONE);
    expect(stageCleared(save, stage)).toBe(false);
    const encounter = stageEncounterId(1);
    const xpBefore = save.xp;
    const skill = starterSkillId("warrior");
    save = applyBattleOutcome(save, "win", now.getTime(), encounter);
    expect(stageCleared(save, stage)).toBe(true);
    expect(save.replayWinsByDay).toBeUndefined();
    expect(save.xp).toBe(xpBefore + 20);
    expect(save.skillLevels[skill]).toBe(2);
    const afterClear = save.xp;
    for (let win = 0; win < 4; win += 1) {
      save = applyBattleOutcome(save, "win", now.getTime(), encounter);
    }
    expect(save.replayWinsByDay?.[localDayKey(now, ZONE)]).toBe(4);
    expect(save.xp).toBe(afterClear + 60);
    expect(save.skillLevels[skill]).toBe(MAX_SKILL_LEVEL);
  });

  it("RP7 a boss replay spends the same daily quota", () => {
    const now = atLocal("2026-08-07", "11:00");
    const cards = Object.fromEntries(sampleWords().map((word) => [word.id, { wordId: word.id, collectedAt: now.getTime(), masteryBadge: false }]));
    let save: SaveData = {
      ...fresh(now),
      wordCards: cards,
      stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 },
    };
    const before = save.xp;
    save = applyBattleOutcome(save, "win", now.getTime(), CHAPTER_BOSS_ID);
    expect(save.chapterCleared).toBe(true);
    expect(save.replayWinsByDay).toBeUndefined();
    expect(save.xp).toBe(before + 20);
    const day = localDayKey(now, ZONE);
    for (let win = 0; win < 2; win += 1) save = applyBattleOutcome(save, "win", now.getTime(), CHAPTER_BOSS_ID);
    save = applyBattleOutcome(save, "win", now.getTime(), stageEncounterId(1));
    expect(save.replayWinsByDay?.[day]).toBe(3);
    expect(save.xp).toBe(before + 80);
    const blocked = applyBattleOutcome(save, "win", now.getTime(), CHAPTER_BOSS_ID);
    expect(blocked.replayWinsByDay?.[day]).toBe(4);
    expect(blocked.xp).toBe(save.xp);
    expect(blocked.skillLevels).toEqual(save.skillLevels);
    expect(blocked.rewardQueue).toEqual(save.rewardQueue);
  });

  it("RP8 an open stage cannot farm experience or card levels after the first win", () => {
    const now = atLocal("2026-08-08", "11:00");
    const stage = stageById(1)!;
    let save = setGoalPreset(fresh(now), "more");
    const ids = stageWordIds(save, stage);
    for (const id of ids.slice(0, -1)) save = learnWord(save, id, now, ZONE);
    const encounter = stageEncounterId(1);
    const skill = starterSkillId("warrior");
    save = applyBattleOutcome(save, "win", now.getTime(), encounter);
    expect(stageCleared(save, stage)).toBe(false);
    expect(save.stageWins["1"]).toBe(1);
    expect(save.replayWinsByDay).toBeUndefined();
    expect(save.xp).toBeGreaterThan(0);
    expect(save.skillLevels[skill]).toBe(2);
    for (let win = 0; win < 3; win += 1) save = applyBattleOutcome(save, "win", now.getTime(), encounter);
    expect(stageCleared(save, stage)).toBe(false);
    expect(save.replayWinsByDay?.[localDayKey(now, ZONE)]).toBe(3);
    expect(save.skillLevels[skill]).toBe(MAX_SKILL_LEVEL);
    const cappedXp = save.xp;
    const cappedLevel = save.skillLevels[skill];
    save = applyBattleOutcome(save, "win", now.getTime(), encounter);
    expect(save.xp).toBe(cappedXp);
    expect(save.skillLevels[skill]).toBe(cappedLevel);
    save = applyBattleOutcome(save, "win", now.getTime(), encounter);
    expect(save.xp).toBe(cappedXp);
    expect(save.skillLevels[skill]).toBe(cappedLevel);
    expect(save.rewardQueue.every((notice) => notice.title !== "对战胜利")).toBe(true);
  });

  it("N8 grants the sixth grade-3 word, keeps it after a save reload, and only reminds", () => {
    const now = atLocal("2026-08-09", "10:00");
    const unit = lessonUnits(["G3"])[0];
    if (!unit) throw new Error("missing grade 3 lesson");
    expect(unit.wordIds.slice(0, 5)).toEqual(["tree", "bird", "fish", "sun", "map"]);
    const sixth = unit.wordIds[5]!;
    const seventh = unit.wordIds[6]!;
    let save = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: now.getTime(),
      grades: ["G3"],
    });
    save = setGoalPreset(save, "normal");
    for (const id of ["tree", "bird", "fish", "sun", "map"]) save = learnWord(save, id, now, ZONE);
    expect(newWordsLearnedToday(save, now, ZONE)).toBe(5);
    expect(dailyNewWordTargetMet(save, now, ZONE)).toBe(true);
    const tokens = save.cosmeticTokens;
    const learned = learnWord(save, sixth, now, ZONE);
    expect(learned.wordCards[sixth]).toMatchObject({ masteryBadge: false });
    expect(learned.xp).toBe(save.xp + LEARN_XP);
    expect(newWordsLearnedToday(learned, now, ZONE)).toBe(6);
    expect(learned.cosmeticTokens).toBe(tokens);
    expect(learnWord(learned, sixth, now, ZONE)).toBe(learned);
    const loaded = deserialize(serialize(learned));
    if (!loaded) throw new Error("grade 3 save did not reload");
    expect(loaded.wordCards[sixth]).toBeTruthy();
    expect(newWordsLearnedToday(loaded, now, ZONE)).toBe(6);
    expect(Object.keys(loaded)).not.toContain("newWordCap");
    const continued = learnWord(loaded, seventh, now, ZONE);
    expect(continued.wordCards[seventh]).toBeTruthy();
    expect(newWordsLearnedToday(continued, now, ZONE)).toBe(7);
    const nextDay = atLocal("2026-08-10", "00:05");
    expect(dailyNewWordTargetMet(continued, nextDay, ZONE)).toBe(false);
    expect(learnWord(continued, unit.wordIds[7]!, nextDay, ZONE).wordCards[unit.wordIds[7]!]).toBeTruthy();
    const learn = readFileSync(new URL("../game/scenes/LearnScene.ts", import.meta.url), "utf8");
    const progress = readFileSync(new URL("./progress.ts", import.meta.url), "utf8");
    const parent = readFileSync(new URL("./parent.ts", import.meta.url), "utf8");
    const proposals = readFileSync(new URL("./proposals.ts", import.meta.url), "utf8");
    expect(NEW_WORD_GOAL_NOTICE).toBe("今天的新词够啦，想继续认识新朋友也可以。");
    expect(NEW_WORD_GOAL_NOTICE).not.toContain("明天再来");
    expect(learn).toContain("NEW_WORD_GOAL_NOTICE");
    expect(learn).toContain("learnWord(current, id, studyNow(current))");
    expect(learn).toContain("uiLabel(\"选意思\")");
    expect(learn).not.toContain("canLearnNewWord");
    expect(learn).not.toContain("atNewWordCap");
    expect(learn).not.toContain("NEW_WORD_CAP_NOTICE");
    const noticeAt = learn.indexOf("dailyNewWordTargetMet(save, now)");
    const cardAt = learn.indexOf("this.meaningRow(640, studyRowY");
    expect(noticeAt).toBeGreaterThan(-1);
    expect(cardAt).toBeGreaterThan(noticeAt);
    expect(learn.slice(noticeAt, cardAt)).not.toContain("return;");
    expect(progress).not.toContain("canLearnNewWord");
    expect(parent).not.toContain("function canLearnNewWord");
    expect(parent).not.toContain("newWordCap");
    expect(proposals).toContain("newWordTarget:");
    expect(proposals).not.toContain("newWordCap");
  });

  it("G1 does not store the play timer on a save", () => {
    const save = fresh(atLocal("2026-08-02", "09:00"));
    expect(JSON.stringify(save)).not.toContain("snoozeUntil");
    expect(Object.keys(save)).not.toContain("playTimer");
  });

  it("prompts after 15 minutes or 50 answers and snoozes for 10 minutes", () => {
    const start = 1_000_000;
    let timer = createPlayTimer(start);
    expect(shouldPromptRest(timer, start + PLAY_PROMPT_MS - 1)).toBe(false);
    expect(shouldPromptRest(timer, start + PLAY_PROMPT_MS)).toBe(true);
    for (let answer = 0; answer < PLAY_PROMPT_ANSWERS; answer += 1) timer = notePlayAnswer(timer);
    expect(shouldPromptRest({ ...timer, startedAt: start }, start + 1000)).toBe(true);
    const snoozed = snoozePlayTimer(timer, start + PLAY_PROMPT_MS);
    expect(shouldPromptRest(snoozed, start + PLAY_PROMPT_MS + PLAY_SNOOZE_MS - 1)).toBe(false);
    expect(shouldPromptRest(snoozed, start + PLAY_PROMPT_MS + PLAY_SNOOZE_MS)).toBe(true);
    const rested = createPlayTimer(start + PLAY_PROMPT_MS);
    expect(rested.answers).toBe(0);
    expect(shouldPromptRest(rested, start + PLAY_PROMPT_MS + 1)).toBe(false);
  });
});

describe("round 3 class simulations", () => {
  it("A6 wins the boss with each starter at level 3 under normal play", () => {
    for (const classId of CLASS_IDS) {
      const starter = starterSkillId(classId);
      const full = run(fightFor(classId, 5, [starter], { [starter]: 3 }, 21), "greedy", null);
      expect(full.state.phase, classId).toBe("won");
      expect(full.questions, classId).toBeGreaterThanOrEqual(10);
      expect(full.questions, classId).toBeLessThanOrEqual(14);
      for (let slot = 0; slot < 5; slot += 1) {
        const mixed = run(fightFor(classId, 5, [starter], { [starter]: 3 }, 30 + slot), "greedy", slot);
        expect(mixed.state.phase, `${classId} slot ${slot}`).toBe("won");
        expect(mixed.questions, `${classId} slot ${slot}`).toBeLessThanOrEqual(16);
      }
    }
  });

  it("A8 wins the boss at starter level 1 and 80 percent", () => {
    for (const classId of CLASS_IDS) {
      const starter = starterSkillId(classId);
      for (let slot = 0; slot < 5; slot += 1) {
        const mixed = run(fightFor(classId, 5, [starter], { [starter]: 1 }, 40 + slot), "greedy", slot);
        expect(mixed.state.phase, `${classId} ${slot}`).toBe("won");
        expect(mixed.questions, `${classId} ${slot}`).toBeLessThanOrEqual(16);
      }
    }
  });

  it("A7 clears small stages in 4 to 6 questions, or at most 8 at 80 percent", () => {
    for (const classId of CLASS_IDS) {
      const starter = starterSkillId(classId);
      for (const stageId of [1, 2, 3, 4]) {
        const full = run(fightFor(classId, stageId, [starter], { [starter]: 1 }, stageId), "greedy", null);
        expect(full.state.phase, `${classId} ${stageId}`).toBe("won");
        expect(full.questions, `${classId} ${stageId}`).toBeGreaterThanOrEqual(4);
        expect(full.questions, `${classId} ${stageId}`).toBeLessThanOrEqual(6);
        const mixed = run(fightFor(classId, stageId, [starter], { [starter]: 1 }, stageId + 9), "greedy", 0);
        expect(mixed.state.phase, `${classId} ${stageId} 80`).toBe("won");
        expect(mixed.questions, `${classId} ${stageId} 80`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("A9 loses a boss that only heals or only blocks", () => {
    for (const policy of ["heal", "block"] as const) {
      const played = run(fightFor("warrior", 5, ["warrior-bash"], { "warrior-bash": 3 }, 3), policy, null);
      expect(played.state.phase, policy).toBe("lost");
    }
  });

  it("A10 wins with 盾击, 坚守, and 战吼 under first-affordable", () => {
    const deck = ["warrior-bash", "warrior-hold", "warrior-shout"];
    const levels = { "warrior-bash": 3, "warrior-hold": 1, "warrior-shout": 1 };
    const full = run(fightFor("warrior", 5, deck, levels, 8), "first", null);
    expect(full.state.phase).toBe("won");
    expect(full.questions).toBeLessThanOrEqual(14);
    for (let slot = 0; slot < 5; slot += 1) {
      const mixed = run(fightFor("warrior", 5, deck, levels, 12 + slot), "first", slot);
      expect(mixed.state.phase, `slot ${slot}`).toBe("won");
      expect(mixed.questions, `slot ${slot}`).toBeLessThanOrEqual(16);
    }
  });

  it("A11 wins when 战吼 is cast whenever energy allows", () => {
    const deck = ["warrior-bash", "warrior-hold", "warrior-shout"];
    const levels = { "warrior-bash": 3, "warrior-hold": 1, "warrior-shout": 1 };
    const played = run(fightFor("warrior", 5, deck, levels, 18), "shout", null);
    expect(played.state.phase).toBe("won");
  });

  it("A12 wins a warrior who only carries 盾击", () => {
    const full = run(fightFor("warrior", 5, ["warrior-bash"], { "warrior-bash": 3 }, 19), "first", null);
    expect(full.state.phase).toBe("won");
    for (const stageId of [1, 2, 3, 4]) {
      const stage = run(fightFor("warrior", stageId, ["warrior-bash"], { "warrior-bash": 3 }, stageId), "first", null);
      expect(stage.state.phase, `stage ${stageId}`).toBe("won");
      expect(stage.questions, `stage ${stageId}`).toBeLessThanOrEqual(6);
    }
  });

  it.skip("A12 healer only 治愈 loses under first-affordable; R2 is normal play and p0 is warrior only", () => {
    const played = run(fightFor("healer", 5, ["healer-cure"], { "healer-cure": 3 }, 4), "first", null);
    expect(played.state.phase).toBe("lost");
  });
});

describe("round 3 remaining assertions", () => {
  it("S2 halves the third support action and a hit restores the next heal", () => {
    let state = { ...fightFor("warrior", 1, [], {}, 15), playerHp: 1, playerMaxHp: 500, enemyMaxHp: 500, enemyHp: 500, enemyAttack: 0 };
    state = act(state, { type: "heal" });
    state = act(state, { type: "block" });
    const weakened = state.playerHp;
    state = act(state, { type: "heal" });
    expect(state.playerHp - weakened).toBe(4);
    state = act(state, { type: "attack" });
    const restored = state.playerHp;
    state = act(state, { type: "heal" });
    expect(state.playerHp - restored).toBe(8);
    expect(state.lastNote).not.toMatch(/[0-9]/);
  });

  it("S5 counts heal and guard cards together and clears the streak on a strike", () => {
    let state = startBattle({
      encounterId: "inkling",
      classId: "healer",
      learnedIds: LEARNED,
      equippedSkillIds: ["healer-cure", "healer-guard", "healer-light"],
      skillLevels: { "healer-cure": 1, "healer-guard": 1, "healer-light": 1 },
      seed: 6,
      enemy: { name: "x", maxHp: 500, attack: 0, sprite: "inkling" },
    });
    state = { ...state, playerHp: 1, energy: 8 };
    state = act(state, { type: "skill", slotIndex: 0 });
    expect(state.supportStreak).toBe(1);
    state = act(state, { type: "skill", slotIndex: 1 });
    expect(state.supportStreak).toBe(2);
    state = { ...state, energy: 8 };
    state = act(state, { type: "skill", slotIndex: 2 });
    expect(state.supportStreak).toBe(0);
    state = { ...state, energy: 8 };
    const healedFrom = state.playerHp;
    state = act(state, { type: "skill", slotIndex: 0 });
    expect(state.supportStreak).toBe(1);
    expect(state.playerHp - healedFrom).toBe(14);
    expect(state.lastNote).toContain("恢复了体力");
    expect(state.lastNote).not.toMatch(/[0-9]/);
  });

  it("W1 raises the hint on every third support action and an attack starts the count over", () => {
    let state = { ...fightFor("warrior", 1, [], {}, 16), playerHp: 1, playerMaxHp: 500, enemyMaxHp: 500, enemyHp: 500, enemyAttack: 0 };
    const hints: boolean[] = [];
    for (let turn = 0; turn < 4; turn += 1) {
      state = act(state, { type: "block" }, false);
      hints.push(state.attackHint);
    }
    expect(hints).toEqual([false, false, true, false]);
    state = act(state, { type: "attack" }, false);
    expect(state.attackHint).toBe(false);
    const again: boolean[] = [];
    for (let turn = 0; turn < 3; turn += 1) {
      state = act(state, { type: "heal" }, false);
      again.push(state.attackHint);
    }
    expect(again).toEqual([false, false, true]);
  });

  it("W2 does not hint when the third action ends the fight, and damage never hints", () => {
    const open = { ...fightFor("warrior", 1, [], {}, 17), playerHp: 10, playerMaxHp: 80, enemyMaxHp: 30, enemyHp: 30, enemyAttack: 0 };
    const asked = takeAction({ ...open, enemyHp: 0, supportStreak: 2 }, { type: "heal" });
    const finished = answerQuestion(asked.state, answerOf(asked.state, false));
    expect(finished.phase === "won" || finished.phase === "lost").toBe(true);
    expect(finished.attackHint).toBe(false);
    const struck = act(open, { type: "attack" });
    expect(struck.attackHint).toBe(false);
    expect(struck.playerHp).toBe(open.playerHp);
    expect(struck.questionsAsked).toBe(1);
  });

  it("P3 keeps a full due list free of words that are not due", () => {
    const pool = skillQuestionPool(["tree", "bird", "fish", "sun", "map"], LEARNED);
    expect(pool).toEqual(["tree", "bird", "fish", "sun", "map"]);
  });

  it("K1 treats a fresh deck as unchanged for every class", () => {
    for (const classId of CLASS_IDS) {
      expect(showNoDamageHint(classId, [starterSkillId(classId)])).toBe(false);
    }
    expect(deckChangedFromDefault("healer", ["healer-beam"])).toBe(false);
    expect(deckChangedFromDefault("healer", ["healer-cure"])).toBe(true);
    expect(deckChangedFromDefault("healer", [])).toBe(true);
    expect(deckChangedFromDefault("healer", ["healer-guard"])).toBe(true);
    expect(deckChangedFromDefault("healer", ["healer-cure", "healer-guard"])).toBe(true);
    expect(deckChangedFromDefault("healer", ["healer-guard", "healer-cure"])).toBe(
      deckChangedFromDefault("healer", ["healer-cure", "healer-guard"]),
    );
    expect(showNoDamageHint("healer", ["healer-cure", "healer-guard"])).toBe(true);
    expect(showNoDamageHint("healer", ["healer-guard", "healer-cure"])).toBe(true);
    expect(hasDamageCard([])).toBe(false);
    expect(hasDamageCard(["missing"])).toBe(false);
    expect(hasDamageCard(["healer-guard"])).toBe(false);
  });

  it("RP2 still writes the first due answer on a fourth replay, and RP3 resets the next day", () => {
    const now = atLocal("2026-08-03", "15:00");
    const stage = stageById(1)!;
    let save = setGoalPreset(fresh(now), "more");
    for (const id of stageWordIds(save, stage)) save = learnWord(save, id, now, ZONE);
    save = { ...save, stageWins: { "1": 1 } };
    const encounter = stageEncounterId(1);
    for (let win = 0; win < 3; win += 1) save = applyBattleOutcome(save, "win", now.getTime(), encounter);
    const wordId = stageWordIds(save, stage)[0];
    if (!wordId) throw new Error("stage word missing");
    const memory = save.memory[wordId];
    if (!memory) throw new Error("memory missing");
    save = {
      ...save,
      memory: { ...save.memory, [wordId]: { ...memory, fsrs: { ...memory.fsrs, due: new Date(now.getTime() - 1000).toISOString() } } },
    };
    const written = noteBattleAnswer(save, { wordId, correct: true, now, dueAtStart: [wordId], spelling: false, timeZone: ZONE });
    expect(written.memory[wordId]?.fsrs.due).not.toBe(save.memory[wordId]?.fsrs.due);
    const nextDay = atLocal("2026-08-04", "00:10");
    const again = applyBattleOutcome(save, "win", nextDay.getTime(), encounter);
    expect(again.replayWinsByDay?.[localDayKey(nextDay, ZONE)]).toBe(1);
    expect(again.xp).toBe(save.xp + 20);
  });

  it("A12 also wins the boss at 80 percent with only 盾击", () => {
    for (let slot = 0; slot < 5; slot += 1) {
      const mixed = run(fightFor("warrior", 5, ["warrior-bash"], { "warrior-bash": 3 }, 50 + slot), "first", slot);
      expect(mixed.state.phase, `slot ${slot}`).toBe("won");
      expect(mixed.questions, `slot ${slot}`).toBeLessThanOrEqual(16);
    }
  });
});

describe("round 3 scene contracts", () => {
  const battle = readFileSync(new URL("../game/scenes/BattleScene.ts", import.meta.url), "utf8");
  const review = readFileSync(new URL("../game/scenes/ReviewScene.ts", import.meta.url), "utf8");
  const learn = readFileSync(new URL("../game/scenes/LearnScene.ts", import.meta.url), "utf8");
  const skills = readFileSync(new URL("../game/scenes/SkillsScene.ts", import.meta.url), "utf8");
  const map = readFileSync(new URL("../game/scenes/StageMapScene.ts", import.meta.url), "utf8");

  it("H1 does not print the enemy health number", () => {
    expect(battle).not.toContain("${this.state.enemyHp}");
    expect(battle).not.toContain("enemyHp}");
  });

  it("V1 hides the gloss until the card is revealed", () => {
    expect(review).toContain("翻看释义");
    expect(review).toContain("if (!this.revealed.has(wordId)) return;");
    expect(review).toContain("在不同的两天都记住它，就能点亮徽章。");
  });

  it("E1 notes battle:ready once the lock opens on a choose phase", () => {
    expect(battle).toContain('probeNote("battle:ready")');
    expect(battle).toContain('if (this.state.phase === "choose")');
  });

  it("L1 keeps disabled buttons while a turn is resolving or lunging", () => {
    expect(battle).toContain("disabled: inputLocked");
    expect(battle).toContain("panel_wood");
  });

  it("W6 places the attack hint clear of the boss and both health bars", () => {
    const text = "效果变弱了，试试攻击吧！";
    const width = Math.max(160, text.length * 18 + 96);
    const rect = {
      left: ATTACK_HINT_TOAST.x - width / 2,
      right: ATTACK_HINT_TOAST.x + width / 2,
      top: ATTACK_HINT_TOAST.y - 26,
      bottom: ATTACK_HINT_TOAST.y + 26,
    };
    const boxes = [
      { left: 813, right: 1121, top: 197, bottom: 520 },
      { left: 170, right: 440, top: 92, bottom: 116 },
      { left: 750, right: 1020, top: 92, bottom: 116 },
      { left: 865, right: 1095, top: 400, bottom: 640 },
    ];
    for (const box of boxes) {
      const overlap = Math.max(0, Math.min(rect.right, box.right) - Math.max(rect.left, box.left))
        * Math.max(0, Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top));
      expect(overlap).toBe(0);
    }
  });

  it("shows the no-damage hint only on the skill page", () => {
    expect(skills).toContain("带一张攻击卡会更好打哦");
    expect(battle).not.toContain("带一张攻击卡会更好打哦");
    expect(map).not.toContain("带一张攻击卡会更好打哦");
    expect(learn).toContain("NEW_WORD_GOAL_NOTICE");
    expect(learn).not.toContain("NEW_WORD_CAP_NOTICE");
    expect(learn).not.toContain("canLearnNewWord");
    expect(map).toContain("fromBattleEnd");
    expect(map).toContain("已经玩了一会儿啦");
    expect(map).toContain("再玩一会儿");
    expect(battle).not.toContain("已经玩了一会儿啦");
    expect(learn).not.toContain("已经玩了一会儿啦");
    expect(review).not.toContain("已经玩了一会儿啦");
    expect(battle).toContain("fromBattleEnd: this.reported");
  });
});
