import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_BOSS_ID,
  CHAPTER_BOSS_POSES,
  PEP_G3_07_BOSS_ID,
  chapterBossAsset,
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
  it("keeps toychest as the only name for the pep_g3_07 boss until v1.0.3", () => {
    const source = readFileSync(new URL("./chapter-bosses.ts", import.meta.url), "utf8");
    expect(source.match(/toychest/g)).toEqual(["toychest"]);
    expect(CHAPTER_BOSS_ID.pep_g3_07).toBe(PEP_G3_07_BOSS_ID);
    expect(chapterBossId("pep_g3_07")).toBe(PEP_G3_07_BOSS_ID);
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
