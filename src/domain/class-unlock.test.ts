import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_IDS } from "./classes";
import {
  INVENTOR_LOCK_NOTE,
  isClassUnlocked,
  readFinalBossCleared,
  selectClass,
} from "./class-unlock";

describe("class unlock", () => {
  it("keeps inventor locked until the final boss mark is set, and leaves the other classes open", () => {
    expect(readFinalBossCleared(null)).toBe(false);
    expect(readFinalBossCleared({})).toBe(false);
    expect(readFinalBossCleared({ finalBossCleared: false })).toBe(false);
    expect(isClassUnlocked("inventor", null)).toBe(false);
    expect(isClassUnlocked("inventor", {})).toBe(false);
    expect(readFinalBossCleared({ finalBossCleared: true })).toBe(true);
    expect(isClassUnlocked("inventor", { finalBossCleared: true })).toBe(true);
    for (const id of CLASS_IDS) {
      if (id === "inventor") continue;
      expect(isClassUnlocked(id, null)).toBe(true);
    }
  });

  it("will not select a locked inventor on the class picker", () => {
    expect(selectClass("warrior", "inventor", null)).toBe("warrior");
    expect(selectClass("mage", "inventor", { finalBossCleared: false })).toBe("mage");
    expect(selectClass("warrior", "ranger", null)).toBe("ranger");
    expect(selectClass("warrior", "inventor", { finalBossCleared: true })).toBe("inventor");
    const scene = readFileSync(new URL("../game/scenes/CreateScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("selectClass");
    expect(scene).toContain("this.pick(CLASSES[index].id)");
    expect(scene).toContain("INVENTOR_LOCK_NOTE");
    expect(INVENTOR_LOCK_NOTE).toBe("通关任意一个期末 Boss 后解锁");
    expect(scene).toContain("if (!unlocked) return");
    expect(scene).toContain("if (!unlocked) portrait.setTint(0x141414)");
  });
});
