import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG_WORDS, mergeWordFiles, readWordFile, wordById, wordsForGrades, type WordFile } from "./catalog";
import { PEP_WORDS } from "./pep-catalog";

const VOLUME_COUNTS = [
  ["3上", 107],
  ["3下", 115],
  ["4上", 107],
  ["4下", 107],
  ["5上", 117],
  ["5下", 140],
  ["6上", 127],
  ["6下", 36],
] as const;

describe("PEP grades 3–6 catalog", () => {
  it("loads 856 words with the delivered grade and spelling counts", () => {
    expect(PEP_WORDS).toHaveLength(856);
    expect(new Set(PEP_WORDS.map((word) => word.id)).size).toBe(856);
    expect(PEP_WORDS.every((word) => word.sample === false && word.theme === "PEP Grades 3-6")).toBe(true);
    const spelling = { basic: 0, advanced: 0, none: 0 };
    const grades = { 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const word of PEP_WORDS) {
      spelling[word.spelling] += 1;
      grades[word.gradeEst] += 1;
      expect(word).not.toHaveProperty("notes");
      expect(word).not.toHaveProperty("senses");
      expect(word.unitId).toBe(`${word.grade}-S1-U1`);
    }
    expect(spelling).toEqual({ basic: 376, advanced: 459, none: 21 });
    // The loader file does not keep semester, so each grade total is the two delivered volumes.
    expect(grades[3]).toBe(VOLUME_COUNTS[0][1] + VOLUME_COUNTS[1][1]);
    expect(grades[4]).toBe(VOLUME_COUNTS[2][1] + VOLUME_COUNTS[3][1]);
    expect(grades[5]).toBe(VOLUME_COUNTS[4][1] + VOLUME_COUNTS[5][1]);
    expect(grades[6]).toBe(VOLUME_COUNTS[6][1] + VOLUME_COUNTS[7][1]);
    expect(VOLUME_COUNTS.reduce((sum, [, count]) => sum + count, 0)).toBe(856);
    expect(grades).toEqual({ 3: 222, 4: 214, 5: 257, 6: 163 });
    for (const word of ["t-shirt", "hard-working", "ping-pong", "ice-skate", "o'clock"]) {
      expect(PEP_WORDS.some((item) => item.id === word)).toBe(true);
    }
  });

  it("stays out of the forest catalog, including the 20 shared ids", () => {
    expect(CATALOG_WORDS).toHaveLength(28);
    expect(wordsForGrades(["G3", "G4", "G5", "G6"])).toHaveLength(28);
    expect(wordById("about")).toBeUndefined();
    expect(wordById("tree")?.theme).toBe("Forest Adventure");
    const shared = PEP_WORDS.filter((word) => CATALOG_WORDS.some((sample) => sample.id === word.id)).map((word) => word.id);
    expect(shared).toHaveLength(20);
    expect(new Set(CATALOG_WORDS.map((word) => word.id)).size).toBe(28);
    const forest = JSON.parse(readFileSync("src/domain/data/forest-adventure.json", "utf8")) as WordFile;
    const pep = JSON.parse(readFileSync("src/domain/pep/pep_words_g3-6_v1_loader.json", "utf8")) as WordFile;
    expect(() => mergeWordFiles({ "forest-adventure.json": forest, "pep_words_g3-6_v1_loader.json": pep })).toThrow(/is in both/);
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
