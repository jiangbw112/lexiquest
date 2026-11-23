import { afterEach, describe, expect, it } from "vitest";
import { probeEnter } from "./probe";

describe("scene marker", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  });

  it("records the open scene where a packaged build can read it", () => {
    const element = { dataset: {} as Record<string, string> };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { documentElement: element, getElementById: () => null },
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    probeEnter("profiles");
    expect(element.dataset.lexiScene).toBe("profiles");
  });
});
