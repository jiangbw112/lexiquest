import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startBattle } from "./battle";

/**
 * Question-pool copy. A line that only names the stage, such as
 * 「这一关还有几个新词可以去学堂学」, stays. These phrases say the draw is limited to one stage.
 */
const STALE_POOL_PHRASES = [
  "这一关的词",
  "本关的词",
  "本关词",
  "从这一关",
  `这一关${String.fromCodePoint(0x5141)}许`,
  "这一关还没学过",
];

function filesUnder(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      filesUnder(full, out);
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".mjs")) out.push(full);
  }
}

describe("question pool copy", () => {
  it("draws from this chapter, and the old stage-pool wording is gone from src", () => {
    const root = new URL("..", import.meta.url);
    const files: string[] = [];
    filesUnder(root.pathname, files);
    const hits: string[] = [];
    for (const file of files) {
      if (file.endsWith("question-scope-copy.test.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const phrase of STALE_POOL_PHRASES) {
        if (text.includes(phrase)) hits.push(`${file} ${phrase}`);
      }
    }
    expect(hits).toEqual([]);

    const battle = readFileSync(new URL("./battle.ts", import.meta.url), "utf8");
    const guide = readFileSync(new URL("../game/scenes/GuideScene.ts", import.meta.url), "utf8");
    expect(battle).toContain("技能卡会从这一章的词里抽题。");
    expect(guide).toContain("打出技能卡时，从这一章的词里抽题。");
    expect(guide).toContain("本章 Boss 要先学完本章词。");
    expect(guide).toContain("这一关的新词可以去学堂学。");

    const opened = startBattle({
      encounterId: "inkling",
      classId: "warrior",
      learnedIds: ["tree"],
      equippedSkillIds: [],
      skillLevels: {},
      seed: 1,
    });
    expect(opened.lastNote).toBe("可以攻击、格挡、治疗，或打出一张技能卡。技能卡会从这一章的词里抽题。");
    expect(opened.answerReveal).toBeNull();
  });
});
