import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { createSave } from "./progress";
import { deserialize, serialize } from "./storage";

const NOW = Date.parse("2026-03-01T02:00:00Z");

function savedBody(classId: unknown, present: boolean) {
  const save = createSave({
    name: "小林",
    classId: "explorer",
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3"],
  });
  save.xp = 40;
  const raw = JSON.parse(serialize(save)) as {
    player: { classId?: unknown; name: string };
    xp: number;
    selectedGrades: string[];
  };
  if (present) raw.player.classId = classId;
  else delete raw.player.classId;
  return JSON.stringify(raw);
}

describe("save class id", () => {
  it("writes a legal class and keeps the rest of the save", () => {
    const created = createSave({
      name: "小林",
      classId: "mage",
      appearance: DEFAULT_APPEARANCE,
      now: NOW,
      grades: ["G3"],
    });
    expect(created.player.classId).toBe("mage");
    const loaded = deserialize(savedBody("mage", true));
    expect(loaded?.player.classId).toBe("mage");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.xp).toBe(40);
    expect(loaded?.selectedGrades).toEqual(["G3"]);
  });

  it("falls back to warrior when classId is missing", () => {
    const loaded = deserialize(savedBody(undefined, false));
    expect(loaded).not.toBeNull();
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.xp).toBe(40);
    expect(loaded?.selectedGrades).toEqual(["G3"]);
  });

  it("falls back to warrior when the saved class is a locked inventor", () => {
    const loaded = deserialize(savedBody("inventor", true));
    expect(loaded).not.toBeNull();
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.xp).toBe(40);
    expect(loaded?.selectedGrades).toEqual(["G3"]);
  });

  it("falls back to warrior when classId is not one of the six", () => {
    const loaded = deserialize(savedBody("not-a-class", true));
    expect(loaded).not.toBeNull();
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.xp).toBe(40);
    expect(loaded?.selectedGrades).toEqual(["G3"]);
  });
});
