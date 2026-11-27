import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import {
  activeChapter,
  forestPlayChapter,
  gradeChapters,
  independentForestId,
  isChapterUnlocked,
  playStatuses,
  visibleChapters,
} from "./chapter-plan";
import {
  academyForestChapter,
  battleReturn,
  commitBattleEntry,
  confirmLearnSelection,
  legalLearnChapters,
} from "./chapter-route";
import { learnCardsDoneCopy } from "./learn-batch";
import { importNewProfile, loadProfile, type ByteStore } from "./profiles";
import { createSave, learnWord } from "./progress";
import { chapterWordIds } from "./stages";
import { deserialize, serialize } from "./storage";
import type { GradeBand, SaveData } from "./types";

const START = new Date("2026-03-01T02:00:00Z");
const GRADES = ["G3", "G4", "G5", "G6"] as const;

function fresh(grades: readonly string[]): SaveData {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades,
  });
}

function memoryStore(): ByteStore {
  const data = new Map<string, string>();
  return {
    get(key) {
      return data.has(key) ? data.get(key) ?? null : null;
    },
    set(key, value) {
      data.set(key, value);
    },
    remove(key) {
      data.delete(key);
    },
  };
}

describe("independent forest chapter", () => {
  it("is absent from battle navigation and cannot be entered", () => {
    for (const grades of [[], ["G3"], ["G6", "G3"], ["G3", "G4", "G5", "G6"]] as const) {
      const ids = visibleChapters(grades).map((chapter) => chapter.id);
      expect(ids).not.toContain("forest_adventure");
      expect(new Set(ids).size).toBe(ids.length);
    }
    const save = fresh(["G3", "G5"]);
    expect(isChapterUnlocked(save, forestPlayChapter())).toBe(false);
    expect(commitBattleEntry(save, forestPlayChapter())).toBe(save);
    expect(commitBattleEntry(save, academyForestChapter("G3"))).toBe(save);
    const back = battleReturn({ ...save, currentChapterId: "forest_adventure" });
    expect(back.kind).toBe("pick-grade");
    if (back.kind === "pick-grade") expect(back.grades).toEqual(["G3", "G5"]);
    const only = battleReturn({ ...fresh(["G4"]), currentChapterId: "forest_adventure" });
    expect(only).toMatchObject({
      kind: "ready",
      grade: "G4",
      spot: { chapter: expect.objectContaining({ id: gradeChapters("G4")[0]!.id }) },
    });
    if (only.kind === "ready") expect(only.spot.chapter.id).not.toBe("forest_adventure");
    expect(activeChapter({ ...save, currentChapterId: "forest_adventure" }).id).toBe(gradeChapters("G3")[0]!.id);
  });

  it("keeps each grade's first lesson and first battle chapter, with the same words", () => {
    for (const grade of GRADES) {
      const save = fresh([grade]);
      const lesson = legalLearnChapters(save, grade);
      const battle = gradeChapters(grade);
      const firstBattle = battle[0]!;
      const second = battle[1]!;
      expect(lesson.map((chapter) => chapter.id)).toEqual(battle.map((chapter) => chapter.id));
      expect(lesson.some((chapter) => chapter.id === "forest_adventure")).toBe(false);
      expect(lesson[0]).toMatchObject({ id: firstBattle.id, grade });
      expect(lesson[0]?.wordIds).toEqual(firstBattle.wordIds);
      expect(firstBattle.wordIds.length).toBeGreaterThanOrEqual(3);
      expect(isChapterUnlocked(save, firstBattle)).toBe(true);
      expect(isChapterUnlocked(save, second)).toBe(false);
      expect(playStatuses(save, firstBattle).some((status) => status === "open")).toBe(true);
      expect(playStatuses(save, second).every((status) => status === "locked")).toBe(true);
      const done = { ...save, chapterProgress: { [firstBattle.id]: { cleared: true, stageWins: { "5": 1 } } } };
      expect(isChapterUnlocked(done, second)).toBe(true);
      expect(isChapterUnlocked({ ...done, chapterCleared: false }, battle[2]!)).toBe(false);
    }
  });

  it("returns an old forest save to a real chapter without dropping records or granting rewards", () => {
    let parked = learnWord(fresh(["G3", "G6"]), "tree", START);
    parked = learnWord(parked, "brave", START);
    parked = {
      ...parked,
      currentChapterId: "forest_adventure",
      chapterCleared: true,
      stageWins: { "1": 1, "5": 1 },
      clearRewardClaimed: true,
      masteryMilestonesClaimed: ["forest-half"],
      unlockedCosmeticIds: ["forest_wreath"],
      unlockedTitleIds: ["title_forest_trekker"],
      rewardQueue: [{ id: "kept", title: "外观奖励", detail: "已经发过" }],
      wordCards: {
        ...parked.wordCards,
        tree: { ...parked.wordCards.tree!, masteryBadge: true },
      },
    };
    const before = serialize(parked);
    const entry = battleReturn(parked);
    expect(entry.kind).toBe("pick-grade");
    expect(serialize(parked)).toBe(before);
    expect(parked.wordCards.tree?.masteryBadge).toBe(true);
    expect(parked.memory.brave?.wordId).toBe("brave");
    const braveReviews = parked.memory.brave?.reviewInstants ?? [];
    expect(braveReviews.length).toBeGreaterThan(0);
    expect(parked.clearRewardClaimed).toBe(true);
    expect(parked.masteryMilestonesClaimed).toEqual(["forest-half"]);
    expect(parked.unlockedCosmeticIds).toEqual(["forest_wreath"]);
    expect(parked.rewardQueue).toHaveLength(1);
    expect(parked.chapterCleared).toBe(true);
    const loaded = deserialize(before);
    expect(loaded?.currentChapterId).toBe("forest_adventure");
    expect(loaded?.wordCards.tree?.masteryBadge).toBe(true);
    expect(loaded?.memory.brave?.wordId).toBe("brave");
    expect(loaded?.memory.brave?.reviewInstants).toEqual(braveReviews);
    expect(loaded?.clearRewardClaimed).toBe(true);
    expect(loaded?.rewardQueue).toEqual(parked.rewardQueue);
    expect(loaded?.stageWins).toEqual({ "1": 1, "5": 1 });
    expect(activeChapter(loaded!).grade).not.toBe("mixed");
    expect(isChapterUnlocked(loaded!, gradeChapters("G3")[1]!)).toBe(false);
    expect(isChapterUnlocked(loaded!, gradeChapters("G6")[0]!)).toBe(true);
    const lesson = learnCardsDoneCopy(loaded!, forestPlayChapter());
    expect(lesson.primary).toBe("chapters");
    expect(lesson.mapChapterId).toBeUndefined();
  });

  it("imports a forest save beside another character and leaves both records intact", () => {
    const store = memoryStore();
    const forest = {
      ...fresh(["G5"]),
      currentChapterId: "forest_adventure",
      chapterCleared: false,
    };
    forest.wordCards = {
      map: { wordId: "map", collectedAt: START.getTime(), masteryBadge: false },
    };
    const other = fresh(["G6"]);
    other.player = { ...other.player, name: "Momo" };
    other.wordCards = { sun: { wordId: "sun", collectedAt: START.getTime(), masteryBadge: true } };
    const first = importNewProfile(store, serialize(forest), START.getTime());
    const second = importNewProfile(store, serialize(other), START.getTime() + 1);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok || !("slotId" in first) || !("slotId" in second)) throw new Error("import");
    const loadedForest = loadProfile(store, first.slotId);
    const loadedOther = loadProfile(store, second.slotId);
    expect(loadedForest?.player.name).toBe("小林");
    expect(loadedForest?.wordCards.map?.collectedAt).toBe(START.getTime());
    expect(loadedForest?.currentChapterId).toBe("forest_adventure");
    expect(loadedForest?.chapterCleared).toBe(false);
    const returned = battleReturn(loadedForest!);
    expect(returned.kind).toBe("ready");
    if (returned.kind !== "ready") throw new Error("return");
    expect(returned.spot.chapter.id).toBe(gradeChapters("G5")[0]!.id);
    expect(independentForestId(returned.spot.chapter.id)).toBe(false);
    expect(loadedOther?.wordCards.sun?.masteryBadge).toBe(true);
    expect(loadedOther?.wordCards.map).toBeUndefined();
    expect(loadedForest?.wordCards.sun).toBeUndefined();
    expect(loadProfile(store, second.slotId)?.player.name).toBe(other.player.name);
  });

  it("teaches every forest word from one grade chapter and does not drop a card", () => {
    const home: Record<string, string> = {
      big: "pep_g3_01",
      bird: "pep_g3_02",
      fish: "pep_g3_02",
      tree: "pep_g3_03",
      sun: "pep_g3_03",
      flower: "pep_g3_03",
      red: "pep_g3_03",
      map: "pep_g3_08",
      bridge: "pep_g4_02",
      rain: "pep_g4_03",
      weather: "pep_g4_03",
      run: "pep_g4_05",
      jump: "pep_g5_01",
      brave: "pep_g5_01",
      river: "pep_g5_04",
      forest: "pep_g5_04",
      mountain: "pep_g5_04",
      dangerous: "pep_g5_04",
      path: "pep_g5_04",
      explore: "pep_g5_09",
      village: "pep_g6_01",
      climb: "pep_g6_01",
      treasure: "pep_g6_01",
      adventure: "pep_g6_01",
      cloud: "pep_g6_04",
      discover: "pep_g6_04",
      protect: "pep_g6_04",
      journey: "pep_g6_06",
    };
    expect(Object.keys(home)).toHaveLength(28);
    const found = new Map<string, string>();
    for (const grade of GRADES) {
      for (const chapter of legalLearnChapters(fresh([grade]), grade)) {
        expect(chapter.id).not.toBe("forest_adventure");
        for (const id of chapter.wordIds) {
          if (!chapterWordIds().includes(id)) continue;
          expect(found.has(id), id).toBe(false);
          found.set(id, chapter.id);
        }
      }
    }
    expect([...found.keys()].sort()).toEqual(chapterWordIds().slice().sort());
    for (const [id, chapterId] of Object.entries(home)) expect(found.get(id)).toBe(chapterId);
    const onlyG3 = legalLearnChapters(fresh(["G3"]), "G3").flatMap((chapter) => chapter.wordIds);
    expect(onlyG3).toEqual(expect.arrayContaining(["big", "bird", "fish", "tree", "sun", "flower", "red", "map"]));
    expect(onlyG3).not.toContain("bridge");
    expect(onlyG3).not.toContain("explore");
    const onlyG4 = legalLearnChapters(fresh(["G4"]), "G4").flatMap((chapter) => chapter.wordIds);
    expect(onlyG4).toEqual(expect.arrayContaining(["bridge", "rain", "weather", "run"]));
    expect(onlyG4).not.toContain("bird");
    let learned = learnWord(fresh(["G3"]), "bridge", START);
    const card = learned.wordCards.bridge;
    const claimed = learned.clearRewardClaimed;
    const queue = learned.rewardQueue;
    learned = { ...learned, selectedGrades: ["G3"] };
    expect(learned.wordCards.bridge).toEqual(card);
    expect(learnWord(learned, "bridge", START)).toBe(learned);
    expect(learned.clearRewardClaimed).toBe(claimed);
    expect(learned.rewardQueue).toEqual(queue);
    expect(confirmLearnSelection(learned, "G3", "forest_adventure")).toBe(learned);
    const added = fresh(["G3", "G4"]);
    expect(legalLearnChapters(added, "G4").flatMap((chapter) => chapter.wordIds)).toContain("bridge");
    expect(isChapterUnlocked({ ...fresh(["G3"]), chapterCleared: true }, gradeChapters("G3")[1]!)).toBe(false);
  });

  it("does not point the map or battle scenes at a forest fight", () => {
    const map = readFileSync(new URL("../game/scenes/StageMapScene.ts", import.meta.url), "utf8");
    const battle = readFileSync(new URL("../game/scenes/BattleScene.ts", import.meta.url), "utf8");
    const guide = readFileSync(new URL("../game/scenes/GuideScene.ts", import.meta.url), "utf8");
    const learn = readFileSync(new URL("../game/scenes/LearnScene.ts", import.meta.url), "utf8");
    expect(learn).not.toContain('?? "forest_adventure"');
    expect(learn).not.toContain("forest_adventure");
    expect(map).not.toContain('viewChapterId = "forest_adventure"');
    expect(map).toContain("independentForestId");
    expect(battle).not.toContain('battleChapterId = "forest_adventure"');
    expect(battle).toContain("independentForestId(this.launch.chapterId)");
    expect(guide).not.toContain("森林冒险");
    expect(chapterWordIds()).toHaveLength(28);
    for (const grade of GRADES) {
      expect(gradeChapters(grade as GradeBand)[0]!.wordIds.length).toBeGreaterThan(0);
    }
  });
});
