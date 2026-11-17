import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { formatMeaning, wordById, type WordDef } from "./catalog";
import { allGradeChapters, battleWordIds, glossPairBlocked, gradeChapters, unlockedWordIds, visibleChapters } from "./chapter-plan";
import { answerQuestion, startBattle, takeAction } from "./battle";
import { examCardPool } from "./exam-questions";
import { EXAMS } from "./exams";
import { createSave, gradeIsOpen, learnWord, setSelectedGrades } from "./progress";
import { MEANING_CHOICE_COUNT, quizForWord } from "./questions";
import { starterSkillId } from "./skills";
import type { SaveData } from "./types";

const GRADES = ["G3", "G4", "G5", "G6"] as const;
/** Question pools for every chapter under every grade selection, measured on 2ee729d. */
const POOL_HASH = "6a4549596ce055b5f93afa1d7787d47dbc22af6e1c1d548c34e65db36536aeb4";
/** Exam meaning choices for a full card pool, measured before the fill. */
const EXAM_CHOICE_HASH = "17a620c7fc6a0b5e25facc3e0f35e09744dda73d308cda67f3042b4e2e99a995";
const EXCLUSION_SHA = "516cc9da9ac457e400b71530ec77174179e13ad643311dfa84423e866c7fb311";
const FOREST_G3_POOL = [
  "tree", "bird", "fish", "sun", "map", "big", "red", "flower",
  "bridge", "path", "brave", "protect", "treasure", "journey", "discover", "adventure",
];

function combos(): string[][] {
  const out: string[][] = [];
  for (let mask = 1; mask < 1 << GRADES.length; mask += 1) {
    out.push(GRADES.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return out;
}

function fresh(grades: string[]): SaveData {
  return setSelectedGrades(
    createSave({ name: "小林", classId: "warrior", appearance: DEFAULT_APPEARANCE, now: 1 }),
    grades,
  );
}

function unlockAll(save: SaveData): SaveData {
  const chapterProgress: NonNullable<SaveData["chapterProgress"]> = {};
  for (const chapter of allGradeChapters()) {
    if (chapter.grade === "mixed" || !save.selectedGrades.includes(chapter.grade)) continue;
    chapterProgress[chapter.id] = { cleared: true, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
  }
  return {
    ...save,
    chapterCleared: true,
    stageWins: { "1": 1, "2": 1, "3": 1, "4": 1, "5": 1 },
    chapterProgress,
  };
}

function wordsOf(ids: readonly string[]): WordDef[] {
  return ids.map((id) => {
    const word = wordById(id);
    if (!word) throw new Error(id);
    return word;
  });
}

function assertChoice(quiz: ReturnType<typeof quizForWord>): void {
  expect(quiz.choices).toHaveLength(MEANING_CHOICE_COUNT);
  expect(quiz.choices.filter((choice) => choice.id === quiz.answerId)).toHaveLength(1);
  expect(new Set(quiz.choices.map((choice) => choice.id)).size).toBe(MEANING_CHOICE_COUNT);
  expect(new Set(quiz.choices.map((choice) => choice.label)).size).toBe(MEANING_CHOICE_COUNT);
  const words = quiz.choices.map((choice) => wordById(choice.id)!);
  expect(new Set(words.map((word) => word.english.trim().toLowerCase())).size).toBe(MEANING_CHOICE_COUNT);
  expect(new Set(words.map((word) => word.chinese.trim())).size).toBe(MEANING_CHOICE_COUNT);
  expect(new Set(words.map((word) => formatMeaning(word))).size).toBe(MEANING_CHOICE_COUNT);
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      expect(glossPairBlocked(words[i]!.id, words[j]!.id)).toBe(false);
    }
  }
}

describe("short choice fill", () => {
  it("prescribes three choices", () => {
    expect(MEANING_CHOICE_COUNT).toBe(3);
  });

  it("keeps the spelling exclusion file bytes", () => {
    const bytes = readFileSync(new URL("./chapters/spelling_exclusion_word_ids_v0.1.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXCLUSION_SHA);
  });

  it("fills a short grade from the chapter before an adjacent grade outside it", () => {
    const about = gradeChapters("G3")[0]!.wordIds[0]!;
    const later = gradeChapters("G5")[0]!.wordIds[0]!;
    expect(wordById(about)?.grade).toBe("G3");
    expect(wordById(later)?.grade).toBe("G5");
    const chapterOnly = wordsOf(["bridge", "treasure", "protect", about]);
    const fromChapter = quizForWord("bridge", 1, "zh-to-en", chapterOnly);
    expect(fromChapter.choices.map((choice) => choice.id).sort()).toEqual(["bridge", "protect", "treasure"]);
    const oneChapterWord = wordsOf(["bridge", "treasure", about, later]);
    const mixed = quizForWord("bridge", 4, "zh-to-en", oneChapterWord);
    expect(mixed.choices.map((choice) => choice.id)).toContain("treasure");
    expect(mixed.choices).toHaveLength(MEANING_CHOICE_COUNT);
    const outsider = mixed.choices.map((choice) => choice.id).filter((id) => id !== "bridge" && id !== "treasure");
    expect(outsider).toHaveLength(1);
    expect([about, later]).toContain(outsider[0]);
  });

  it("gives forest grade-3 bridge, path, and brave three unique choices", () => {
    const save = fresh(["G3"]);
    expect(battleWordIds(save)).toEqual(FOREST_G3_POOL);
    const pool = wordsOf(unlockedWordIds(save));
    expect(pool.map((word) => word.id)).toEqual(FOREST_G3_POOL);
    for (const id of ["bridge", "path", "brave"] as const) {
      for (const direction of ["zh-to-en", "en-to-zh", "listen-to-zh"] as const) {
        const quiz = quizForWord(id, 1, direction, pool);
        assertChoice(quiz);
        expect(quiz.choices.every((choice) => FOREST_G3_POOL.includes(choice.id))).toBe(true);
      }
    }
    const path = quizForWord("path", 1, "zh-to-en", pool);
    expect(path.choices.map((choice) => choice.id)).toContain("brave");
    const bridge = quizForWord("bridge", 1, "zh-to-en", pool);
    expect(bridge.choices.map((choice) => choice.id).filter((id) => wordById(id)?.grade === "G4")).toEqual(["bridge"]);
  });

  it("does not learn a distractor or open a card when the child picks it", () => {
    const save = fresh(["G3"]);
    const starter = starterSkillId("warrior");
    let state = startBattle({
      encounterId: "inkling",
      classId: "warrior",
      learnedIds: ["tree"],
      equippedSkillIds: [starter],
      skillLevels: { [starter]: 1 },
      seed: 1,
      allowedWordIds: battleWordIds(save),
      distractorIds: unlockedWordIds(save),
      enemy: { name: "墨团", maxHp: 99999, attack: 0, sprite: "inkling" },
    });
    const seen = new Set<string>();
    for (let turn = 0; turn < 48 && seen.size < 3; turn += 1) {
      const acted = takeAction(state, { type: "attack" });
      expect(acted.ok).toBe(true);
      state = acted.state;
      const question = state.question;
      expect(question?.kind).not.toBe("spelling");
      if (!question || question.kind === "spelling") break;
      expect(question.choices).toHaveLength(MEANING_CHOICE_COUNT);
      const wrong = question.choices.find((choice) => choice.id !== question.answerId);
      expect(wrong).toBeTruthy();
      const asked = question.wordId;
      state = answerQuestion(state, wrong!.id);
      expect(state.learnedIds).toEqual(["tree"]);
      expect(state.answers.at(-1)).toMatchObject({ wordId: asked, correct: false });
      if (asked === "bridge" || asked === "path" || asked === "brave") seen.add(asked);
    }
    expect([...seen].sort()).toEqual(["brave", "bridge", "path"]);
  });

  it("keeps every chapter question full for all 15 grade selections", () => {
    expect(combos()).toHaveLength(15);
    const pools = createHash("sha256");
    let questions = 0;
    for (const grades of combos()) {
      const opened = unlockAll(fresh(grades));
      const closed = fresh(grades);
      for (const chapter of visibleChapters(grades)) {
        const asked = battleWordIds({ ...opened, currentChapterId: chapter.id });
        expect(battleWordIds({ ...closed, currentChapterId: chapter.id })).toEqual(asked);
        pools.update(`${grades.join("+")}|${chapter.id}|${asked.join(",")}\n`);
        for (const standing of [opened, closed]) {
          const pool = wordsOf(unlockedWordIds({ ...standing, currentChapterId: chapter.id }));
          for (const id of asked) {
            questions += standing === opened ? 1 : 0;
            for (const direction of ["zh-to-en", "en-to-zh"] as const) {
              assertChoice(quizForWord(id, 7, direction, pool));
            }
          }
        }
      }
    }
    expect(questions).toBe(7024);
    expect(pools.digest("hex")).toBe(POOL_HASH);
  });

  it("leaves exam choice lists and a one-card exam question unchanged", () => {
    const hash = createHash("sha256");
    let examQuestions = 0;
    for (const exam of EXAMS) {
      let save = fresh([exam.grade]);
      const ids = exam.chapters.flatMap((id) => gradeChapters(exam.grade).find((chapter) => chapter.id === id)?.wordIds ?? []);
      for (const id of ids) save = learnWord(save, id, new Date(1_700_000_000_000));
      const cards = examCardPool(save, exam, new Date(1_700_100_000_000), gradeIsOpen);
      const defs = wordsOf(cards.map((card) => card.id));
      for (const card of cards) {
        for (const direction of ["zh-to-en", "en-to-zh"] as const) {
          const quiz = quizForWord(card.id, 11, direction, defs);
          examQuestions += 1;
          expect(quiz.choices).toHaveLength(MEANING_CHOICE_COUNT);
          hash.update(`${exam.id}|${card.id}|${direction}|${quiz.choices.map((choice) => choice.id).join(",")}\n`);
        }
      }
    }
    expect(examQuestions).toBe(2526);
    expect(hash.digest("hex")).toBe(EXAM_CHOICE_HASH);
    const next = wordById("next");
    expect(next).toBeTruthy();
    const single = quizForWord(next!.id, 1, "zh-to-en", [next!]);
    expect(single.choices.map((choice) => choice.id)).toEqual([next!.id]);
  });
});
