import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_BOSS_ID,
  CHAPTER_BOSS_POSES,
  BOSS_RESERVE,
  PEP_G3_07_BOSS,
  PEP_G3_07_BOSS_ID,
  chapterBossAsset,
  chapterBossDisplayName,
  chapterBossId,
} from "./chapter-bosses";
import { gradeChapters, stageCombatFor } from "./chapter-plan";
import { FOREST_CHAPTER, stageById, stageCombat } from "./stages";
import type { GradeBand } from "./types";

interface BossLedgerFile {
  bossId: string;
  repoPath: string;
  repoSha256: string;
  sourceSha256: string;
  recompressed: boolean;
}

const GRADES: GradeBand[] = ["G3", "G4", "G5", "G6"];

function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("chapter bosses", () => {
  it("keeps the pep_g3_07 boss id, display name, and frame files in one object", () => {
    const source = readFileSync(new URL("./chapter-bosses.ts", import.meta.url), "utf8");
    const plan = readFileSync(new URL("./chapter-plan.ts", import.meta.url), "utf8");
    const battle = readFileSync(new URL("../game/scenes/BattleScene.ts", import.meta.url), "utf8");
    const chapters = JSON.parse(readFileSync(new URL("./chapters/chapters_v0.2.json", import.meta.url), "utf8")) as Array<{
      chapter_id: string;
      boss_name_zh: string;
      theme_note_zh?: string;
      stages?: Array<{ name_zh: string }>;
    }>;
    expect(source.match(/mealmap/g)).toEqual(["mealmap"]);
    expect(source.match(/toychest/g)).toEqual(["toychest"]);
    expect(source.match(/营养餐盘守护者/g)).toEqual(["营养餐盘守护者"]);
    expect(plan).not.toContain("营养餐盘守护者");
    expect(plan).not.toContain("玩具箱守护者");
    expect(battle).not.toContain("营养餐盘守护者");
    expect(battle).not.toContain("mealmap");
    expect(CHAPTER_BOSS_ID.pep_g3_07).toBe(PEP_G3_07_BOSS.id);
    expect(PEP_G3_07_BOSS_ID).toBe("mealmap");
    expect(Object.values(CHAPTER_BOSS_ID)).not.toContain("toychest");
    expect(BOSS_RESERVE).toEqual([{ id: "toychest", nameZh: "玩具箱守护者" }]);
    expect(chapterBossId("pep_g3_07")).toBe("mealmap");
    const foodFile = chapters.find((chapter) => chapter.chapter_id === "pep_g3_07");
    expect(foodFile?.boss_name_zh).toBe(PEP_G3_07_BOSS.nameZh);
    expect(foodFile?.stages?.[4]?.name_zh).toBe(PEP_G3_07_BOSS.nameZh);
    expect(foodFile?.theme_note_zh).toContain("Healthy food");
    expect(foodFile?.theme_note_zh).toContain(PEP_G3_07_BOSS.nameZh);
    expect(foodFile?.theme_note_zh).not.toContain("Old toys");
    const toys = chapters.find((chapter) => chapter.chapter_id === "pep_g3_08");
    expect(toys?.theme_note_zh).toContain("Old toys");
    const fileText = readFileSync(new URL("./chapters/chapters_v0.2.json", import.meta.url), "utf8");
    expect(fileText).not.toContain("旧玩具守护");
    expect(fileText).not.toContain("玩具守护");
    expect(chapterBossDisplayName("pep_g3_07", "别的名字")).toBe(PEP_G3_07_BOSS.nameZh);
    expect(chapterBossDisplayName("pep_g3_01", "全家福守护者")).toBe("全家福守护者");
    const food = gradeChapters("G3").find((chapter) => chapter.id === "pep_g3_07");
    expect(food?.bossName).toBe("营养餐盘守护者");
    expect(food?.stages[4]?.name_zh).toBe("营养餐盘守护者");
    const boss = stageById(5)!;
    expect(stageCombatFor(food!, boss, "warrior").enemyName).toBe("营养餐盘守护者");
    expect(stageCombatFor(food!, boss, "warrior").sprite).toBe("mealmap");
    for (const pose of CHAPTER_BOSS_POSES) {
      expect(chapterBossAsset(PEP_G3_07_BOSS.id, pose).imageUrl).toBe(
        `assets/chapter/bosses/mealmap/${PEP_G3_07_BOSS.frames[pose]}.png`,
      );
    }
  });

  it("gives each of the 31 chapters its own atlas and does not reuse canopy", () => {
    const chapters = GRADES.flatMap((grade) => gradeChapters(grade));
    expect(chapters).toHaveLength(31);
    const ids = chapters.map((chapter) => chapterBossId(chapter.id));
    expect(new Set(ids).size).toBe(31);
    expect(Object.keys(CHAPTER_BOSS_ID)).toHaveLength(31);
    const boss = stageById(5)!;
    const forest = stageCombatFor(
      { id: FOREST_CHAPTER.chapter_id, bossName: "林心守护者" } as never,
      boss,
      "warrior",
    );
    expect(forest.sprite).toBe("canopy");
    expect(forest.enemyName).toBe("林心守护者");
    expect(stageCombat(boss, "warrior").sprite).toBe("canopy");
    const spriteSource = readFileSync(new URL("../game/art/chapter-boss-sprite.ts", import.meta.url), "utf8");
    expect(spriteSource).not.toContain("tigerkin");
    expect(spriteSource).not.toContain("768");
    const boot = readFileSync(new URL("../game/scenes/BootScene.ts", import.meta.url), "utf8");
    const budget = readFileSync(new URL("../../tools/boot-budget.mjs", import.meta.url), "utf8");
    expect(boot).not.toContain("chapter/bosses");
    expect(budget).not.toContain("chapter/bosses");

    for (const chapter of chapters) {
      const combat = stageCombatFor(chapter, boss, "mage");
      expect(combat.sprite).toBe(chapterBossId(chapter.id));
      expect(combat.sprite).not.toBe("canopy");
      expect(combat.enemyName).toBe(chapter.bossName);
      for (const pose of CHAPTER_BOSS_POSES) {
        const asset = chapterBossAsset(combat.sprite, pose);
        const png = readFileSync(new URL(`../../public/${asset.imageUrl}`, import.meta.url));
        const packed = JSON.parse(readFileSync(new URL(`../../public/${asset.dataUrl}`, import.meta.url), "utf8")) as {
          frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
        };
        const { width, height } = pngSize(png);
        const names = Object.keys(packed.frames);
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
          const frame = packed.frames[name]!.frame;
          expect(frame.x).toBeGreaterThanOrEqual(0);
          expect(frame.y).toBeGreaterThanOrEqual(0);
          expect(frame.x + frame.w).toBeLessThanOrEqual(width);
          expect(frame.y + frame.h).toBeLessThanOrEqual(height);
        }
      }
    }
  });

  it("records boss atlas hashes that match the files on disk", () => {
    const ledger = JSON.parse(readFileSync(new URL("./chapters/scene-asset-ledger.json", import.meta.url), "utf8")) as {
      bossFiles: BossLedgerFile[];
    };
    expect(ledger.bossFiles).toHaveLength(248);
    const ids = new Set(ledger.bossFiles.map((file) => file.bossId));
    expect(ids.size).toBe(31);
    for (const file of ledger.bossFiles) {
      const bytes = readFileSync(new URL(`../../${file.repoPath}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.repoSha256);
      expect(file.recompressed).toBe(false);
      expect(file.repoSha256).toBe(file.sourceSha256);
    }
  });
});
