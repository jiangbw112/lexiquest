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
  version: string;
  note: string;
  chapters: LedgerChapter[];
  files: LedgerFile[];
  minionFiles?: (LedgerFile & { sourceSha256: string })[];
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

  it("lets only pep_g6_01 reference the journey night set", () => {
    const nights = journeyNightUrls();
    const dayJourney = ["pep_g5_08", "pep_g5_09", "pep_g6_03", "pep_g6_04", "pep_g6_05", "pep_g6_06"];
    expect(nights).toEqual([
      "assets/chapter/scenes/journey/bg_map_night.webp",
      "assets/chapter/scenes/journey/bg_battle_night.webp",
    ]);
    expect([...JOURNEY_NIGHT_CHAPTERS]).toEqual(["pep_g6_01"]);
    expect(ledger.note).toContain("only pep_g6_01");
    expect(ledger.note).not.toContain("pep_g6_04 uses the journey night");
    for (const file of ledger.files) {
      expect(file.referenced).toBe(true);
      expect(file.recompressed).toBe(false);
      expect(file.repoSha256).toBe(file.sourceSha256);
      expect(sha256(file.repoPath)).toBe(file.repoSha256);
    }
    const night = chapterBackdrop("pep_g6_01");
    expect(night.mapUrl).toBe(nights[0]);
    expect(night.battleUrl).toBe(nights[1]);
    expect(night.mapKey).toBe("chapter_map_journey_night");
    expect(night.battleKey).toBe("chapter_battle_journey_night");
    for (const id of dayJourney) {
      const backdrop = chapterBackdrop(id);
      expect(backdrop.mapUrl).toBe("assets/chapter/scenes/journey/bg_map_day.webp");
      expect(backdrop.battleUrl).toBe("assets/chapter/scenes/journey/bg_battle_day.webp");
      expect(backdrop.mapKey).toBe("chapter_map_journey_day");
      expect(backdrop.battleKey).toBe("chapter_battle_journey_day");
    }
    for (const id of Object.keys(CHAPTER_SCENE_GROUP)) {
      if (id === "pep_g6_01") continue;
      const backdrop = chapterBackdrop(id);
      expect(nights).not.toContain(backdrop.mapUrl);
      expect(nights).not.toContain(backdrop.battleUrl);
    }
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
    expect(ledger.version).toBe("integration_v1.0.2");
    for (const file of minionFiles) {
      expect(sha256(file.repoPath)).toBe(file.repoSha256);
      expect(file.recompressed).toBe(false);
      expect(file.repoSha256).toBe(file.sourceSha256);
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
    expect(stageCombatFor(forest, exploration, "warrior").enemyName).toBe(exploration.name_zh);
    expect(stageCombatFor(home, exploration, "warrior").sprite).toBe("cushion");
    expect(stageCombatFor(home, exploration, "warrior").enemyName).toBe("抱枕灵");
    expect(stageCombatFor({ id: "pep_g3_02", bossName: "温柔小虎灵" } as PlayChapter, exploration, "warrior").enemyName).toBe("爪爪灵");
    expect(stageCombatFor({ id: "pep_g4_07", bossName: "小羊碗筷灵" } as PlayChapter, exploration, "warrior").enemyName).toBe("芽芽灵");
    expect(stageCombatFor({ id: "pep_g3_06", bossName: "铅笔尺子灵" } as PlayChapter, exploration, "warrior").enemyName).toBe("橡皮灵");
    expect(stageCombatFor({ id: "pep_g5_03", bossName: "荷花湖守护者" } as PlayChapter, exploration, "warrior").enemyName).toBe("热气灵");
    expect(stageCombatFor({ id: "pep_g4_02", bossName: "社区守望者" } as PlayChapter, exploration, "warrior").enemyName).toBe("路灯灵");
    expect(stageCombatFor({ id: "pep_g5_07", bossName: "沙丘驼铃灵" } as PlayChapter, exploration, "warrior").enemyName).toBe("风叶灵");
    expect(stageCombatFor({ id: "pep_g5_09", bossName: "旅行地图灵" } as PlayChapter, exploration, "warrior").enemyName).toBe("行囊灵");
    expect(stageCombatFor(home, boss, "mage").sprite).toBe("family_album");
    expect(stageCombatFor(home, boss, "mage").enemyName).toBe("全家福守护者");
    expect(stageCombat(boss, "mage", "cushion").sprite).toBe(PROVISIONAL.chapterEnding.bossSprite);
  });

});

/** Canvas sizes recorded by integration_v1.0.2/atlas_bounds_check.json. */
const MINION_ATLAS_BOUNDS: Record<string, { width: number; height: number; frames: number }> = {
  atlas_monsters_scenes: { width: 2048, height: 1544, frames: 12 },
  atlas_monsters_scenes_2: { width: 1032, height: 1032, frames: 4 },
};

interface MinionFrameCase {
  atlas: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  width: number;
  height: number;
}

function minionFrameCases(): MinionFrameCase[] {
  const cases: MinionFrameCase[] = [];
  for (const [atlas, expected] of Object.entries(MINION_ATLAS_BOUNDS)) {
    const stem = `public/assets/chapter/scenes/minions/${atlas}`;
    const png = readFileSync(new URL(`../../${stem}.png`, import.meta.url));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== expected.width || height !== expected.height) {
      throw new Error(`${atlas} is ${width}x${height}, atlas_bounds_check.json expects ${expected.width}x${expected.height}`);
    }
    const packed = JSON.parse(readFileSync(new URL(`../../${stem}.json`, import.meta.url), "utf8")) as {
      frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    };
    const names = Object.keys(packed.frames);
    if (names.length !== expected.frames) {
      throw new Error(`${atlas} has ${names.length} frames, atlas_bounds_check.json expects ${expected.frames}`);
    }
    for (const name of names) {
      const frame = packed.frames[name]!.frame;
      cases.push({ atlas, name, ...frame, width, height });
    }
  }
  return cases;
}

const minionFrames = minionFrameCases();

describe("minion atlas frames", () => {
  it.each(minionFrames)("$name stays inside $atlas", ({ name, x, y, w, h, width, height }) => {
    expect(name.startsWith("monster_")).toBe(true);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(width);
    expect(y + h).toBeLessThanOrEqual(height);
  });
});
