import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { sampleWords } from "./catalog";
import { createSave, learnWord, syncUnlocks } from "./progress";
import { fillSkillSlots } from "./skills";
import type { SaveData } from "./types";

const START = new Date("2026-03-01T02:00:00Z");

function healerWithWords(count: number): SaveData {
  let save = createSave({
    name: "小林",
    classId: "healer",
    appearance: DEFAULT_APPEARANCE,
    now: START.getTime(),
    grades: ["G3"],
  });
  sampleWords()
    .slice(0, count)
    .forEach((word, index) => {
      save = learnWord(save, word.id, new Date(START.getTime() + index * 86_400_000));
    });
  return save;
}

describe("healer deck migration", () => {
  it("old save with healer-cheer keeps healer-beam in that slot", () => {
    const save = healerWithWords(4);
    const old: SaveData = {
      ...save,
      battlesWon: 1,
      equippedSkillIds: ["healer-cure", "healer-cheer", "healer-guard"],
      skillLevels: { ...save.skillLevels, "healer-cure": 1, "healer-cheer": 3, "healer-guard": 2 },
    };
    const cards = old.wordCards;
    const migrated = syncUnlocks(old);

    expect(migrated.equippedSkillIds).toEqual(["healer-cure", "healer-beam", "healer-guard"]);
    expect(migrated.wordCards).toBe(cards);
    expect(migrated.skillLevels["healer-cure"]).toBe(1);
    expect(migrated.skillLevels["healer-cheer"]).toBe(3);
    expect(migrated.skillLevels["healer-guard"]).toBe(2);
  });

  it("two cards and zero wins are not only the base move", () => {
    const save = healerWithWords(2);
    const old: SaveData = {
      ...save,
      battlesWon: 0,
      equippedSkillIds: ["healer-cure"],
      unlockedSkillIds: ["healer-cure"],
      skillLevels: { "healer-cure": 1 },
    };
    const migrated = syncUnlocks(old);
    const slots = fillSkillSlots("healer", migrated.equippedSkillIds, migrated.skillLevels);

    expect(migrated.battlesWon).toBe(0);
    expect(Object.keys(migrated.wordCards)).toHaveLength(2);
    expect(migrated.equippedSkillIds).toEqual(["healer-beam"]);
    expect(slots.some((slot) => slot.origin === "equipped" && slot.skillId === "healer-beam")).toBe(true);
    expect(slots.every((slot) => slot.origin === "base")).toBe(false);
  });

  it("migrating the same save twice stays the same", () => {
    const early = healerWithWords(2);
    const old: SaveData = {
      ...early,
      battlesWon: 0,
      equippedSkillIds: ["healer-cure", "healer-cheer"],
      skillLevels: { "healer-cure": 1, "healer-cheer": 2 },
    };
    const once = syncUnlocks(old);
    const twice = syncUnlocks(once);
    expect(twice).toEqual(once);
    expect(once.equippedSkillIds[0]).toBe("healer-beam");
  });
});
