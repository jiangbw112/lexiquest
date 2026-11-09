import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeWordFiles, SAMPLE_THEME, SAMPLE_WORDS, sampleUnits, wordById, type WordFile } from "./catalog";
import { checkSpelling, listeningQuestion, pickDistractors, spellingAllowed, spellingQuestion } from "./questions";
import { placeholderSpeaker, speakWord } from "./speech";

const raw = JSON.parse(readFileSync("src/domain/data/forest-adventure.json", "utf8")) as {
  theme: string;
  words: { word: string; meaning_zh: string; grade_est: number; spelling: string }[];
};

describe("Forest Adventure sample words", () => {
  it("loads the approved 28-word list and no audio files", () => {
    expect(raw.theme).toBe("Forest Adventure");
    expect(raw.words).toHaveLength(28);
    expect(SAMPLE_WORDS).toHaveLength(28);
    expect(SAMPLE_WORDS.every((word) => word.sample && word.theme === SAMPLE_THEME)).toBe(true);
    expect(JSON.stringify(raw)).not.toMatch(/https?:|audio|\.mp3|\.ogg/i);
    const grades = raw.words.map((word) => word.grade_est);
    expect(grades.filter((grade) => grade === 3)).toHaveLength(8);
    expect(grades.filter((grade) => grade === 4)).toHaveLength(8);
    expect(grades.filter((grade) => grade === 5)).toHaveLength(6);
    expect(grades.filter((grade) => grade === 6)).toHaveLength(6);
    expect(sampleUnits().map((unit) => unit.grade)).toEqual(["G3", "G4", "G5", "G6"]);
  });

  it("loads one file or one file per grade from the same schema", () => {
    const grade3 = raw.words.filter((word) => word.grade_est === 3);
    const rest = raw.words.filter((word) => word.grade_est !== 3);
    const files: Record<string, WordFile> = {
      "grade-3.json": { theme: raw.theme, sample: true, words: grade3 },
      "grades-4-6.json": { theme: raw.theme, sample: true, words: rest },
    };
    const merged = mergeWordFiles(files);
    expect(merged.map((word) => word.id).sort()).toEqual(raw.words.map((word) => word.word).sort());
    expect(merged.every((word) => word.sample)).toBe(true);
    expect(() => mergeWordFiles({ ...files, "again.json": { words: [grade3[0]!] } })).toThrow(/tree/);
  });

  it("prefers distractors from the same theme and grade", () => {
    const tree = wordById("tree");
    expect(tree?.chinese).toBe("树");
    const picked = pickDistractors(tree!, 9, 4);
    expect(picked.slice(0, 7).every((word) => word.gradeEst === 3 && word.theme === SAMPLE_THEME)).toBe(true);
    expect(picked[7]?.gradeEst).not.toBe(3);
    expect(picked.every((word) => word.theme === SAMPLE_THEME)).toBe(true);
  });

  it("allows meaning and listening for every word, and spelling by the approved rule", () => {
    for (const word of SAMPLE_WORDS) {
      const listening = listeningQuestion(word.id, 3);
      expect(listening.kind).toBe("listening");
      expect(listening.speakText).toBe(word.english);
      expect(listening.choices).toHaveLength(3);
    }
    expect(spellingAllowed(wordById("tree")!, false)).toBe(true);
    expect(spellingAllowed(wordById("mountain")!, false)).toBe(false);
    expect(spellingAllowed(wordById("mountain")!, true)).toBe(true);
    expect(spellingAllowed(wordById("dangerous")!, true)).toBe(false);
    expect(spellingQuestion("dangerous", true)).toBeNull();
    expect(checkSpelling("Tree", "  tree ")).toBe(true);
    expect(checkSpelling("tree", "three")).toBe(false);
    const log: string[] = [];
    speakWord("tree", placeholderSpeaker(log));
    expect(log).toEqual(["cancel", "tree"]);
  });
});
