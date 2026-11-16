import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startBattle, takeAction, type BattleQuestion } from "./battle";
import { catalogWords, chapterExtraWords, formatMeaning, wordById } from "./catalog";
import { quizForWord, spellingAllowed, spellingQuestion } from "./questions";
import {
  SPELLING_EXCLUSION_SHA256,
  SPELLING_MASK,
  excludedFromUnpromptedSpelling,
  excludedSpellingWords,
  listedSpellingExclusionIds,
  maskSpellingFace,
  promptLeaksAnswer,
  reviewDeskEnglish,
  reviewDeskMeaning,
  sharesStem,
} from "./spelling-leak";

const LISTED = [
  "begin",
  "bought",
  "changed",
  "cleaned",
  "drank",
  "fell",
  "fixed",
  "laughed",
  "next",
  "rode",
  "slept",
  "stayed",
  "swam",
  "t-shirt",
  "took",
  "wake",
  "was",
  "washed",
  "watched",
  "win",
] as const;

const EXPECTED: { id: string; source: "rule" | "list" | "both" }[] = [
  { id: "begin", source: "list" },
  { id: "bought", source: "list" },
  { id: "changed", source: "both" },
  { id: "cleaned", source: "both" },
  { id: "drank", source: "list" },
  { id: "fell", source: "list" },
  { id: "fixed", source: "both" },
  { id: "laughed", source: "both" },
  { id: "next", source: "both" },
  { id: "rode", source: "list" },
  { id: "slept", source: "list" },
  { id: "stayed", source: "both" },
  { id: "swam", source: "list" },
  { id: "t-shirt", source: "list" },
  { id: "took", source: "list" },
  { id: "wake", source: "list" },
  { id: "was", source: "list" },
  { id: "washed", source: "both" },
  { id: "watched", source: "both" },
  { id: "win", source: "list" },
];

function ask(wordId: string, action: "attack" | "heal"): BattleQuestion {
  const state = startBattle({
    encounterId: "inkling",
    classId: "warrior",
    learnedIds: [wordId],
    equippedSkillIds: [],
    skillLevels: {},
    seed: 3,
    litWordIds: [wordId],
    spellingCap: 1,
    enemy: { name: "词灵", maxHp: 9000, attack: 0, sprite: "inkling" },
  });
  const cast = takeAction(state, { type: action });
  if (!cast.ok || !cast.state.question) throw new Error(cast.reason ?? "no question");
  return cast.state.question;
}

describe("spelling answer leaks", () => {
  it("keeps the gameplay list bytes and all 20 ids", () => {
    const bytes = readFileSync(new URL("./chapters/spelling_exclusion_word_ids_v0.1.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SPELLING_EXCLUSION_SHA256);
    expect(listedSpellingExclusionIds()).toEqual([...LISTED]);
    expect(new Set(listedSpellingExclusionIds()).size).toBe(20);
    for (const id of LISTED) expect(wordById(id)?.id).toBe(id);
  });

  it("scans the whole word list and names each excluded word once", () => {
    const words = [...catalogWords(), ...chapterExtraWords()];
    expect(words.length).toBeGreaterThan(LISTED.length);
    const ruled = words.filter((word) => promptLeaksAnswer(word)).map((word) => word.id).sort();
    expect(ruled).toEqual(EXPECTED.filter((item) => item.source !== "list").map((item) => item.id));
    expect(excludedSpellingWords()).toEqual(EXPECTED);
    for (const item of EXPECTED) {
      expect(excludedFromUnpromptedSpelling(item.id)).toBe(true);
      expect(LISTED).toContain(item.id);
    }
    for (const word of words) {
      if (!EXPECTED.some((item) => item.id === word.id)) {
        expect(promptLeaksAnswer(word)).toBe(false);
        expect(excludedFromUnpromptedSpelling(word.id)).toBe(false);
      }
    }
  });

  it("matches a stem and leaves irregular pairs to the list", () => {
    expect(sharesStem("cleaned", "clean")).toBe(true);
    expect(sharesStem("changed", "change")).toBe(true);
    expect(sharesStem("next", "next")).toBe(true);
    expect(sharesStem("next", "to")).toBe(false);
    expect(sharesStem("bought", "buy")).toBe(false);
    expect(sharesStem("drank", "drink")).toBe(false);
    expect(sharesStem("was", "is")).toBe(false);
    expect(sharesStem("was", "am")).toBe(false);
    expect(sharesStem("begin", "began")).toBe(false);
    expect(sharesStem("T-shirt", "T")).toBe(false);
  });

  it("masks the spelling face and leaves the stored gloss alone", () => {
    const cleaned = wordById("cleaned");
    const next = wordById("next");
    const bought = wordById("bought");
    const tree = wordById("tree");
    if (!cleaned || !next || !bought || !tree) throw new Error("missing word");
    expect(cleaned.chinese).toContain("clean");
    expect(next.chinese).toContain("next");
    const cleanedFace = maskSpellingFace(formatMeaning(cleaned), cleaned.english);
    expect(cleanedFace).toBe(formatMeaning(cleaned).replace("clean", SPELLING_MASK));
    expect(cleanedFace).not.toMatch(/clean/i);
    const nextFace = maskSpellingFace(formatMeaning(next), next.english);
    expect(nextFace).not.toMatch(/\bnext\b/i);
    expect(nextFace).toContain(SPELLING_MASK);
    expect(nextFace).toContain("to");
    const boughtFace = maskSpellingFace(formatMeaning(bought), bought.english);
    expect(boughtFace).toBe(formatMeaning(bought));
    expect(boughtFace).toContain("buy");
    expect(maskSpellingFace(formatMeaning(tree), tree.english)).toBe(formatMeaning(tree));
    const cleanedPrompt = spellingQuestion("cleaned", true);
    const nextPrompt = spellingQuestion("next", true);
    expect(spellingAllowed(cleaned, false)).toBe(true);
    expect(cleanedPrompt?.prompt).toBe(`用键盘拼出「${cleanedFace}」。`);
    expect(cleanedPrompt?.answer).toBe("cleaned");
    expect(nextPrompt?.answer).toBe("next");
    expect(nextPrompt?.prompt).not.toMatch(/\bnext\b/i);
    expect(nextPrompt?.prompt).toContain(SPELLING_MASK);
    const recognition = quizForWord("next", 1, "zh-to-en");
    expect(recognition.kind).toBe("meaning");
    expect(recognition.prompt.toLowerCase()).toContain("next");
    expect(recognition.answerId).toBe("next");
  });

  it("hides every Latin word on the review list while the spelling panel is open", () => {
    const cleaned = wordById("cleaned");
    const next = wordById("next");
    const shirt = wordById("t-shirt");
    if (!cleaned || !next || !shirt) throw new Error("missing word");
    expect(reviewDeskEnglish(cleaned.english, false)).toBe(cleaned.english);
    expect(reviewDeskEnglish(cleaned.english, true)).toBe("");
    expect(reviewDeskEnglish(next.english, true)).toBe("");
    expect(reviewDeskEnglish(shirt.english, true)).toBe("");
    expect(reviewDeskMeaning(formatMeaning(cleaned), false)).toBe(formatMeaning(cleaned));
    expect(reviewDeskMeaning(formatMeaning(next), true)).toBe(formatMeaning(next).replace(/[A-Za-z]+/g, SPELLING_MASK));
    expect(reviewDeskMeaning(formatMeaning(shirt), true)).not.toMatch(/T/i);
    expect(reviewDeskMeaning(formatMeaning(cleaned), true)).not.toMatch(/clean/i);
    expect(reviewDeskMeaning(formatMeaning(wordById("bought")!), true)).not.toMatch(/buy/i);
    const scene = readFileSync(new URL("../game/scenes/ReviewScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("reviewDeskEnglish");
    expect(scene).toContain("reviewDeskMeaning");
    expect(scene).toContain("this.spellingPanel = true");
    expect(scene).toContain("showSpellingPrompt");
  });

  it("keeps part-of-speech abbreviations on the review list and the spelling face", () => {
    const cleaned = wordById("cleaned");
    const next = wordById("next");
    if (!cleaned || !next) throw new Error("missing word");
    const stem = formatMeaning(cleaned).replace(/^v\.\s*/, "");
    const marks = ["n.", "v.", "adj.", "adv.", "prep.", "pron.", "conj.", "num.", "art.", "int."];
    for (const mark of marks) {
      const face = `${mark} ${stem}`;
      const kept = face.replace("clean", SPELLING_MASK);
      expect(maskSpellingFace(face, cleaned.english)).toBe(kept);
      expect(reviewDeskMeaning(face, true)).toBe(kept);
      expect(kept.startsWith(`${mark} `)).toBe(true);
      expect(kept).not.toMatch(/clean/i);
    }
    expect(maskSpellingFace(`modal v. ${stem.replace("clean", "can")}`, "can")).toBe(`modal v. ${stem.replace("clean", SPELLING_MASK)}`);
    expect(reviewDeskMeaning(`interj. ${stem.replace("clean", "oh")}`, true)).toBe(`interj. ${stem.replace("clean", SPELLING_MASK)}`);
    expect(maskSpellingFace("art. art", "art")).toBe(`art. ${SPELLING_MASK}`);
    const cleanedKept = formatMeaning(cleaned).replace("clean", SPELLING_MASK);
    expect(cleanedKept.startsWith("v. ")).toBe(true);
    expect(reviewDeskMeaning(formatMeaning(cleaned), true)).toBe(cleanedKept);
    expect(maskSpellingFace(formatMeaning(cleaned), cleaned.english)).toBe(cleanedKept);
    const nextKept = formatMeaning(next).replace(/[A-Za-z]+/g, SPELLING_MASK);
    expect(nextKept).toBe(formatMeaning(next).replace("next", SPELLING_MASK).replace("to", SPELLING_MASK));
    expect(reviewDeskMeaning(formatMeaning(next), true)).toBe(nextKept);
    expect(nextKept).not.toMatch(/[A-Za-z]/);
    expect(reviewDeskEnglish(cleaned.english, true)).toBe("");
  });

  it("keeps excluded words out of battle spelling, including a heal", () => {
    for (const item of EXPECTED) {
      for (const action of ["attack", "heal"] as const) {
        const question = ask(item.id, action);
        expect(question.kind, `${item.id} ${action}`).not.toBe("spelling");
        if (question.kind === "spelling") continue;
        expect(question.answerId).toBe(item.id);
        expect(question.kind).toBe("meaning");
      }
    }
    const tree = ask("tree", "attack");
    expect(tree.kind).toBe("spelling");
    if (tree.kind === "spelling") expect(tree.answer).toBe("tree");
    const healed = ask("tree", "heal");
    expect(healed.kind).toBe("spelling");
  });
});
