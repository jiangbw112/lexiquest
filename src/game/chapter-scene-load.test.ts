import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chapterBackdrop } from "../domain/chapter-scenes";
import { FOREST_CHAPTER } from "../domain/stages";
import { chapterMapPlate, queueMissingChapterMap, queueMissingForestBattle } from "./chapter-scene-load";

interface FakeScene {
  textures: { exists(key: string): boolean };
  load: { image(key: string, url: string): void };
}

function loader(have: Set<string>): { scene: FakeScene; queued: string[] } {
  const queued: string[] = [];
  const scene: FakeScene = {
    textures: { exists: (key) => have.has(key) },
    load: { image: (key, url) => queued.push(`${key} ${url}`) },
  };
  return { scene, queued };
}

describe("switching back to the forest", () => {
  it("queues bg_map and bg_forest when a grade chapter was loaded first", () => {
    const home = chapterBackdrop("pep_g3_01");
    const forest = chapterBackdrop(FOREST_CHAPTER.chapter_id);
    const have = new Set([home.mapKey, home.battleKey]);
    const { scene, queued } = loader(have);

    expect(queueMissingChapterMap(scene as never, home)).toBe(false);
    expect(queueMissingForestBattle(scene as never, home)).toBe(false);
    expect(queueMissingChapterMap(scene as never, forest)).toBe(true);
    expect(queueMissingForestBattle(scene as never, forest)).toBe(true);
    expect(queued).toEqual([
      "bg_map assets/warm/backgrounds/bg_map_forest_2x.webp",
      "bg_forest assets/warm/backgrounds/bg_forest_battle_2x.webp",
    ]);

    have.add("bg_map");
    have.add("bg_forest");
    expect(queueMissingChapterMap(scene as never, forest)).toBe(false);
    expect(queueMissingForestBattle(scene as never, forest)).toBe(false);
  });

  it("keeps the map chrome when the background file fails", () => {
    expect(chapterMapPlate({ textureReady: false, failed: false })).toBe("wait");
    expect(chapterMapPlate({ textureReady: false, failed: true })).toBe("fallback");
    expect(chapterMapPlate({ textureReady: true, failed: true })).toBe("image");
    const scene = readFileSync(new URL("./scenes/StageMapScene.ts", import.meta.url), "utf8");
    const plate = scene.indexOf("chapterMapPlate(");
    const title = scene.indexOf("warmTitlePlank(");
    const previous = scene.indexOf('"上一章"');
    const next = scene.indexOf('"下一章"');
    expect(plate).toBeGreaterThan(0);
    expect(title).toBeGreaterThan(plate);
    expect(previous).toBeGreaterThan(title);
    expect(next).toBeGreaterThan(previous);
    expect(scene).not.toContain("paintMapFallback");
    expect(scene).toContain("this.mapLoadFailedKey = \"\"");
    const forest = chapterBackdrop(FOREST_CHAPTER.chapter_id);
    expect(forest.mapKey).toBe("bg_map");
    expect(forest.mapUrl).toBe("assets/warm/backgrounds/bg_map_forest_2x.webp");
    expect(chapterMapPlate({ textureReady: false, failed: true })).toBe("fallback");
  });

  it("keeps battle controls when the background file fails", () => {
    const battle = readFileSync(new URL("./scenes/BattleScene.ts", import.meta.url), "utf8");
    const plate = battle.indexOf("paintBattleBackdrop()");
    const fallback = battle.indexOf("battle:plate:fallback");
    const attack = battle.indexOf('"1 攻击"');
    const block = battle.indexOf('"2 格挡"');
    const heal = battle.indexOf('"3 治疗"');
    expect(battle).toContain("this.battleBackdropFailed = false");
    expect(plate).toBeGreaterThan(0);
    expect(fallback).toBeGreaterThan(plate);
    expect(attack).toBeGreaterThan(fallback);
    expect(block).toBeGreaterThan(attack);
    expect(heal).toBeGreaterThan(block);
    expect(battle).toContain("bg_forest");
    expect(battle).not.toContain("P0_CLASS_ID");
  });
});
