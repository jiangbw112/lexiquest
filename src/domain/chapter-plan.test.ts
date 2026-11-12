import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { optionTextBounds, wrapCjkText } from "../game/layout";
import { DEFAULT_APPEARANCE } from "./appearance";
import { isMastered } from "./cards";
import {
  activeChapter,
  battleWordIds,
  chapterBossReady,
  chapterPlanStatus,
  collectedCardIds,
  glossPairBlocked,
  gradeChapters,
  isChapterUnlocked,
  parseChapterEncounter,
  scopeWordIds,
  SPELLING_EXCEPTIONS,
  spellingSkipIds,
  unlockedWordIds,
  visibleChapters,
} from "./chapter-plan";
import { chapterExtraWords, continuationWordIds, wordById } from "./catalog";
import { parentView } from "./parent";
import { quizForWord, spellingAllowed, spellingQuestion } from "./questions";
import { applyBattleOutcome, createSave, learnWord, noteIndependentSpelling } from "./progress";
import { deserialize, serialize } from "./storage";
import { chapterWordIds } from "./stages";
import type { GradeBand, SaveData } from "./types";

const CHAPTERS_SHA256 = "f70645d8faf80032a3c938d364fe414f165aba082be062479cb020a41402807a";
const GLOSS_SHA256 = "b894a98edae983f916ebb3d6dc10fbb7c73021303120623b5a6587876b61f047";

const START = new Date("2026-03-01T02:00:00Z");
const GRADES: GradeBand[] = ["G3", "G4", "G5", "G6"];

function newSave(grades: GradeBand[] = GRADES) {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades,
  });
}

function withCards(save: SaveData, ids: readonly string[]): SaveData {
  const wordCards = { ...save.wordCards };
  for (const id of ids) {
    wordCards[id] = { wordId: id, collectedAt: START.getTime(), masteryBadge: false };
  }
  return { ...save, wordCards };
}

function fileRemainder(): Record<GradeBand, string[]> {
  const loader = JSON.parse(readFileSync(new URL("./data/pep_words_g3-6_v1.2.2_loader.json", import.meta.url), "utf8")) as {
    words: { word: string; grade_est: number }[];
  };
  const forest = JSON.parse(readFileSync(new URL("./chapters/chapter_forest_v1.1.json", import.meta.url), "utf8")) as {
    word_refs_formal: string[];
  };
  const formal = new Set(forest.word_refs_formal);
  const byGrade: Record<GradeBand, string[]> = { G3: [], G4: [], G5: [], G6: [] };
  const seen = new Set<string>();
  for (const entry of loader.words) {
    const id = entry.word.trim().toLowerCase();
    if (formal.has(id) || seen.has(id)) continue;
    seen.add(id);
    byGrade[`G${entry.grade_est}` as GradeBand].push(id);
  }
  return byGrade;
}

describe("grade chapters", () => {
  const remainder = fileRemainder();

  it("loads each remaining official word once, under the grade where it first appears", () => {
    const chapterBytes = readFileSync(new URL("./chapters/chapters_v0.2.json", import.meta.url));
    const glossBytes = readFileSync(new URL("./chapters/gloss_overlap_pairs_v0.2.json", import.meta.url));
    expect(createHash("sha256").update(chapterBytes).digest("hex")).toBe(CHAPTERS_SHA256);
    expect(createHash("sha256").update(glossBytes).digest("hex")).toBe(GLOSS_SHA256);
    const plan = JSON.parse(chapterBytes.toString("utf8")) as Array<{
      chapter_id: string;
      in_chapter_stage_swaps?: { word_a: string; to_stage_a: number; word_b: string; to_stage_b: number }[];
      stages: { id: number; word_refs: string[] }[];
    }>;
    const gloss = JSON.parse(glossBytes.toString("utf8")) as {
      exact: { a: string; b: string; cross_grade: boolean }[];
      overlap: { a: string; b: string; rules: string[]; cross_grade: boolean }[];
    };
    expect(plan).toHaveLength(32);
    expect(chapterPlanStatus()).toBe("v0.2");
    const swaps = plan.flatMap((chapter) => chapter.in_chapter_stage_swaps ?? []);
    expect(swaps).toHaveLength(8);
    for (const swap of swaps) {
      const chapter = plan.find((item) => item.in_chapter_stage_swaps?.includes(swap));
      const stageA = chapter?.stages.find((stage) => stage.id === swap.to_stage_a);
      const stageB = chapter?.stages.find((stage) => stage.id === swap.to_stage_b);
      expect(stageA?.word_refs).toContain(swap.word_a);
      expect(stageB?.word_refs).toContain(swap.word_b);
    }
    const shared = gloss.overlap.filter((pair) => pair.rules.includes("R1_shared_sense"));
    const containsOnly = gloss.overlap.filter((pair) => pair.rules.includes("R2_contains") && !pair.rules.includes("R1_shared_sense"));
    expect(gloss.exact).toHaveLength(23);
    expect(shared).toHaveLength(26);
    expect(containsOnly).toHaveLength(66);
    expect(gloss.exact.some((pair) => pair.cross_grade && glossPairBlocked(pair.a, pair.b))).toBe(true);
    expect(shared.every((pair) => glossPairBlocked(pair.a, pair.b))).toBe(true);
    expect(containsOnly.some((pair) => glossPairBlocked(pair.a, pair.b))).toBe(false);
    const extras = new Set(chapterExtraWords().map((word) => word.id));
    const forest = new Set(chapterWordIds());
    const seen = new Set<string>();
    for (const grade of GRADES) {
      const ids = gradeChapters(grade).flatMap((chapter) => chapter.wordIds);
      expect(new Set(ids)).toEqual(new Set(remainder[grade]));
      expect(ids).toHaveLength(remainder[grade].length);
      expect(new Set(ids)).toEqual(new Set(continuationWordIds(grade)));
      for (const chapter of gradeChapters(grade)) {
        expect(chapter.stages).toHaveLength(5);
        expect(chapter.stages[4]?.type).toBe("boss");
        for (const stage of chapter.stages) expect(stage.new_words.length).toBeGreaterThanOrEqual(3);
      }
      for (const id of ids) {
        expect(seen.has(id)).toBe(false);
        expect(forest.has(id)).toBe(false);
        expect(extras.has(id)).toBe(false);
        expect(wordById(id)?.grade).toBe(grade);
        seen.add(id);
      }
    }
    expect(Object.fromEntries(GRADES.map((grade) => [grade, remainder[grade].length]))).toEqual({
      G3: 220,
      G4: 211,
      G5: 251,
      G6: 161,
    });
    expect(seen.size).toBe(843);
    expect(GRADES.map((grade) => gradeChapters(grade).length)).toEqual([8, 8, 9, 6]);
    const sizes = (id: string) => gradeChapters(id.slice(4, 6) === "g3" ? "G3" : id.slice(4, 6) === "g4" ? "G4" : id.slice(4, 6) === "g5" ? "G5" : "G6")
      .find((chapter) => chapter.id === id)!;
    expect(sizes("pep_g3_08").wordIds).toHaveLength(24);
    expect(sizes("pep_g3_08").stages.map((stage) => stage.new_words.length)).toEqual([5, 5, 5, 5, 4]);
    expect(sizes("pep_g4_08").wordIds).toHaveLength(15);
    expect(sizes("pep_g4_08").stages.map((stage) => stage.new_words.length)).toEqual([3, 3, 3, 3, 3]);
    expect(sizes("pep_g5_09").wordIds).toHaveLength(27);
    expect(sizes("pep_g5_09").stages.map((stage) => stage.new_words.length)).toEqual([6, 6, 6, 6, 3]);
    expect(sizes("pep_g6_06").wordIds).toHaveLength(21);
    expect(sizes("pep_g6_06").stages.map((stage) => stage.new_words.length)).toEqual([5, 4, 4, 4, 4]);
    const friends = gradeChapters("G3")[0]!;
    expect(friends).toMatchObject({ id: "pep_g3_01", name: "朋友与家人", bossName: "全家福守护者" });
    expect(friends.stages[0]?.new_words).toEqual(["arm", "can", "ear", "eye", "friend", "good"]);
    const places = gradeChapters("G6")[0]!;
    expect(places.id).toBe("pep_g6_01");
    const early = new Set(places.stages.slice(0, 3).flatMap((stage) => stage.new_words));
    const longNames = [
      "eiffel tower",
      "hong kong-zhuhai-macao bridge",
      "jinggangshan revolution museum",
      "new zealand",
      "terracotta warriors",
      "the red army",
    ];
    expect(longNames.every((id) => early.has(id))).toBe(true);
    const longest = [...longNames].sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
    expect(longest).toBe("jinggangshan revolution museum");
    const width = optionTextBounds(640, 56).maxWidth;
    const measure = (sample: string) => {
      let pixels = 0;
      for (const char of sample) pixels += char.charCodeAt(0) <= 0x7e ? 24 * 0.62 : 24;
      return pixels;
    };
    const wrapped = wrapCjkText(longest, width, measure);
    expect(wrapped.includes("\n")).toBe(false);
    for (const token of longest.split(" ")) expect(wrapped.includes(token)).toBe(true);
  });

  it("opens the boss from this chapter's own word count", () => {
    const chapter = gradeChapters("G4").find((item) => item.id === "pep_g4_08")!;
    expect(chapter.wordIds).toHaveLength(15);
    const wins = { "1": 1, "2": 1, "3": 1, "4": 1 };
    const ready = {
      ...withCards(newSave(["G4"]), chapter.wordIds),
      chapterCleared: true,
      currentChapterId: chapter.id,
      chapterProgress: { [chapter.id]: { cleared: false, stageWins: wins } },
    };
    expect(chapterBossReady(ready, chapter.id)).toBe(true);
    const missingId = chapter.wordIds[chapter.wordIds.length - 1]!;
    const rest = { ...ready.wordCards };
    delete rest[missingId];
    expect(chapterBossReady({ ...ready, wordCards: rest }, chapter.id)).toBe(false);
  });

  it("keeps Beijing opera and Mount Taishan spellable and does not call other listed names mastered", () => {
    const listed = JSON.parse(readFileSync(new URL("./chapters/chapters_v0.2.json", import.meta.url), "utf8")) as {
      no_spelling_word_refs?: string[];
    }[];
    const raw = listed.flatMap((chapter) => chapter.no_spelling_word_refs ?? []);
    for (const id of SPELLING_EXCEPTIONS) expect(raw).toContain(id);
    expect(spellingSkipIds()).not.toContain("beijing opera");
    expect(spellingSkipIds()).not.toContain("mount taishan");
    expect(spellingSkipIds()).toContain("jinggangshan revolution museum");
    expect(spellingAllowed(wordById("beijing opera")!, true)).toBe(true);
    expect(spellingAllowed(wordById("mount taishan")!, true)).toBe(true);
    expect(spellingQuestion("jinggangshan revolution museum", true)).toBeNull();
    let save = learnWord(newSave(["G6"]), "jinggangshan revolution museum", START);
    expect(noteIndependentSpelling(save, "jinggangshan revolution museum", START).wordCards["jinggangshan revolution museum"]?.spelledAloneAt).toBeUndefined();
    save = {
      ...save,
      wordCards: {
        ...save.wordCards,
        "jinggangshan revolution museum": {
          ...save.wordCards["jinggangshan revolution museum"]!,
          spelledAloneAt: START.getTime(),
        },
        "beijing opera": {
          wordId: "beijing opera",
          collectedAt: START.getTime(),
          masteryBadge: false,
          spelledAloneAt: START.getTime(),
        },
      },
    };
    expect(isMastered(save.wordCards["jinggangshan revolution museum"])).toBe(false);
    expect(isMastered(save.wordCards["beijing opera"])).toBe(true);
    const view = parentView(save, START);
    expect(view.masteredLine).toContain("已认识 2 个，已掌握 1 个");
    expect(view.firstMasteredLine).toBe("首次掌握：1 个");
  });

  it("orders selected grades from G3 to G6 and opens the next chapter after a boss", () => {
    const mixed = visibleChapters(["G6", "G3"]);
    expect(mixed[0]?.id).toBe("forest_adventure");
    expect(mixed[1]?.grade).toBe("G3");
    expect(mixed.some((chapter) => chapter.grade === "G4")).toBe(false);
    expect(mixed.filter((chapter) => chapter.grade === "G6")).toHaveLength(gradeChapters("G6").length);
    const fresh = newSave(["G3", "G5"]);
    const list = visibleChapters(fresh.selectedGrades);
    expect(isChapterUnlocked(fresh, list[0]!)).toBe(true);
    expect(isChapterUnlocked(fresh, list[1]!)).toBe(false);
    const beaten = { ...fresh, chapterCleared: true };
    expect(isChapterUnlocked(beaten, list[1]!)).toBe(true);
    expect(list[1]?.grade).toBe("G3");
    expect(isChapterUnlocked(beaten, list[2]!)).toBe(false);
    const only5 = visibleChapters(["G5"]);
    const old = { ...newSave(["G5"]), chapterCleared: true };
    expect(only5[1]?.grade).toBe("G5");
    expect(isChapterUnlocked(old, only5[1]!)).toBe(true);
    expect(activeChapter(fresh).id).toBe("forest_adventure");
    expect(activeChapter({ ...fresh, currentChapterId: "missing" }).id).toBe("forest_adventure");
  });

  it("draws distractors from unlocked words of the same grade", () => {
    const save = newSave(["G3", "G4"]);
    const pool = unlockedWordIds(save).map((id) => wordById(id)).filter((word) => word?.grade === "G4");
    expect(pool.map((word) => word!.id).sort()).toEqual(["bridge", "rain", "run", "weather"]);
    const quiz = quizForWord("run", 1, "zh-to-en", unlockedWordIds(save).map((id) => wordById(id)!));
    expect(quiz.choices).toHaveLength(3);
    expect(quiz.choices.map((choice) => choice.id)).toContain("run");
    expect(quiz.choices.every((choice) => wordById(choice.id)?.grade === "G4")).toBe(true);
    const later = gradeChapters("G4")[0]!;
    expect(battleWordIds(save)).not.toContain(later.wordIds[0]);
    const standing = { ...save, currentChapterId: later.id, chapterCleared: true };
    expect(battleWordIds(standing)).toEqual(later.wordIds);
    expect(battleWordIds(standing)).not.toContain("run");
  });

  it("keeps cards, badges, spelling, outfits, and stars when the save has no chapter fields", () => {
    let save = newSave(["G3"]);
    save = learnWord(save, "about", START);
    save = {
      ...save,
      chapterCleared: true,
      stageWins: { "1": 1 },
      bestStars: { "1": 3 },
      ownedOutfitIds: ["traveler", "forest-cape"],
      equippedOutfitId: "forest-cape",
      wordCards: {
        ...save.wordCards,
        about: { ...save.wordCards.about!, masteryBadge: true, spelledAloneAt: START.getTime() },
      },
    };
    const raw = JSON.parse(serialize(save)) as { chapterProgress?: unknown; currentChapterId?: unknown };
    delete raw.chapterProgress;
    delete raw.currentChapterId;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.version).toBe(1);
    expect(loaded?.wordCards.about?.spelledAloneAt).toBe(START.getTime());
    expect(loaded?.wordCards.about?.masteryBadge).toBe(true);
    expect(loaded?.equippedOutfitId).toBe("forest-cape");
    expect(loaded?.bestStars).toEqual({ "1": 3 });
    expect(loaded?.stageWins).toEqual({ "1": 1 });
    expect(loaded?.chapterCleared).toBe(true);
    expect(loaded?.chapterProgress).toEqual({});
    const home = gradeChapters("G3").find((chapter) => chapter.wordIds.includes("about"));
    expect(home?.id).toBe("pep_g3_04");
    expect(loaded && isChapterUnlocked(loaded, gradeChapters("G3")[0]!)).toBe(true);
    expect(loaded && home && isChapterUnlocked(loaded, home)).toBe(false);
    expect(collectedCardIds(loaded!).includes("about")).toBe(true);
    const cleared = scopeWordIds(loaded!);
    expect(cleared).toContain("about");
    expect(cleared).toContain("tree");
    expect(new Set(cleared).size).toBe(cleared.length);
  });

  it("records a later chapter without touching forest wins or stars", () => {
    const chapter = gradeChapters("G3")[0]!;
    const save = {
      ...newSave(["G3"]),
      chapterCleared: true,
      stageWins: { "1": 2 },
      bestStars: { "1": 3 as const },
      currentChapterId: chapter.id,
    };
    const won = applyBattleOutcome(save, "win", START.getTime(), `chapter:${chapter.id}:stage:1`, 2, 1);
    expect(won.stageWins).toEqual({ "1": 2 });
    expect(won.chapterCleared).toBe(true);
    expect(won.bestStars?.["1"]).toBe(3);
    expect(won.bestStars?.[`${chapter.id}:1`]).toBe(2);
    expect(won.chapterProgress?.[chapter.id]?.stageWins["1"]).toBe(1);
    expect(won.chapterProgress?.[chapter.id]?.cleared).toBe(false);
    expect(parseChapterEncounter("forest-stage-1")).toBeNull();
    expect(parseChapterEncounter("canopy")).toBeNull();
    const earlyBoss = applyBattleOutcome(won, "win", START.getTime(), `chapter:${chapter.id}:boss`, 3, 5);
    expect(earlyBoss.chapterProgress?.[chapter.id]?.cleared).toBe(false);
    expect(earlyBoss.chapterCleared).toBe(true);
  });
});
