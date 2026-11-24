import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { isMastered } from "./cards";
import { catalogWords, wordById } from "./catalog";
import {
  COVER_SPELL_XP,
  applyCoverSpell,
  coverSpellFeedback,
  coverSpellOffered,
  coverSpellPrompt,
  type CoverSpellApplied,
} from "./cover-spell";
import { localDayKey } from "./local-day";
import { notePracticeAnswer } from "./parent";
import { createSave, learnWord, noteBattleAnswer, noteIndependentSpelling, reviewWord } from "./progress";
import { noteExamAnswer } from "./exam-settlement";
import { checkSpelling } from "./questions";
import { SPELLING_EXCLUSION_SHA256, excludedFromUnpromptedSpelling } from "./spelling-leak";
import { deserialize, serialize } from "./storage";
import type { SaveData, WordCardRecord } from "./types";
import { Rating } from "ts-fsrs";

const SH = "Asia/Shanghai";
const LA = "America/Los_Angeles";

function fresh(at: Date, grades: string[] = ["G3", "G4", "G5", "G6"]): SaveData {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: at.getTime(),
    grades,
  });
}

function learned(id: string, at: Date, zone = SH): SaveData {
  return learnWord(fresh(at), id, at, zone);
}

function attempt(
  save: SaveData,
  wordId: string,
  now: Date,
  zone: string,
  typed: string,
  giveUp = false,
  badgeLit = false,
): CoverSpellApplied {
  return applyCoverSpell(save, { wordId, typed, giveUp, now, timeZone: zone, badgeLit });
}

describe("cover spell", () => {
  it("keeps the frozen exclusion file hash", () => {
    const bytes = readFileSync(new URL("./chapters/spelling_exclusion_word_ids_v0.1.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SPELLING_EXCLUSION_SHA256);
    expect(SPELLING_EXCLUSION_SHA256).toBe("516cc9da9ac457e400b71530ec77174179e13ad643311dfa84423e866c7fb311");
    expect(excludedFromUnpromptedSpelling("tree")).toBe(false);
  });

  it("pays +30 once when a correct answer first sets spelledAloneAt", () => {
    const learnedAt = new Date("2026-11-22T02:00:00Z");
    const now = new Date("2026-11-23T02:00:00Z");
    const save = learned("tree", learnedAt);
    const memory = save.memory;
    const goal = save.dailyGoal;
    const stats = save.dailyStats;
    const answers = save.dueAnswers;
    const first = attempt(save, "tree", now, SH, "  TrEe  ");
    expect(first.outcome).toBe("mastered");
    expect(first.xpGained).toBe(COVER_SPELL_XP);
    expect(first.save.xp).toBe(save.xp + 30);
    expect(first.save.wordCards.tree?.spelledAloneAt).toBe(now.getTime());
    expect(isMastered(first.save.wordCards.tree)).toBe(true);
    expect(first.save.wordCards.tree?.masteryBadge).toBe(false);
    expect(first.save.memory).toBe(memory);
    expect(first.save.dailyGoal).toBe(goal);
    expect(first.save.dailyStats).toBe(stats);
    expect(first.save.dueAnswers).toBe(answers);
    const second = attempt(first.save, "tree", now, SH, "tree");
    expect(second.outcome).toBe("practice-already-mastered");
    expect(second.xpGained).toBe(0);
    expect(second.save).toBe(first.save);
    const fromSameBase = [0, 1].map(() => attempt(save, "tree", now, SH, "tree"));
    expect(fromSameBase[0]?.save.xp).toBe(save.xp + 30);
    expect(fromSameBase[1]?.save.xp).toBe(save.xp + 30);
    expect(attempt(fromSameBase[0]!.save, "tree", now, SH, "tree").xpGained).toBe(0);
  });

  it("does not backfill +30 for a word boss or exam already mastered", () => {
    const learnedAt = new Date("2026-11-22T02:00:00Z");
    const now = new Date("2026-11-23T02:00:00Z");
    const save = learned("tree", learnedAt);
    const boss = noteBattleAnswer(save, {
      wordId: "tree",
      correct: true,
      now,
      dueAtStart: [],
      spelling: true,
      timeZone: SH,
    });
    expect(isMastered(boss.wordCards.tree)).toBe(true);
    expect(boss.xp).toBe(save.xp);
    const afterBoss = attempt(boss, "tree", now, SH, "tree");
    expect(afterBoss.xpGained).toBe(0);
    expect(afterBoss.save).toBe(boss);
    const exam = noteExamAnswer(save, {
      wordId: "tree",
      correct: true,
      now,
      dueAtStart: [],
      spelling: true,
      timeZone: SH,
    });
    expect(exam.wordCards.tree?.spelledAloneAt).toBe(now.getTime());
    expect(exam.xp).toBe(save.xp);
    expect(attempt(exam, "tree", now, SH, "tree").xpGained).toBe(0);
    const direct = noteIndependentSpelling(save, "tree", now);
    expect(attempt(direct, "tree", now, SH, "tree").save.xp).toBe(save.xp);
  });

  it("lets a same-day new word be practiced and masters it on the next local day", () => {
    const same = new Date("2026-11-23T15:00:00Z");
    const laterSame = new Date("2026-11-23T15:40:00Z");
    const next = new Date("2026-11-23T16:30:00Z");
    expect(localDayKey(same, SH)).toBe("2026-11-23");
    expect(localDayKey(laterSame, SH)).toBe("2026-11-23");
    expect(localDayKey(next, SH)).toBe("2026-11-24");
    const save = learned("tree", same, SH);
    const practiced = attempt(save, "tree", laterSame, SH, "tree");
    expect(practiced.outcome).toBe("practice-too-soon");
    expect(practiced.xpGained).toBe(0);
    expect(practiced.save.wordCards.tree?.spelledAloneAt).toBeUndefined();
    expect(practiced.save).toBe(save);
    const mastered = attempt(save, "tree", next, SH, "tree");
    expect(mastered.outcome).toBe("mastered");
    expect(mastered.save.wordCards.tree?.spelledAloneAt).toBe(next.getTime());
    expect(mastered.save.xp).toBe(save.xp + 30);
  });

  it("uses the submit instant across midnight in Shanghai and Los Angeles", () => {
    const laLearn = new Date("2026-01-15T07:30:00Z");
    const laSame = new Date("2026-01-15T07:50:00Z");
    const laNext = new Date("2026-01-15T08:30:00Z");
    expect(localDayKey(laLearn, LA)).toBe("2026-01-14");
    expect(localDayKey(laSame, LA)).toBe("2026-01-14");
    expect(localDayKey(laNext, LA)).toBe("2026-01-15");
    const los = learned("bird", laLearn, LA);
    expect(attempt(los, "bird", laSame, LA, "bird").outcome).toBe("practice-too-soon");
    expect(attempt(los, "bird", laNext, LA, "bird").outcome).toBe("mastered");

    const opened = new Date("2026-11-23T15:00:00Z");
    const submit = new Date("2026-11-23T16:30:00Z");
    const shanghai = learned("tree", opened, SH);
    expect(attempt(shanghai, "tree", opened, SH, "tree").outcome).toBe("practice-too-soon");
    expect(attempt(shanghai, "tree", submit, SH, "tree").outcome).toBe("mastered");
  });

  it("blocks mastery for the rest of the reveal day and clears it the next local day", () => {
    const learnedAt = new Date("2026-11-22T02:00:00Z");
    const wrongAt = new Date("2026-11-23T15:30:00Z");
    const still = new Date("2026-11-23T15:50:00Z");
    const next = new Date("2026-11-23T16:30:00Z");
    const save = learned("tree", learnedAt, SH);
    const wrong = attempt(save, "tree", wrongAt, SH, "nope");
    expect(wrong.outcome).toBe("revealed");
    expect(wrong.answer).toBe("tree");
    expect(wrong.xpGained).toBe(0);
    expect(wrong.save.wordCards.tree?.coverSpellRevealDay).toBe("2026-11-23");
    expect(wrong.save.wordCards.tree?.spelledAloneAt).toBeUndefined();
    expect(wrong.save.xp).toBe(save.xp);
    const gaveUp = attempt(save, "bird", wrongAt, SH, "bird", true);
    expect(gaveUp.outcome).toBe("unavailable");
    const bird = learned("bird", learnedAt, SH);
    const giveUp = attempt(bird, "bird", wrongAt, SH, "bird", true);
    expect(giveUp.outcome).toBe("revealed");
    expect(giveUp.answer).toBe("bird");
    expect(giveUp.save.wordCards.bird?.spelledAloneAt).toBeUndefined();
    const again = attempt(wrong.save, "tree", still, SH, "tree");
    expect(again.outcome).toBe("practice-revealed");
    expect(again.xpGained).toBe(0);
    expect(again.save.wordCards.tree?.spelledAloneAt).toBeUndefined();
    const repeatReveal = attempt(wrong.save, "tree", still, SH, "xxx");
    expect(repeatReveal.save).toBe(wrong.save);
    expect(repeatReveal.answer).toBe("tree");
    const tomorrow = attempt(wrong.save, "tree", next, SH, "tree");
    expect(tomorrow.outcome).toBe("mastered");
    expect(tomorrow.save.xp).toBe(save.xp + 30);
    const laWrong = new Date("2026-01-15T07:50:00Z");
    const laNext = new Date("2026-01-15T08:30:00Z");
    const laSave = learned("tree", new Date("2026-01-14T20:00:00Z"), LA);
    const laReveal = attempt(laSave, "tree", laWrong, LA, "", false);
    expect(laReveal.save.wordCards.tree?.coverSpellRevealDay).toBe("2026-01-14");
    expect(attempt(laReveal.save, "tree", laWrong, LA, "tree").outcome).toBe("practice-revealed");
    expect(attempt(laReveal.save, "tree", laNext, LA, "tree").outcome).toBe("mastered");
  });

  it("follows checkSpelling and refuses skip, none, advanced, and leak-list words", () => {
    expect(checkSpelling("Tree", "  tree ")).toBe(true);
    expect(checkSpelling("T-shirt", "t shirt")).toBe(false);
    expect(checkSpelling("colour", "color")).toBe(false);
    const learnedAt = new Date("2026-11-22T02:00:00Z");
    const now = new Date("2026-11-23T02:00:00Z");
    const tree = learned("tree", learnedAt);
    expect(attempt(tree, "tree", now, SH, "tree ").outcome).toBe("mastered");
    expect(attempt(tree, "tree", now, SH, "tree-").outcome).toBe("revealed");
    const hello = wordById("hello");
    const big = wordById("big");
    const cleaned = wordById("cleaned");
    const museum = wordById("jinggangshan revolution museum");
    if (!hello || !big || !cleaned || !museum) throw new Error("missing word");
    expect(coverSpellOffered(hello, true)).toBe(false);
    expect(coverSpellOffered(big, false)).toBe(false);
    expect(coverSpellOffered(big, true)).toBe(true);
    expect(coverSpellOffered(cleaned, true)).toBe(false);
    expect(coverSpellOffered(museum, true)).toBe(false);
    expect(attempt(learned("hello", learnedAt), "hello", now, SH, "hello", false, true).outcome).toBe("unavailable");
    expect(attempt(learned("big", learnedAt), "big", now, SH, "big", false, false).outcome).toBe("unavailable");
    const advanced = attempt(learned("big", learnedAt), "big", now, SH, "big", false, true);
    expect(advanced.outcome).toBe("mastered");
    expect(attempt(learned("cleaned", learnedAt), "cleaned", now, SH, "cleaned", false, true).save.wordCards.cleaned?.spelledAloneAt).toBeUndefined();
    expect(attempt(learned(museum.id, learnedAt), museum.id, now, SH, museum.english, false, true).outcome).toBe("unavailable");
    const hyphen = wordById("hard-working");
    const apostrophe = wordById("o'clock");
    const spaced = wordById("dining hall");
    if (!hyphen || !apostrophe || !spaced) throw new Error("missing marked word");
    expect(coverSpellOffered(hyphen, false)).toBe(true);
    expect(coverSpellOffered(apostrophe, false)).toBe(false);
    expect(coverSpellOffered(apostrophe, true)).toBe(true);
    expect(coverSpellOffered(spaced, false)).toBe(true);
    const hyphenSave = learned(hyphen.id, learnedAt);
    expect(attempt(hyphenSave, hyphen.id, now, SH, "  HARD-WORKING  ").outcome).toBe("mastered");
    expect(attempt(hyphenSave, hyphen.id, now, SH, "hard working").outcome).toBe("revealed");
    const markSave = learned(apostrophe.id, learnedAt);
    expect(attempt(markSave, apostrophe.id, now, SH, "oclock", false, true).outcome).toBe("revealed");
    expect(attempt(markSave, apostrophe.id, now, SH, "  O'CLOCK  ", false, true).outcome).toBe("mastered");
    const spaceSave = learned(spaced.id, learnedAt);
    expect(attempt(spaceSave, spaced.id, now, SH, "  Dining   Hall ").outcome).toBe("mastered");
    expect(attempt(spaceSave, spaced.id, now, SH, "dininghall").outcome).toBe("revealed");
    for (const word of catalogWords()) {
      if (!coverSpellOffered(word, true)) continue;
      expect(coverSpellPrompt(word).toLowerCase(), word.id).not.toContain(word.english.trim().toLowerCase());
    }
  });

  it("keeps old saves and illegal fields from paying twice or skipping a day", () => {
    const learnedAt = new Date("2026-11-22T02:00:00Z");
    const now = new Date("2026-11-23T02:00:00Z");
    const save = learned("tree", learnedAt);
    const mastered = noteIndependentSpelling(save, "tree", now);
    const loaded = deserialize(serialize(mastered));
    if (!loaded) throw new Error("load");
    expect(loaded.xp).toBe(mastered.xp);
    expect(loaded.wordCards.tree?.coverSpellRevealDay).toBeUndefined();
    expect(attempt(loaded, "tree", now, SH, "tree").xpGained).toBe(0);
    const missing = deserialize(serialize(save));
    if (!missing?.wordCards.tree) throw new Error("missing");
    expect(missing.wordCards.tree.coverSpellRevealDay).toBeUndefined();
    expect(attempt(missing, "tree", now, SH, "tree").outcome).toBe("mastered");
    const card = save.wordCards.tree;
    if (!card) throw new Error("card");
    const badDay: WordCardRecord = { ...card, coverSpellRevealDay: "2026-13-40" };
    const badSave = { ...save, wordCards: { ...save.wordCards, tree: badDay } };
    expect(attempt(badSave, "tree", now, SH, "tree").outcome).toBe("practice-revealed");
    const future: WordCardRecord = { ...card, coverSpellRevealDay: "2099-01-01" };
    expect(attempt({ ...save, wordCards: { tree: future } }, "tree", now, SH, "tree").xpGained).toBe(0);
    const past: WordCardRecord = { ...card, coverSpellRevealDay: "2026-11-22" };
    expect(attempt({ ...save, wordCards: { tree: past } }, "tree", now, SH, "tree").outcome).toBe("mastered");
    const textStamp = { ...card, spelledAloneAt: "12345" } as unknown as WordCardRecord;
    const held = attempt({ ...save, wordCards: { tree: textStamp } }, "tree", now, SH, "tree");
    expect(held.outcome).toBe("practice-stamp-blocked");
    expect(held.save.wordCards.tree?.spelledAloneAt).toBe("12345" as unknown as number);
    expect(held.save.xp).toBe(save.xp);
    const zeroStamp: WordCardRecord = { ...card, spelledAloneAt: 0 };
    expect(attempt({ ...save, wordCards: { tree: zeroStamp } }, "tree", now, SH, "tree").xpGained).toBe(0);
    const nanStamp: WordCardRecord = { ...card, spelledAloneAt: Number.NaN };
    const nanHeld = attempt({ ...save, wordCards: { tree: nanStamp } }, "tree", now, SH, "tree");
    expect(nanHeld.xpGained).toBe(0);
    expect(Number.isNaN(nanHeld.save.wordCards.tree?.spelledAloneAt)).toBe(true);
    const brokenDate: WordCardRecord = { ...card, collectedAt: Number.NaN };
    expect(attempt({ ...save, wordCards: { tree: brokenDate } }, "tree", now, SH, "tree").outcome).toBe("practice-too-soon");
  });

  it("does not move FSRS, the practice goal, or the shared spelling writer", () => {
    const learnedAt = new Date("2026-11-22T02:00:00Z");
    const now = new Date("2026-11-23T02:00:00Z");
    let save = learned("tree", learnedAt, SH);
    save = notePracticeAnswer(save, "tree", now, SH);
    const practiced = save.dailyGoal?.progressPractice ?? 0;
    const next = attempt(save, "tree", now, SH, "tree");
    expect(next.save.dailyGoal?.progressPractice ?? 0).toBe(practiced);
    expect(next.save.memory.tree?.fsrs).toEqual(save.memory.tree?.fsrs);
    const reviewed = reviewWord(save, "tree", Rating.Good, now, SH);
    expect(reviewed.memory.tree).not.toBe(save.memory.tree);
    expect(next.save.wordCards.tree?.masteryBadge).toBe(false);
    const progress = readFileSync(new URL("./progress.ts", import.meta.url), "utf8");
    expect(progress).not.toContain("COVER_SPELL_XP");
    expect(progress).not.toContain("applyCoverSpell");
    expect(progress).toContain("noteIndependentSpelling");
    expect(coverSpellFeedback(next)).toBe("拼对了。已掌握，经验 +30。");
  });
});
