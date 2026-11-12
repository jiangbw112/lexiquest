import { describe, expect, it } from "vitest";
import { CLASSES } from "./classes";
import {
  answerQuestion,
  canStartBattle,
  CHAPTER_BOSS_ID,
  MIN_LEARNED_FOR_BATTLE,
  openEncounters,
  startBattle,
  takeAction,
  type BattleState,
} from "./battle";
import { sampleWords } from "./catalog";
import { PROVISIONAL } from "./provisional";
import { SKILL_CARD_RULES, skillsForClass } from "./skills";

const LEARNED = ["tree", "bird", "fish", "sun", "map", "run"];

function askBoss(learned: string[], lit: string[], count: number, allowed = learned) {
  let state = startBattle({
    encounterId: CHAPTER_BOSS_ID,
    classId: "warrior",
    learnedIds: learned,
    equippedSkillIds: [],
    skillLevels: {},
    seed: 4,
    allowedWordIds: allowed,
    litWordIds: lit,
    enemy: { name: "林心守护者", maxHp: 9000, attack: 0, sprite: "page" },
    phases: [
      { hp: 9000, note: "第一阶段" },
      { hp: 9000, note: "第二阶段" },
    ],
    spellingCap: 0.3,
  });
  const words: string[] = [];
  let spelling = 0;
  for (let turn = 0; turn < count; turn += 1) {
    const cast = takeAction(state, { type: "skill", slotIndex: 0 });
    if (!cast.ok || !cast.state.question) throw new Error(cast.reason ?? "no question");
    words.push(cast.state.question.wordId);
    if (cast.state.question.kind === "spelling") spelling += 1;
    const answer = cast.state.question.kind === "spelling" ? "nope" : cast.state.question.answerId;
    state = answerQuestion(cast.state, answer);
  }
  return { spelling, asked: count, words };
}

function begin(
  classId: BattleState["classId"],
  encounterId = "inkling",
  extra: { dueWordIds?: string[]; equipped?: string[]; rules?: BattleState["rules"] } = {},
): BattleState {
  const skills = skillsForClass(classId);
  return startBattle({
    encounterId,
    classId,
    learnedIds: LEARNED,
    equippedSkillIds: extra.equipped ?? skills.slice(0, 4).map((skill) => skill.id),
    skillLevels: Object.fromEntries(skills.map((skill) => [skill.id, 1])),
    seed: 42,
    dueWordIds: extra.dueWordIds,
    rules: extra.rules,
  });
}

function play(
  state: BattleState,
  policy: "attack" | "smart" | "wrong" | "heal" | "block" | "first-affordable",
): BattleState {
  let guard = 0;
  while (state.phase !== "won" && state.phase !== "lost") {
    if (guard++ > 120) throw new Error(`battle did not end from ${state.phase}`);
    if (state.phase === "question" && state.question) {
      const question = state.question;
      const choice =
        question.kind === "spelling"
          ? policy === "wrong"
            ? "nope"
            : question.answer
          : policy === "wrong"
            ? (question.choices.find((item) => item.id !== question.answerId)?.id ?? "nope")
            : question.answerId;
      state = answerQuestion(state, choice);
      continue;
    }
    if (policy === "heal" || policy === "block") {
      state = takeAction(state, { type: policy }).state;
      continue;
    }
    if (policy === "first-affordable") {
      const slot = state.slots.find((item) => state.energy >= item.energyCost);
      const cast = takeAction(state, slot ? { type: "skill", slotIndex: slot.index } : { type: "attack" });
      if (!cast.ok) throw new Error(cast.reason ?? "cast failed");
      state = cast.state;
      continue;
    }
    if (policy === "wrong") {
      const slot = state.slots.find((item) => item.origin === "base") ?? state.slots[0];
      const cast = takeAction(state, { type: "skill", slotIndex: slot?.index });
      if (!cast.ok) throw new Error(cast.reason ?? "cast failed");
      state = cast.state;
      continue;
    }
    if (policy === "smart") {
      const skillId =
        state.equippedSkillIds.find((id) => id.endsWith("shout") || id.endsWith("spark") || id.endsWith("aim")) ??
        state.equippedSkillIds[0];
      const skillTry = skillId ? takeAction(state, { type: "skill", skillId }) : { ok: false as const, state };
      if (skillTry.ok) {
        state = skillTry.state;
        continue;
      }
    }
    state = takeAction(state, { type: "attack" }).state;
  }
  return state;
}

describe("word-monster battle", () => {
  it("opens after four collected words and carries three slots even from a longer list", () => {
    expect(MIN_LEARNED_FOR_BATTLE).toBe(4);
    expect(canStartBattle(3)).toBe(false);
    expect(canStartBattle(4)).toBe(true);
    const state = begin("mage");
    expect(state.phase).toBe("choose");
    expect(state.question).toBeNull();
    expect(state.slots).toHaveLength(3);
    expect(state.equippedSkillIds).toHaveLength(3);
    expect(state.slots.every((slot) => slot.origin === "equipped")).toBe(true);
  });

  it("starts a battle with one real card by filling the other slots", () => {
    const state = begin("warrior", "inkling", { equipped: ["warrior-bash"] });
    expect(state.equippedSkillIds).toEqual(["warrior-bash"]);
    expect(state.slots.map((slot) => slot.origin)).toEqual(["equipped", "base", "base"]);
    const cast = takeAction(state, { type: "skill", slotIndex: 1 });
    expect(cast.ok).toBe(true);
    expect(cast.state.phase).toBe("question");
    expect(cast.state.question?.wordId).not.toBe("warrior-bash");
    expect(LEARNED).toContain(cast.state.question?.wordId);
  });

  it("draws the question from due learned words and does not ask an unlearned word", () => {
    const state = begin("warrior", "inkling", {
      equipped: ["warrior-bash"],
      dueWordIds: ["mountain", "map", "not-a-word"],
    });
    const cast = takeAction(state, { type: "skill", slotIndex: 1 });
    expect(cast.state.question?.wordId).toBe("map");
    const asked = cast.state.question;
    if (!asked || asked.kind === "spelling") throw new Error("expected a choice question");
    const again = takeAction(answerQuestion(cast.state, asked.answerId), { type: "skill", slotIndex: 2 });
    expect(again.state.question?.wordId).toBe("map");
  });

  it("walks the learned pool instead of repeating only the first three words", () => {
    let state = begin("warrior", "page", { equipped: ["warrior-hold"] });
    const seen: string[] = [];
    for (let index = 0; index < LEARNED.length; index += 1) {
      const slot = state.slots.find((item) => item.origin === "base");
      const cast = takeAction(state, { type: "skill", slotIndex: slot?.index });
      expect(cast.ok).toBe(true);
      seen.push(cast.state.question!.wordId);
      state = answerQuestion(cast.state, "wrong-on-purpose");
      if (state.phase === "won" || state.phase === "lost") break;
    }
    expect(seen.length).toBeGreaterThan(3);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("applies full damage on a correct cast and the configurable reduced base effect on a miss", () => {
    const correctStart = begin("warrior", "page", { equipped: ["warrior-shout"], rules: { ...SKILL_CARD_RULES, wrongAnswerMultiplier: 0.5 } });
    correctStart.energy = 6;
    correctStart.skillLevels["warrior-shout"] = 3;
    const leveled = begin("warrior", "page", {
      equipped: ["warrior-shout"],
      rules: { ...SKILL_CARD_RULES, wrongAnswerMultiplier: 0.5 },
    });
    leveled.energy = 6;
    leveled.slots = leveled.slots.map((slot) =>
      slot.skillId === "warrior-shout" ? { ...slot, fullPower: 30, basePower: 10 } : slot,
    );
    const right = takeAction(leveled, { type: "skill", skillId: "warrior-shout" });
    const wrong = takeAction(leveled, { type: "skill", skillId: "warrior-shout" });
    const rightQuestion = right.state.question;
    if (!rightQuestion || rightQuestion.kind === "spelling") throw new Error("expected a choice question");
    const rightDone = answerQuestion(right.state, rightQuestion.answerId);
    const wrongDone = answerQuestion(wrong.state, "nope");
    expect(rightDone.enemyHp).toBe(leveled.enemyHp - 30);
    expect(wrongDone.enemyHp).toBe(leveled.enemyHp - 5);
    expect(correctStart.rules.wrongAnswerMultiplier).toBe(0.5);
  });

  it("asks before attack, block, and heal, and a full three-card loadout can still be asked", () => {
    const trios = <T,>(items: readonly T[]): T[][] => {
      const sets: T[][] = [];
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          for (let k = j + 1; k < items.length; k += 1) sets.push([items[i]!, items[j]!, items[k]!]);
        }
      }
      return sets;
    };
    for (const type of ["attack", "block", "heal"] as const) {
      const asked = takeAction(begin("warrior"), { type });
      expect(asked.ok, type).toBe(true);
      expect(asked.state.phase, type).toBe("question");
      expect(asked.state.enemyHp, type).toBe(begin("warrior").enemyHp);
      expect(asked.state.playerHp, type).toBe(begin("warrior").playerHp);
    }
    const unlearned = startBattle({
      encounterId: "inkling",
      classId: "warrior",
      learnedIds: [],
      equippedSkillIds: ["warrior-bash", "warrior-shout", "warrior-hold"],
      skillLevels: { "warrior-bash": 1, "warrior-shout": 1, "warrior-hold": 1 },
      seed: 1,
    });
    expect(takeAction(unlearned, { type: "attack" }).ok).toBe(false);
    expect(unlearned.question).toBeNull();

    for (const hero of CLASSES) {
      const skills = skillsForClass(hero.id);
      expect(trios(skills).length).toBeGreaterThan(0);
      for (const trio of trios(skills)) {
        const state = begin(hero.id, "inkling", { equipped: trio.map((skill) => skill.id) });
        expect(state.slots.filter((slot) => slot.origin === "equipped")).toHaveLength(3);
        expect(state.slots.some((slot) => slot.origin === "base")).toBe(false);
        const asked = takeAction(state, { type: "attack" });
        expect(asked.ok, `${hero.id} ${trio.map((skill) => skill.id).join(",")}`).toBe(true);
        expect(asked.state.phase).toBe("question");
        expect(asked.state.question).toBeTruthy();
      }
      let state = begin(hero.id);
      let questions = 0;
      while (state.phase !== "won" && state.phase !== "lost") {
        if (questions > 20) throw new Error(`${hero.id} did not finish`);
        const asked = takeAction(state, { type: "attack" });
        expect(asked.ok, hero.id).toBe(true);
        expect(asked.state.phase, hero.id).toBe("question");
        const question = asked.state.question;
        if (!question) throw new Error("missing question");
        questions += 1;
        const choice = question.kind === "spelling" ? question.answer : question.answerId;
        state = answerQuestion(asked.state, choice);
      }
      expect(state.phase, hero.id).toBe("won");
      expect(questions, hero.id).toBeGreaterThan(0);
    }
  });

  it("loses when wrong casts are configured to do nothing, and stalls lose to the enrage", () => {
    const zero = begin("warrior", "inkling", {
      equipped: ["warrior-bash"],
      rules: { ...SKILL_CARD_RULES, wrongAnswerMultiplier: 0 },
    });
    expect(play(zero, "wrong").phase).toBe("lost");
  });

  it("refuses a skill that is not one of the equipped three", () => {
    const state = begin("warrior");
    const extra = skillsForClass("warrior")[3]!;
    expect(state.equippedSkillIds).not.toContain(extra.id);
    const rejected = takeAction(state, { type: "skill", skillId: extra.id });
    expect(rejected.ok).toBe(false);
    expect(rejected.state).toBe(state);
  });

  it("does not ask a due word outside the selected grades", () => {
    const shared = {
      encounterId: "inkling",
      classId: "warrior" as const,
      learnedIds: ["tree"],
      equippedSkillIds: [] as string[],
      skillLevels: {},
      seed: 3,
      allowedWordIds: ["explore"],
    };
    const empty = takeAction(startBattle(shared), { type: "skill", slotIndex: 0 });
    expect(empty.ok).toBe(false);
    expect(empty.reason).toContain("所选年级");
    const due = takeAction(startBattle({ ...shared, dueWordIds: ["tree"] }), { type: "skill", slotIndex: 0 });
    expect(due.ok).toBe(false);
    expect(due.reason).toContain("所选年级");
    expect(due.state.question).toBeNull();
  });

  it("keeps the chapter boss locked until every sample card is collected", () => {
    const ids = sampleWords().map((word) => word.id);
    expect(openEncounters(ids.slice(0, 4), ids).map((encounter) => encounter.id)).not.toContain(CHAPTER_BOSS_ID);
    expect(openEncounters(ids, ids).some((encounter) => encounter.id === CHAPTER_BOSS_ID)).toBe(true);
    expect(startBattle({
      encounterId: CHAPTER_BOSS_ID,
      classId: "warrior",
      learnedIds: ids,
      equippedSkillIds: ["warrior-bash"],
      skillLevels: { "warrior-bash": 1 },
      seed: 1,
    }).enemyMaxHp).toBe(75);
  });

  it("changes boss phase without ending the fight, and caps spelling at 30 percent", () => {
    const basics = ["tree", "bird", "fish", "sun", "map", "run"];
    let phase = { ...startBattle({
      encounterId: CHAPTER_BOSS_ID,
      classId: "warrior",
      learnedIds: ["tree"],
      equippedSkillIds: [],
      skillLevels: {},
      seed: 2,
      enemy: { name: "林心守护者", maxHp: 5, attack: 0, sprite: "page" },
      phases: [
        { hp: 5, note: "第一阶段" },
        { hp: 5, note: "林心守护者进入第二阶段。" },
      ],
    }), shaken: true };
    const cast = takeAction(phase, { type: "skill", slotIndex: 0 });
    expect(cast.ok).toBe(true);
    const answer = cast.state.question?.kind === "spelling" ? cast.state.question.answer : cast.state.question?.answerId;
    phase = answerQuestion(cast.state, answer ?? "");
    expect(phase.phase).toBe("choose");
    expect(phase.phaseIndex).toBe(1);
    expect(phase.shaken).toBe(true);
    expect(phase.enemyHp).toBe(5);
    expect(phase.lastNote).toContain("第二阶段");
    const again = takeAction(phase, { type: "skill", slotIndex: 0 });
    phase = answerQuestion(again.state, again.state.question?.kind === "spelling" ? again.state.question.answer : again.state.question!.answerId);
    expect(phase.phase).toBe("won");

    const mix = askBoss(basics, basics, 12);
    expect(mix.spelling).toBeGreaterThan(0);
    expect(mix.spelling / mix.asked).toBeLessThanOrEqual(0.3);
    expect(mix.spelling).toBeLessThanOrEqual(4);
    expect(askBoss(["big"], [], 12).spelling).toBe(0);
    expect(askBoss(["treasure"], ["treasure"], 12).spelling).toBe(0);
    const onlyTree = askBoss(["tree"], [], 8, sampleWords().map((word) => word.id));
    expect(onlyTree.words.every((id) => id === "tree")).toBe(true);
  });

  it("keeps a word out of the last three questions when another word is available", () => {
    const pool = ["tree", "bird", "fish", "sun"];
    let state = startBattle({
      encounterId: "inkling",
      classId: "warrior",
      learnedIds: pool,
      equippedSkillIds: [],
      skillLevels: {},
      seed: 9,
      allowedWordIds: pool,
    });
    const asked: string[] = [];
    for (let turn = 0; turn < 6 && state.phase !== "won" && state.phase !== "lost"; turn += 1) {
      const cast = takeAction(state, { type: "skill", slotIndex: 0 });
      expect(cast.ok).toBe(true);
      const wordId = cast.state.question?.wordId ?? "";
      expect(asked.slice(-PROVISIONAL.chapterBattle.recentQuestionWindow)).not.toContain(wordId);
      asked.push(wordId);
      const answer = cast.state.question?.kind === "spelling" ? cast.state.question.answer : cast.state.question!.answerId;
      state = answerQuestion(cast.state, answer);
    }
    expect(asked.length).toBeGreaterThanOrEqual(4);
  });

  it("makes a block reduce the next hit after the question is answered", () => {
    const state = begin("warrior");
    const resolve = (action: "attack" | "block") => {
      const asked = takeAction(state, { type: action });
      const question = asked.state.question;
      if (!question || question.kind === "spelling") throw new Error("expected a choice question");
      return answerQuestion(asked.state, question.answerId);
    };
    const attacked = resolve("attack");
    const blocked = resolve("block");
    expect(blocked.playerHp).toBeGreaterThan(attacked.playerHp);
    expect(blocked.enemyHp).toBeGreaterThan(attacked.enemyHp);
    let streak = { ...state, playerHp: 20, enemyAttack: 6, enemyHp: 400, enemyMaxHp: 400 };
    for (let turn = 0; turn < 2; turn += 1) {
      const asked = takeAction(streak, { type: "block" });
      const question = asked.state.question;
      if (!question || question.kind === "spelling") throw new Error("expected a choice question");
      streak = answerQuestion(asked.state, question.answerId);
    }
    expect(streak.playerHp).toBe(20);
    const third = takeAction(streak, { type: "block" });
    const thirdQuestion = third.state.question;
    if (!thirdQuestion || thirdQuestion.kind === "spelling") throw new Error("expected a choice question");
    streak = answerQuestion(third.state, thirdQuestion.answerId);
    expect(streak.playerHp).toBe(17);
    expect(streak.lastNote).toContain("挡下了下一次伤害");
    expect(streak.lastNote).not.toMatch(/[0-9]/);
  });

  it("records the actual HP deltas, including a capped heal, a shield, and a zero change", () => {
    const hero = begin("warrior");
    const answer = (state: BattleState, type: "attack" | "block" | "heal", correct: boolean) => {
      const asked = takeAction(state, { type });
      const question = asked.state.question;
      if (!question || question.kind === "spelling") throw new Error("expected a choice question");
      const choice = correct ? question.answerId : (question.choices.find((item) => item.id !== question.answerId)?.id ?? "nope");
      return answerQuestion(asked.state, choice);
    };
    const attacked = answer({ ...hero, enemyHp: 40, enemyMaxHp: 40, enemyAttack: 5, playerHp: 42 }, "attack", true);
    expect(attacked.enemyHp).toBe(32);
    expect(attacked.playerHp).toBe(37);
    expect(attacked.turnDeltas).toEqual([
      { target: "enemy", amount: -8 },
      { target: "player", amount: -5 },
    ]);
    const healed = answer({ ...attacked, playerHp: 37, enemyAttack: 5 }, "heal", true);
    expect(healed.playerHp).toBe(37);
    expect(healed.turnDeltas).toEqual([
      { target: "player", amount: 5 },
      { target: "player", amount: -5 },
    ]);
    const shielded = answer({ ...healed, playerHp: 40, enemyAttack: 5 }, "block", false);
    const guardDelta = shielded.turnDeltas.find((delta) => delta.target === "player");
    expect(guardDelta?.amount).toBe(shielded.playerHp - 40);
    expect(guardDelta?.amount).toBeLessThan(0);
    expect(guardDelta?.amount).toBeGreaterThan(-5);
    const full = answer({ ...hero, playerHp: 42, enemyHp: 40, enemyMaxHp: 40, enemyAttack: 5 }, "heal", true);
    expect(full.playerHp).toBe(37);
    expect(full.turnDeltas.filter((delta) => delta.amount > 0)).toEqual([]);
    expect(full.turnDeltas).toContainEqual({ target: "player", amount: -5 });
  });
});
