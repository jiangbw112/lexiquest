import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../../domain/appearance";
import { createSave, learnWord, setSelectedGrades } from "../../domain/progress";
import { bossReady, requiredWordIds, stageStatuses } from "../../domain/stages";
import sliceFile from "./slices.json";
import { BOSS_NODE_ORIGIN, bossMapFrame, tabFrame, tabLabelY } from "./frames";
import { CHIP_ON, TEAL_DEEP, TEAL_DEEP_HOVER, TERRA, TERRA_HOVER, TERRA_PRESSED } from "./theme";

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
  let at = START.getTime();
  for (const id of requiredWordIds(save)) {
    let learned = learnWord(next, id, new Date(at));
    if (!learned.wordCards[id]) {
      at += 86_400_000;
      learned = learnWord(next, id, new Date(at));
    }
    next = learned;
  }
  return { ...next, stageWins: { "1": 1, "2": 1, "3": 1, "4": 1 } };
}

function faceMedian(name: string, frameName: string): string {
  const file = atlas(name);
  const image = png(name);
  const box = file.frames[frameName]?.frame;
  if (!box) throw new Error(frameName);
  const x0 = box.x + Math.floor(box.w * 0.4);
  const x1 = box.x + Math.floor(box.w * 0.75);
  const y0 = box.y + Math.floor(box.h * 0.25);
  const y1 = box.y + Math.floor(box.h * 0.5);
  const channels: number[][] = [[], [], []];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * image.width + x) * 4;
      if (image.data[index + 3]! < 200) continue;
      channels[0]!.push(image.data[index]!);
      channels[1]!.push(image.data[index + 1]!);
      channels[2]!.push(image.data[index + 2]!);
    }
  }
  const mid = channels.map((values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  });
  return `#${mid.map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

describe("warm batch b2.2 faces", () => {
  it("keeps frame names and rectangles while the text-carrying faces use the new palette", () => {
    const battle = atlas("atlas_battle");
    const core = atlas("atlas_ui_core");
    expect(battle.meta.size).toEqual({ w: 2048, h: 1024 });
    expect(core.meta.size).toEqual({ w: 1024, h: 2048 });
    expect(battle.frames.btn_action_coral_normal?.frame).toEqual({ x: 2, y: 356, w: 176, h: 112 });
    expect(battle.frames.btn_action_coral_hover?.frame).toEqual({ x: 180, y: 356, w: 176, h: 112 });
    expect(battle.frames.btn_action_coral_pressed?.frame).toEqual({ x: 358, y: 356, w: 176, h: 112 });
    expect(battle.frames.btn_action_teal_normal?.frame).toEqual({ x: 714, y: 356, w: 176, h: 112 });
    expect(battle.frames.btn_action_teal_hover?.frame).toEqual({ x: 2, y: 470, w: 176, h: 112 });
    expect(battle.frames.btn_action_teal_pressed?.frame).toEqual({ x: 180, y: 470, w: 176, h: 112 });
    expect(core.frames.chip_on_normal?.frame).toEqual({ x: 608, y: 944, w: 200, h: 112 });
    expect(core.frames.chip_on_hover?.frame).toEqual({ x: 810, y: 944, w: 200, h: 112 });
    expect(core.frames.chip_on_pressed?.frame).toEqual({ x: 2, y: 1058, w: 200, h: 112 });
    expect(core.frames.chip_on_disabled?.frame).toEqual({ x: 204, y: 1058, w: 200, h: 112 });
    expect(core.frames.dialog?.frame).toEqual({ x: 2, y: 2, w: 240, h: 240 });
    expect(faceMedian("atlas_battle", "btn_action_coral_normal")).toBe(TERRA);
    expect(faceMedian("atlas_battle", "btn_action_coral_hover")).toBe(TERRA_HOVER);
    expect(faceMedian("atlas_battle", "btn_action_coral_pressed")).toBe(TERRA_PRESSED);
    expect(faceMedian("atlas_battle", "btn_action_teal_normal")).toBe(TEAL_DEEP);
    expect(faceMedian("atlas_battle", "btn_action_teal_hover")).toBe(TEAL_DEEP_HOVER);
    expect(faceMedian("atlas_battle", "btn_action_teal_pressed")).toBe(CHIP_ON);
    expect(faceMedian("atlas_ui_core", "chip_on_normal")).toBe(CHIP_ON);
    expect(faceMedian("atlas_ui_core", "chip_on_pressed")).toBe(CHIP_ON);
    expect(faceMedian("atlas_ui_core", "btn_primary_normal")).toBe("#E9C46A");
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
    expect(bossMapFrame("cleared")).toBe("map_node_boss_cleared");
  });
});
