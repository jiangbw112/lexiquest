import { describe, expect, it } from "vitest";
// The budget script is plain JavaScript so the build can run it without a compile step.
// @ts-expect-error tools/boot-budget.mjs has no declaration file.
import { BOOT_LIMIT_BYTES, BOOT_WARN_BYTES, evaluateBootBudget } from "../../tools/boot-budget.mjs";

describe("boot package warning", () => {
  it("warns above 3800000 decimal bytes and fails only above 4194304", () => {
    expect(BOOT_WARN_BYTES).toBe(3_800_000);
    expect(BOOT_LIMIT_BYTES).toBe(4_194_304);
    expect(evaluateBootBudget(3_630_939).level).toBe("ok");
    expect(evaluateBootBudget(3_800_000).level).toBe("ok");
    const warned = evaluateBootBudget(3_800_001);
    expect(warned.level).toBe("warn");
    expect(warned.message).toContain("3800001");
    expect(evaluateBootBudget(4_194_304).level).toBe("warn");
    expect(evaluateBootBudget(4_194_305).level).toBe("fail");
  });
});
