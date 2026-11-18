import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { createSave, learnWord, setSelectedGrades } from "./progress";
import { buildResultsView } from "./battle-results";
import { mapPanel } from "./map-panel";
import { gradeChapters } from "./chapter-plan";
import { bossUnlockLine, FOREST_CHAPTER, requiredWordIds, stageCleared, stageLearnMoreLine, stageStatuses, stageWordIds, stageWordsStillToLearn } from "./stages";

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
    let at = START.getTime();
    for (const id of stage.new_words) {
      const learned = learnWord(save, id, new Date(at));
      if (!learned.wordCards[id]) {
        at += 86_400_000;
        save = learnWord(save, id, new Date(at));
      } else save = learned;
    }
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
    expect(all.unlockLine).toBe("在学堂学完本章词就能挑战");
    expect(all.unlockLine).toBe(bossUnlockLine());
    expect(all.total).toBe(requiredWordIds(everyGrade).length);
    expect(all.learned).toBe(0);
    expect(all.progressLabel).toBe(`本章已学 0/${all.total} 个词`);
    expect(all.progressLabel).not.toContain("本关");
    expect(all.missingLines.length).toBeGreaterThan(0);
    expect(all.missingLines.join("")).toContain("tree");
    expect(all.buttons.filter((button) => button.id === "learn")).toEqual([
      expect.objectContaining({ enabled: true, label: "去三年级学这几个", grade: "G3" }),
    ]);
    expect(all.buttons.at(-1)).toEqual({ id: "fight", label: "挑战林心守护者", enabled: false, tone: "coral" });

    const gradeChapter = gradeChapters("G3")[0]!;
    const gradeBoss = gradeChapter.stages.find((item) => item.type === "boss");
    if (!gradeBoss) throw new Error("grade boss missing");
    const gradePanel = mapPanel(everyGrade, gradeBoss, "locked", undefined, gradeChapter);
    expect(gradePanel.total).toBe(gradeChapter.wordIds.length);
    expect(gradePanel.progressLabel).toBe(`本章已学 0/${gradeChapter.wordIds.length} 个词`);

    const grade3 = saveWith(["G3"]);
    const one = mapPanel(grade3, stage, "locked");
    expect(requiredWordIds(grade3)).toHaveLength(16);
    expect(one.unlockLine).toBe("在学堂学完本章词就能挑战");
    expect(one.buttons.filter((button) => button.id === "learn")).toHaveLength(1);

    const three = saveWith(["G3", "G4", "G5"]);
    const threePanel = mapPanel(three, stage, "locked");
    expect(threePanel.unlockLine).toBe("在学堂学完本章词就能挑战");
    expect(threePanel.buttons.filter((button) => button.id === "learn")).toHaveLength(1);
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
    expect(panel.total).toBe(0);
    expect(panel.learned).toBe(0);
    expect(panel.progressLabel).toBeNull();
    expect(`${panel.goal ?? ""} ${panel.note ?? ""}`).not.toMatch(/\d+\/\d+/);
  });

  it("shows a stage as cleared after one win and keeps the remaining-word hint", () => {
    let save = saveWith(["G3"]);
    const stage = FOREST_CHAPTER.stages[0]!;
    const ids = stageWordIds(save, stage);
    expect(ids.length).toBeGreaterThan(1);
    save = learnWord(save, ids[0]!, START);
    expect(stageCleared(save, stage)).toBe(false);
    const beforeWin = stageWordsStillToLearn(save, stage);
    const waiting = mapPanel(save, stage, "open");
    expect(waiting.note).toBe(`这一关还有 ${beforeWin} 个新词可以去学堂学`);
    expect(waiting.progressLabel).toBe(`本关已学 1/${ids.length} 个词`);
    expect(waiting.statusLabel).toBe("进行中");
    save = { ...save, stageWins: { "1": 1 }, battlesWon: 1 };
    expect(stageCleared(save, stage)).toBe(true);
    expect(stageStatuses(save)[0]).toBe("cleared");
    expect(stageStatuses(save)[1]).toBe("open");
    const remaining = stageWordsStillToLearn(save, stage);
    expect(remaining).toBe(ids.length - 1);
    const panel = mapPanel(save, stage, "cleared");
    expect(panel.note).toBe(stageLearnMoreLine(remaining));
    expect(panel.note).toBe(`这一关还有 ${remaining} 个新词可以去学堂学`);
    expect(panel.note).not.toContain("才能通过");
    expect(panel.progressLabel).toBe(`本关已学 1/${ids.length} 个词`);
    expect(panel.learned).toBe(1);
    expect(panel.total).toBe(ids.length);
    expect(panel.statusLabel).toBe("已通过");
    expect(panel.progressLabel).not.toContain("通过");
    const view = buildResultsView({
      before: save,
      after: { ...save, battlesWon: save.battlesWon + 1, xp: save.xp + 10 },
      answers: [{ wordId: ids[0]!, correct: true, kind: "meaning" }],
      stageId: stage.id,
      boss: false,
      now: START.getTime(),
    });
    expect(view.learnMoreLine).toBe(panel.note);
    expect(view.repeatLine).toBeNull();
    const scene = readFileSync(new URL("../game/scenes/BattleResultsScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("learnMoreLine");
    expect(scene).toContain("repeatLine");
    const map = readFileSync(new URL("../game/scenes/StageMapScene.ts", import.meta.url), "utf8");
    expect(map).toContain("panel.note");
    expect(map).toContain("openAcademyForStage");

    let done = save;
    let at = START.getTime();
    for (const id of ids) {
      if (done.wordCards[id]) continue;
      at += 86_400_000;
      const learned = learnWord(done, id, new Date(at));
      done = learned.wordCards[id] ? learned : learnWord(done, id, new Date(at + 86_400_000));
    }
    expect(stageWordsStillToLearn(done, stage)).toBe(0);
    expect(stageCleared(done, stage)).toBe(true);
    const cleared = mapPanel(done, stage, "cleared");
    expect(cleared.note).toBeNull();
    expect(cleared.progressLabel).toBe(`本关已学 ${ids.length}/${ids.length} 个词`);
    expect(cleared.statusLabel).toBe("已通过");
    const finished = buildResultsView({
      before: done,
      after: { ...done, battlesWon: done.battlesWon + 1 },
      answers: [{ wordId: ids[0]!, correct: true, kind: "meaning" }],
      stageId: stage.id,
      boss: false,
      now: at,
    });
    expect(finished.learnMoreLine).toBeNull();
    expect(finished.repeatLine).toBeNull();
  });
});
