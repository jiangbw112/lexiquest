import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parchmentTitleY, PARCHMENT_FRAME } from "./layout";
import { devModeEnabled, reviewClockCommand, reviewClockDelta, reviewDeskLayout } from "./dev-mode";

describe("dev mode gate", () => {
  it("stays off unless the query is exactly dev=1", () => {
    expect(devModeEnabled("")).toBe(false);
    expect(devModeEnabled("?")).toBe(false);
    expect(devModeEnabled("?dev=0")).toBe(false);
    expect(devModeEnabled("?dev=true")).toBe(false);
    expect(devModeEnabled("?foo=1")).toBe(false);
    expect(devModeEnabled("?dev=1")).toBe(true);
    expect(devModeEnabled("dev=1")).toBe(true);
    const joined = String.fromCharCode(38);
    expect(devModeEnabled(`?x=2${joined}dev=1`)).toBe(true);
    expect(devModeEnabled(`?dev=1${joined}x=2`)).toBe(true);
  });

  it("ignores time-skip keys when dev mode is off and honors T, Y, and R when it is on", () => {
    for (const code of ["KeyT", "KeyY", "KeyR", "Digit1", "KeyE"]) {
      expect(reviewClockCommand(code, false)).toBeNull();
    }
    expect(reviewClockCommand("Digit1", true)).toBeNull();
    expect(reviewClockCommand("KeyT", true)).toBe("advance-10m");
    expect(reviewClockCommand("KeyY", true)).toBe("advance-1d");
    expect(reviewClockCommand("KeyR", true)).toBe("reset");
    expect(reviewClockDelta("advance-10m")).toBe(10 * 60 * 1000);
    expect(reviewClockDelta("advance-1d")).toBe(24 * 60 * 60 * 1000);
  });

  it("drops the hourglass row in normal mode so the list is not left with an empty band", () => {
    const off = reviewDeskLayout(false);
    const on = reviewDeskLayout(true);
    const frameBottom = 400 - 740 / 2 + PARCHMENT_FRAME;
    expect(off.titleY).toBe(parchmentTitleY(400, 740));
    expect(off.titleY).toBeGreaterThanOrEqual(frameBottom);
    expect(off.subtitleY).toBeGreaterThanOrEqual(off.titleY + 34);
    expect(off.bodyY).toBeLessThan(off.clockY);
    expect(on.bodyY).toBeGreaterThanOrEqual(on.clockY + 28);
    expect(on.titleY).toBe(off.titleY);
  });

  it("wires the review desk through the same gate", () => {
    const source = readFileSync(new URL("./scenes/ReviewScene.ts", import.meta.url), "utf8");
    expect(source).toContain("reviewClockCommand(event.code, this.dev)");
    expect(source).not.toContain('if (event.code === "KeyT")');
    expect(source).not.toContain('if (event.code === "KeyY")');
    expect(source).not.toContain('if (event.code === "KeyR")');
    const draw = source.slice(source.indexOf("private draw()"));
    const button = draw.indexOf("沙漏 +10 分钟 T");
    const gate = draw.lastIndexOf("if (this.dev)", button);
    expect(gate).toBeGreaterThan(-1);
    expect(draw.slice(0, gate)).not.toContain("沙漏");
  });
});
