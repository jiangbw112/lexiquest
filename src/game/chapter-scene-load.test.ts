import { describe, expect, it } from "vitest";
import { chapterBackdrop } from "../domain/chapter-scenes";
import { FOREST_CHAPTER } from "../domain/stages";
import { queueMissingChapterMap, queueMissingForestBattle } from "./chapter-scene-load";

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
});
