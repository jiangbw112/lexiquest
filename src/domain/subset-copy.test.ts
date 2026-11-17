import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startBattle } from "./battle";
import { bossWordsLeftLine } from "./battle-results";
import { CATALOG_WORDS, chapterExtraWords, formatMeaning, type WordDef } from "./catalog";

const ROOT = new URL("../../", import.meta.url);

function readRepo(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function quoted(source: string, needle: string): string {
  const line = source.split("\n").find((item) => item.includes(needle));
  if (!line) throw new Error(`missing ${needle}`);
  const match = line.match(/"((?:[^"\\]|\\.)*)"/) ?? line.match(/`((?:[^`\\]|\\.)*)`/);
  if (!match?.[1]) throw new Error(`no literal for ${needle}`);
  return match[1];
}

function cmap(file: string): Set<number> {
  const script = `
from fontTools.ttLib import TTFont
font = TTFont(${JSON.stringify(file)})
print(" ".join(str(code) for code in (font.getBestCmap() or {})))
font.close()
`;
  const out = execFileSync("python3", ["-c", script], { encoding: "utf8" });
  return new Set(out.trim().split(/\s+/).filter(Boolean).map((code) => Number(code)));
}

function coveredBy(text: string, have: Set<number>): string[] {
  const missing: string[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined || have.has(code)) continue;
    missing.push(`${ch} U+${code.toString(16).toUpperCase()}`);
  }
  return missing;
}

function meaningsOf(word: WordDef): string[] {
  const lines = [formatMeaning(word)];
  for (const sense of word.senses ?? []) lines.push(formatMeaning(word, sense));
  return lines;
}

describe("player copy glyphs in the committed subsets", () => {
  const regular = cmap(new URL("public/fonts/NotoSansSC-Regular-core.woff2", ROOT).pathname);
  const bold = cmap(new URL("public/fonts/NotoSansSC-Bold-core.woff2", ROOT).pathname);
  const body = new Set(regular);
  const bodyBold = new Set(bold);
  for (const grade of [3, 4, 5, 6]) {
    for (const code of cmap(new URL(`public/fonts/NotoSansSC-Regular-g${grade}.woff2`, ROOT).pathname)) body.add(code);
    for (const code of cmap(new URL(`public/fonts/NotoSansSC-Bold-g${grade}.woff2`, ROOT).pathname)) bodyBold.add(code);
  }
  const title = cmap(new URL("public/fonts/ZCOOLKuaiLe-ui.woff2", ROOT).pathname);

  it("keeps the battle, guide, reveal, and boss reminder inside Noto", () => {
    const guide = readRepo("src/game/scenes/GuideScene.ts");
    const battle = readRepo("src/game/scenes/BattleScene.ts");
    const opened = startBattle({
      encounterId: "inkling",
      classId: "warrior",
      learnedIds: ["tree"],
      equippedSkillIds: [],
      skillLevels: {},
      seed: 1,
      allowedWordIds: ["tree"],
      enemy: { name: "墨团", maxHp: 20, attack: 1, sprite: "inkling" },
    });
    const lines = [
      opened.lastNote,
      quoted(guide, "从这一章的词里抽题"),
      quoted(guide, "本章 Boss 要先学完本章词"),
      quoted(battle, "正确答案"),
      bossWordsLeftLine(7),
    ];
    expect(lines[0]).toContain("这一章的词");
    expect(lines[4]).toBe("Boss 要先学完本章词，还剩 7 个词。");
    for (const line of lines) {
      expect(coveredBy(line, body), line).toEqual([]);
      expect(coveredBy(line, bodyBold), line).toEqual([]);
    }
    expect(body.has("剩".codePointAt(0)!)).toBe(true);
    expect(bodyBold.has("剩".codePointAt(0)!)).toBe(true);
  });

  it("keeps the listen and academy buttons inside the title subset", () => {
    const battle = readRepo("src/game/scenes/BattleScene.ts");
    const results = readRepo("src/game/scenes/BattleResultsScene.ts");
    const labels = [quoted(battle, "听一听"), quoted(results, "去学堂")];
    expect(labels).toEqual(["听一听", "去学堂"]);
    for (const label of labels) expect(coveredBy(label, title), label).toEqual([]);
  });

  it("keeps every gloss a wrong answer can show inside Noto", () => {
    const words = [...CATALOG_WORDS, ...chapterExtraWords()];
    expect(words.length).toBeGreaterThan(100);
    const missing: string[] = [];
    for (const word of words) {
      for (const line of meaningsOf(word)) {
        for (const gap of coveredBy(line, body)) missing.push(`${word.id} ${gap} ${line}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
