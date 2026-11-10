import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUDGET } from "../budget";
import { ATLAS_SPEC, visibleFrames } from "./layers";

interface AtlasFile {
  frames: Record<string, { frame: { w: number; h: number }; sourceSize: { w: number; h: number } }>;
  meta: { lexiquest: typeof ATLAS_SPEC };
}

const atlas = JSON.parse(readFileSync("public/assets/atlases/actors.json", "utf8")) as AtlasFile;

describe("placeholder actor atlas", () => {
  it("uses one canvas size, anchor, and back-to-front order per view", () => {
    expect(atlas.meta.lexiquest).toEqual(ATLAS_SPEC);
    for (const view of ["side", "top", "monster"] as const) {
      const expected = ATLAS_SPEC[view];
      expect(expected.originX).toBe(0.5);
      expect(expected.originY).toBe(1);
      for (const name of expected.frames) {
        const frame = atlas.frames[name];
        expect(frame, name).toBeTruthy();
        expect(frame?.frame.w).toBe(expected.width);
        expect(frame?.frame.h).toBe(expected.height);
        expect(frame?.sourceSize).toEqual({ w: expected.width, h: expected.height });
      }
    }
  });

  it("stacks outfit layers without inventing frames", () => {
    expect(visibleFrames("side", "traveler")).toEqual(["side/body", "side/tunic", "side/hair", "side/emblem"]);
    expect(visibleFrames("side", "forest-cape")).toEqual([
      "side/cape",
      "side/body",
      "side/tunic",
      "side/hair",
      "side/emblem",
      "side/hat-leaf",
    ]);
    expect(visibleFrames("top", "star-sash")[0]).toBe("top/shadow");
    expect(visibleFrames("top", "star-sash")).toContain("top/sash");
    expect(visibleFrames("top", "traveler")).not.toContain("top/cape");
    const caped = visibleFrames("top", "forest-cape");
    expect(caped.indexOf("top/cape")).toBeGreaterThan(caped.indexOf("top/shadow"));
    expect(caped.indexOf("top/cape")).toBeLessThan(caped.indexOf("top/body"));
    expect(caped.indexOf("top/hair")).toBeGreaterThan(caped.indexOf("top/body"));
  });

  it("keeps placeholder images inside the load budget", () => {
    const bytes =
      statSync("public/assets/atlases/actors.png").size +
      statSync("public/assets/atlases/actors.json").size +
      statSync("public/assets/map/village.png").size;
    expect(bytes).toBeLessThan(BUDGET.assetBytes);
  });
});
