import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { createSave, learnWord, setSelectedGrades } from "./progress";
import { mapPanel } from "./map-panel";
import { bossUnlockLine, FOREST_CHAPTER, requiredWordIds, stageStatuses } from "./stages";

const START = new Date("2026-03-01T02:00:00Z");

function saveWith(grades: string[] = ["G3", "G4", "G5", "G6"]) {
  return setSelectedGrades(
    createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
    }),
    grades,
  );
}

describe("forest map panel", () => {
  it("hides every word on a locked stage and still counts real cards", () => {
    let save = saveWith();
    save = learnWord(save, "cloud", START);
    const stage = FOREST_CHAPTER.stages[2]!;
    expect(stageStatuses(save)[2]).toBe("locked");
    const panel = mapPanel(save, stage, "locked");
    expect(panel.goal).toBe("过桥登山，动作与地形容词");
    expect(panel.words).toHaveLength(stage.new_words.length);
    expect(panel.words.every((face) => face.english === null && face.interactive === false)).toBe(true);
    expect(panel.words.map((face) => face.id)).toEqual(["cloud", "jump", "mountain", "bridge", "path", "climb"]);
    expect(panel.learned).toBe(1);
    expect(panel.total).toBe(6);
    expect(panel.wins).toBeNull();
    expect(panel.unlockLine).toBe("通过第 2 关后开启");
    expect(panel.buttons).toEqual([{ id: "fight", label: "未开启", enabled: false, tone: "primary" }]);
  });

  it("shows english only for introduced words on the open stage", () => {
    let save = saveWith();
    const stage = FOREST_CHAPTER.stages[0]!;
    save = learnWord(save, stage.new_words[0]!, START);
    const panel = mapPanel(save, stage, "open");
    expect(panel.statusLabel).toBe("进行中");
    expect(panel.goal).toBeNull();
    expect(panel.words[0]).toMatchObject({ english: "tree", interactive: true });
    expect(panel.words.slice(1).every((face) => face.english === null && !face.interactive)).toBe(true);
    expect(panel.wins).toBe(0);
    expect(panel.buttons.map((button) => button.label)).toEqual(["去学堂", "小战斗"]);
    expect(panel.buttons.every((button) => button.enabled)).toBe(true);
  });

  it("shows every english word after the stage is cleared", () => {
    let save = saveWith();
    const stage = FOREST_CHAPTER.stages[0]!;
    for (const id of stage.new_words) save = learnWord(save, id, START);
    save = { ...save, stageWins: { "1": 2 } };
    const panel = mapPanel(save, stage, "cleared");
    expect(panel.statusLabel).toBe("已通过");
    expect(panel.words.every((face) => face.english && face.interactive)).toBe(true);
    expect(panel.learned).toBe(6);
    expect(panel.wins).toBe(2);
    expect(panel.buttons.map((button) => [button.label, button.tone])).toEqual([
      ["去学堂", "secondary"],
      ["再战", "coral"],
    ]);
  });

  it("shows the boss lock line for the grades that are actually selected", () => {
    const stage = FOREST_CHAPTER.stages[4]!;
    const everyGrade = saveWith();
    const all = mapPanel(everyGrade, stage, "locked");
    expect(all.goal).toBe("夺回宝藏，通关本章");
    expect(requiredWordIds(everyGrade)).toHaveLength(28);
    expect(all.unlockLine).toBe("通过前 4 关并学完 28 个词");
    expect(all.unlockLine).toBe(bossUnlockLine(everyGrade));
    expect(all.words.every((face) => face.english === null)).toBe(true);
    expect(all.total).toBe(4);
    expect(all.buttons).toEqual([{ id: "fight", label: "挑战林心守护者", enabled: false, tone: "coral" }]);

    const grade3 = saveWith(["G3"]);
    const one = mapPanel(grade3, stage, "locked");
    expect(requiredWordIds(grade3)).toHaveLength(16);
    expect(one.unlockLine).toBe("通过前 4 关并学完 16 个词");
    expect(one.unlockLine).not.toBe(all.unlockLine);

    const three = saveWith(["G3", "G4", "G5"]);
    expect(mapPanel(three, stage, "locked").unlockLine).toBe("通过前 4 关并学完 25 个词");
  });

  it("reveals a boss word only after that card exists", () => {
    let save = saveWith();
    save = learnWord(save, "treasure", START);
    const panel = mapPanel(save, FOREST_CHAPTER.stages[4]!, "open");
    expect(panel.statusLabel).toBe("可挑战");
    expect(panel.words[0]).toMatchObject({ english: "treasure", interactive: true });
    expect(panel.words.slice(1).every((face) => face.english === null)).toBe(true);
    expect(panel.buttons[0]?.enabled).toBe(true);
  });

  it("keeps an unlearned word hidden after the stage is cleared", () => {
    let save = saveWith(["G3"]);
    for (const id of ["tree", "bird", "fish", "sun", "map"]) save = learnWord(save, id, START);
    save = { ...save, stageWins: { "1": 1 } };
    expect(stageStatuses(save)[0]).toBe("cleared");
    const panel = mapPanel(save, FOREST_CHAPTER.stages[0]!, "cleared");
    expect(panel.words.find((face) => face.id === "tree")).toMatchObject({ english: "tree", interactive: true });
    expect(panel.words.find((face) => face.id === "run")).toMatchObject({ english: null, interactive: false });
  });

  it("asks for one small battle when the selected grades have no words on the stage", () => {
    const save = saveWith(["G5"]);
    const stage = FOREST_CHAPTER.stages[0]!;
    expect(stageStatuses(save)[0]).toBe("open");
    const panel = mapPanel(save, stage, "open");
    expect(panel.words.every((face) => face.english === null && face.interactive === false)).toBe(true);
    expect(panel.words).toHaveLength(stage.new_words.length);
    expect(panel.goal).toBe("赢 1 场小战斗");
    expect(panel.note).toBe("这一关没有要学的新词。赢 1 场小战斗就算通过。");
    expect(panel.statusLabel).toBe("进行中");
    expect(panel.buttons.find((button) => button.id === "fight")).toMatchObject({ label: "小战斗", enabled: true });
    expect(panel.total).toBe(stage.new_words.length);
  });
});
