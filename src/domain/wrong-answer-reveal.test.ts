import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { answerQuestion, revealedAnswer, startBattle, takeAction, type BattleQuestion, type BattleState } from "./battle";
import { formatMeaning, wordById } from "./catalog";
import { createSave, learnWord, noteBattleAnswer } from "./progress";
import { quizForWord, spellingQuestion } from "./questions";
import { castEffect, SKILL_CARD_RULES } from "./skills";
import { classById } from "./classes";

const START = new Date("2026-04-02T02:00:00Z");

function saveWith(learned: readonly string[]) {
  let save = createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades: ["G3"],
  });
  for (const id of learned) save = learnWord(save, id, START);
  return save;
}

function asked(question: BattleQuestion): BattleState {
  const opened = startBattle({
    encounterId: "inkling",
    classId: "warrior",
    learnedIds: ["tree"],
    equippedSkillIds: [],
    skillLevels: {},
    seed: 3,
    allowedWordIds: ["tree", "bird"],
    enemy: { name: "墨团", maxHp: 36, attack: 6, sprite: "inkling" },
  });
  const cast = takeAction(opened, { type: "attack" });
  if (!cast.ok || !cast.state.question) throw new Error(cast.reason ?? "no question");
  return { ...cast.state, question };
}

function figures(state: BattleState) {
  return {
    playerHp: state.playerHp,
    enemyHp: state.enemyHp,
    energy: state.energy,
    guard: state.guard,
    enemyAttack: state.enemyAttack,
    questionsAsked: state.questionsAsked,
    spellingAsked: state.spellingAsked,
    playerMaxHp: state.playerMaxHp,
    enemyMaxHp: state.enemyMaxHp,
  };
}

function expectWrongLeavesProgress(
  question: BattleQuestion,
  learned: readonly string[],
): void {
  const save = saveWith(learned);
  const state = asked(question);
  const before = figures(state);
  const choice = question.kind === "spelling"
    ? "nope"
    : (question.choices.find((item) => item.id !== question.answerId)?.id ?? "nope");
  const after = answerQuestion(state, choice);
  const word = wordById(question.wordId);
  if (!word) throw new Error(question.wordId);
  const hero = classById("warrior");
  const damage = castEffect({
    index: -1,
    skillId: "basic-attack",
    name: "攻击",
    kind: "damage",
    origin: "base",
    fullPower: hero.attack,
    basePower: hero.attack,
    fullHeal: 0,
    baseHeal: 0,
    energyCost: 0,
    level: null,
  }, false, SKILL_CARD_RULES.wrongAnswerMultiplier);
  expect(after.answerReveal).toEqual({ english: word.english, chinese: formatMeaning(word) });
  expect(after.answerReveal?.english).toBe(word.english);
  expect(after.answerReveal?.chinese).toContain(word.chinese);
  expect(revealedAnswer(question)).toEqual(after.answerReveal);
  expect(after.enemyHp).toBe(before.enemyHp - damage);
  expect(after.playerHp).toBe(before.playerHp - before.enemyAttack);
  expect(after.energy).toBe(before.energy);
  expect(after.guard).toBe(0);
  expect(after.enemyAttack).toBe(before.enemyAttack);
  expect(after.questionsAsked).toBe(before.questionsAsked);
  expect(after.spellingAsked).toBe(before.spellingAsked);
  expect(after.playerMaxHp).toBe(before.playerMaxHp);
  expect(after.enemyMaxHp).toBe(before.enemyMaxHp);
  const noted = noteBattleAnswer(save, {
    wordId: question.wordId,
    correct: false,
    now: START,
    dueAtStart: [],
    spelling: question.kind === "spelling",
  });
  expect(noted.wordCards).toEqual(save.wordCards);
  expect(noted.memory).toEqual(save.memory);
  expect(noted.dueAnswers).toEqual(save.dueAnswers);
  expect(save.wordCards[question.wordId] === undefined).toBe(!learned.includes(question.wordId));
}

describe("wrong answer reveal", () => {
  it("shows English and Chinese for a learned word, an unlearned word, and a spelling miss", () => {
    const learned = quizForWord("tree", 2, "en-to-zh");
    const unlearned = quizForWord("bird", 5, "zh-to-en");
    const spelling = spellingQuestion("tree", false);
    if (!spelling) throw new Error("tree should allow a spelling question");
    expectWrongLeavesProgress(learned, ["tree"]);
    expectWrongLeavesProgress(unlearned, ["tree"]);
    expectWrongLeavesProgress(spelling, ["tree"]);
    expect(unlearned.wordId).toBe("bird");

    const scene = readFileSync(new URL("../game/scenes/BattleScene.ts", import.meta.url), "utf8");
    const reveal = scene.slice(scene.indexOf("private drawAnswerReveal"), scene.indexOf("private drawPreview"));
    expect(reveal).toContain("reveal.english");
    expect(reveal).toContain("reveal.chinese");
    expect(reveal).toContain("正确答案");
    expect(reveal).toContain("听一听");
    expect(reveal).toContain("speakWord(reveal.english, browserSpeaker())");
  });

  it("clears the reveal after a correct answer", () => {
    const question = quizForWord("tree", 2, "en-to-zh");
    const state = asked(question);
    const right = answerQuestion(state, question.answerId);
    const wrong = answerQuestion(state, "nope");
    expect(right.answerReveal).toBeNull();
    expect(wrong.answerReveal?.english).toBe("tree");
    expect(right.enemyHp).toBeLessThan(wrong.enemyHp);
    expect(right.playerMaxHp).toBe(wrong.playerMaxHp);
  });
});
