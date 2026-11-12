import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_SCENE_GROUP,
  SCENE_GROUP_IDS,
  chapterBackdrop,
  journeyNightUrls,
} from "./chapter-scenes";
import { FOREST_CHAPTER } from "./stages";

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
}

interface Ledger {
  chapters: LedgerChapter[];
  files: LedgerFile[];
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

  it("stores the journey night art and does not point any chapter at it", () => {
    const nights = journeyNightUrls();
    expect(nights).toEqual([
      "assets/chapter/scenes/journey/bg_map_night.webp",
      "assets/chapter/scenes/journey/bg_battle_night.webp",
    ]);
    const nightFiles = ledger.files.filter((file) => !file.referenced);
    expect(nightFiles.map((file) => file.repoPath).sort()).toEqual(nights.map((url) => `public/${url}`).sort());
    for (const file of ledger.files) {
      expect(file.recompressed).toBe(false);
      expect(file.repoSha256).toBe(file.sourceSha256);
      expect(sha256(file.repoPath)).toBe(file.repoSha256);
    }
    for (const id of Object.keys(CHAPTER_SCENE_GROUP)) {
      const backdrop = chapterBackdrop(id);
      expect(nights).not.toContain(backdrop.mapUrl);
      expect(nights).not.toContain(backdrop.battleUrl);
    }
    expect(chapterBackdrop("pep_g6_06").mapUrl).toBe("assets/chapter/scenes/journey/bg_map_day.webp");
    expect(chapterBackdrop("pep_g6_06").battleUrl).toBe("assets/chapter/scenes/journey/bg_battle_day.webp");
  });

  it("does not add chapter scenes to the boot scene", () => {
    const boot = readFileSync(new URL("../game/scenes/BootScene.ts", import.meta.url), "utf8");
    const budget = readFileSync(new URL("../../tools/boot-budget.mjs", import.meta.url), "utf8");
    expect(boot).not.toContain("chapter/scenes");
    expect(boot).not.toContain("bg_map_home");
    expect(budget).not.toContain("chapter/scenes");
    expect(boot).toContain("bg_home");
    expect(boot).toContain("bg_village");
  });
});
