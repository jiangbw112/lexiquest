import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { CLASS_IDS } from "./classes";
import {
  INVENTOR_LOCK_BUTTON,
  INVENTOR_LOCK_NOTE,
  INVENTOR_LOCK_TIP,
  INVENTOR_LOCK_TITLE,
  INVENTOR_SWITCH_LOCKED_TIP,
  INVENTOR_UNLOCK_GO,
  INVENTOR_UNLOCK_LATER,
  INVENTOR_UNLOCK_MAIN,
  INVENTOR_UNLOCK_SUB,
  INVENTOR_UNLOCK_ENABLED,
  isClassSelectable,
  isClassUnlocked,
  lockedCardTip,
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
    expect(INVENTOR_LOCK_TITLE).toBe("藏起来的职业");
    expect(INVENTOR_LOCK_NOTE).toBe("打败期末大 Boss 后解锁");
    expect(INVENTOR_LOCK_TIP).toContain("期末大 Boss 还在准备中");
    expect(INVENTOR_SWITCH_LOCKED_TIP).toBe("打败期末大 Boss 后才能换成它。");
    expect(INVENTOR_UNLOCK_MAIN).toContain("发明家来找你了");
    expect(INVENTOR_UNLOCK_SUB).toBe("可以在技能页换成发明家。");
    expect(INVENTOR_UNLOCK_GO).toBe("去看看");
    expect(INVENTOR_UNLOCK_LATER).toBe("等会儿");
    expect(scene).toContain("INVENTOR_LOCK_TITLE");
    expect(scene).toContain("INVENTOR_LOCK_TIP");
    expect(scene).toContain("lockedCardTip");
    expect(scene).toContain("showLockTip");
    expect(scene).not.toContain("if (!unlocked) return");
    expect(scene).toContain("PORTRAIT_LOCKED_FRAME");
    expect(scene).not.toContain("setTint(0x141414)");
    expect(scene).not.toContain("unlockClasses");
  });

  it("keeps the current class and shows the full lock tip when the inventor card is chosen", () => {
    expect(INVENTOR_UNLOCK_ENABLED).toBe(false);
    expect(INVENTOR_LOCK_NOTE).toBe("打败期末大 Boss 后解锁");
    expect(INVENTOR_LOCK_TIP).toBe(
      "这里藏着一位新朋友。打败任意一个期末大 Boss，就能请它加入。期末大 Boss 还在准备中，先和大家一起去冒险吧！",
    );
    expect(INVENTOR_LOCK_TIP).not.toBe(INVENTOR_LOCK_NOTE);
    expect(INVENTOR_LOCK_BUTTON).toBe("好的");
    expect(lockedCardTip("inventor", null)).toBe(INVENTOR_LOCK_TIP);
    expect(lockedCardTip("inventor", { unlockedClassIds: ["inventor"] })).toBe(INVENTOR_LOCK_TIP);
    expect(lockedCardTip("warrior", null)).toBeNull();
    expect(selectClass("explorer", "inventor", { unlockedClassIds: ["inventor"] })).toBe("explorer");
    const scene = readFileSync(new URL("../game/scenes/CreateScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("INVENTOR_LOCK_BUTTON");
    expect(scene).not.toContain("icon_lock");
  });

  it("C-12 case 4 does not unlock inventor when the save only lists unlockedClassIds", () => {
    const raw = claimedSave("warrior");
    delete raw.inventorUnlockedAt;
    delete raw.inventorUnlockedBy;
    delete raw.examProgress;
    raw.unlockedClassIds = ["inventor"];
    expect(raw.examProgress).toBeUndefined();
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.player.classId).toBe("warrior");
    expect(isClassSelectable("inventor", loaded)).toBe(false);
    expect(isClassUnlocked("inventor", loaded)).toBe(false);
    expect(selectClass("mage", "inventor", loaded)).toBe("mage");
    const kept = JSON.parse(serialize(loaded!)) as typeof raw;
    expect(kept.unlockedClassIds).toEqual(["inventor"]);
    expect(kept.examProgress).toBeUndefined();
    expect(kept.inventorUnlockedAt).toBeUndefined();
  });

  it("C-12 case 5 does not unlock inventor when only exam clears are stored, one or all eight", () => {
    const one = claimedSave("warrior");
    delete one.unlockedClassIds;
    delete one.inventorUnlockedAt;
    delete one.inventorUnlockedBy;
    expect(one.player.classId).toBe("warrior");
    expect(one.unlockedClassIds).toBeUndefined();
    one.examProgress = { exam_g3_s1_final: { cleared: true, bestPhase: 3 } };
    const oneLoaded = deserialize(JSON.stringify(one));
    expect(oneLoaded?.player.classId).toBe("warrior");
    expect(isClassSelectable("inventor", oneLoaded)).toBe(false);
    expect(JSON.parse(serialize(oneLoaded!)).examProgress).toEqual(one.examProgress);
    expect(JSON.parse(serialize(oneLoaded!)).unlockedClassIds).toBeUndefined();

    const exams = [
      "exam_g3_s1_final",
      "exam_g3_s2_final",
      "exam_g4_s1_final",
      "exam_g4_s2_final",
      "exam_g5_s1_final",
      "exam_g5_s2_final",
      "exam_g6_s1_final",
      "exam_g6_s2_final",
    ];
    const all = claimedSave("warrior");
    delete all.unlockedClassIds;
    delete all.inventorUnlockedAt;
    delete all.inventorUnlockedBy;
    all.examProgress = Object.fromEntries(exams.map((id) => [id, { cleared: true, bestPhase: 3 }]));
    const allLoaded = deserialize(JSON.stringify(all));
    expect(allLoaded?.player.classId).toBe("warrior");
    expect(isClassSelectable("inventor", allLoaded)).toBe(false);
    expect(selectClass("warrior", "inventor", allLoaded)).toBe("warrior");
    expect(JSON.parse(serialize(allLoaded!)).examProgress).toEqual(all.examProgress);
    expect(JSON.parse(serialize(allLoaded!)).unlockedClassIds).toBeUndefined();
  });
});
