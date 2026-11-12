import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { skillById } from "./skills";
import { createSave } from "./progress";
import { deserialize, serialize } from "./storage";

const NOW = Date.parse("2026-03-01T02:00:00Z");

function savedBody(classId: unknown, present: boolean) {
  const save = createSave({
    name: "小林",
    classId: "explorer",
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3"],
  });
  save.xp = 40;
  const raw = JSON.parse(serialize(save)) as {
    player: { classId?: unknown; name: string };
    xp: number;
    selectedGrades: string[];
  };
  if (present) raw.player.classId = classId;
  else delete raw.player.classId;
  return JSON.stringify(raw);
}

describe("save class id", () => {
  it("writes a legal class and keeps the rest of the save", () => {
    const created = createSave({
      name: "小林",
      classId: "mage",
      appearance: DEFAULT_APPEARANCE,
      now: NOW,
      grades: ["G3"],
    });
    expect(created.player.classId).toBe("mage");
    const loaded = deserialize(savedBody("mage", true));
    expect(loaded?.player.classId).toBe("mage");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.xp).toBe(40);
    expect(loaded?.selectedGrades).toEqual(["G3"]);
  });

  it("falls back to warrior when classId is missing", () => {
    const loaded = deserialize(savedBody(undefined, false));
    expect(loaded).not.toBeNull();
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.xp).toBe(40);
    expect(loaded?.selectedGrades).toEqual(["G3"]);
  });

  it("falls back to warrior when the saved class is a locked inventor, even if the save claims it is open", () => {
    const claimed = JSON.parse(savedBody("inventor", true)) as {
      finalBossCleared?: boolean;
      unlockedClassIds?: string[];
    };
    claimed.finalBossCleared = true;
    claimed.unlockedClassIds = ["inventor"];
    const loaded = deserialize(JSON.stringify(claimed));
    expect(loaded).not.toBeNull();
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.xp).toBe(40);
    expect(loaded?.selectedGrades).toEqual(["G3"]);
  });

  it("parks an inventor deck and equips the warrior starter when that class is locked", () => {
    const raw = JSON.parse(savedBody("inventor", true)) as {
      equippedSkillIds: string[];
      skillLevels: Record<string, number>;
      unlockedClassIds?: string[];
      inventorUnlockedAt?: number;
      inventorUnlockedBy?: string;
    };
    raw.equippedSkillIds = ["inventor-gear"];
    raw.skillLevels["inventor-gear"] = 2;
    raw.unlockedClassIds = ["inventor"];
    raw.inventorUnlockedAt = 1_700_000_000_000;
    raw.inventorUnlockedBy = "exam_g3_s1_final";
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.equippedByClass?.inventor).toEqual(["inventor-gear"]);
    expect(loaded?.skillLevels["inventor-gear"]).toBe(2);
    expect(loaded?.equippedSkillIds.length).toBeGreaterThan(0);
    expect(loaded?.equippedSkillIds).toContain("warrior-bash");
    expect(skillById("warrior-bash")?.name).toBe("盾击");
    const kept = JSON.parse(serialize(loaded!)) as typeof raw & { equippedByClass: { inventor: string[] } };
    expect(kept.unlockedClassIds).toEqual(["inventor"]);
    expect(kept.inventorUnlockedAt).toBe(1_700_000_000_000);
    expect(kept.inventorUnlockedBy).toBe("exam_g3_s1_final");
    expect(kept.equippedByClass.inventor).toEqual(["inventor-gear"]);
  });

  it("keeps a stored warrior deck when an inventor save falls back", () => {
    const raw = JSON.parse(savedBody("inventor", true)) as {
      equippedSkillIds: string[];
      equippedByClass: { warrior: string[] };
    };
    raw.equippedSkillIds = ["inventor-gear", "inventor-over"];
    raw.equippedByClass = { warrior: ["warrior-shout", "warrior-bash"] };
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.equippedByClass?.inventor).toEqual(["inventor-gear", "inventor-over"]);
    expect(loaded?.equippedSkillIds).toEqual(["warrior-shout", "warrior-bash"]);
  });

  it("falls back to warrior when classId is not one of the six", () => {
    const loaded = deserialize(savedBody("not-a-class", true));
    expect(loaded).not.toBeNull();
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.xp).toBe(40);
    expect(loaded?.selectedGrades).toEqual(["G3"]);
  });

  it("keeps every other legal field when an unknown class id falls back, and does not read unlock fields", () => {
    const save = createSave({
      name: "小林",
      classId: "explorer",
      appearance: DEFAULT_APPEARANCE,
      now: NOW,
      grades: ["G3", "G4"],
    });
    save.wordCards = {
      tree: { wordId: "tree", collectedAt: NOW, masteryBadge: true, masteredAt: NOW, badgeEverOn: true },
    };
    save.memory = {
      tree: {
        wordId: "tree",
        fsrs: { due: "2026-04-01T00:00:00.000Z", stability: 7, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2 },
        reviewInstants: [NOW],
        realReviewDays: ["2026-03-01"],
      },
    };
    save.spellingMemory = {
      tree: {
        wordId: "tree",
        fsrs: { due: "2026-04-02T00:00:00.000Z", stability: 4, difficulty: 6, elapsed_days: 0, scheduled_days: 1, learning_steps: 1, reps: 1, lapses: 0, state: 1 },
        reviewInstants: [NOW + 1],
      },
    };
    save.dailyStats = {
      "2026-03-01": { learnedWordIds: ["tree"], reviewedDueWordIds: [], badgeFirstOnWordIds: ["tree"], badgeRestoredWordIds: [] },
    };
    save.dueAnswers = [{ wordId: "tree", rating: "good", at: NOW, track: "meaning" }];
    save.parentGoalPreset = "more";
    save.dailyGoal = {
      dayKey: "2026-03-01",
      snapshotDue: 4,
      mode: "review",
      targetReview: 4,
      targetLearn: 0,
      targetPractice: 0,
      progressReview: 1,
      progressLearn: 0,
      progressPractice: 0,
      completed: false,
      rewardClaimed: false,
    };
    save.goalDaysTotal = 3;
    save.lastGoalCompletedDayKey = "2026-02-28";
    save.goalCalendar = { "2026-02-28": "completed", "2026-02-27": "missed" };
    save.cosmeticTokens = 2;
    save.lastTimezone = "Asia/Shanghai";
    save.clockAnomaly = false;
    save.skillLevels = { "explorer-staff": 2, "warrior-bash": 1 };
    save.unlockedSkillIds = ["explorer-staff", "explorer-map"];
    save.equippedSkillIds = ["explorer-staff"];
    save.xp = 308;
    save.battlesWon = 4;
    save.battlesLost = 1;
    save.chapterCleared = true;
    save.stageWins = { forest_1: 1, forest_2: 2 };
    save.chapterProgress = { pep_g3_01: { cleared: true, stageWins: { s1: 1 } } };
    save.currentChapterId = "forest";
    save.titles = ["林间行者"];
    save.unlockedCosmeticIds = ["forest_wreath"];
    save.unlockedTitleIds = ["forest_walker"];
    save.equippedCosmeticIds = ["forest_wreath"];
    save.equippedTitleId = "forest_walker";
    save.masteryMilestonesClaimed = ["forest-badge"];
    save.clearRewardClaimed = true;
    save.clockOffsetMs = 0;
    save.rewardQueue = [{ id: "title-forest_walker", title: "称号", detail: "林间行者" }];
    save.replayWinsByDay = { "2026-03-01": 1 };
    save.bestStars = { forest_1: 3 };
    save.ownedOutfitIds = ["traveler", "forest-cape"];
    save.equippedOutfitId = "forest-cape";
    const raw = JSON.parse(serialize(save)) as Record<string, unknown> & { player: { classId: string } };
    raw.player.classId = "knight";
    raw.unlockedClassIds = ["inventor"];
    raw.inventorUnlockedAt = 1_700_000_000_000;
    raw.inventorUnlockedBy = "exam_g6_s2_final";
    raw.examProgress = { exam_g6_s2_final: { cleared: true, bestPhase: 3 } };
    raw.finalBossCleared = true;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded).not.toBeNull();
    const again = JSON.parse(serialize(loaded!)) as typeof raw;
    const changes = changedPaths(raw, again);
    expect(changes).toEqual(["player.classId"]);
    expect(again.player.classId).toBe("warrior");
    expect(again.wordCards).toEqual(raw.wordCards);
    expect(again.memory).toEqual(raw.memory);
    expect(again.chapterCleared).toBe(true);
    expect(again.equippedSkillIds).toEqual(["explorer-staff"]);
    expect(again.titles).toEqual(["林间行者"]);
    expect(again.unlockedClassIds).toEqual(["inventor"]);
    expect(again.examProgress).toEqual(raw.examProgress);
    expect(again.inventorUnlockedAt).toBe(1_700_000_000_000);
    expect(again.finalBossCleared).toBe(true);
  });
});

function changedPaths(before: unknown, after: unknown, path = ""): string[] {
  if (Object.is(before, after)) return [];
  if (typeof before !== "object" || typeof after !== "object" || before === null || after === null) {
    return [path || "$"];
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [path || "$"];
  }
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const out: string[] = [];
  for (const key of keys) {
    out.push(...changedPaths(left[key], right[key], path ? `${path}.${key}` : key));
  }
  return out;
}
