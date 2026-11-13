import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
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
    expect(ledger.version).toBe("integration_v1.0.4");
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

interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MinionFrameCase extends FrameBox {
  atlas: string;
  name: string;
  image: PNG;
}

/** Bounds use the decoded canvas. A frame also needs one pixel whose alpha is not 0. */
function frameFaults(image: PNG, box: FrameBox): string[] {
  if (box.w <= 0 || box.h <= 0 || box.x < 0 || box.y < 0 || box.x + box.w > image.width || box.y + box.h > image.height) {
    return ["out-of-bounds"];
  }
  const stride = image.width * 4;
  for (let y = box.y; y < box.y + box.h; y += 1) {
    const row = y * stride;
    for (let x = box.x; x < box.x + box.w; x += 1) {
      if (image.data[row + x * 4 + 3] !== 0) return [];
    }
  }
  return ["fully-transparent"];
}

function minionFrameCases(): MinionFrameCase[] {
  const cases: MinionFrameCase[] = [];
  for (const [atlas, expected] of Object.entries(MINION_ATLAS_BOUNDS)) {
    const stem = `public/assets/chapter/scenes/minions/${atlas}`;
    const image = PNG.sync.read(readFileSync(new URL(`../../${stem}.png`, import.meta.url)));
    if (image.width !== expected.width || image.height !== expected.height) {
      throw new Error(`${atlas} is ${image.width}x${image.height}, atlas_bounds_check.json expects ${expected.width}x${expected.height}`);
    }
    if (image.data.length !== image.width * image.height * 4) {
      throw new Error(`${atlas} did not decode to one alpha byte per pixel`);
    }
    const packed = JSON.parse(readFileSync(new URL(`../../${stem}.json`, import.meta.url), "utf8")) as {
      frames: Record<string, { frame: FrameBox; rotated?: boolean }>;
    };
    const names = Object.keys(packed.frames);
    if (names.length !== expected.frames) {
      throw new Error(`${atlas} has ${names.length} frames, atlas_bounds_check.json expects ${expected.frames}`);
    }
    for (const name of names) {
      const packedFrame = packed.frames[name]!;
      if (packedFrame.rotated) throw new Error(`${atlas} ${name} is rotated`);
      cases.push({ atlas, name, ...packedFrame.frame, image });
    }
  }
  return cases;
}

const minionFrames = minionFrameCases();

function assertMinionFrames(frames: readonly MinionFrameCase[]): void {
  if (frames.length === 0) throw new Error("no frames");
  for (const frame of frames) {
    const faults = frameFaults(frame.image, frame);
    if (faults.length > 0) throw new Error(`${frame.atlas} ${frame.name}: ${faults.join(",")}`);
  }
}

describe("minion atlas frames", () => {
  it("covers both CH-05 atlases and every runtime idle and hit frame", () => {
    expect(minionFrames).toHaveLength(16);
    const byAtlas = new Map<string, number>();
    for (const frame of minionFrames) byAtlas.set(frame.atlas, (byAtlas.get(frame.atlas) ?? 0) + 1);
    expect(byAtlas.get("atlas_monsters_scenes")).toBe(12);
    expect(byAtlas.get("atlas_monsters_scenes_2")).toBe(4);
    const names = new Set(minionFrames.map((frame) => `${frame.atlas}:${frame.name}`));
    const minionIds = [...new Set(Object.values(CHAPTER_MINION_ID))];
    expect(minionIds).toHaveLength(8);
    for (const id of minionIds) {
      const minion = chapterMinion(Object.entries(CHAPTER_MINION_ID).find(([, value]) => value === id)![0]);
      expect(names.has(`${minion.atlasKey}:${minion.idleFrame}`)).toBe(true);
      expect(names.has(`${minion.atlasKey}:${minion.hitFrame}`)).toBe(true);
    }
  });

  it.each(minionFrames)("$name stays inside $atlas and has a non-zero alpha pixel", (frame) => {
    expect(frame.name.startsWith("monster_")).toBe(true);
    expect(frameFaults(frame.image, frame)).toEqual([]);
  });

  it("rejects an empty frame list, an out-of-bounds rect, and a fully transparent rect", () => {
    expect(() => assertMinionFrames(minionFrames)).not.toThrow();
    expect(() => assertMinionFrames([])).toThrow("no frames");
    const image = minionFrames[0]!.image;
    const outside: MinionFrameCase = { ...minionFrames[0]!, x: image.width - 1, y: 0, w: 2, h: 1 };
    expect(() => assertMinionFrames([outside])).toThrow("out-of-bounds");
    expect(frameFaults(image, { x: 0, y: 0, w: 0, h: 1 })).toEqual(["out-of-bounds"]);
    let clear: FrameBox | null = null;
    for (let y = 0; y < image.height && !clear; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (image.data[(y * image.width + x) * 4 + 3] === 0) {
          clear = { x, y, w: 1, h: 1 };
          break;
        }
      }
    }
    expect(clear).not.toBeNull();
    expect(() => assertMinionFrames([{ ...minionFrames[0]!, ...clear! }])).toThrow("fully-transparent");
  });
});
