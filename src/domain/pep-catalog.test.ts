import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATALOG_WORDS,
  chapterExtraWords,
  chapterWords,
  formatMeaning,
  posGloss,
  mergeWordFiles,
  readWordFile,
  wordById,
  wordsForGrades,
  type WordFile,
} from "./catalog";
import { checkSpelling, quizForWord, spellingAllowed, spellingQuestion } from "./questions";
import { FOREST_CHAPTER } from "./stages";

const GRADE_COUNTS = { 3: 228, 4: 214, 5: 257, 6: 164 } as const;
const EXTRAS = ["bridge", "brave", "path", "treasure", "journey", "discover", "adventure", "protect"];

describe("PEP grades 3–6 v1.2.2 library", () => {
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
    expect(phrase?.id).toBe("hong kong-zhuhai-macao bridge");
    expect(phrase?.english).toBe("Hong Kong-Zhuhai-Macao Bridge");
    expect(phrase?.spelling).toBe("none");
    expect(checkSpelling(phrase!.english, "Hong Kong-Zhuhai-Macao Bridge")).toBe(true);
    expect(checkSpelling(phrase!.english, "hong kong zhuhai macao bridge")).toBe(false);
    expect(checkSpelling(phrase!.english, "hongkong-zhuhai-macao bridge")).toBe(false);
    const museum = wordById("jinggangshan revolution museum");
    expect(museum?.english).toBe("Jinggangshan Revolution Museum");
    expect(wordById("monday")?.english).toBe("Monday");
    expect(wordById("january")?.english).toBe("January");
    expect(wordById("beijing opera")?.english).toBe("Beijing opera");
    expect(wordById("t-shirt")?.english).toBe("T-shirt");
    const quiz = quizForWord(museum!.id, 1, "zh-to-en", [museum!, wordById("send")!, wordById("thousand")!]);
    expect(quiz.choices.find((choice) => choice.id === museum!.id)?.label).toBe("Jinggangshan Revolution Museum");
    expect(checkSpelling(museum!.english, "jinggangshan revolution museum")).toBe(true);
    expect(checkSpelling(museum!.english, "JINGGANGSHAN REVOLUTION MUSEUM")).toBe(true);
    expect(checkSpelling("Monday", "monday")).toBe(true);
    expect(checkSpelling("T-shirt", "t-shirt")).toBe(true);
    expect(checkSpelling("T-shirt", "tshirt")).toBe(false);
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
    const chapter = JSON.parse(readFileSync("src/domain/chapters/chapter_forest_v1.1.json", "utf8")) as {
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
    expect(() => readWordFile(chapter as unknown as WordFile, "chapter_forest_v1.1.json")).toThrow(/needs a words array/);
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
      english: "About",
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
    expect(loaded[0]?.pos).toBeUndefined();
  });

  it("keeps pos as an opaque string, including null, modal v., and a dual form", () => {
    expect(CATALOG_WORDS.filter((word) => word.pos === undefined)).toHaveLength(19);
    expect(CATALOG_WORDS.filter((word) => word.pos === "modal v.").map((word) => word.id).sort()).toEqual(["can", "could", "must", "should"]);
    expect(CATALOG_WORDS.filter((word) => word.pos?.includes("/"))).toHaveLength(13);
    expect(wordById("tree")).toMatchObject({ pos: "n.", chinese: "树" });
    expect(wordById("can")).toMatchObject({ pos: "modal v.", chinese: "能；会" });
    expect(formatMeaning(wordById("can")!)).toBe("modal v. 能；会");
    expect(wordById("may")).toMatchObject({ pos: "n.", chinese: "五月" });
    expect(wordById("rain")).toMatchObject({ pos: "v./n.", chinese: "下雨；雨" });
    expect(wordById("plant")).toMatchObject({ pos: "v./n.", chinese: "种植；植物" });
    expect(wordById("today")).not.toHaveProperty("pos");
    expect(formatMeaning(wordById("today")!)).toBe("今天");
    expect(formatMeaning(wordById("today")!).startsWith(" ")).toBe(false);
    expect(wordById("in class")?.pos).toBe("phr.");
    const modal = readWordFile({
      words: [{ word: "can", meaning_zh: "能；会", grade_est: 3, spelling: "advanced", pos: "modal v." }],
    });
    expect(modal[0]?.pos).toBe("modal v.");
    const slash = readWordFile({
      words: [{ word: "plant", meaning_zh: "种植；植物", grade_est: 3, spelling: "advanced", pos: "n./v." }],
    });
    expect(slash[0]?.pos).toBe("n./v.");
    const absent = readWordFile({
      words: [{ word: "big", meaning_zh: "大的", grade_est: 3, spelling: "basic" }],
    });
    expect(absent[0]).not.toHaveProperty("pos");
    const empty = readWordFile({
      words: [{ word: "big", meaning_zh: "大的", grade_est: 3, spelling: "basic", pos: "" }],
    });
    expect(empty[0]).not.toHaveProperty("pos");
    const cleared = readWordFile({
      words: [{ word: "rain", meaning_zh: "下雨；雨", grade_est: 4, spelling: "advanced", pos: null }],
    });
    expect(cleared[0]).not.toHaveProperty("pos");
    expect(() => readWordFile({
      words: [{ word: "apple", meaning_zh: "苹果", grade_est: 3, spelling: "basic", pos: 1 }],
    })).toThrow(/bad pos/);
    expect(() => readWordFile({
      words: [{ word: "apple", meaning_zh: "苹果", grade_est: 3, spelling: "basic", pos: { kind: "n." } }],
    })).toThrow(/bad pos/);
  });

  it("uses a sense pos when that sense is shown, and falls back to the word pos", () => {
    const loaded = readWordFile({
      words: [{
        word: "can",
        meaning_zh: "能；会",
        grade_est: 3,
        spelling: "advanced",
        pos: "modal v.",
        senses: [
          { meaning_zh: "能；会", pos: null },
          { meaning_zh: "能；会" },
          { meaning_zh: "能；会", pos: "" },
          { meaning_zh: "罐；罐头", pos: "n./v." },
        ],
      }],
    });
    const word = loaded[0]!;
    expect(word.senses).toEqual([
      { chinese: "能；会" },
      { chinese: "能；会" },
      { chinese: "能；会" },
      { chinese: "罐；罐头", pos: "n./v." },
    ]);
    expect(formatMeaning(word)).toBe("modal v. 能；会");
    expect(formatMeaning(word, word.senses?.[0])).toBe("modal v. 能；会");
    expect(formatMeaning(word, word.senses?.[1])).toBe("modal v. 能；会");
    expect(formatMeaning(word, word.senses?.[2])).toBe("modal v. 能；会");
    expect(formatMeaning(word, word.senses?.[3])).toBe("n./v. 罐；罐头");
    const bare = readWordFile({
      words: [{
        word: "rain",
        meaning_zh: "下雨；雨",
        grade_est: 4,
        spelling: "advanced",
        pos: null,
        senses: [{ meaning_zh: "雨", pos: null }],
      }],
    });
    expect(formatMeaning(bare[0]!, bare[0]?.senses?.[0])).toBe("雨");
    expect(formatMeaning(bare[0]!, bare[0]?.senses?.[0]).startsWith(" ")).toBe(false);
    expect(() => readWordFile({
      words: [{
        word: "can",
        meaning_zh: "能；会",
        grade_est: 3,
        spelling: "advanced",
        pos: "v.",
        senses: [{ meaning_zh: "罐；罐头", pos: 2 }],
      }],
    })).toThrow(/bad pos/);
  });

  it("puts the part of speech before the meaning, and leaves a bare meaning untouched", () => {
    expect(formatMeaning({ chinese: "苹果", pos: "n." })).toBe("n. 苹果");
    expect(formatMeaning({ chinese: "大的", pos: "adj." })).toBe("adj. 大的");
    expect(formatMeaning({ chinese: "能；会", pos: "modal v." })).toBe("modal v. 能；会");
    expect(formatMeaning({ chinese: "种植；植物", pos: "n./v." })).toBe("n./v. 种植；植物");
    expect(formatMeaning({ chinese: "树" })).toBe("树");
    expect(formatMeaning({ chinese: "树", pos: "" })).toBe("树");
    expect(formatMeaning({ chinese: "树", pos: null })).toBe("树");
    expect(formatMeaning(wordById("tree")!)).toBe("n. 树");
    expect(formatMeaning(wordById("rain")!)).toBe("v./n. 下雨；雨");
    expect(formatMeaning(wordById("orange")!)).toBe("n. 橙子");
    expect(formatMeaning(wordById("red")!)).toBe("adj. 红色的");
    expect(quizForWord("tree", 1).prompt).toBe("「n. 树」用英语怎么说？");
    expect(quizForWord("tree", 1).hint).toBe("n. 树");
    expect(quizForWord("rain", 1).prompt).toBe("「v./n. 下雨；雨」用英语怎么说？");
    expect(quizForWord("rain", 1).hint).toBe("v./n. 下雨；雨");
    expect(quizForWord("can", 1).prompt).toBe("「modal v. 能；会」用英语怎么说？");
    expect(posGloss("n.")).toBe("名词");
    expect(posGloss("adj.")).toBe("形容词");
    expect(posGloss("modal v.")).toBe("情态动词");
    expect(posGloss("v./n.")).toBeUndefined();
    expect(posGloss(undefined)).toBeUndefined();
    expect(posGloss(wordById("today")?.pos)).toBeUndefined();
  });

  it("resolves red from the word list when the chapter snapshot still says the old meaning", () => {
    const chapter = JSON.parse(readFileSync("src/domain/chapters/chapter_forest_v1.1.json", "utf8")) as {
      formal_wordlist: string;
      words_resolved_snapshot: { word: string; meaning_zh: string }[];
    };
    const snapshot = chapter.words_resolved_snapshot.find((item) => item.word === "red");
    expect(chapter.formal_wordlist).toContain("pep_words_g3-6_v1.2.2.json");
    expect(snapshot?.meaning_zh).toBe("红色");
    expect(wordById("red")).toMatchObject({ chinese: "红色的", pos: "adj." });
    expect(formatMeaning(wordById("red")!)).toBe("adj. 红色的");
    expect(readFileSync("src/domain/catalog.ts", "utf8")).not.toContain("words_resolved");
    expect(createHash("sha256").update(readFileSync("src/domain/data/pep_words_g3-6_v1.2.2_loader.json")).digest("hex")).toBe(
      "8229269445379022a0b9e3da059b77e236e4f5582df5a45a8b5d7a9666985dd1",
    );
    expect(createHash("sha256").update(readFileSync("src/domain/chapters/chapter_forest_v1.1.json")).digest("hex")).toBe(
      "bbf3e72c59bf21673cd29ff474239ce1fe7b42bdf2ad62b8b588a1eb956b4e83",
    );
  });

  it("keeps new_sense meanings out of the catalog and out of every quiz", () => {
    expect(wordById("orange")).toMatchObject({ chinese: "橙子", pos: "n." });
    expect(wordById("cook")).toMatchObject({ chinese: "做饭", pos: "v." });
    const hidden = ["橙色的", "厨师", "也许；可能"];
    for (const word of CATALOG_WORDS) {
      for (const text of hidden) expect(word.chinese).not.toContain(text);
    }
    const loaded = readWordFile({
      words: [{
        word: "orange",
        meaning_zh: "橙子",
        grade_est: 3,
        spelling: "basic",
        pos: "n.",
        senses: [
          { meaning_zh: "橙子", pos: "n." },
          { meaning_zh: "橙色的", pos: "adj.", relation: "new_sense" },
        ],
      }, {
        word: "May",
        meaning_zh: "五月",
        grade_est: 5,
        spelling: "basic",
        pos: "n.",
        senses: [
          { meaning_zh: "五月", pos: "n." },
          { meaning_zh: "也许；可能", pos: "modal v.", relation: "new_sense" },
        ],
      }],
    });
    expect(JSON.stringify(loaded)).not.toContain("橙色的");
    expect(JSON.stringify(loaded)).not.toContain("也许；可能");
    expect(loaded[1]?.senses).toEqual([{ chinese: "五月", pos: "n." }]);
    for (const id of CATALOG_WORDS.map((word) => word.id)) {
      for (const direction of ["zh-to-en", "en-to-zh", "listen-to-zh"] as const) {
        const quiz = quizForWord(id, 1, direction);
        const text = `${quiz.prompt} ${quiz.hint} ${quiz.choices.map((choice) => choice.label).join(" ")}`;
        for (const hiddenText of hidden) expect(text).not.toContain(hiddenText);
      }
    }
  });
});
