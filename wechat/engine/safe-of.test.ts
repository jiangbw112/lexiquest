import { afterEach, describe, expect, it } from "vitest";
import { safeInsetSource, safeOf } from "./phone";

const view = { w: 844, h: 390 };

afterEach(() => {
  delete (globalThis as { wx?: unknown }).wx;
});

describe("safeOf", () => {
  it("uses the 844×390 design assumption when no window API is present", () => {
    expect(safeInsetSource(view)).toBe("assumption");
    expect(safeOf(view)).toEqual({ x: 56, y: 16, w: 684, h: 350 });
  });

  it("reads a window safe area and keeps the menu capsule outside it", () => {
    (globalThis as { wx?: unknown }).wx = {
      getWindowInfo: () => ({ windowWidth: 844, windowHeight: 390, safeArea: { left: 40, top: 12, right: 800, bottom: 370 } }),
      getMenuButtonBoundingClientRect: () => ({ left: 740, top: 0, right: 844, bottom: 44 }),
    };
    expect(safeInsetSource(view)).toBe("window");
    expect(safeOf(view)).toEqual({ x: 40, y: 12, w: 700, h: 358 });
  });

  it("prefers the page rectangle and its capsule over the design assumption", () => {
    const passed = { w: 844, h: 390, safe: { left: 47, top: 8, right: 820, bottom: 380 }, capsule: { left: 700, top: 0, right: 844, bottom: 36 } };
    expect(safeInsetSource(passed)).toBe("window");
    expect(safeOf(passed)).toEqual({ x: 47, y: 8, w: 653, h: 372 });
  });
});
