import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { CLASS_IDS } from "./classes";
import {
  INVENTOR_LOCK_NOTE,
  INVENTOR_UNLOCK_ENABLED,
  isClassSelectable,
  isClassUnlocked,
  resolvedClassId,
  selectClass,
} from "./class-unlock";
import { createSave } from "./progress";
import { deserialize, serialize } from "./storage";

const NOW = Date.parse("2026-03-01T02:00:00Z");
const UNLOCK_AT = 1_700_000_000_000;
const EXAM_ID = "exam_g3_s1_final";

function claimedSave(classId: "warrior" | "inventor") {
  const save = createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3"],
  });
  const raw = JSON.parse(serialize(save)) as Record<string, unknown> & {
    player: { classId: string; name: string; appearance: unknown };
  };
  raw.player = { ...raw.player, classId };
  raw.unlockedClassIds = ["inventor"];
  raw.inventorUnlockedAt = UNLOCK_AT;
  raw.inventorUnlockedBy = EXAM_ID;
  raw.examProgress = { [EXAM_ID]: { cleared: true, bestPhase: 3 } };
  return raw;
}

describe("class unlock", () => {
  it("hard-locks inventor with a literal false and keeps unlock fields on the next save", () => {
    const source = readFileSync(new URL("./class-unlock.ts", import.meta.url), "utf8");
    expect(source).toContain("export const INVENTOR_UNLOCK_ENABLED = false as const;");
    expect(source).not.toContain("import.meta.env");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("URLSearchParams");
    expect(source).not.toContain("unlockClasses");
    expect(source).not.toContain("VITE_");
    const enabled: false = INVENTOR_UNLOCK_ENABLED;
    expect(enabled).toBe(false);

    const loaded = deserialize(JSON.stringify(claimedSave("warrior")));
    expect(loaded).not.toBeNull();
    expect(isClassSelectable("inventor", loaded)).toBe(false);
    expect(isClassUnlocked("inventor", loaded)).toBe(false);
    expect(selectClass("warrior", "inventor", loaded)).toBe("warrior");
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.unlockedClassIds).toEqual(["inventor"]);
    const written = JSON.parse(serialize(loaded!)) as typeof loaded & {
      examProgress: { exam_g3_s1_final: { cleared: boolean; bestPhase: number } };
    };
    expect(written.unlockedClassIds).toEqual(["inventor"]);
    expect(written.inventorUnlockedAt).toBe(UNLOCK_AT);
    expect(written.inventorUnlockedBy).toBe(EXAM_ID);
    expect(written.examProgress).toEqual({ [EXAM_ID]: { cleared: true, bestPhase: 3 } });
    expect(written.player.classId).toBe("warrior");

    const asInventor = deserialize(JSON.stringify(claimedSave("inventor")));
    expect(asInventor?.player.classId).toBe("warrior");
    expect(isClassSelectable("inventor", asInventor)).toBe(false);
    expect(resolvedClassId("inventor", asInventor)).toBe("warrior");
    const kept = JSON.parse(serialize(asInventor!)) as typeof written;
    expect(kept.unlockedClassIds).toEqual(["inventor"]);
    expect(kept.inventorUnlockedAt).toBe(UNLOCK_AT);
    expect(kept.inventorUnlockedBy).toBe(EXAM_ID);
    expect(kept.examProgress).toEqual({ [EXAM_ID]: { cleared: true, bestPhase: 3 } });

    for (const id of CLASS_IDS) {
      if (id === "inventor") continue;
      expect(isClassSelectable(id, loaded)).toBe(true);
      expect(isClassUnlocked(id, loaded)).toBe(true);
    }
  });

  it("will not select a locked inventor on the class picker", () => {
    expect(selectClass("warrior", "inventor", null)).toBe("warrior");
    expect(selectClass("mage", "inventor", { unlockedClassIds: ["inventor"] })).toBe("mage");
    expect(selectClass("warrior", "ranger", null)).toBe("ranger");
    const scene = readFileSync(new URL("../game/scenes/CreateScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("selectClass");
    expect(scene).toContain("this.pick(CLASSES[index].id)");
    expect(scene).toContain("INVENTOR_LOCK_NOTE");
    expect(INVENTOR_LOCK_NOTE).toBe("通关任意一个期末 Boss 后解锁");
    expect(scene).toContain("if (!unlocked) return");
    expect(scene).toContain("PORTRAIT_LOCKED_FRAME");
    expect(scene).not.toContain("setTint(0x141414)");
    expect(scene).not.toContain("unlockClasses");
  });
});
