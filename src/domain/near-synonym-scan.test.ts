import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG_WORDS, chapterExtraWords, wordById, type WordDef } from "./catalog";
import { glossPairBlocked, gradeChapters } from "./chapter-plan";
import glossFile from "./chapters/gloss_overlap_pairs_v0.2.json";
import { EXAMS } from "./exams";
import { pairsToBlock, scanNearSynonyms } from "./near-synonym-scan";
import { pickDistractors } from "./questions";
import { shuffle } from "./rng";
import { SPELLING_EXCLUSION_SHA256 } from "./spelling-leak";

const EXAM_POOL_WORDS = 1263;

function sameGrade(word: WordDef): WordDef[] {
  return [...CATALOG_WORDS, ...chapterExtraWords()].filter((item) => item.grade === word.grade);
}

function seedThatDraws(answer: WordDef, partnerId: string): number {
  const pool = sameGrade(answer);
  const others = pool.filter((item) => item.id !== answer.id && item.theme === answer.theme && item.gradeEst === answer.gradeEst);
  for (let seed = 1; seed < 4000; seed += 1) {
    if (shuffle(others, seed).slice(0, 2).some((item) => item.id === partnerId)) return seed;
  }
  throw new Error(`no seed draws ${partnerId} for ${answer.id}`);
}

describe("near synonym distractors", () => {
  it("keeps camp and camping from answering each other", () => {
    const camp = wordById("camp");
    const camping = wordById("camping");
    expect(camp?.grade).toBe("G6");
    expect(camping?.grade).toBe("G6");
    expect(camp?.chinese).not.toBe(camping?.chinese);
    expect(camp && camping && glossPairBlocked(camp.id, camping.id)).toBe(true);
    const seed = seedThatDraws(camp!, "camping");
    const picked = pickDistractors(camp!, 2, seed, sameGrade(camp!));
    expect(picked).toHaveLength(2);
    expect(picked.map((word) => word.id)).not.toContain("camping");
    const back = pickDistractors(camping!, 2, seedThatDraws(camping!, "camp"), sameGrade(camping!));
    expect(back).toHaveLength(2);
    expect(back.map((word) => word.id)).not.toContain("camp");
  });

  it("blocks each new pair and leaves the pairs that cannot make two answers", () => {
    const report = scanNearSynonyms();
    const file = glossFile as { near_synonym: { a: string; b: string }[] };
    const blocked = pairsToBlock(report);
    expect(report.wordCount).toBe(871);
    expect(report.candidates.filter((pair) => pair.decision === "already-blocked")).toHaveLength(49);
    expect(report.candidates.filter((pair) => pair.decision === "leave")).toHaveLength(81);
    expect(blocked).toEqual(file.near_synonym.map((pair) => ({ a: pair.a, b: pair.b })));
    for (const pair of file.near_synonym) {
      expect(glossPairBlocked(pair.a, pair.b), pair.a).toBe(true);
      const answer = wordById(pair.a);
      const picked = pickDistractors(answer!, 2, seedThatDraws(answer!, pair.b), sameGrade(answer!));
      expect(picked).toHaveLength(2);
      expect(picked.map((word) => word.id)).not.toContain(pair.b);
    }
    for (const pair of report.candidates) {
      if (pair.decision === "leave") expect(glossPairBlocked(pair.a, pair.b), `${pair.a}/${pair.b}`).toBe(false);
      if (pair.decision === "block") expect(pair.doubleAnswerAfter).toBe(0);
    }
  }, 15000);

  it("has no double-answer battle question after the blocks", () => {
    const report = scanNearSynonyms();
    expect(report.doubleAnswerAfter).toBe(0);
    expect(report.g6OpenDoubleAfter).toBe(0);
    expect(report.frontierDoubleAfter).toBe(0);
    expect(report.g6OpenDoubleBefore).toBeGreaterThan(0);
    expect(report.doubleAnswerBefore).toBeGreaterThan(report.g6OpenDoubleBefore);
    expect(report.choicesDropped).toBe(0);
    expect(report.minSelectedChoicesBefore.choices).toBeGreaterThanOrEqual(3);
    expect(report.minSelectedChoicesAfter.choices).toBeGreaterThanOrEqual(3);
    expect(report.minChoicesAfter).toEqual(report.minChoicesBefore);
    expect(report.minSelectedChoicesAfter).toEqual(report.minSelectedChoicesBefore);
    // Grade 6 fully open is 4 of 344 meaning questions: camp and camping, both directions, about 1.2%.
    expect(report.totalQuestions).toBe(14048);
    expect(report.doubleAnswerBefore).toBe(240);
    expect(report.g6OpenQuestions).toBe(344);
    expect(report.g6OpenDoubleBefore).toBe(4);
    expect(report.frontierDoubleBefore).toBe(128);
  }, 15000);

  it("keeps the exam pools and three choices on every exam word", () => {
    expect(EXAMS).toHaveLength(15);
    let total = 0;
    for (const exam of EXAMS) {
      const ids = new Set<string>();
      for (const chapterId of exam.chapters) {
        const chapter = gradeChapters(exam.grade).find((item) => item.id === chapterId);
        for (const id of chapter?.wordIds ?? []) ids.add(id);
      }
      const pool = [...ids].map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word));
      expect(pool).toHaveLength(ids.size);
      total += pool.length;
      for (const word of pool) {
        expect(pickDistractors(word, 2, 1, pool)).toHaveLength(2);
        expect(pickDistractors(word, 2, 2, pool)).toHaveLength(2);
      }
    }
    expect(total).toBe(EXAM_POOL_WORDS);
  });

  it("leaves the spelling exclusion bytes alone", () => {
    const bytes = readFileSync(new URL("./chapters/spelling_exclusion_word_ids_v0.1.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SPELLING_EXCLUSION_SHA256);
    expect(SPELLING_EXCLUSION_SHA256).toBe("516cc9da9ac457e400b71530ec77174179e13ad643311dfa84423e866c7fb311");
  });
});
