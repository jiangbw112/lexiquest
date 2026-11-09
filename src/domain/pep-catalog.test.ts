import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATALOG_WORDS,
  chapterExtraWords,
  chapterWords,
  mergeWordFiles,
  readWordFile,
  wordById,
  wordsForGrades,
  type WordFile,
} from "./catalog";
import { checkSpelling, spellingAllowed, spellingQuestion } from "./questions";
import { FOREST_CHAPTER } from "./stages";

const GRADE_COUNTS = { 3: 228, 4: 214, 5: 257, 6: 164 } as const;
const EXTRAS = ["bridge", "brave", "path", "treasure", "journey", "discover", "adventure", "protect"];

describe("PEP grades 3–6 v1.1 library", () => {
  it("loads 863 words with unique ids and the delivered grade and spelling counts", () => {
    expect(CATALOG_WORDS).toHaveLength(863);
    expect(new Set(CATALOG_WORDS.map((word) => word.id)).size).toBe(863);
    expect(CATALOG_WORDS.every((word) => word.sample === false && word.theme === "PEP Grades 3-6")).toBe(true);
    const spelling = { basic: 0, advanced: 0, none: 0 };
    const grades = { 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const word of CATALOG_WORDS) {
      spelling[word.spelling] += 1;
      grades[word.gradeEst] += 1;
      expect(word).not.toHaveProperty("notes");
      expect(word).not.toHaveProperty("senses");
      expect(word.unitId).toBe(`${word.grade}-S1-U1`);
    }
    expect(spelling).toEqual({ basic: 386, advanced: 453, none: 24 });
    expect(grades).toEqual(GRADE_COUNTS);
    for (const word of ["t-shirt", "hard-working", "ping-pong", "ice-skate", "o'clock", "camp", "camping"]) {
      expect(CATALOG_WORDS.some((item) => item.id === word)).toBe(true);
    }
    expect(wordById("camp")?.spelling).toBe("basic");
    expect(wordById("camping")?.spelling).toBe("basic");
    expect(wordById("camp")?.id).not.toBe(wordById("camping")?.id);
    expect(checkSpelling("camp", "camping")).toBe(false);
    expect(checkSpelling("camping", "camp")).toBe(false);
    const phrase = wordById("hong kong-zhuhai-macao bridge");
    expect(phrase?.english).toBe("hong kong-zhuhai-macao bridge");
    expect(phrase?.spelling).toBe("none");
    expect(checkSpelling(phrase!.english, "Hong Kong-Zhuhai-Macao Bridge")).toBe(true);
    expect(checkSpelling(phrase!.english, "hong kong zhuhai macao bridge")).toBe(false);
    expect(checkSpelling(phrase!.english, "hongkong-zhuhai-macao bridge")).toBe(false);
  });

  it("loads the conversation cards as spelling none and never asks them as spelling", () => {
    for (const id of ["hello", "hi", "goodbye"]) {
      const word = wordById(id);
      expect(word?.spelling).toBe("none");
      expect(word?.sample).toBe(false);
      expect(spellingAllowed(word!, true)).toBe(false);
      expect(spellingQuestion(id, true)).toBeNull();
    }
  });

  it("resolves every forest reference and keeps the eight extras out of every grade pool", () => {
    const library = new Set(CATALOG_WORDS.map((word) => word.id));
    const chapter = JSON.parse(readFileSync("src/domain/chapters/chapter_forest_v1.json", "utf8")) as {
      word_refs_formal: string[];
      chapter_extra_words: { id: string; chapter_only: boolean; in_grade_pool: boolean }[];
      words?: unknown;
      words_resolved_snapshot?: unknown[];
    };
    expect(chapter.words).toBeUndefined();
    expect(chapter.word_refs_formal).toHaveLength(20);
    expect(chapter.chapter_extra_words).toHaveLength(8);
    for (const id of chapter.word_refs_formal) {
      expect(library.has(id)).toBe(true);
      expect(wordById(id)?.theme).toBe("PEP Grades 3-6");
    }
    expect(chapter.chapter_extra_words.every((word) => word.chapter_only && word.in_grade_pool === false)).toBe(true);
    expect(new Set(chapterExtraWords().map((word) => word.id))).toEqual(new Set(EXTRAS));
    for (const id of EXTRAS) {
      expect(library.has(id)).toBe(false);
      expect(wordById(id)).toBeTruthy();
    }
    const pools = [
      wordsForGrades(["G3"]),
      wordsForGrades(["G4"]),
      wordsForGrades(["G5"]),
      wordsForGrades(["G6"]),
      wordsForGrades(["G3", "G4", "G5", "G6"]),
    ];
    for (const pool of pools) {
      for (const id of EXTRAS) expect(pool.some((word) => word.id === id)).toBe(false);
    }
    expect(new Set(chapterWords().map((word) => word.id)).size).toBe(28);
    expect(FOREST_CHAPTER.stages.map((stage) => stage.new_words.length)).toEqual([6, 6, 6, 6, 4]);
    expect(() => readWordFile(chapter as unknown as WordFile, "chapter_forest_v1.json")).toThrow(/needs a words array/);
    const tree = CATALOG_WORDS.find((word) => word.id === "tree");
    expect(() => mergeWordFiles({
      "library.json": { words: [{ word: "tree", meaning_zh: "树", grade_est: 3, spelling: "basic" }] },
      "again.json": { words: [{ word: "tree", meaning_zh: "树", grade_est: 3, spelling: "basic" }] },
    })).toThrow(/is in both/);
    expect(tree?.id).toBe("tree");
  });

  it("ignores senses, notes, and the top-level lists that are not words", () => {
    const loaded = readWordFile({
      theme: "PEP Grades 3-6",
      sample: false,
      dedup_dropped: { items: [{ word: "ghost" }] },
      pending_verification_words: { items: [{ word: "maybe" }] },
      supplement_candidates: { items: [{ word: "extra" }] },
      counts: { words: 99 },
      words: [
        {
          word: "About",
          meaning_zh: "大约；关于",
          grade_est: 3,
          spelling: "advanced",
          senses: ["关于"],
          change_note: "kept",
          notes: "后来的义项",
        },
      ],
    } as unknown as WordFile);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual({
      id: "about",
      english: "about",
      chinese: "大约；关于",
      gradeEst: 3,
      grade: "G3",
      spelling: "advanced",
      theme: "PEP Grades 3-6",
      unitId: "G3-S1-U1",
      sample: false,
    });
    expect(JSON.stringify(loaded)).not.toContain("ghost");
    expect(JSON.stringify(loaded)).not.toContain("后来的义项");
  });
});
