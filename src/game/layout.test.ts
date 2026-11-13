import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRows, renderContrastDoc } from "../domain/contrast";
import { CHIP_ON, TEAL_DEEP, TERRA, TITLE_PLANK } from "./warm/theme";
import { gradeGate, setSelectedGrades, createSave } from "../domain/progress";
import { DEFAULT_APPEARANCE } from "../domain/appearance";
import { redirectUngraded } from "./grade-route";
import { CATALOG_WORDS, formatMeaning, wordById } from "../domain/catalog";
import { reviewDeskLayout } from "./dev-mode";
import { REVIEW_DESK_LIMIT } from "../domain/review";
import { CARD_GOT, COLLECTION_CARD, FITTED_LINE_GAP, OPTION_BADGE_CENTER, RESULTS_WORD_CHIP, REVIEW_DESK, REVIEW_ROW, STUDY_CARD, STRUGGLE_LIST, WARDROBE_TITLE_Y, cardGotEnglishMeaningGap, cardGotTitleGap, cjkWrap, fitTextBox, fittedBlockHeight, fittedLineBoxes, meaningScale, optionTextBounds, resultsGlossBox, reviewEnglishBox, reviewMeaningBox, reviewRowSlice, reviewRowTextY, reviewTextRight, rewardDialogChrome, struggleButtonTop, struggleWindow, studyHintStackGap, studyNoticeGap, studyReviewHintGap, wrapCjkText, type FittedText, type TextBox } from "./layout";

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

  it("keeps 词卡入手 clear of the English word on the collected card", () => {
    expect(cardGotTitleGap()).toBeGreaterThanOrEqual(24);
    expect(cardGotEnglishMeaningGap()).toBeGreaterThanOrEqual(16);
    const learn = readFileSync(new URL("./scenes/LearnScene.ts", import.meta.url), "utf8");
    expect(learn).toContain("CARD_GOT.titleY");
    expect(learn).toContain("CARD_GOT.rowY");
    expect(CARD_GOT.noteY).toBeGreaterThan(CARD_GOT.rowY + 20 + 23);
    expect(CARD_GOT.buttonY - 28).toBeGreaterThan(CARD_GOT.noteY + 10);
  });

  it("wraps a long part-of-speech gloss inside a battle option and a collection card", () => {
    const measure = (fontSize: number) => (sample: string) => {
      let pixels = 0;
      for (const char of sample) pixels += char.charCodeAt(0) <= 0x7e ? fontSize * 0.55 : fontSize;
      return pixels;
    };
    const about = formatMeaning(wordById("about")!);
    const when = formatMeaning(wordById("when")!);
    const flower = formatMeaning(wordById("flower")!);
    const labels = [about, when, flower];
    const hanRuns = (label: string) => label.match(/\p{Script=Han}{2,}/gu) ?? [];
    const keepsHanTogether = (wrapped: string, label: string) => {
      const lines = wrapped.split("\n");
      return hanRuns(label).every((word) =>
        lines.every((line, index) => {
          const next = lines[index + 1];
          if (!next) return true;
          return !Array.from(word, (_, cut) => cut + 1)
            .slice(0, -1)
            .some((cut) => line.endsWith(word.slice(0, cut)) && next.startsWith(word.slice(cut)));
        }),
      );
    };
    const battle = optionTextBounds(250, 76);
    for (const label of labels) {
      const wrapped = wrapCjkText(label, battle.maxWidth, measure(24));
      expect(wrapped.replaceAll("\n", "")).toBe(label);
      expect(keepsHanTogether(wrapped, label)).toBe(true);
      for (const line of wrapped.split("\n")) expect(measure(24)(line)).toBeLessThanOrEqual(battle.maxWidth);
    }
    expect(hanRuns(about).length).toBeGreaterThan(0);
    const aboutBattle = wrapCjkText(about, battle.maxWidth, measure(24));
    expect(aboutBattle.includes("\n")).toBe(true);
    expect(keepsHanTogether(aboutBattle, about)).toBe(true);
    expect(COLLECTION_CARD.englishInset).toBeGreaterThanOrEqual(24);
    expect(COLLECTION_CARD.englishInset + COLLECTION_CARD.englishWidth).toBeLessThanOrEqual(COLLECTION_CARD.width - 30);
    const card = wrapCjkText(about, COLLECTION_CARD.meaningWidth, measure(13));
    expect(card.replaceAll("\n", "")).toBe(about);
    expect(card.includes("\n")).toBe(true);
    expect(keepsHanTogether(card, about)).toBe(true);
    for (const line of card.split("\n")) expect(measure(13)(line)).toBeLessThanOrEqual(COLLECTION_CARD.meaningWidth);
    const whenCard = wrapCjkText(when, COLLECTION_CARD.meaningWidth, measure(13));
    expect(whenCard.replaceAll("\n", "")).toBe(when);
    expect(keepsHanTogether(whenCard, when)).toBe(true);
    for (const line of whenCard.split("\n")) expect(measure(13)(line)).toBeLessThanOrEqual(COLLECTION_CARD.meaningWidth);
    const kit = readFileSync(new URL("./warm/kit.ts", import.meta.url), "utf8");
    expect(kit).toContain("OPTION_TEXT_LEFT");
    expect(kit).toContain("optionTextBounds");
    expect(kit).toContain("cjkWrap(bounds.maxWidth)");
    const battleScene = readFileSync(new URL("./scenes/BattleScene.ts", import.meta.url), "utf8");
    expect(battleScene).toContain("250, 76");
  });

  it("fits the longest English words and meanings without covering buttons or the study hint", () => {
    const measure = (fontSize: number) => (sample: string) => {
      let pixels = 0;
      for (const char of sample) pixels += char.charCodeAt(0) <= 0x7e ? fontSize * 0.55 : fontSize;
      return pixels;
    };
    interface Box { x: number; y: number; w: number; h: number }
    const hits = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const inside = (inner: Box, item: Box) =>
      item.x >= inner.x && item.y >= inner.y && item.x + item.w <= inner.x + inner.w && item.y + item.h <= inner.y + inner.h;
    const assertFit = (fitted: FittedText, box: TextBox, source: string) => {
      expect(fitted.lines.length, source).toBeGreaterThan(0);
      expect(fitted.lines.length, source).toBeLessThanOrEqual(box.maxLines);
      expect(fitted.fontSize, source).toBeGreaterThanOrEqual(box.minFontSize);
      expect(fitted.fontSize, source).toBeLessThanOrEqual(box.fontSize);
      expect(fitted.text, source).toBe(fitted.lines.join("\n"));
      expect(fitted.text.replaceAll("\n", ""), source).toBe(source);
      expect(fittedBlockHeight(fitted.fontSize, fitted.lines.length), source).toBeLessThanOrEqual(box.maxHeight);
      for (const line of fitted.lines) expect(measure(fitted.fontSize)(line), source).toBeLessThanOrEqual(box.maxWidth);
    };
    const lineWidth = (fitted: FittedText) => fitted.lines.reduce((wide, line) => Math.max(wide, measure(fitted.fontSize)(line)), 0);
    const spellLeft = REVIEW_ROW.spellCenter - REVIEW_ROW.spellWidth / 2;
    const revealLeft = REVIEW_ROW.revealCenter - REVIEW_ROW.revealWidth / 2;
    const reveal: Box = {
      x: revealLeft,
      y: REVIEW_ROW.revealOffset - REVIEW_ROW.revealHeight / 2,
      w: REVIEW_ROW.revealWidth,
      h: REVIEW_ROW.revealHeight,
    };
    const spell: Box = {
      x: spellLeft,
      y: REVIEW_ROW.spellOffset - REVIEW_ROW.spellHeight / 2,
      w: REVIEW_ROW.spellWidth,
      h: REVIEW_ROW.spellHeight,
    };
    const rates: Box[] = [0, 1, 2, 3].map((index) => ({
      x: REVIEW_ROW.rateCenter + index * 120 - REVIEW_ROW.rateWidth / 2,
      y: REVIEW_ROW.rateOffset - REVIEW_ROW.rateHeight / 2,
      w: REVIEW_ROW.rateWidth,
      h: REVIEW_ROW.rateHeight,
    }));
    expect(reviewTextRight()).toBeLessThanOrEqual(spell.x - REVIEW_ROW.gap);
    expect(spell.x).toBeLessThan(rates[0]!.x);
    expect(REVIEW_ROW.textX + REVIEW_ROW.englishMaxWidth).toBeLessThanOrEqual(reveal.x - REVIEW_ROW.gap);
    expect(REVIEW_ROW.blockHeight).toBeLessThanOrEqual(REVIEW_ROW.statusOffset);
    const byWidth = (pick: (word: (typeof CATALOG_WORDS)[number]) => string, fontSize: number) =>
      CATALOG_WORDS.map((word) => ({ id: word.id, text: pick(word), width: measure(fontSize)(pick(word)) })).sort((a, b) => b.width - a.width);
    const longestMeaning = byWidth((word) => formatMeaning(word), REVIEW_ROW.fontSize);
    const longestEnglish = byWidth((word) => word.english, REVIEW_ROW.fontSize);
    const longestGloss = byWidth((word) => word.chinese, RESULTS_WORD_CHIP.fontSize);
    expect(longestMeaning[0]?.id).toBe("took");
    expect(longestEnglish[0]?.id).toBe("jinggangshan revolution museum");
    expect(longestEnglish[1]?.id).toBe("hong kong-zhuhai-macao bridge");
    expect(longestGloss[0]?.id).toBe("took");
    const glossBox = resultsGlossBox();
    expect(glossBox.maxWidth).toBe(RESULTS_WORD_CHIP.width - RESULTS_WORD_CHIP.glossX - RESULTS_WORD_CHIP.glossRight);
    expect(glossBox.maxWidth).toBeLessThanOrEqual(156);
    const chipRight = RESULTS_WORD_CHIP.width - RESULTS_WORD_CHIP.glossRight;
    const named = ["took", "stayed", "fell", "cleaned", "office worker", "jinggangshan revolution museum", "hong kong-zhuhai-macao bridge"];
    for (const id of named) expect(wordById(id), id).toBeTruthy();
    for (const word of CATALOG_WORDS) {
      const english = fitTextBox(word.english, reviewEnglishBox(), (sample, size) => measure(size)(sample));
      assertFit(english, reviewEnglishBox(), word.english);
      const englishBox: Box = { x: REVIEW_ROW.textX, y: 0, w: lineWidth(english), h: fittedBlockHeight(english.fontSize, english.lines.length) };
      const meaningBox = reviewMeaningBox(englishBox.w);
      expect(meaningBox.x + meaningBox.maxWidth, word.id).toBeLessThanOrEqual(spell.x - REVIEW_ROW.gap);
      expect(meaningBox.maxWidth, word.id).toBeGreaterThan(0);
      const meaning = fitTextBox(formatMeaning(word), meaningBox, (sample, size) => measure(size)(sample));
      assertFit(meaning, meaningBox, formatMeaning(word));
      const meaningRect: Box = { x: meaningBox.x, y: 0, w: lineWidth(meaning), h: fittedBlockHeight(meaning.fontSize, meaning.lines.length) };
      expect(hits(englishBox, reveal), `${word.id} unopened`).toBe(false);
      expect(hits(englishBox, spell), `${word.id} unopened spell`).toBe(false);
      expect(hits(meaningRect, spell), `${word.id} opened spell`).toBe(false);
      for (const rate of rates) {
        expect(hits(meaningRect, rate), `${word.id} opened rate`).toBe(false);
        expect(hits(englishBox, rate), `${word.id} english rate`).toBe(false);
      }
      const gloss = fitTextBox(word.chinese, glossBox, (sample, size) => measure(size)(sample));
      assertFit(gloss, glossBox, word.chinese);
      expect(RESULTS_WORD_CHIP.glossX + lineWidth(gloss), word.id).toBeLessThanOrEqual(chipRight);
      const glossInner: Box = {
        x: RESULTS_WORD_CHIP.glossX,
        y: RESULTS_WORD_CHIP.glossY,
        w: glossBox.maxWidth,
        h: glossBox.maxHeight,
      };
      const glossLines = fittedLineBoxes(RESULTS_WORD_CHIP.glossX, RESULTS_WORD_CHIP.glossY, gloss, (line) => measure(gloss.fontSize)(line));
      expect(glossLines.length, word.id).toBe(gloss.lines.length);
      for (const line of glossLines) expect(inside(glossInner, line), `${word.id} gloss inside`).toBe(true);
      for (let index = 0; index < glossLines.length; index += 1) {
        const line = glossLines[index]!;
        expect(line.y + line.h, `${word.id} line ${index}`).toBeLessThanOrEqual(RESULTS_WORD_CHIP.height - RESULTS_WORD_CHIP.glossBottom);
        const next = glossLines[index + 1];
        if (!next) continue;
        expect(hits(line, next), `${word.id} lines overlap`).toBe(false);
        expect(next.y - (line.y + line.h), `${word.id} line gap`).toBeGreaterThanOrEqual(FITTED_LINE_GAP);
      }
    }
    const chipAt = (index: number): Box => ({
      x: 477 + (index % 4) * RESULTS_WORD_CHIP.pitchX,
      y: 220 + Math.floor(index / 4) * RESULTS_WORD_CHIP.pitchY,
      w: RESULTS_WORD_CHIP.width,
      h: RESULTS_WORD_CHIP.height,
    });
    for (let index = 0; index < 3; index += 1) {
      const left = chipAt(index);
      const right = chipAt(index + 1);
      expect(hits(left, right), `chip ${index}`).toBe(false);
      expect(right.x - (left.x + left.w), `chip gap ${index}`).toBeGreaterThanOrEqual(8);
    }
    const row = reviewRowSlice(0);
    const dueStatus: Box = { x: REVIEW_ROW.textX, y: REVIEW_ROW.statusOffset, w: 180, h: 16 };
    const toneStatus: Box = { x: 400, y: REVIEW_ROW.statusOffset, w: 140, h: REVIEW_ROW.statusFont };
    const bottomBorder: Box = { x: 150, y: row.innerBottom, w: 980, h: row.bottom - row.innerBottom };
    for (const [label, status] of [["unopened", dueStatus], ["opened", toneStatus]] as const) {
      expect(status.y, label).toBeGreaterThanOrEqual(row.innerTop + REVIEW_ROW.statusPad);
      expect(status.y + status.h, label).toBeLessThanOrEqual(row.innerBottom - REVIEW_ROW.statusPad);
      expect(hits(status, bottomBorder), label).toBe(false);
    }
    expect(row.pitch).toBeGreaterThanOrEqual(row.height);
    const desk = reviewDeskLayout(false);
    const hint: Box = { x: 170, y: desk.bodyY, w: 440, h: REVIEW_DESK.hintFont };
    const firstRow = reviewRowSlice(reviewRowTextY(desk.bodyY, 0));
    const firstSlice: Box = { x: 150, y: firstRow.top, w: 980, h: firstRow.height };
    expect(firstRow.top, "hint pad").toBeGreaterThanOrEqual(hint.y + hint.h + REVIEW_DESK.hintPad);
    expect(hits(hint, firstSlice), "hint vs row 1").toBe(false);
    const lastRow = reviewRowSlice(reviewRowTextY(desk.bodyY, REVIEW_DESK_LIMIT - 1));
    const lastSlice: Box = { x: 150, y: lastRow.top, w: 980, h: lastRow.height };
    const back: Box = {
      x: REVIEW_DESK.backX - REVIEW_DESK.backWidth / 2,
      y: REVIEW_DESK.backY - REVIEW_DESK.backHeight / 2,
      w: REVIEW_DESK.backWidth,
      h: REVIEW_DESK.backHeight,
    };
    expect(lastRow.bottom, "back pad").toBeLessThanOrEqual(back.y - REVIEW_DESK.backPad);
    expect(hits(lastSlice, back), "full page vs back").toBe(false);
    expect(REVIEW_DESK_LIMIT).toBe(4);
    for (const missed of [false, true]) {
      for (const scale of [1, 0.75, 0.5, 0.35]) {
        expect(studyReviewHintGap(missed, scale), `${missed} ${scale}`).toBeGreaterThanOrEqual(16);
      }
    }
    expect(studyHintStackGap()).toBeGreaterThanOrEqual(8);
    const learn = readFileSync(new URL("./scenes/LearnScene.ts", import.meta.url), "utf8");
    expect(learn).toContain("STUDY_CARD.reviewHintY");
    expect(learn).not.toContain("640, 210,");
    const review = readFileSync(new URL("./scenes/ReviewScene.ts", import.meta.url), "utf8");
    expect(review).toContain("applyFittedText");
    expect(review).toContain("reviewEnglishBox");
    expect(review).toContain("reviewMeaningBox");
    expect(review).toContain("REVIEW_ROW.revealCenter");
    expect(review).toContain("REVIEW_ROW.spellCenter");
    expect(review).toContain("reviewRowSlice");
    expect(review).toContain("reviewRowTextY");
    expect(review).toContain("REVIEW_DESK.backY");
    expect(review).toContain("REVIEW_ROW.statusOffset");
    const results = readFileSync(new URL("./scenes/BattleResultsScene.ts", import.meta.url), "utf8");
    expect(results).toContain("applyFittedText");
    expect(results).toContain("resultsGlossBox");
    expect(results).toContain("RESULTS_WORD_CHIP.pitchX");
    expect(results).toContain("RESULTS_WORD_CHIP.pitchY");
    const layoutSource = readFileSync(new URL("./layout.ts", import.meta.url), "utf8");
    expect(layoutSource).not.toContain("setLineSpacing(-");
    expect(STUDY_CARD.reviewHintY).toBeLessThan(STUDY_CARD.restingRowY);
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
    expect(map).toContain("playStatuses");
    expect(map).toContain("activeChapter");
    expect(map).toContain("上一章");
    expect(map).toContain("this.tweens.killAll()");
    expect(map).toContain("learnedRequiredCount(save)");
    expect(map).toContain("requiredWordIds(save).length");
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

  it("keeps 这台电脑 on one line", () => {
    const wrapped = wrapCjkText("清掉这台电脑上的数据后要重新设置。", 18 * 5, measure);
    for (const line of wrapped.split("\n")) {
      expect(line.endsWith("这")).toBe(false);
      expect(line.endsWith("这台")).toBe(false);
      expect(line.endsWith("这台电")).toBe(false);
      expect(line.startsWith("台电脑")).toBe(false);
      expect(line.startsWith("电脑")).toBe(false);
    }
    expect(wrapped).toContain("这台电脑");
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
