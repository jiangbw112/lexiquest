import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pointerHitsContainer, VILLAGE_BUILDING_HEIGHT, VILLAGE_BUILDING_WIDTH, villageSignLocal } from "./hit";
import { PLACES } from "./layout";

function hits(centerX: number, centerY: number, width: number, height: number, worldX: number, worldY: number): boolean {
  return pointerHitsContainer(width, height, worldX - centerX, worldY - centerY);
}

describe("control hit areas", () => {
  it("covers the center, the inset corners, and the edge midpoints, and misses 4px outside", () => {
    const samples = [
      { width: 280, height: 64, x: 640, y: 560 },
      { width: 148, height: 56, x: 200, y: 680 },
      { width: 190, height: 56, x: 280, y: 360 },
      { width: 200, height: 52, x: 360, y: 96 },
      { width: 640, height: 56, x: 640, y: 380 },
    ];
    for (const sample of samples) {
      const { width, height, x, y } = sample;
      const inside = [
        [x, y],
        [x - width / 2 + 8, y - height / 2 + 8],
        [x + width / 2 - 8, y - height / 2 + 8],
        [x - width / 2 + 8, y + height / 2 - 8],
        [x + width / 2 - 8, y + height / 2 - 8],
        [x - width / 2 + 8, y],
        [x + width / 2 - 8, y],
        [x, y - height / 2 + 8],
        [x, y + height / 2 - 8],
      ];
      for (const [px, py] of inside) expect(hits(x, y, width, height, px!, py!), `${px},${py}`).toBe(true);
      const outside = [
        [x - width / 2 - 4, y],
        [x + width / 2 + 4, y],
        [x, y - height / 2 - 4],
        [x, y + height / 2 + 4],
      ];
      for (const [px, py] of outside) expect(hits(x, y, width, height, px!, py!), `${px},${py}`).toBe(false);
    }
  });

  it("does not let the attack button's right side fire the block button", () => {
    const attack = { x: 200, y: 680, width: 148, height: 56 };
    const block = { x: 360, y: 680, width: 148, height: 56 };
    const rightSide = attack.x + attack.width / 2 - 8;
    expect(hits(attack.x, attack.y, attack.width, attack.height, rightSide, attack.y)).toBe(true);
    expect(hits(block.x, block.y, block.width, block.height, rightSide, attack.y)).toBe(false);
    const between = (attack.x + attack.width / 2 + block.x - block.width / 2) / 2;
    expect(hits(attack.x, attack.y, attack.width, attack.height, between, attack.y)).toBe(false);
    expect(hits(block.x, block.y, block.width, block.height, between, attack.y)).toBe(false);
  });

  it("covers each village building, including the sign, and misses the gap between neighbors", () => {
    const width = VILLAGE_BUILDING_WIDTH;
    const height = VILLAGE_BUILDING_HEIGHT;
    const sign = villageSignLocal();
    expect(sign).toEqual({ x: 0, y: 49.5 });
    for (const place of PLACES) {
      const inside = [
        [place.x, place.y],
        [place.x, place.y + sign.y],
        [place.x - width / 2 + 8, place.y - height / 2 + 8],
        [place.x + width / 2 - 8, place.y - height / 2 + 8],
        [place.x - width / 2 + 8, place.y + height / 2 - 8],
        [place.x + width / 2 - 8, place.y + height / 2 - 8],
      ];
      for (const [px, py] of inside) {
        expect(hits(place.x, place.y, width, height, px!, py!), place.id).toBe(true);
        for (const other of PLACES) {
          if (other.id === place.id) continue;
          expect(hits(other.x, other.y, width, height, px!, py!), `${place.id} into ${other.id}`).toBe(false);
        }
      }
      expect(hits(place.x, place.y, width, height, place.x, place.y - height / 2 - 4)).toBe(false);
      expect(hits(place.x, place.y, width, height, place.x, place.y + height / 2 + 4)).toBe(false);
    }
    expect(hits(900, 320, width, height, 970, 360)).toBe(false);
    expect(hits(1040, 400, width, height, 970, 360)).toBe(false);
  });

  it("wires the containers and the house through the aligned hit helpers", () => {
    const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
    const kit = readFileSync(new URL("./warm/kit.ts", import.meta.url), "utf8");
    const village = readFileSync(new URL("./scenes/OverworldScene.ts", import.meta.url), "utf8");
    expect(ui).toContain("containerHitArea(width, height)");
    expect(ui).not.toContain("Rectangle(-width / 2");
    expect(kit.match(/containerHitArea\(width, height\)/g)).toHaveLength(4);
    expect(kit).not.toContain("Rectangle(-width / 2");
    expect(village).toContain("village_bld_");
    expect(village).toContain("containerHitArea");
    expect(village).not.toContain("polygon");
    expect(ui).toContain("if (!down) return");
    expect(ui).toContain("down = false");
    expect(kit).toContain("if (!down) return");
  });
});
