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
import { SKILL_CARD_RULES, skillsForClass } from "./skills";

const LEARNED = ["tree", "bird", "fish", "sun", "map", "run"];

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

function play(state: BattleState, policy: "attack" | "smart" | "wrong" | "heal"): BattleState {
  let guard = 0;
  while (state.phase !== "won" && state.phase !== "lost") {
    if (guard++ > 40) throw new Error(`battle did not end from ${state.phase}`);
    if (state.phase === "question" && state.question) {
      const question = state.question;
      const choice =
        policy === "wrong"
          ? (question.choices.find((item) => item.id !== question.answerId)?.id ?? "nope")
          : question.answerId;
      state = answerQuestion(state, choice);
      continue;
    }
    if (policy === "heal") {
      state = takeAction(state, { type: "heal" }).state;
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
    const again = takeAction(answerQuestion(cast.state, cast.state.question!.answerId), { type: "skill", slotIndex: 2 });
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
    const rightDone = answerQuestion(right.state, right.state.question!.answerId);
    const wrongDone = answerQuestion(wrong.state, "nope");
    expect(rightDone.enemyHp).toBe(leveled.enemyHp - 30);
    expect(wrongDone.enemyHp).toBe(leveled.enemyHp - 5);
    expect(correctStart.rules.wrongAnswerMultiplier).toBe(0.5);
  });

  it("lets every class beat the first monster by attacking", () => {
    for (const hero of CLASSES) {
      const finished = play(begin(hero.id), "attack");
      expect(finished.phase, hero.id).toBe("won");
    }
  });

  it("loses when wrong casts are configured to do nothing, and stalls lose to the enrage", () => {
    const zero = begin("warrior", "inkling", {
      equipped: ["warrior-bash"],
      rules: { ...SKILL_CARD_RULES, wrongAnswerMultiplier: 0 },
    });
    expect(play(zero, "wrong").phase).toBe("lost");
    expect(play(begin("healer"), "heal").phase).toBe("lost");
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
    }).enemyMaxHp).toBe(48);
  });

  it("makes a block reduce the next hit", () => {
    const state = begin("warrior");
    const attacked = takeAction(state, { type: "attack" }).state;
    const blocked = takeAction(state, { type: "block" }).state;
    expect(blocked.playerHp).toBeGreaterThan(attacked.playerHp);
    expect(blocked.enemyHp).toBeGreaterThan(attacked.enemyHp);
  });
});
