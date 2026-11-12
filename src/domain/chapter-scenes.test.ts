import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stageCombatFor, type PlayChapter } from "./chapter-plan";
import {
  CHAPTER_MINION_ID,
  CHAPTER_SCENE_GROUP,
  JOURNEY_NIGHT_CHAPTERS,
  SCENE_GROUP_IDS,
  chapterBackdrop,
  chapterMinion,
  journeyNightUrls,
} from "./chapter-scenes";
import { PROVISIONAL } from "./provisional";
import { FOREST_CHAPTER, stageById, stageCombat } from "./stages";

interface LedgerFile {
  groupId: string;
  role: string;
  referenced: boolean;
  sourceSha256: string;
  repoPath: string;
  repoSha256: string;
  recompressed: boolean;
}

interface LedgerChapter {
  chapterId: string;
  groupId: string;
  minionId: string;
}

interface Ledger {
  chapters: LedgerChapter[];
  files: LedgerFile[];
  minionFiles?: LedgerFile[];
}

const ledger = JSON.parse(readFileSync(new URL("./chapters/scene-asset-ledger.json", import.meta.url), "utf8")) as Ledger;
const chapterFile = JSON.parse(readFileSync(new URL("./chapters/chapters_v0.2.json", import.meta.url), "utf8")) as {
  chapter_id: string;
}[];

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(new URL(`../../${path}`, import.meta.url))).digest("hex");
}

describe("chapter scene groups", () => {
  it("resolves all 31 grade chapters to a background that is in the repo", () => {
    const gradeIds = chapterFile.map((chapter) => chapter.chapter_id).filter((id) => id !== FOREST_CHAPTER.chapter_id);
    expect(gradeIds).toHaveLength(31);
    expect(Object.keys(CHAPTER_SCENE_GROUP).sort()).toEqual([...gradeIds].sort());
    expect(ledger.chapters.map((chapter) => chapter.chapterId).sort()).toEqual([...gradeIds].sort());
    const referenced = new Set(ledger.files.filter((file) => file.referenced).map((file) => file.repoPath));
    for (const id of gradeIds) {
      const backdrop = chapterBackdrop(id);
      expect(SCENE_GROUP_IDS).toContain(backdrop.groupId);
      expect(backdrop.groupId).toBe(CHAPTER_SCENE_GROUP[id]);
      expect(referenced.has(`public/${backdrop.mapUrl}`)).toBe(true);
      expect(referenced.has(`public/${backdrop.battleUrl}`)).toBe(true);
      expect(sha256(`public/${backdrop.mapUrl}`)).toBe(ledger.files.find((file) => file.repoPath === `public/${backdrop.mapUrl}`)!.repoSha256);
      expect(sha256(`public/${backdrop.battleUrl}`)).toBe(ledger.files.find((file) => file.repoPath === `public/${backdrop.battleUrl}`)!.repoSha256);
    }
  });

  it("keeps the forest on the existing map and battle art", () => {
    const forest = chapterBackdrop(FOREST_CHAPTER.chapter_id);
    expect(forest).toEqual({
      groupId: "forest",
      mapKey: "bg_map",
      mapUrl: "assets/warm/backgrounds/bg_map_forest_2x.webp",
      battleKey: "bg_forest",
      battleUrl: "assets/warm/backgrounds/bg_forest_battle_2x.webp",
    });
    expect(CHAPTER_SCENE_GROUP[FOREST_CHAPTER.chapter_id]).toBeUndefined();
  });

  it("follows the v1.0.1 journey day and night assignment", () => {
    const nights = journeyNightUrls();
    expect(nights).toEqual([
      "assets/chapter/scenes/journey/bg_map_night.webp",
      "assets/chapter/scenes/journey/bg_battle_night.webp",
    ]);
    expect([...JOURNEY_NIGHT_CHAPTERS]).toEqual(["pep_g6_01", "pep_g6_04"]);
    for (const file of ledger.files) {
      expect(file.referenced).toBe(true);
      expect(file.recompressed).toBe(false);
      expect(file.repoSha256).toBe(file.sourceSha256);
      expect(sha256(file.repoPath)).toBe(file.repoSha256);
    }
    for (const id of JOURNEY_NIGHT_CHAPTERS) {
      const backdrop = chapterBackdrop(id);
      expect(backdrop.mapUrl).toBe(nights[0]);
      expect(backdrop.battleUrl).toBe(nights[1]);
      expect(backdrop.mapKey).toBe("chapter_map_journey_night");
      expect(backdrop.battleKey).toBe("chapter_battle_journey_night");
    }
    for (const id of Object.keys(CHAPTER_SCENE_GROUP)) {
      if ((JOURNEY_NIGHT_CHAPTERS as readonly string[]).includes(id)) continue;
      const backdrop = chapterBackdrop(id);
      expect(nights).not.toContain(backdrop.mapUrl);
      expect(nights).not.toContain(backdrop.battleUrl);
    }
    const day = chapterBackdrop("pep_g6_06");
    expect(day.mapUrl).toBe("assets/chapter/scenes/journey/bg_map_day.webp");
    expect(day.battleUrl).toBe("assets/chapter/scenes/journey/bg_battle_day.webp");
    expect(day.mapKey).toBe("chapter_map_journey_day");
    expect(day.mapKey).not.toBe(chapterBackdrop("pep_g6_01").mapKey);
  });

  it("does not add chapter scenes to the boot scene", () => {
    const boot = readFileSync(new URL("../game/scenes/BootScene.ts", import.meta.url), "utf8");
    const budget = readFileSync(new URL("../../tools/boot-budget.mjs", import.meta.url), "utf8");
    expect(boot).not.toContain("chapter/scenes");
    expect(boot).not.toContain("bg_map_home");
    expect(budget).not.toContain("chapter/scenes");
    expect(boot).toContain("bg_home");
    expect(boot).toContain("bg_village");
    expect(boot).not.toContain("atlas_monsters_scenes");
    expect(budget).not.toContain("atlas_monsters_scenes");
  });

  it("resolves all 31 grade chapters to a minion whose frames are in the stored atlas", () => {
    const gradeIds = chapterFile.map((chapter) => chapter.chapter_id).filter((id) => id !== FOREST_CHAPTER.chapter_id);
    expect(Object.keys(CHAPTER_MINION_ID).sort()).toEqual([...gradeIds].sort());
    const minionFiles = ledger.minionFiles ?? [];
    expect(minionFiles.map((file) => file.repoPath).sort()).toEqual([
      "public/assets/chapter/scenes/minions/atlas_monsters_scenes.json",
      "public/assets/chapter/scenes/minions/atlas_monsters_scenes.png",
      "public/assets/chapter/scenes/minions/atlas_monsters_scenes_2.json",
      "public/assets/chapter/scenes/minions/atlas_monsters_scenes_2.png",
    ]);
    for (const file of minionFiles) {
      expect(sha256(file.repoPath)).toBe(file.repoSha256);
      if (file.repoPath.endsWith(".png")) expect(file.recompressed).toBe(true);
      else {
        expect(file.recompressed).toBe(false);
        expect(file.repoSha256).toBe(file.sourceSha256);
      }
    }
    const framesByAtlas = new Map<string, Set<string>>();
    for (const file of minionFiles.filter((item) => item.repoPath.endsWith(".json"))) {
      const atlas = JSON.parse(readFileSync(new URL(`../../${file.repoPath}`, import.meta.url), "utf8")) as { frames: Record<string, unknown> };
      framesByAtlas.set(file.repoPath, new Set(Object.keys(atlas.frames)));
    }
    for (const id of gradeIds) {
      const minion = chapterMinion(id);
      const listed = ledger.chapters.find((chapter) => chapter.chapterId === id);
      expect(minion.id).toBe(CHAPTER_MINION_ID[id]);
      expect(minion.id).toBe(listed?.minionId);
      expect(minion.atlasKey).not.toBe("atlas_monsters");
      const frames = framesByAtlas.get(`public/${minion.dataUrl}`);
      expect(frames?.has(minion.idleFrame)).toBe(true);
      expect(frames?.has(minion.hitFrame)).toBe(true);
    }
    expect(chapterMinion("pep_g3_01").atlasKey).toBe("atlas_monsters_scenes");
    expect(chapterMinion("pep_g5_07").atlasKey).toBe("atlas_monsters_scenes_2");
  });

  it("keeps the forest minion and the chapter boss sprite", () => {
    expect(chapterMinion(FOREST_CHAPTER.chapter_id)).toMatchObject({
      id: "inkling",
      atlasKey: "atlas_monsters",
      idleFrame: "monster_inkling_idle",
      hitFrame: "monster_inkling_hit",
    });
    expect(CHAPTER_MINION_ID[FOREST_CHAPTER.chapter_id]).toBeUndefined();
    const exploration = stageById(1)!;
    const boss = stageById(5)!;
    expect(stageCombat(exploration, "warrior").sprite).toBe("inkling");
    const forest = { id: FOREST_CHAPTER.chapter_id, bossName: "林心守护者" } as PlayChapter;
    const home = { id: "pep_g3_01", bossName: "全家福守护者" } as PlayChapter;
    expect(stageCombatFor(forest, exploration, "warrior").sprite).toBe("inkling");
    expect(stageCombatFor(home, exploration, "warrior").sprite).toBe("cushion");
    expect(stageCombatFor(home, boss, "mage").sprite).toBe(PROVISIONAL.chapterEnding.bossSprite);
    expect(stageCombat(boss, "mage", "cushion").sprite).toBe(PROVISIONAL.chapterEnding.bossSprite);
  });
});
