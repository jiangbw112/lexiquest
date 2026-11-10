import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pointerHitsContainer, polygonContainsAtVisual, VILLAGE_HOUSE_POINTS } from "./hit";

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

  it("keeps the village house hit on the drawn polygon, including the lower tip", () => {
    const points = [];
    for (let i = 0; i < VILLAGE_HOUSE_POINTS.length; i += 2) {
      points.push({ x: VILLAGE_HOUSE_POINTS[i]!, y: VILLAGE_HOUSE_POINTS[i + 1]! });
    }
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const polygon = { points };
    const origin = { displayOriginX: (maxX - minX) / 2, displayOriginY: (maxY - minY) / 2 };
    const hit = (x: number, y: number) => polygonContainsAtVisual(polygon, x + origin.displayOriginX, y + origin.displayOriginY, origin);
    expect(hit(0, 13)).toBe(true);
    expect(hit(0, 48)).toBe(true);
    expect(hit(0, -20)).toBe(true);
    expect(hit(0, 58)).toBe(false);
    expect(hit(0, -32)).toBe(false);
    expect(hit(0, -40)).toBe(false);
  });

  it("wires the containers and the house through the aligned hit helpers", () => {
    const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
    const kit = readFileSync(new URL("./warm/kit.ts", import.meta.url), "utf8");
    const village = readFileSync(new URL("./scenes/OverworldScene.ts", import.meta.url), "utf8");
    expect(ui).toContain("containerHitArea(width, height)");
    expect(ui).not.toContain("Rectangle(-width / 2");
    expect(kit.match(/containerHitArea\(width, height\)/g)).toHaveLength(4);
    expect(kit).not.toContain("Rectangle(-width / 2");
    expect(village).toContain("polygonContainsAtVisual");
    expect(ui).toContain("if (!down) return");
    expect(ui).toContain("down = false");
    expect(kit).toContain("if (!down) return");
  });
});
