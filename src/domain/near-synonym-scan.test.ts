import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG_WORDS, chapterExtraWords, wordById, type WordDef } from "./catalog";
import { glossPairBlocked, gradeChapters } from "./chapter-plan";
import glossFile from "./chapters/gloss_overlap_pairs_v0.2.json";
import { EXAMS } from "./exams";
import { baselineBlocked, pairsToBlock, scanNearSynonyms } from "./near-synonym-scan";
import { pickDistractors } from "./questions";
import { shuffle } from "./rng";
import { maskedSpellingFace, SPELLING_EXCLUSION_SHA256 } from "./spelling-leak";

const EXAM_POOL_WORDS = 1302;
const REVIEW_PAIRS = ["drank|drink", "finally|last", "outer space|space"] as const;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

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

function examPools(): Array<{ id: string; pool: WordDef[] }> {
  return EXAMS.map((exam) => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const chapterId of exam.chapters) {
      const chapter = gradeChapters(exam.grade).find((item) => item.id === chapterId);
      for (const id of chapter?.wordIds ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
    ids.sort((a, b) => a.localeCompare(b));
    return {
      id: exam.id,
      pool: ids.map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word)),
    };
  });
}

/** Same order as quizForWord, with an explicit block set so the pre-change paper can be rebuilt. */
function distractors(word: WordDef, seed: number, pool: readonly WordDef[], block: (a: string, b: string) => boolean): WordDef[] {
  const others = pool.filter((item) => item.id !== word.id && !block(word.id, item.id));
  const same = others.filter((item) => item.theme === word.theme && item.gradeEst === word.gradeEst);
  const theme = others.filter((item) => item.theme === word.theme && item.gradeEst !== word.gradeEst);
  const elsewhere = others.filter((item) => item.theme !== word.theme);
  return [...shuffle(same, seed), ...shuffle(theme, seed + 3), ...shuffle(elsewhere, seed + 9)].slice(0, 2);
}

interface PaperLine {
  kind: "prompt" | "answer" | "distractor";
  exam: string;
  direction: "zh-to-en" | "en-to-zh";
  word: string;
  value: string;
}

function paperLines(block: (a: string, b: string) => boolean): PaperLine[] {
  const lines: PaperLine[] = [];
  for (const exam of examPools()) {
    for (const word of exam.pool) {
      for (const direction of ["zh-to-en", "en-to-zh"] as const) {
        const picked = distractors(word, 1, exam.pool, block);
        const choices = shuffle([word, ...picked], 18);
        const face = maskedSpellingFace(word);
        const prompt = direction === "zh-to-en" ? `「${face}」用英语怎么说？` : `${word.english} 是什么意思？`;
        lines.push({ kind: "prompt", exam: exam.id, direction, word: word.id, value: prompt });
        lines.push({ kind: "answer", exam: exam.id, direction, word: word.id, value: word.id });
        for (const choice of choices) {
          if (choice.id === word.id) continue;
          const label = direction === "zh-to-en" ? choice.english : maskedSpellingFace(choice);
          lines.push({ kind: "distractor", exam: exam.id, direction, word: word.id, value: `${choice.id} ${label}` });
        }
      }
    }
  }
  return lines;
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
    expect(report.candidates.filter((pair) => pair.decision === "leave")).toHaveLength(78);
    const filePairs = file.near_synonym.map((pair) => ({ a: pair.a, b: pair.b }));
    // rain and rainy now share the grade-4 weather chapter. The existing gloss entry still blocks them.
    expect(blocked).toEqual(filePairs);
    expect(glossPairBlocked("rain", "rainy")).toBe(true);
    const rain = report.candidates.find((pair) => pair.a === "rain" && pair.b === "rainy");
    expect(rain?.decision).toBe("block");
    expect(rain?.togetherBefore).toBe(32);
    expect(rain?.doubleAnswerBefore).toBe(32);
    expect(rain?.doubleAnswerAfter).toBe(0);
    for (const pair of file.near_synonym) {
      expect(glossPairBlocked(pair.a, pair.b), pair.a).toBe(true);
      const answer = wordById(pair.a);
      const picked = pickDistractors(answer!, 2, seedThatDraws(answer!, pair.b), sameGrade(answer!));
      expect(picked).toHaveLength(2);
      expect(picked.map((word) => word.id)).not.toContain(pair.b);
    }
    for (const key of REVIEW_PAIRS) {
      const pair = report.candidates.find((item) => pairKey(item.a, item.b) === key);
      expect(pair?.decision, key).toBe("block");
      expect(pair?.doubleAnswerBefore, key).toBe(0);
      expect(pair?.doubleAnswerAfter, key).toBe(0);
      expect(pair?.togetherBefore, key).toBe(32);
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
    // Grade 6 fully open is 4 of 322 meaning questions: camp and camping, both directions.
    expect(report.totalQuestions).toBe(13936);
    expect(report.doubleAnswerBefore).toBe(240);
    expect(report.g6OpenQuestions).toBe(338);
    expect(report.g6OpenDoubleBefore).toBe(4);
    expect(report.frontierDoubleBefore).toBe(144);
  }, 15000);

  it("keeps exam prompts and answers, and still draws two distractors", () => {
    expect(EXAMS).toHaveLength(15);
    const pools = examPools();
    expect(pools.reduce((sum, exam) => sum + exam.pool.length, 0)).toBe(EXAM_POOL_WORDS);
    const beforeBlock = (a: string, b: string) => baselineBlocked().has(pairKey(a, b));
    const before = paperLines(beforeBlock);
    const after = paperLines(glossPairBlocked);
    expect(after).toHaveLength(before.length);
    expect(before.filter((line) => line.kind === "distractor")).toHaveLength(EXAM_POOL_WORDS * 2 * 2);
    const byAnswer = new Map<string, number>();
    let changed = 0;
    let promptChanged = 0;
    let answerChanged = 0;
    for (let i = 0; i < before.length; i += 1) {
      const left = before[i];
      const right = after[i];
      if (!left || !right || (left.kind === right.kind && left.exam === right.exam && left.word === right.word && left.value === right.value)) continue;
      if (left.kind === "prompt") promptChanged += 1;
      else if (left.kind === "answer") answerChanged += 1;
      else {
        changed += 1;
        byAnswer.set(left.word, (byAnswer.get(left.word) ?? 0) + 1);
      }
    }
    expect(promptChanged).toBe(0);
    expect(answerChanged).toBe(0);
    expect(changed).toBe(52);
    expect(Object.fromEntries([...byAnswer].sort(([a], [b]) => a.localeCompare(b)))).toEqual({
      camp: 2,
      camping: 2,
      finally: 4,
      last: 4,
      "outer space": 4,
      rain: 4,
      rainy: 4,
      snow: 4,
      snowy: 4,
      space: 4,
      tour: 4,
      travel: 4,
      worried: 4,
      worry: 4,
    });
    for (const exam of pools) {
      for (const word of exam.pool) {
        const earlier = distractors(word, 1, exam.pool, beforeBlock);
        const later = distractors(word, 1, exam.pool, glossPairBlocked);
        expect(earlier, `${exam.id} ${word.id}`).toHaveLength(2);
        expect(later, `${exam.id} ${word.id}`).toHaveLength(2);
      }
    }
  });

  it("leaves the spelling exclusion bytes alone", () => {
    const bytes = readFileSync(new URL("./chapters/spelling_exclusion_word_ids_v0.1.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SPELLING_EXCLUSION_SHA256);
    expect(SPELLING_EXCLUSION_SHA256).toBe("516cc9da9ac457e400b71530ec77174179e13ad643311dfa84423e866c7fb311");
  });
});
