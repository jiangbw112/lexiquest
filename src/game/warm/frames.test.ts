import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../../domain/appearance";
import { createSave, learnWord, setSelectedGrades } from "../../domain/progress";
import { bossReady, requiredWordIds, stageStatuses } from "../../domain/stages";
import sliceFile from "./slices.json";
import { BOSS_NODE_ORIGIN, bossMapFrame, tabFrame, tabLabelY } from "./frames";
import { CHIP_ON, INK, TEAL_DEEP, TERRA } from "./theme";

const START = new Date("2026-03-01T02:00:00Z");

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

interface AtlasFile {
  frames: Record<string, AtlasFrame>;
  meta: { size: { w: number; h: number } };
}

function atlas(name: string): AtlasFile {
  return JSON.parse(readFileSync(`public/assets/warm/atlas/${name}.json`, "utf8")) as AtlasFile;
}

function png(name: string): PNG {
  return PNG.sync.read(readFileSync(`public/assets/warm/atlas/${name}.png`));
}

function newSave(grades: string[]) {
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

function learnRequired(save: ReturnType<typeof newSave>) {
  let next = save;
  for (const id of requiredWordIds(save)) next = learnWord(next, id, START);
  return { ...next, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
}

function centerHex(image: PNG, frame: AtlasFrame): string {
  const x = frame.frame.x + Math.floor(frame.frame.w / 2);
  const y = frame.frame.y + Math.floor(frame.frame.h / 2);
  const i = (y * image.width + x) * 4;
  return `#${[image.data[i], image.data[i + 1], image.data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

describe("warm batch b2.2 palette frames", () => {
  it("paints the eleven action and chip frames with the declared fills and keeps the ink outline", () => {
    const battle = atlas("atlas_battle");
    const battlePng = png("atlas_battle");
    const ui = atlas("atlas_ui_core");
    const uiPng = png("atlas_ui_core");
    expect(centerHex(battlePng, battle.frames.btn_action_coral_normal!)).toBe(TERRA);
    expect(centerHex(battlePng, battle.frames.btn_action_teal_normal!)).toBe(TEAL_DEEP);
    expect(centerHex(battlePng, battle.frames.hp_fill_coral!)).toBe(TERRA);
    expect(centerHex(battlePng, battle.frames.hp_fill_teal!)).toBe(TEAL_DEEP);
    expect(centerHex(uiPng, ui.frames.chip_on_normal!)).toBe(CHIP_ON);
    expect(centerHex(uiPng, ui.frames.chip_on_hover!)).toBe(CHIP_ON);
    expect(centerHex(uiPng, ui.frames.chip_on_pressed!)).toBe(CHIP_ON);
    expect(centerHex(battlePng, battle.frames.btn_action_coral_hover!)).not.toBe("#E76F51");
    expect(centerHex(battlePng, battle.frames.btn_action_teal_pressed!)).not.toBe("#30938B");
    const coral = battle.frames.btn_action_coral_normal!.frame;
    let ink = 0;
    for (let row = 0; row < coral.h; row += 1) {
      for (let col = 0; col < coral.w; col += 1) {
        const i = ((coral.y + row) * battlePng.width + (coral.x + col)) * 4;
        const hex = `#${[battlePng.data[i], battlePng.data[i + 1], battlePng.data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
        if (battlePng.data[i + 3] > 200 && hex === INK) ink += 1;
      }
    }
    expect(ink).toBeGreaterThan(1000);
    const names = [
      "btn_action_coral_normal",
      "btn_action_coral_hover",
      "btn_action_coral_pressed",
      "hp_fill_coral",
      "btn_action_teal_normal",
      "btn_action_teal_hover",
      "btn_action_teal_pressed",
      "hp_fill_teal",
      "chip_on_normal",
      "chip_on_hover",
      "chip_on_pressed",
    ];
    expect(names).toHaveLength(11);
    for (const name of names) {
      const pack = name.startsWith("chip") ? ui : battle;
      expect(pack.frames[name]).toBeTruthy();
    }
  });
});

describe("warm batch b2.1 frames", () => {
  it("loads tab_pressed at 208×104 with the same nine-slice insets as the other tabs", () => {
    const file = atlas("atlas_ui_core");
    const frame = file.frames.tab_pressed;
    expect(frame).toBeTruthy();
    expect(frame?.sourceSize).toEqual({ w: 208, h: 104 });
    expect(frame?.frame.w).toBe(208);
    expect(frame?.frame.h).toBe(104);
    expect(frame!.frame.x + frame!.frame.w).toBeLessThanOrEqual(file.meta.size.w);
    expect(frame!.frame.y + frame!.frame.h).toBeLessThanOrEqual(file.meta.size.h);
    const image = png("atlas_ui_core");
    expect(image.width).toBe(file.meta.size.w);
    expect(image.height).toBe(file.meta.size.h);
    const parts = sliceFile.parts as unknown as Record<string, { nineslice: { left: number; right: number; top: number; bottom: number } | null }>;
    for (const name of ["tab_normal", "tab_hover", "tab_pressed", "tab_selected", "tab_disabled"]) {
      expect(parts[name]?.nineslice).toEqual({ left: 34, right: 34, top: 30, bottom: 24 });
    }
  });

  it("loads map_node_boss_ready at 300×300 with the same anchor as map_node_boss", () => {
    const file = atlas("atlas_map");
    const ready = file.frames.map_node_boss_ready;
    const locked = file.frames.map_node_boss;
    expect(ready?.sourceSize).toEqual({ w: 300, h: 300 });
    expect(locked?.sourceSize).toEqual({ w: 300, h: 300 });
    expect(ready?.frame).toMatchObject({ w: 300, h: 300 });
    expect(ready!.frame.x + 300).toBeLessThanOrEqual(file.meta.size.w);
    expect(ready!.frame.y + 300).toBeLessThanOrEqual(file.meta.size.h);
    const image = png("atlas_map");
    expect(image.width).toBe(file.meta.size.w);
    expect(image.height).toBe(file.meta.size.h);
    expect(BOSS_NODE_ORIGIN).toEqual({ x: 0.5, y: 142 / 300 });
  });

  it("presses an unselected tab onto tab_pressed and releases it onto tab_selected", () => {
    expect(tabFrame(false, "normal")).toBe("tab_normal");
    expect(tabFrame(false, "hover")).toBe("tab_hover");
    expect(tabFrame(false, "pressed")).toBe("tab_pressed");
    expect(tabLabelY(false, "normal")).toBe(-2);
    expect(tabLabelY(false, "pressed")).toBe(0);
    expect(tabFrame(false, "released")).toBe("tab_selected");
    expect(tabLabelY(false, "released")).toBe(-2);
    expect(tabFrame(true, "pressed")).toBe("tab_selected");
    expect(tabLabelY(true, "pressed")).toBe(-2);
    expect(tabFrame(true, "hover")).toBe("tab_selected");
  });

  it("uses the locked boss frame until the selected grades and extras are learned", () => {
    const all = newSave(["G3", "G4", "G5", "G6"]);
    expect(bossReady(all)).toBe(false);
    expect(bossMapFrame(stageStatuses(all)[4]!)).toBe("map_node_boss");

    const grade3 = learnRequired(newSave(["G3"]));
    expect(requiredWordIds(grade3)).toHaveLength(16);
    expect(bossReady(grade3)).toBe(true);
    expect(bossMapFrame(stageStatuses(grade3)[4]!)).toBe("map_node_boss_ready");

    const stillWide = learnRequired(newSave(["G3"]));
    const widened = setSelectedGrades(stillWide, ["G3", "G4", "G5", "G6"]);
    expect(bossReady(widened)).toBe(false);
    expect(bossMapFrame(stageStatuses(widened)[4]!)).toBe("map_node_boss");

    const ready = learnRequired(newSave(["G3", "G4", "G5", "G6"]));
    expect(requiredWordIds(ready)).toHaveLength(28);
    expect(bossReady(ready)).toBe(true);
    expect(bossMapFrame(stageStatuses(ready)[4]!)).toBe("map_node_boss_ready");
    expect(bossMapFrame("cleared")).toBe("map_node_boss_ready");
  });
});
