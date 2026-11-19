import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { bossGateStudy, buildResultsView } from "./battle-results";
import { wordById } from "./catalog";
import {
  academyForestChapter,
  academyForestWordIds,
  assessLearnSelection,
  openAcademyForStage,
} from "./chapter-route";
import {
  chapterBossReady,
  forestPlayChapter,
  gradeChapters,
  isChapterUnlocked,
  playStatuses,
} from "./chapter-plan";
import { chapterLearnScope, learnBatchView, learnCardsDoneCopy } from "./learn-batch";
import { mapPanel } from "./map-panel";
import { createSave, learnWord, setSelectedGrades } from "./progress";
import { deserialize, serialize } from "./storage";
import { FOREST_CHAPTER, bossReady, forestStudyWordIds, requiredWordIds, stageById, wordsUntilBoss } from "./stages";
import { academyProgressLabel, clipMissingWords, selectedGradesLabel, studyBanner } from "./study-copy";
import type { GradeBand, SaveData } from "./types";

const START = new Date("2026-03-01T02:00:00Z");
const GRADES: GradeBand[] = ["G3", "G4", "G5", "G6"];

function fresh(grades: GradeBand[]): SaveData {
  return setSelectedGrades(
    createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
    }),
    grades,
  );
}

function learnIds(save: SaveData, ids: readonly string[]): SaveData {
  let next = save;
  let at = START.getTime();
  for (const id of ids) {
    let learned = learnWord(next, id, new Date(at));
    if (!learned.wordCards[id]) {
      at += 86_400_000;
      learned = learnWord(next, id, new Date(at));
    }
    next = learned;
  }
  return next;
}

function subsets(grades: readonly GradeBand[]): GradeBand[][] {
  const out: GradeBand[][] = [];
  for (let mask = 1; mask < 2 ** grades.length; mask += 1) {
    out.push(grades.filter((_, index) => (mask & (2 ** index)) !== 0));
  }
  return out;
}

describe("forest study list", () => {
  it("matches the union of each selected grade's academy forest lesson", () => {
    expect(subsets(GRADES)).toHaveLength(15);
    for (const selected of subsets(GRADES)) {
      const seen = new Set<string>();
      const union: string[] = [];
      for (const grade of selected) {
        for (const id of academyForestWordIds(grade)) {
          if (seen.has(id)) continue;
          seen.add(id);
          union.push(id);
        }
      }
      const save = fresh(selected);
      expect(forestStudyWordIds(selected), selected.join("+")).toEqual(union);
      expect(requiredWordIds(save), selected.join("+")).toEqual(union);
      expect(wordsUntilBoss(save)).toBe(union.length);
    }
  });

  it("sends a grade-4 and grade-6 save that only lacks cloud and climb to the grade-6 lesson", () => {
    let save = fresh(["G4", "G6"]);
    save = learnIds(save, requiredWordIds(save).filter((id) => id !== "cloud" && id !== "climb"));
    save = { ...save, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
    expect(wordsUntilBoss(save)).toBe(2);
    expect(bossReady(save)).toBe(false);
    const stage = stageById(4);
    if (!stage) throw new Error("stage 4 missing");
    const opened = openAcademyForStage(save, stage);
    expect(opened.learnSelection).toEqual({ grade: "G6", chapterId: "forest_adventure" });
    const assessed = assessLearnSelection(opened);
    expect(assessed.status).toBe("ready");
    if (assessed.status !== "ready") return;
    const left = assessed.chapter.wordIds.filter((id) => !opened.wordCards[id]);
    expect(left).toEqual(["cloud", "climb"]);
    expect(chapterLearnScope(opened, { ...assessed.chapter, wordIds: ["cloud", "climb"] })).toEqual(["cloud", "climb"]);
    expect(assessed.chapter.grade).toBe("G6");
    const cloud = wordById("cloud");
    const climb = wordById("climb");
    expect(cloud && climb).toBeTruthy();
    const study = bossGateStudy(opened);
    expect(study.words).toEqual([`cloud ${cloud!.chinese}`, `climb ${climb!.chinese}`]);
    expect(study.entries).toEqual([
      {
        grade: "G6",
        chapterId: "forest_adventure",
        wordIds: ["cloud", "climb"],
        label: "去学堂学",
      },
    ]);
    const panel = mapPanel(opened, FOREST_CHAPTER.stages[4]!, "locked");
    expect(panel.missingLines.join("")).toContain(`cloud ${cloud!.chinese}`);
    expect(panel.missingLines.join("")).toContain(`climb ${climb!.chinese}`);
    expect(panel.buttons.find((button) => button.id === "learn")).toMatchObject({
      enabled: true,
      label: "去学堂学",
      grade: "G6",
      wordIds: ["cloud", "climb"],
    });
    const view = buildResultsView({
      before: save,
      after: { ...opened, battlesWon: opened.battlesWon + 1 },
      answers: [],
      stageId: 4,
      boss: false,
      now: START.getTime(),
    });
    expect(view.bossGateLine).toContain("还有 2 个没在学堂学过");
    expect(view.bossGateWords).toEqual(study.words);
    expect(view.bossStudy.map((entry) => entry.wordIds)).toEqual([["cloud", "climb"]]);
  });
});

describe("academy chapter progress", () => {
  it("shows a fraction until every card exists, then 已学完", () => {
    const chapter = gradeChapters("G3")[0]!;
    let save = fresh(["G3"]);
    save = { ...save, chapterCleared: true };
    const some = chapter.wordIds.slice(0, 5);
    save = learnIds(save, some);
    expect(academyProgressLabel(save, chapter)).toBe(`5/${chapter.wordIds.length}`);
    save = learnIds(save, chapter.wordIds);
    expect(academyProgressLabel(save, chapter)).toBe("已学完");
  });

  it("counts shared words in the common fraction and waits for the grade words too", () => {
    let save = fresh(["G4", "G6"]);
    save = learnIds(save, academyForestWordIds("G4"));
    const sixth = academyForestChapter("G6");
    expect(academyProgressLabel(save, sixth)).toBe("六年级词 0/3 · 共用 8/8");
    expect(academyProgressLabel(save, sixth)).not.toBe("已学完");
    save = learnIds(save, ["cloud"]);
    expect(academyProgressLabel(save, academyForestChapter("G6"))).toBe("六年级词 1/3 · 共用 8/8");
    save = learnIds(save, academyForestWordIds("G6"));
    expect(academyProgressLabel(save, academyForestChapter("G6"))).toBe("已学完");
  });
});

describe("studied chapters open their five stages without a new save field", () => {
  it("opens the boss with an empty win list and leaves the next chapter locked", () => {
    const chapter = gradeChapters("G3")[0]!;
    const next = gradeChapters("G3")[1]!;
    let save = fresh(["G3"]);
    save = { ...save, chapterCleared: true, currentChapterId: chapter.id };
    const beforeKeys = Object.keys(JSON.parse(serialize(save)) as object).sort();
    save = learnIds(save, chapter.wordIds);
    expect(playStatuses(save, chapter)).toEqual(["open", "open", "open", "open", "open"]);
    expect(chapterBossReady(save, chapter.id)).toBe(true);
    expect(save.chapterProgress?.[chapter.id]).toBeUndefined();
    expect(isChapterUnlocked(save, next)).toBe(false);
    expect(playStatuses(save, next).every((status) => status === "locked")).toBe(true);
    const loaded = deserialize(serialize(save));
    const sampleId = chapter.wordIds[0]!;
    expect(loaded?.wordCards[sampleId]?.wordId).toBe(sampleId);
    expect(Object.keys(loaded?.wordCards ?? {}).every((id) => !id.includes("+"))).toBe(true);
    expect(Object.keys(JSON.parse(serialize(loaded!)) as object).sort()).toEqual(beforeKeys);
    const mixed = { ...save, learnSelection: { grade: "mixed" as const, chapterId: "forest_adventure" } };
    expect(assessLearnSelection(mixed).status).toBe("reselect");
    expect(mixed.wordCards).toBe(save.wordCards);
  });
});

describe("academy settlement", () => {
  it("uses four mutually exclusive lines", () => {
    let gap = fresh(["G4", "G6"]);
    gap = learnIds(gap, academyForestWordIds("G4"));
    const fourth = learnCardsDoneCopy(gap, academyForestChapter("G4"));
    expect(fourth.message).toContain("四年级的词学完了");
    expect(fourth.message).toContain("cloud");
    expect(fourth.message).toContain("climb");
    expect(fourth.message).not.toContain("通关");
    expect(fourth.primaryLabel).toBe("去六年级学");
    expect(fourth.wordIds).toEqual(expect.arrayContaining(["cloud", "climb"]));
    expect(fourth.primary).toBe("grade");

    const forest = learnIds(fresh(["G3"]), requiredWordIds(fresh(["G3"])));
    const ready = learnCardsDoneCopy(forest, forestPlayChapter());
    expect(ready.message).toBe("本章词都学会了！去对战挑战林心守护者吧");
    expect(ready.primaryLabel).toBe("去挑战 Boss");
    expect(ready.focusBoss).toBe(true);

    const first = gradeChapters("G3")[0]!;
    const locked = learnIds(fresh(["G3"]), first.wordIds);
    const waiting = learnCardsDoneCopy(locked, first);
    expect(waiting.message).toBe("本章词都学会了。对战里先打完森林冒险，这一章才能挑战。");
    expect(waiting.primaryLabel).toBe("去对战");
    expect(waiting.mapChapterId).toBe("forest_adventure");
    expect(waiting.focusBoss).toBe(false);

    const cleared = learnCardsDoneCopy({ ...forest, chapterCleared: true }, forestPlayChapter());
    expect(cleared.message).toBe("本章词卡已学完。");
    expect(cleared.primaryLabel).toBe("返回选择章节");
    expect(cleared.primary).toBe("chapters");
    expect(learnBatchView(forest, [], [], forestPlayChapter()).message).toBe(ready.message);
    expect(JSON.stringify(waiting)).not.toContain("通关");
  });
});

describe("study banner", () => {
  it("names the grade and chapter, then one encouragement for each state", () => {
    const none = fresh(["G3"]);
    expect(studyBanner(none, forestPlayChapter()).title).toBe("三年级 · 森林冒险：已学 0/16 个词");
    expect(studyBanner(none, forestPlayChapter()).encourage).toBe("还有 16 个没在学堂学过");

    let pair = fresh(["G4", "G6"]);
    pair = learnIds(pair, requiredWordIds(pair).filter((id) => id !== "run" && id !== "rain" && id !== "weather"));
    expect(studyBanner(pair, forestPlayChapter()).encourage).toBe("还有 3 个没在学堂学过。去四年级学。");

    const second = gradeChapters("G3")[1]!;
    const locked = fresh(["G3"]);
    expect(studyBanner(locked, second).encourage).toBe(`还有 ${second.wordIds.length} 个没在学堂学过。对战里要先打完上一章。`);

    const done = learnIds(fresh(["G3"]), requiredWordIds(fresh(["G3"])));
    expect(studyBanner(done, forestPlayChapter()).encourage).toBe("本章全学会了，真棒！");
    expect(studyBanner({ ...done, chapterCleared: true }, forestPlayChapter()).encourage).toBe("这一章打完啦，真棒！");
    expect(studyBanner({ ...done, chapterCleared: true }, forestPlayChapter()).title).toBe("三年级 · 森林冒险：已学 16/16 个词");

    const several = fresh(["G3", "G4"]);
    expect(studyBanner(several, forestPlayChapter()).title).toBe("三、四年级 · 森林冒险：已学 0/19 个词");
    expect(studyBanner(pair, forestPlayChapter()).title).toMatch(/^四、六年级 · 森林冒险：已学 \d+\/14 个词$/);
    const all = fresh(["G3", "G4", "G5", "G6"]);
    expect(selectedGradesLabel(all.selectedGrades)).toBe("三、四、五、六年级");
    expect(studyBanner(all, forestPlayChapter()).title).toBe("三、四、五、六年级 · 森林冒险：已学 0/28 个词");
  });
});

describe("one academy entry for every selected grade", () => {
  it("keeps a single learn button for one through four grades and clips a long word list", () => {
    const stage = FOREST_CHAPTER.stages[4]!;
    const sets: GradeBand[][] = [["G3"], ["G4", "G6"], ["G3", "G4", "G5"], ["G3", "G4", "G5", "G6"]];
    for (const grades of sets) {
      const save = fresh(grades);
      const panel = mapPanel(save, stage, "locked");
      const learn = panel.buttons.filter((button) => button.id === "learn");
      expect(learn, grades.join("+")).toHaveLength(1);
      expect(learn[0]?.enabled).toBe(true);
      expect(panel.buttons.at(-1)?.id).toBe("fight");
      expect(panel.buttons.at(-1)?.enabled).toBe(false);
      const study = bossGateStudy(save);
      expect(study.entries, grades.join("+")).toHaveLength(1);
      expect(study.entries[0]?.wordIds).toEqual(learn[0]?.wordIds);
      expect(study.entries[0]?.wordIds).not.toContain("cloud");
    }
    const four = fresh(["G3", "G4", "G5", "G6"]);
    const study = bossGateStudy(four);
    expect(study.entries[0]?.grade).toBe("G3");
    expect(study.entries[0]?.label).toBe("去三年级学");
    expect(study.entries[0]?.wordIds).toContain("tree");
    const clipped = clipMissingWords([study.words.join("、")], 48);
    expect(clipped.length).toBeGreaterThan(0);
    expect(clipped.join("")).toContain("还有");
    expect([...clipped[0]!].length).toBeLessThanOrEqual(48);
  });
});
