import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRows, renderContrastDoc } from "../domain/contrast";
import { CHIP_ON, TEAL_DEEP, TERRA, TITLE_PLANK } from "./warm/theme";
import { gradeGate, setSelectedGrades, createSave } from "../domain/progress";
import { DEFAULT_APPEARANCE } from "../domain/appearance";
import { redirectUngraded } from "./grade-route";
import { OPTION_BADGE_CENTER, STRUGGLE_LIST, WARDROBE_TITLE_Y, cjkWrap, meaningScale, rewardDialogChrome, struggleButtonTop, struggleWindow, studyNoticeGap, wrapCjkText } from "./layout";

const START = new Date("2026-03-01T02:00:00Z");

describe("parent struggle list", () => {
  it("keeps 0, 6, 10, and 100 rows inside the screen and off the buttons", () => {
    for (const total of [0, 6, 10, 100]) {
      const collapsed = struggleWindow(total, false, 0);
      expect(collapsed.count).toBe(Math.min(total, STRUGGLE_LIST.collapsed));
      expect(collapsed.bottom).toBeLessThanOrEqual(struggleButtonTop() - STRUGGLE_LIST.gap);
      expect(collapsed.bottom).toBeLessThan(STRUGGLE_LIST.screenBottom);
      const pages = Math.max(1, Math.ceil(total / STRUGGLE_LIST.pageSize));
      let seen = 0;
      for (let page = 0; page < pages; page += 1) {
        const list = struggleWindow(total, true, page);
        expect(list.count).toBeLessThanOrEqual(STRUGGLE_LIST.pageSize);
        expect(list.bottom).toBeLessThanOrEqual(struggleButtonTop() - STRUGGLE_LIST.gap);
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
    const confirmedEmpty = { ...fresh, gradesConfirmed: true };
    expect(gradeGate(confirmedEmpty)).toBe("ask-parent");
    expect(redirectUngraded(host, confirmedEmpty)).toBe(true);
    expect(starts).toEqual([
      ["grades", { mode: "migrate" }],
      ["grades", { mode: "ask-parent" }],
    ]);
    const parent = readFileSync(new URL("./scenes/GuideScene.ts", import.meta.url), "utf8");
    expect(parent).toContain("保存年级");
    expect(parent).toContain("disabled: !canSave");
    expect(parent).toContain("GRADE_REQUIRED_NOTICE");
    expect(parent).toContain("STRUGGLE_LIST.buttonCenter");
    const scene = readFileSync(new URL("./scenes/GradeScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("ask-parent");
    expect(scene).toContain("请家长选年级");
    expect(scene).toContain("去给家长");
    expect(scene).toContain("这一页不能改年级");
  });
});

describe("warm text contrast", () => {
  it("writes the WCAG table from text fill against the fill behind it", () => {
    const doc = readFileSync(new URL("../../docs/contrast_wcag.md", import.meta.url), "utf8");
    expect(doc).toBe(renderContrastDoc());
    expect(contrastRows().length).toBeGreaterThan(40);
    expect(contrastRows().filter((row) => !row.pass)).toEqual([]);
    const approved = [
      ["徽章", "变灰", "#5B4B6B", "#FFF4DC"],
      ["名称", "未解锁", "#5B4B6B", "#FFF4DC"],
      ["确认", "悬停", "#FFF4DC", "#1F6F64"],
      ["技能", "常态", "#FFF4DC", "#A9432B"],
      ["奖励标题", "常态", "#FFF4DC", "#775036"],
      ["招牌", "常态", "#3B2A20", "#FFF4DC"],
      ["确认", "禁用", "#3F2E25", "#CFC4B2"],
    ] as const;
    for (const [control, state, fg, bg] of approved) {
      const row = contrastRows().find((item) => item.control === control && item.state === state && item.fg === fg && item.bg === bg);
      expect(row?.pass, `${control} ${state}`).toBe(true);
      expect(row && row.ratio).toBeGreaterThanOrEqual(4.5);
    }
    const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
    expect(ui).not.toContain("0x2f9a63");
    expect(doc).not.toContain("Colors were not changed");
    expect(doc).not.toContain("没有改颜色");
    const terra = contrastRows().find((row) => row.control === "赤陶按钮" && row.state === "常态");
    const teal = contrastRows().find((row) => row.control === "深青按钮" && row.state === "常态");
    const chip = contrastRows().find((row) => row.control === "选中芯片" && row.state === "常态");
    const plank = contrastRows().find((row) => row.control === "顶栏标题牌");
    expect(terra?.bg).toBe(TERRA);
    expect(teal?.bg).toBe(TEAL_DEEP);
    expect(chip?.bg).toBe(CHIP_ON);
    expect(plank?.fg).toBe("#3B2A20");
    expect(plank?.bg).toBe(TITLE_PLANK);
    expect(plank?.stroke).toBe("无");
    expect(terra?.pass).toBe(true);
    expect(teal?.pass).toBe(true);
    expect(chip?.pass).toBe(true);
    expect(plank?.pass).toBe(true);
    expect(contrastRows().filter((row) => row.control === "赤陶按钮" || row.control === "深青按钮" || row.control === "选中芯片").every((row) => row.pass)).toBe(true);
  });
});

describe("boot and renderer guards", () => {
  it("counts the files the boot scene loads and forces WebGL", () => {
    const budget = readFileSync(new URL("../../tools/boot-budget.mjs", import.meta.url), "utf8");
    expect(budget).toContain("bg_village_2x.webp");
    expect(budget).toContain("atlas_village");
    expect(budget).toContain("bg_home_2x.webp");
    expect(budget).not.toContain("bg_forest_battle");
    const boot = readFileSync(new URL("./scenes/BootScene.ts", import.meta.url), "utf8");
    expect(boot).toContain("bg_village");
    expect(boot).not.toContain("bg_forest");
    const battle = readFileSync(new URL("./scenes/BattleScene.ts", import.meta.url), "utf8");
    expect(battle).toContain("bg_forest");
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

describe("reward dialog header", () => {
  it("keeps the 22px title inside the opaque header and above the cream body", () => {
    const chrome = rewardDialogChrome();
    const half = 11;
    expect(chrome.top).toBe(120);
    expect(chrome.titleY - half).toBeGreaterThanOrEqual(chrome.fillTop);
    expect(chrome.titleY + half).toBeLessThanOrEqual(chrome.fillBottom);
    expect(chrome.fillBottom).toBeLessThanOrEqual(chrome.headerBottom);
    expect(chrome.titleY + half).toBeLessThan(chrome.headerBottom);
    expect(chrome.fillWidth).toBeGreaterThanOrEqual(860 - 16);
    expect(chrome.fillWidth).toBeLessThanOrEqual(860);
  });
});

describe("wardrobe title chip", () => {
  it("ends above the wreath on the preview", () => {
    expect(WARDROBE_TITLE_Y + 18).toBeLessThan(330);
    const wardrobe = readFileSync(new URL("./scenes/WardrobeScene.ts", import.meta.url), "utf8");
    expect(wardrobe).toContain("drawEquippedTitle(this, 1000, WARDROBE_TITLE_Y, save.equippedTitleId, 440)");
  });
});

describe("Chinese line wrap", () => {
  const measure = (sample: string) => {
    let pixels = 0;
    for (const char of sample) pixels += char.charCodeAt(0) <= 0x7e ? 10 : 18;
    return pixels;
  };

  it("asks Phaser to break CJK at the given width", () => {
    const wrap = cjkWrap(960);
    expect(wrap.width).toBe(960);
    expect(wrap.useAdvancedWrap).toBe(true);
    expect(wrap.callback("浏览器会记住进度，明天还能继续。", { style: { fontSize: "18px" } })).toContain("浏览器");
  });

  it("does not start a line with fullwidth punctuation", () => {
    const wrapped = wrapCjkText("同机练习，两个人轮流答。", 18 * 4, measure);
    for (const line of wrapped.split("\n")) {
      expect(line.startsWith("，")).toBe(false);
      expect(line.startsWith("。")).toBe(false);
    }
    expect(wrapped).toContain("，");
  });

  it("keeps 浏览器 on one line", () => {
    const wrapped = wrapCjkText("进度存在这台电脑的浏览器里。", 18 * 6, measure);
    for (const line of wrapped.split("\n")) {
      expect(line.endsWith("浏")).toBe(false);
      expect(line.startsWith("览器")).toBe(false);
    }
    expect(wrapped).toContain("浏览器");
  });
});
