import { existsSync, readFileSync, statSync } from "node:fs";
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

describe("warrior pack metadata", () => {
  it("does not ship the old battle-view atlas directory", () => {
    expect(existsSync("public/assets/warrior")).toBe(false);
  });

  it("keeps the layer table the client still imports", () => {
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
    const slots = JSON.parse(readFileSync("src/game/art/data/slots.json", "utf8")) as {
      slots: { id: string; p0Active: boolean }[];
    };
    expect(slots.slots).toHaveLength(19);
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
    ];
    const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
    expect(bytes).toBeLessThan(BUDGET.assetBytes);
  });
});
