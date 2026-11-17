import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { bindSingleInstance, focusExistingWindow } from "./single-instance.mjs";

interface FakeWindow {
  isMinimized: () => boolean;
  isDestroyed?: () => boolean;
  restore: () => void;
  show: () => void;
  focus: () => void;
}

function recorder(minimized: boolean, destroyed = false): { win: FakeWindow; order: string[] } {
  const order: string[] = [];
  return {
    order,
    win: {
      isMinimized: () => minimized,
      isDestroyed: () => destroyed,
      restore: () => order.push("restore"),
      show: () => order.push("show"),
      focus: () => order.push("focus"),
    },
  };
}

describe("desktop single instance", () => {
  it("quits immediately when the lock is already taken", () => {
    const calls: string[] = [];
    const locked = bindSingleInstance(
      {
        quit: () => calls.push("quit"),
        on: () => calls.push("on"),
      },
      false,
      () => null,
    );
    expect(locked).toBe(false);
    expect(calls).toEqual(["quit"]);
  });

  it("focuses the existing window when a second launch arrives", () => {
    const events = new Map<string, () => void>();
    let current: FakeWindow | null = null;
    const locked = bindSingleInstance(
      {
        quit: () => {
          throw new Error("owner must stay open");
        },
        on: (event: string, listener: () => void) => {
          events.set(event, listener);
        },
      },
      true,
      () => current,
    );
    expect(locked).toBe(true);
    const minimized = recorder(true);
    current = minimized.win;
    events.get("second-instance")?.();
    expect(minimized.order).toEqual(["restore", "show", "focus"]);

    const visible = recorder(false);
    current = visible.win;
    events.get("second-instance")?.();
    expect(visible.order).toEqual(["show", "focus"]);
  });

  it("ignores a missing or destroyed window", () => {
    expect(() => focusExistingWindow(null)).not.toThrow();
    const gone = recorder(true, true);
    focusExistingWindow(gone.win);
    expect(gone.order).toEqual([]);
  });

  it("asks Electron for the lock in the shell before the window is created", () => {
    const main = fs.readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
    const helper = fs.readFileSync(new URL("./single-instance.mjs", import.meta.url), "utf8");
    const lock = main.indexOf("app.requestSingleInstanceLock()");
    const ready = main.indexOf("app.whenReady");
    expect(lock).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(lock);
    expect(main).toContain("bindSingleInstance");
    expect(main).toContain("if (!singleInstance) return");
    expect(helper).toContain("second-instance");
    expect(helper).toContain("app.quit()");
    expect(helper).toContain("win.restore()");
    expect(helper).toContain("win.show()");
    expect(helper).toContain("win.focus()");
  });

  it("ships the single-instance module inside the desktop package", () => {
    const builder = fs.readFileSync(new URL("./builder.yml", import.meta.url), "utf8");
    expect(builder).toContain("desktop/single-instance.mjs");
  });
});
