import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "./data/forest-rewards-manifest.json";
import warrior from "./data/manifest.json";
import slots from "./data/slots.json";
import { CHAPTER_ASSET_ROOT, chapterCosmeticLayers } from "./chapter-cosmetics";

const PUBLIC = "public/assets/chapter/forest/v0.1";

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pivot: { x: number; y: number };
  rotated: boolean;
}

interface AtlasFile {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; size: { w: number; h: number } };
}

describe("forest reward atlases v0.1", () => {
  it("keeps the public manifest identical to the copy the client imports", () => {
    const onDisk = JSON.parse(readFileSync(`${PUBLIC}/manifest.json`, "utf8")) as unknown;
    expect(onDisk).toEqual(manifest);
    expect(manifest.version).toBe("0.1-provisional");
    expect(manifest.status).toContain("暂定");
    expect(CHAPTER_ASSET_ROOT).toBe("assets/chapter/forest/v0.1");
  });

  it("parses every atlas, matching frame size, pivot, and texture keys", () => {
    const pivot = { x: manifest.pivot.normalized[0], y: manifest.pivot.normalized[1] };
    const layers = chapterCosmeticLayers();
    expect(layers.map((layer) => layer.textureKey)).toEqual(manifest.items.map((item) => item.textureKey));
    for (const item of manifest.items) {
      const atlas = JSON.parse(readFileSync(`${PUBLIC}/${item.atlas.json}`, "utf8")) as AtlasFile;
      expect(atlas.meta.image).toBe(item.atlas.image.split("/").at(-1));
      expect(atlas.meta.size.w).toBeLessThanOrEqual(2048);
      expect(atlas.meta.size.h).toBeLessThanOrEqual(2048);
      const names = manifest.animations.flatMap((anim) =>
        anim.frameNames.map((name) => name.replace("{layerPrefix}", item.layerPrefix)),
      );
      expect(Object.keys(atlas.frames).sort()).toEqual([...names].sort());
      expect(names).toHaveLength(item.frameCount);
      for (const frame of Object.values(atlas.frames)) {
        expect(frame.sourceSize).toEqual({ w: manifest.sourceW, h: manifest.sourceH });
        expect(frame.pivot).toEqual(pivot);
        expect(frame.rotated).toBe(false);
        expect(frame.spriteSourceSize.w).toBe(frame.frame.w);
        expect(frame.spriteSourceSize.h).toBe(frame.frame.h);
      }
      const png = readFileSync(`${PUBLIC}/${item.atlas.image}`);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
  });

  it("parses the title atlas at the sizes in the manifest", () => {
    const atlas = JSON.parse(readFileSync(`${PUBLIC}/${manifest.ui.atlas.json}`, "utf8")) as AtlasFile;
    expect(atlas.meta.image).toBe("atlas/ui_title_forest@2x.png".split("/").at(-1));
    expect(manifest.ui.textureKey).toBe("ui_title_forest");
    const leaf = atlas.frames.ui_title_leafIcon;
    const chip = atlas.frames.ui_title_chip;
    expect(leaf?.sourceSize).toEqual({ w: 64, h: 64 });
    expect(chip?.sourceSize).toEqual({ w: 96, h: 56 });
    expect(manifest.ui.frames.ui_title_chip["nineSlice@2x"]).toEqual({ left: 26, right: 26, top: 24, bottom: 24 });
    const png = readFileSync(`${PUBLIC}/${manifest.ui.atlas.image}`);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("puts the pin offset inside the trimmed frame, and follows slot table v0.2", () => {
    const pin = manifest.items.find((item) => item.itemId === "acorn_pin");
    const offset = pin && "anchorOffset" in pin ? pin.anchorOffset?.["px@2x_local"] : undefined;
    expect(offset).toEqual([-30, 10]);
    const atlas = JSON.parse(readFileSync(`${PUBLIC}/${pin?.atlas.json}`, "utf8")) as AtlasFile;
    const frame = atlas.frames.char_acornPin_cosChest_e_idle_00;
    const chestAnchor = warrior.anchorsPerFrame.idle_00.chest;
    const box = frame?.spriteSourceSize;
    if (!box || !offset) throw new Error("idle pin frame missing");
    const point = { x: chestAnchor[0] + offset[0], y: chestAnchor[1] + offset[1] };
    expect(point.x).toBeGreaterThanOrEqual(box.x);
    expect(point.x).toBeLessThanOrEqual(box.x + box.w);
    expect(point.y).toBeGreaterThanOrEqual(box.y);
    expect(point.y).toBeLessThanOrEqual(box.y + box.h);
    const chestSlot = slots.slots.find((slot) => slot.id === "cosmetic_chest");
    expect(chestSlot).toMatchObject({ z: 47, anchor: "chest", p0Active: false });
    expect(slots.slots).toHaveLength(19);
    expect(slots.version).toBe("slots-0.2-provisional");
  });
});
