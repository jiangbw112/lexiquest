import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATALOG_WORDS, chapterExtraWords, formatMeaning } from "../domain/catalog";
import { BATTLE_ANSWER_REVEAL, EXAM_ANSWER_REVEAL, answerRevealLayout, type ScreenBox } from "./answer-reveal-layout";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function measure(kind: "latin" | "cjk", size: number, samples: string[]): number[] {
  const files = kind === "latin"
    ? [new URL("../../public/fonts/Nunito-latin.woff2", import.meta.url).pathname]
    : ["core", "g3", "g4", "g5", "g6"].map((name) => new URL(`../../public/fonts/NotoSansSC-Regular-${name}.woff2`, import.meta.url).pathname);
  const script = `
import json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
payload = json.load(sys.stdin)
fonts = []
for path in payload["files"]:
    font = TTFont(path)
    if payload["wght"] and "fvar" in font:
        instantiateVariableFont(font, {"wght": payload["wght"]}, inplace=True)
    fonts.append((font.getBestCmap() or {}, font["hmtx"], font["head"].unitsPerEm))
widths = []
missing = []
for text in payload["samples"]:
    total = 0
    for ch in text:
        found = False
        for cmap, hmtx, upem in fonts:
            glyph = cmap.get(ord(ch))
            if glyph is None:
                continue
            total += hmtx[glyph][0] * payload["size"] / upem
            found = True
            break
        if not found:
            missing.append(f"{text} U+{ord(ch):04X}")
    widths.append(total)
if missing:
    sys.stderr.write(chr(10).join(missing[:12]))
    sys.exit(1)
json.dump(widths, sys.stdout)
`;
  const out = execFileSync("python3", ["-c", script], {
    cwd: ROOT,
    encoding: "utf8",
    input: JSON.stringify({ files, wght: kind === "latin" ? 700 : 0, size, samples }),
    maxBuffer: 8_000_000,
  });
  const widths = JSON.parse(out) as number[];
  if (widths.length !== samples.length) throw new Error(`measured ${widths.length} of ${samples.length}`);
  return widths;
}

function glyphBox(column: ScreenBox, width: number): ScreenBox {
  return { x: column.x, y: column.y, w: width, h: column.h };
}

function overlaps(a: ScreenBox, b: ScreenBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("answer reveal words", () => {
  it("fits every catalog word on one line without scaling or touching the listen button", () => {
    const words = [...CATALOG_WORDS, ...chapterExtraWords()];
    const english = words.map((word) => word.english);
    const chinese = words.map((word) => formatMeaning(word));
    const battle = answerRevealLayout(BATTLE_ANSWER_REVEAL);
    const exam = answerRevealLayout(EXAM_ANSWER_REVEAL);
    const englishBattle = measure("latin", BATTLE_ANSWER_REVEAL.englishPx, english);
    const englishExam = measure("latin", EXAM_ANSWER_REVEAL.englishPx, english);
    const chineseWidth = measure("cjk", BATTLE_ANSWER_REVEAL.chinesePx, chinese);
    const labelWidth = measure("cjk", BATTLE_ANSWER_REVEAL.labelPx, ["正确答案"])[0] ?? 0;
    let overflow = 0;
    let textButtonOverlaps = 0;
    const maxLines = 1;
    const samples = ["grandmother", "delivery worker", "Dragon Boat Festival", "Hong Kong-Zhuhai-Macao Bridge", "Jinggangshan Revolution Museum", "treasure", "discover", "adventure"];
    const seen = new Set<string>();
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index]!;
      if (samples.includes(word.english)) seen.add(word.english);
      const battleEnglish = glyphBox(battle.english, englishBattle[index] ?? 0);
      const examEnglish = glyphBox(exam.english, englishExam[index] ?? 0);
      const battleChinese = glyphBox(battle.chinese, chineseWidth[index] ?? 0);
      const examChinese = glyphBox(exam.chinese, chineseWidth[index] ?? 0);
      for (const box of [battleEnglish, battleChinese]) {
        if (box.w > battle.english.w || box.x + box.w > battle.plate.x + battle.plate.w) overflow += 1;
        if (overlaps(box, battle.button)) textButtonOverlaps += 1;
      }
      for (const box of [examEnglish, examChinese]) {
        if (box.w > exam.english.w || box.x + box.w > exam.plate.x + exam.plate.w) overflow += 1;
        if (overlaps(box, exam.button)) textButtonOverlaps += 1;
      }
      expect(battleEnglish.w, word.english).toBeLessThanOrEqual(battle.english.w);
      expect(examEnglish.w, word.english).toBeLessThanOrEqual(exam.english.w);
      expect(battleChinese.w, word.id).toBeLessThanOrEqual(battle.chinese.w);
      expect(examChinese.w, word.id).toBeLessThanOrEqual(exam.chinese.w);
    }
    expect(seen).toEqual(new Set(samples));
    expect(labelWidth).toBeLessThanOrEqual(battle.label.w);
    expect(labelWidth).toBeGreaterThan(40);
    const longestEnglish = english.reduce((best, text, index) => (englishExam[index]! > best.width ? { text, width: englishExam[index]! } : best), { text: "", width: 0 });
    const longestChinese = chinese.reduce((best, text, index) => (chineseWidth[index]! > best.width ? { text, width: chineseWidth[index]! } : best), { text: "", width: 0 });
    expect(longestEnglish.text).toBe("Jinggangshan Revolution Museum");
    expect(longestEnglish.width).toBeGreaterThan(400);
    expect(longestEnglish.width).toBeLessThanOrEqual(exam.english.w);
    expect(longestChinese.text.startsWith("v.")).toBe(true);
    expect(readFileSync(new URL("./answer-reveal.ts", import.meta.url), "utf8")).not.toContain("setScale");
    expect({
      words: words.length,
      minWordPx: Math.min(BATTLE_ANSWER_REVEAL.englishPx, BATTLE_ANSWER_REVEAL.chinesePx, EXAM_ANSWER_REVEAL.chinesePx),
      minLabelPx: Math.min(BATTLE_ANSWER_REVEAL.labelPx, EXAM_ANSWER_REVEAL.labelPx),
      maxLines,
      overflow,
      textButtonOverlaps,
    }).toEqual({
      words: 871,
      minWordPx: 22,
      minLabelPx: 18,
      maxLines: 1,
      overflow: 0,
      textButtonOverlaps: 0,
    });
  });
});
