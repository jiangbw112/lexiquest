import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATALOG_WORDS,
  chapterExtraWords,
  chapterWords,
  continuationWordIds,
  forestLearnUnits,
  lessonUnits,
  mergeWordFiles,
  sampleUnits,
  sampleWords,
  wordById,
  type WordFile,
} from "./catalog";
import { spellingInstruction } from "../game/spelling-form";
import { checkSpelling, listeningQuestion, pickDistractors, spellingAllowed, spellingChildLabel, spellingMarkHint, spellingQuestion } from "./questions";
import { placeholderSpeaker, speakWord } from "./speech";

const PREVIOUS_CARD_IDS = [
  "tree", "bird", "fish", "sun", "map", "run", "big", "red", "river", "forest", "mountain", "flower", "rain",
  "cloud", "jump", "bridge", "village", "climb", "weather", "brave", "dangerous", "path", "explore",
  "treasure", "journey", "discover", "adventure", "protect",
];

describe("Forest chapter words", () => {
  it("keeps the same 28 card ids, with meanings taken from the resolved definitions", () => {
    expect(chapterWords()).toHaveLength(28);
    expect(sampleWords().map((word) => word.id)).toEqual(chapterWords().map((word) => word.id));
    expect(new Set(chapterWords().map((word) => word.id))).toEqual(new Set(PREVIOUS_CARD_IDS));
    expect(wordById("tree")).toMatchObject({ chinese: "树", spelling: "basic", theme: "PEP Grades 3-6", sample: false });
    expect(wordById("red")?.chinese).toBe("红色的");
    expect(wordById("mountain")).toMatchObject({ chinese: "高山", spelling: "basic", grade: "G5" });
    expect(wordById("bridge")).toMatchObject({ chinese: "桥", theme: "Forest Adventure", sample: false, grade: "G4" });
    expect(chapterExtraWords().map((word) => word.id).sort()).toEqual(
      ["adventure", "brave", "bridge", "discover", "journey", "path", "protect", "treasure"],
    );
    expect(forestLearnUnits().map((unit) => unit.grade)).toEqual(["G3", "G4", "G5", "G6"]);
    const only3 = lessonUnits(["G3"]);
    expect(only3).toHaveLength(1);
    const extras = chapterExtraWords().map((word) => word.id);
    expect(extras.every((id) => only3[0]?.wordIds.includes(id))).toBe(true);
    const forestG3 = chapterWords().filter((word) => word.grade === "G3").map((word) => word.id);
    expect(only3[0]?.wordIds.slice(0, forestG3.length)).toEqual(forestG3);
    expect(only3[0]?.wordIds.slice(forestG3.length, forestG3.length + extras.length)).toEqual(extras);
    expect(only3[0]?.wordIds.slice(forestG3.length + extras.length)).toEqual(continuationWordIds("G3"));
    const all = lessonUnits(["G3", "G4", "G5", "G6"]);
    const seen = all.flatMap((unit) => unit.wordIds);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(CATALOG_WORDS.length + extras.length);
    expect(extras.every((id) => seen.includes(id))).toBe(true);
    expect(sampleUnits()).toEqual([]);
  });

  it("offers an official word that is not one of the forest 28", () => {
    const grades = ["G3", "G4", "G5", "G6"] as const;
    const forest = new Set(chapterWords().map((word) => word.id));
    const units = lessonUnits(grades);
    let next: string | undefined;
    for (const unit of units) {
      next = unit.wordIds.find((id) => !forest.has(id));
      if (next) break;
    }
    const firstOutside = CATALOG_WORDS.find((word) => word.grade === "G3" && !forest.has(word.id));
    expect(next).toBe(firstOutside?.id);
    expect(next).toBeTruthy();
    expect(forest.has(next ?? "")).toBe(false);
    expect(wordById(next ?? "")?.theme).toBe("PEP Grades 3-6");
    for (const id of chapterWords().filter((word) => word.grade === "G3").map((word) => word.id)) {
      expect(continuationWordIds("G3")).not.toContain(id);
    }
  });

  it("loads one file or one file per grade from the same schema", () => {
    const grade3 = [{ word: "tree", meaning_zh: "树", grade_est: 3, spelling: "basic" }];
    const rest = [{ word: "river", meaning_zh: "河", grade_est: 5, spelling: "basic" }];
    const files: Record<string, WordFile> = {
      "grade-3.json": { theme: "PEP Grades 3-6", sample: false, words: grade3 },
      "grades-4-6.json": { theme: "PEP Grades 3-6", sample: false, words: rest },
    };
    const merged = mergeWordFiles(files);
    expect(merged.map((word) => word.id).sort()).toEqual(["river", "tree"]);
    expect(merged.every((word) => word.sample === false)).toBe(true);
    expect(() => mergeWordFiles({ ...files, "again.json": { words: [grade3[0]!] } })).toThrow(/tree/);
  });

  it("prefers distractors from the same theme and grade", () => {
    const tree = wordById("tree");
    expect(tree?.chinese).toBe("树");
    const picked = pickDistractors(tree!, 9, 4);
    expect(picked.slice(0, 7).every((word) => word.gradeEst === 3 && word.theme === tree?.theme)).toBe(true);
    expect(picked[7]?.gradeEst).not.toBe(3);
    expect(picked.every((word) => chapterWords().some((item) => item.id === word.id))).toBe(true);
  });

  it("allows meaning and listening for every chapter word, and spelling by the approved rule", () => {
    for (const word of chapterWords()) {
      const listening = listeningQuestion(word.id, 3);
      expect(listening.kind).toBe("listening");
      expect(listening.speakText).toBe(word.english);
      expect(listening.choices).toHaveLength(3);
    }
    expect(spellingAllowed(wordById("tree")!, false)).toBe(true);
    expect(spellingAllowed(wordById("big")!, false)).toBe(false);
    expect(spellingAllowed(wordById("big")!, true)).toBe(true);
    expect(spellingAllowed(wordById("treasure")!, true)).toBe(false);
    expect(spellingQuestion("treasure", true)).toBeNull();
    expect(spellingAllowed(wordById("dangerous")!, false)).toBe(false);
    expect(spellingAllowed(wordById("dangerous")!, true)).toBe(true);
    expect(checkSpelling("Tree", "  tree ")).toBe(true);
    expect(checkSpelling("tree", "three")).toBe(false);
    expect(checkSpelling("red panda", "red   panda")).toBe(true);
    expect(checkSpelling("red panda", "redpanda")).toBe(false);
    expect(checkSpelling("red panda", "red-panda")).toBe(false);
    for (const word of ["T-shirt", "hard-working", "ping-pong", "ice-skate", "o'clock"]) {
      expect(checkSpelling(word, `  ${word.toUpperCase()}  `)).toBe(true);
      expect(checkSpelling(word, word.replaceAll("-", "").replaceAll("'", ""))).toBe(false);
      expect(spellingMarkHint(word)).toBe("连字符和撇号要原样输入。");
    }
    expect(checkSpelling("T-shirt", "t shirt")).toBe(false);
    expect(checkSpelling("ice-skate", "ice skate")).toBe(false);
    expect(checkSpelling("o'clock", "o clock")).toBe(false);
    expect(checkSpelling("o'clock", "oclock")).toBe(false);
    expect(checkSpelling("camp", "camping")).toBe(false);
    expect(checkSpelling("camping", "camp")).toBe(false);
    expect(spellingMarkHint("tree")).toBeNull();
    expect(spellingMarkHint("red panda")).toBeNull();
    expect(spellingInstruction("T-shirt")).toContain("连字符和撇号要原样输入。");
    expect(spellingInstruction("o'clock")).toContain("连字符和撇号要原样输入。");
    expect(spellingInstruction("tree")).toBe("在画面上的输入框里用键盘拼写，然后 Enter。");
    const log: string[] = [];
    speakWord("tree", placeholderSpeaker(log));
    expect(log).toEqual(["cancel", "tree"]);
    expect(readFileSync("src/domain/catalog.ts", "utf8")).not.toContain("words_resolved");
    expect(readFileSync("src/domain/stages.ts", "utf8")).not.toContain("words_resolved");
    const scene = readFileSync("src/game/scenes/LearnScene.ts", "utf8");
    expect(scene).toContain("spellingChildLabel");
    expect(scene).not.toMatch(/\$\{word\.spelling\}/);
  });

  it("maps the spelling field to a child line and hides the raw value", () => {
    const values = [...new Set(CATALOG_WORDS.map((word) => word.spelling))].sort();
    expect(values).toEqual(["advanced", "basic", "none"]);
    expect(wordById("tree")?.spelling).toBe("basic");
    expect(spellingChildLabel("basic", false)).toBe("要会拼");
    expect(spellingChildLabel("basic", true)).toBe("要会拼");
    expect(spellingChildLabel(wordById("tree")!.spelling, false)).toBe("要会拼");
    expect(wordById("big")?.spelling).toBe("advanced");
    expect(spellingChildLabel("advanced", false)).toBe("先认读");
    expect(spellingChildLabel(wordById("big")!.spelling, false)).toBe("先认读");
    expect(spellingChildLabel("advanced", true)).toBeNull();
    expect(spellingChildLabel(wordById("big")!.spelling, true)).toBeNull();
    expect(wordById("hello")?.spelling).toBe("none");
    expect(spellingChildLabel("none", false)).toBeNull();
    expect(spellingChildLabel("none", true)).toBeNull();
    expect(spellingChildLabel(wordById("hello")!.spelling, true)).toBeNull();
    for (const unknown of ["", "BASIC", "expert", "basic "]) {
      expect(spellingChildLabel(unknown, false)).toBeNull();
      expect(spellingChildLabel(unknown, true)).toBeNull();
    }
  });
});
