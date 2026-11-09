import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, WARM_TEXT_PAIRS } from "../domain/contrast";
import { gradeGate, setSelectedGrades, createSave } from "../domain/progress";
import { DEFAULT_APPEARANCE } from "../domain/appearance";
import { redirectUngraded } from "./grade-route";
import { OPTION_BADGE_CENTER, STRUGGLE_LIST, meaningScale, struggleWindow, studyNoticeGap } from "./layout";
import { CHIP_ON, INK, TEAL_DEEP, TERRA } from "./warm/theme";

const START = new Date("2026-03-01T02:00:00Z");

describe("parent struggle list", () => {
  it("keeps 0, 6, 10, and 100 rows inside the screen and off the buttons", () => {
    for (const total of [0, 6, 10, 100]) {
      const collapsed = struggleWindow(total, false, 0);
      expect(collapsed.count).toBe(Math.min(total, STRUGGLE_LIST.collapsed));
      expect(collapsed.bottom).toBeLessThan(STRUGGLE_LIST.buttonTop);
      expect(collapsed.bottom).toBeLessThan(STRUGGLE_LIST.screenBottom);
      const pages = Math.max(1, Math.ceil(total / STRUGGLE_LIST.pageSize));
      let seen = 0;
      for (let page = 0; page < pages; page += 1) {
        const list = struggleWindow(total, true, page);
        expect(list.count).toBeLessThanOrEqual(STRUGGLE_LIST.pageSize);
        expect(list.bottom).toBeLessThanOrEqual(693);
        expect(list.bottom).toBeLessThan(STRUGGLE_LIST.buttonTop);
        expect(list.bottom).toBeLessThan(STRUGGLE_LIST.screenBottom);
        seen += list.count;
      }
      expect(seen).toBe(total);
    }
    expect(struggleWindow(10, true, 0)).toMatchObject({ pages: 2, count: 6, start: 0 });
    expect(struggleWindow(10, true, 1)).toMatchObject({ count: 4, start: 6 });
    expect(struggleWindow(100, true, 0).pages).toBe(17);
    expect(struggleWindow(100, true, 99)).toMatchObject({ page: 16, count: 4 });
    expect(struggleWindow(0, true, 0)).toMatchObject({ count: 0, pages: 1 });
    expect(struggleWindow(6, true, 0)).toMatchObject({ count: 6, pages: 1 });
  });
});

describe("study card and option alignment", () => {
  it("leaves a gap between the miss notice and the English word", () => {
    expect(studyNoticeGap()).toBeGreaterThanOrEqual(24);
  });

  it("scales a long Chinese line down to the card width", () => {
    expect(meaningScale(400)).toBe(1);
    expect(meaningScale(800)).toBeCloseTo(0.8);
  });

  it("centers the option index on the circular badge", () => {
    expect(OPTION_BADGE_CENTER).toBe(22);
    const kit = readFileSync(new URL("./warm/kit.ts", import.meta.url), "utf8");
    expect(kit).toContain("OPTION_BADGE_CENTER");
    expect(kit).not.toContain('fontSize: "24px", color: DIS_TEXT');
    expect(kit).toContain('fontSize: "22px", color: DIS_TEXT');
  });
});

describe("grade gate routing", () => {
  it("keeps a saved grade when the parent draft is empty, and opens the picker only for an already-empty save", () => {
    const save = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
      grades: ["G3"],
    });
    expect(setSelectedGrades(save, [])).toBe(save);
    expect(gradeGate(save)).toBe("ready");
    const starts: unknown[] = [];
    const host = { scene: { start: (...args: unknown[]) => { starts.push(args); } } };
    expect(redirectUngraded(host, save)).toBe(false);
    expect(starts).toEqual([]);
    const fresh = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: START.getTime(),
    });
    expect(redirectUngraded(host, fresh)).toBe(true);
    expect(starts).toEqual([["grades", { mode: "migrate" }]]);
    const parent = readFileSync(new URL("./scenes/GuideScene.ts", import.meta.url), "utf8");
    expect(parent).toContain("保存年级");
    expect(parent).toContain("disabled: !canSave");
    expect(parent).toContain("GRADE_REQUIRED_NOTICE");
    const scene = readFileSync(new URL("./scenes/GradeScene.ts", import.meta.url), "utf8");
    expect(scene).not.toContain("ask-parent");
    expect(scene).not.toContain("请家长打开家长页");
  });
});

describe("warm text contrast", () => {
  it("measures declared text color against declared fill", () => {
    const rows = WARM_TEXT_PAIRS.map((pair) => ({
      name: pair.name,
      ratio: Number(contrastRatio(pair.fg, pair.bg).toFixed(2)),
    }));
    expect(rows).toEqual([
      { name: "ink on cream", ratio: 12.5 },
      { name: "muted on cream", ratio: 10.4 },
      { name: "error on cream", ratio: 6.59 },
      { name: "disabled label on disabled fill", ratio: 7.48 },
      { name: "cream on terra button", ratio: 5.45 },
      { name: "cream on deep teal button", ratio: 5.47 },
      { name: "cream on selected chip", ratio: 5.7 },
    ]);
    expect(rows.filter((row) => row.ratio < 4.5)).toEqual([]);
    expect(WARM_TEXT_PAIRS.map((pair) => pair.bg)).toEqual([
      "#FFF4DC",
      "#FFF4DC",
      "#FFF4DC",
      "#CFC4B2",
      TERRA,
      TEAL_DEEP,
      CHIP_ON,
    ]);
    expect(WARM_TEXT_PAIRS[0]?.fg).toBe(INK);
    const tabs = readFileSync(new URL("./warm/kit.ts", import.meta.url), "utf8");
    expect(tabs).not.toContain("strokeThickness: selected ? 3");
  });
});

describe("boot and renderer guards", () => {
  it("counts the files the boot scene loads and forces WebGL", () => {
    const budget = readFileSync(new URL("../../tools/boot-budget.mjs", import.meta.url), "utf8");
    expect(budget).toContain("village.png");
    expect(budget).toContain("actors.png");
    expect(budget).toContain("chapter/forest/v0.1/atlas");
    const main = readFileSync(new URL("./../main.ts", import.meta.url), "utf8");
    expect(main).toContain("Phaser.WEBGL");
    expect(main).not.toContain("Phaser.AUTO");
    expect(main).toContain("WEBGL_REQUIRED_MESSAGE");
    const probe = readFileSync(new URL("./../nineslice-probe.ts", import.meta.url), "utf8");
    expect(probe).toContain("Phaser.WEBGL");
    expect(probe).not.toContain("Phaser.CANVAS");
    const map = readFileSync(new URL("./scenes/StageMapScene.ts", import.meta.url), "utf8");
    expect(map).toContain("initialMapStageId");
    expect(map).toContain("this.tweens.killAll()");
    expect(map).toContain("learnedRequiredCount(save)");
    expect(map).toContain("required.length");
    expect(map).not.toContain("FOREST_WORD_COUNT");
  });
});
