import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pointerHitsContainer, pointerHitsMapWordCard, VILLAGE_BUILDING_HEIGHT, VILLAGE_BUILDING_WIDTH, villageSignLocal } from "./hit";
import { PLACES } from "./layout";

function hits(centerX: number, centerY: number, width: number, height: number, worldX: number, worldY: number): boolean {
  return pointerHitsContainer(width, height, worldX - centerX, worldY - centerY);
}

function rectGap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1);
  if (dx > 0 && dy > 0) return Math.hypot(dx, dy);
  return Math.max(dx, dy);
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

  it("keeps the plaza spawn clear of every building, sign, and HUD box", () => {
    const hero = { x0: 585.6, y0: 372, x1: 694.4, y1: 520 };
    const boxes = [
      ...PLACES.map((place) => ({
        name: place.label,
        x0: place.x - VILLAGE_BUILDING_WIDTH / 2,
        y0: place.y - VILLAGE_BUILDING_HEIGHT / 2,
        x1: place.x + VILLAGE_BUILDING_WIDTH / 2,
        y1: place.y + VILLAGE_BUILDING_HEIGHT / 2,
      })),
      ...PLACES.map((place) => ({
        name: `${place.label} sign`,
        x0: place.x - 58,
        y0: place.y + 38,
        x1: place.x + 58,
        y1: place.y + 61,
      })),
      { name: "top bar", x0: 119, y0: 14, x1: 1161, y1: 110 },
      { name: "goal", x0: 130, y0: 129, x1: 910, y1: 207 },
      { name: "footer", x0: 130, y0: 750, x1: 640, y1: 774 },
      { name: "ending", x0: 1020, y0: 112, x1: 1180, y1: 168 },
    ];
    const gaps = boxes.map((box) => ({ name: box.name, gap: rectGap(hero, box) }));
    expect(Math.min(...gaps.map((item) => item.gap))).toBeGreaterThanOrEqual(56);
    expect(gaps.find((item) => item.name === "衣柜")?.gap).toBe(56);
  });

  it("grows the map word card hit area to 80 by 48 without reaching the next card", () => {
    expect(pointerHitsMapWordCard(0, 0)).toBe(true);
    expect(pointerHitsMapWordCard(39, 0)).toBe(true);
    expect(pointerHitsMapWordCard(41, 0)).toBe(false);
    expect(pointerHitsMapWordCard(0, -23)).toBe(true);
    expect(pointerHitsMapWordCard(0, 23)).toBe(true);
    expect(pointerHitsMapWordCard(0, -20)).toBe(true);
    expect(pointerHitsMapWordCard(0, 25)).toBe(false);
    expect(pointerHitsMapWordCard(0, -25)).toBe(false);
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
    expect(village).toContain("new LayeredActor(this, 640, 520, \"top\")");
    expect(village).toContain("y: 508");
    expect(village).toContain("containerHitArea");
    expect(village).not.toContain("polygon");
    const map = readFileSync(new URL("./scenes/StageMapScene.ts", import.meta.url), "utf8");
    expect(map).toContain("cursor + 40");
    expect(map).toContain("cursor += 64");
    expect(map).toContain("MAP_WORD_CARD_HIT");
    expect(map).not.toContain("cursor + 28");
    expect(ui).toContain("if (!down) return");
    expect(ui).toContain("down = false");
    expect(kit).toContain("if (!down) return");
  });
});
