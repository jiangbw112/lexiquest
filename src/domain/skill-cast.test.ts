import { describe, expect, it } from "vitest";
import {
  buildSharedDuel,
  drawSkillQuestionWord,
  emptySkillDeck,
  sharedDuelWordPool,
  skillQuestionPool,
  type SkillQuestionDeck,
} from "./skill-cast";
import { castEffect } from "./skills";

const LEARNED = ["tree", "bird", "fish", "sun", "map", "run", "big", "red"];

function deal(pool: readonly string[], count: number, seed = 11): string[] {
  let deck: SkillQuestionDeck = emptySkillDeck();
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const next = drawSkillQuestionWord(pool, deck, seed + index);
    deck = next.deck;
    words.push(next.wordId);
  }
  return words;
}

describe("skill card questions", () => {
  it("asks a due learned word before the rest of the learned set, and never an unlearned word", () => {
    expect(skillQuestionPool(["fish", "not-a-word", "tree"], ["river", "map", "fish"])).toEqual(["fish"]);
    expect(skillQuestionPool(["not-a-word", "mountain"], LEARNED)).toEqual(LEARNED);
    const dueOnly = skillQuestionPool(["map", "red"], LEARNED);
    const drawn = deal(dueOnly, 6, 3);
    expect(new Set(drawn)).toEqual(new Set(["map", "red"]));
    expect(drawn).not.toContain("tree");
  });

  it("does not ask a due word from a deselected grade", () => {
    expect(skillQuestionPool(["tree"], ["tree", "explore"], { allowedIds: ["explore"] })).toEqual(["explore"]);
    expect(skillQuestionPool(["tree", "explore"], ["tree", "explore"], { allowedIds: ["explore"] })).toEqual(["explore"]);
    expect(skillQuestionPool(["tree"], ["tree"], { allowedIds: ["explore"] })).toEqual([]);
  });

  it("deals the whole pool before repeating, instead of cycling the same three words", () => {
    const drawn = deal(LEARNED, LEARNED.length, 21);
    expect(new Set(drawn).size).toBe(LEARNED.length);
    expect(drawn.slice(0, 3).every((id) => LEARNED.includes(id))).toBe(true);
    const firstThree = new Set(drawn.slice(0, 3));
    expect(drawn.slice(3).some((id) => !firstThree.has(id))).toBe(true);
  });

  it("gives both duelists the same slots, values, and shared-pool questions", () => {
    const learnedA = ["tree", "bird", "map", "run", "big", "sun"];
    const learnedB = ["map", "run", "big", "river", "forest", "brave"];
    const duel = buildSharedDuel({
      classId: "warrior",
      equippedSkillIds: ["warrior-shout"],
      skillLevels: { "warrior-shout": 3 },
      learnedA,
      learnedB,
      seed: 8,
      questionCount: 6,
    });
    expect(duel.sideA).toEqual(duel.sideB);
    expect(duel.sideA).toEqual(duel.slots);
    expect(duel.sideA[0]).toMatchObject({ skillId: "warrior-shout", origin: "equipped" });
    expect(duel.sideA[1]?.origin).toBe("base");
    expect(duel.sideA[2]?.origin).toBe("base");
    expect(castEffect(duel.sideA[0]!, true, 0.5)).toBe(castEffect(duel.sideB[0]!, true, 0.5));
    expect(castEffect(duel.sideA[0]!, false, 0.5)).toBe(castEffect(duel.sideB[0]!, false, 0.5));

    const shared = sharedDuelWordPool(learnedA, learnedB);
    expect(shared).toEqual(["map", "run", "big"]);
    expect(duel.questions.map((question) => question.wordId).every((id) => shared.includes(id))).toBe(true);
    expect(new Set(duel.questions.map((question) => question.wordId)).size).toBe(shared.length);
    expect(duel.questions.some((question) => question.wordId === "tree")).toBe(false);
    expect(duel.questions.some((question) => question.wordId === "brave")).toBe(false);
  });
});
