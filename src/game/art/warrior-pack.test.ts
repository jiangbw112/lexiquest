import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUDGET } from "../budget";
import {
  WARRIOR_ANIMS,
  WARRIOR_LAYERS,
  WARRIOR_ORIGIN,
  WARRIOR_PACK,
  battlePoses,
  layersInGroup,
} from "./warrior-pack";

const ROOT = "public/assets/warrior/v0.1";

interface AtlasFile {
  frames: Record<string, { sourceSize: { w: number; h: number }; pivot?: { x: number; y: number } }>;
}

describe("provisional warrior v0.1 atlases", () => {
  it("ships the same manifest and slots that the client imports", () => {
    expect(readFileSync(`${ROOT}/manifest.json`, "utf8")).toBe(readFileSync("src/game/art/data/manifest.json", "utf8"));
    expect(readFileSync(`${ROOT}/slots.json`, "utf8")).toBe(readFileSync("src/game/art/data/slots.json", "utf8"));
  });

  it("loads every atlas and every animation key", () => {
    expect(WARRIOR_PACK.version).toBe("0.1-provisional");
    expect(WARRIOR_ORIGIN).toEqual({ x: 0.5, y: 0.875 });
    expect(WARRIOR_LAYERS.map((layer) => layer.slot)).toEqual(WARRIOR_PACK.layerOrder_backToFront);
    expect(WARRIOR_LAYERS).toHaveLength(11);
    expect(WARRIOR_ANIMS.map((anim) => [anim.key, anim.frameCount, anim.fps])).toEqual([
      ["idle", 4, 6],
      ["walk", 6, 10],
      ["attack", 5, 12],
      ["hit", 2, 8],
      ["victory", 4, 8],
    ]);

    for (const layer of WARRIOR_LAYERS) {
      const atlas = JSON.parse(readFileSync(`${ROOT}/${layer.atlasJson}`, "utf8")) as AtlasFile;
      expect(statSync(`${ROOT}/${layer.atlasImage}`).size).toBeGreaterThan(500);
      for (const anim of WARRIOR_ANIMS) {
        const frames = anim.frames(layer.id);
        expect(frames).toHaveLength(anim.frameCount);
        for (const frameName of frames) {
          const frame = atlas.frames[frameName];
          expect(frame, frameName).toBeTruthy();
          expect(frame?.sourceSize).toEqual({ w: 512, h: 512 });
          expect(frame?.pivot).toEqual({ x: 0.5, y: 0.875 });
        }
      }
    }
  });

  it("keeps outfit layers apart from body and class gear", () => {
    expect(layersInGroup("outfit").map((layer) => layer.slot)).toEqual([
      "outfit_back",
      "outfit_body",
      "outfit_head",
      "outfit_front",
    ]);
    expect(layersInGroup("body").map((layer) => layer.slot)).toEqual(["body_back", "body", "hair", "body_front"]);
    expect(layersInGroup("class").map((layer) => layer.slot)).toEqual(["hand_main", "hand_off"]);
    expect(layersInGroup("system").map((layer) => layer.slot)).toEqual(["shadow"]);
    const slots = JSON.parse(readFileSync(`${ROOT}/slots.json`, "utf8")) as {
      slots: { id: string; p0Active: boolean }[];
    };
    expect(slots.slots).toHaveLength(18);
    expect(slots.slots.filter((slot) => slot.p0Active)).toHaveLength(11);
  });

  it("chooses idle, attack, hit, and victory from the battle result", () => {
    expect(battlePoses({ action: "block", playerHpBefore: 42, playerHpAfter: 42, phase: "choose" })).toEqual(["idle"]);
    expect(battlePoses({ action: "skill", playerHpBefore: 42, playerHpAfter: 42, phase: "question" })).toEqual(["attack"]);
    expect(battlePoses({ action: "attack", playerHpBefore: 42, playerHpAfter: 36, phase: "choose" })).toEqual([
      "attack",
      "hit",
    ]);
    expect(battlePoses({ action: "answer", playerHpBefore: 30, playerHpAfter: 24, phase: "choose" })).toEqual(["hit"]);
    expect(battlePoses({ action: "answer", playerHpBefore: 30, playerHpAfter: 30, phase: "won" })).toEqual(["victory"]);
    expect(battlePoses({ action: "attack", playerHpBefore: 42, playerHpAfter: 42, phase: "won" })).toEqual([
      "attack",
      "victory",
    ]);
  });

  it("keeps placeholder art plus the warrior pack inside the asset budget", () => {
    const files = [
      "public/assets/atlases/actors.png",
      "public/assets/atlases/actors.json",
      "public/assets/map/village.png",
      ...readdirSync(`${ROOT}/atlas`).map((name) => `${ROOT}/atlas/${name}`),
      `${ROOT}/manifest.json`,
      `${ROOT}/slots.json`,
    ];
    const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
    expect(bytes).toBeLessThan(BUDGET.assetBytes);
  });
});
