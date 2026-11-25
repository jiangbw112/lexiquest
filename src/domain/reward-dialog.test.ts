import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { wordById } from "./catalog";
import { ensureDailyGoal, goalStatusLine, openingReminder } from "./parent";
import { createSave, dismissReward, questLine, studyNow, syncUnlocks } from "./progress";
import { MASTERY_BADGE_NOTICE, RECOGNIZED_WORD_NOTICE, rewardBatch } from "./reward-dialog";
import { chapterWordIds, requiredWordIds } from "./stages";
import { deserialize, serialize } from "./storage";
import { migrateTitleSave } from "./titles";
import type { RewardNotice, SaveData, WordCardRecord } from "./types";

const NOW = Date.parse("2026-03-01T02:00:00Z");
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function saveWith(patch: Partial<SaveData> = {}): SaveData {
  return {
    ...createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: NOW,
      grades: ["G3", "G4", "G5", "G6"],
    }),
    ...patch,
  };
}

function card(wordId: string, badge = false): WordCardRecord {
  return { wordId, collectedAt: NOW, masteryBadge: badge };
}

function notice(title: string, detail: string): RewardNotice {
  return { id: `${title}-${detail}`, title, detail };
}

function villageLines(save: SaveData): string {
  const shown = ensureDailyGoal(save, studyNow(save));
  return [
    questLine(shown),
    goalStatusLine(shown.dailyGoal),
    openingReminder(shown, studyNow(shown)),
    rewardBatch(shown.rewardQueue)?.detail ?? "",
  ].join("\n");
}

function createBody(source: string): string {
  const start = source.indexOf("\n  create(");
  const end = source.indexOf("\n  private ", start + 1);
  if (start < 0 || end < 0) throw new Error("create() was not found");
  return source.slice(start, end);
}

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("village reward dialog", () => {
  it("shows only the count for 28 learned cards when the queue is empty", () => {
    const ids = chapterWordIds();
    expect(ids).toHaveLength(28);
    const wordCards = Object.fromEntries(ids.map((id) => [id, card(id)]));
    const save = saveWith({ wordCards, rewardQueue: [] });
    expect(requiredWordIds(save)).toHaveLength(28);
    const lines = villageLines(save);
    expect(lines).toContain("朋友与家人：已学 0/28 个词");
    expect(lines).not.toContain("森林冒险");
    expect(Object.keys(save.wordCards)).toHaveLength(28);
    expect(rewardBatch(save.rewardQueue)).toBeNull();
    for (const id of ids) {
      const english = wordById(id)?.english;
      expect(english, id).toBeTruthy();
      expect(lines).not.toContain(english!);
    }

    const loaded = deserialize(serialize(save));
    expect(loaded?.rewardQueue).toEqual([]);
    expect(syncUnlocks(loaded!).rewardQueue).toEqual([]);
    expect(syncUnlocks(loaded!).wordCards).toEqual(loaded!.wordCards);
  });

  it("does not let title migration grow the reward queue", () => {
    const queue = [notice("外观奖励", "得到披风。这只改外观，不改经验、复习和战斗数值。")];
    const raw = JSON.parse(serialize(saveWith({ rewardQueue: queue, xp: 80 }))) as Record<string, unknown>;
    delete raw.profileId;
    delete raw.titleRulesVersion;
    delete raw.titleParts;
    delete raw.titleGrantLedger;
    delete raw.titleReceipts;
    const migrated = migrateTitleSave(raw as unknown as SaveData, NOW);
    expect(migrated.rewardQueue).toEqual(queue);
    expect(migrated.rewardQueue).toHaveLength(queue.length);
    expect(migrateTitleSave(migrated, NOW + 1).rewardQueue).toEqual(queue);
  });

  it("collapses a head run of per-word notices and leaves the appearance reward", () => {
    const outfit = notice("外观奖励", "得到林间花环。这只改外观，不改经验、复习和战斗数值。");
    const sash = notice("得到星光绶带", "森林章节的词卡收集齐了。这是服装奖励。词卡还在，熟练徽章要靠以后的复习。");
    expect(rewardBatch([sash])?.detail).toBe(sash.detail);
    expect(rewardBatch([outfit])?.count).toBe(1);
    const save = saveWith({
      rewardQueue: [
        notice(MASTERY_BADGE_NOTICE, "tree 的词卡还在原处。徽章到了复习时间会变灰，答对后再亮起来。"),
        notice(MASTERY_BADGE_NOTICE, "bird 的词卡还在原处。徽章到了复习时间会变灰，答对后再亮起来。"),
        notice(MASTERY_BADGE_NOTICE, "fish 的词卡还在原处。徽章到了复习时间会变灰，答对后再亮起来。"),
        outfit,
      ],
      wordCards: { tree: card("tree", true), bird: card("bird", true), fish: card("fish", true) },
    });
    const face = rewardBatch(save.rewardQueue);
    expect(face?.count).toBe(3);
    expect(face?.detail).toBe("有 3 张词卡的熟练徽章亮了。");
    expect(face?.detail).not.toContain("tree");
    let next = save;
    for (let i = 0; i < (face?.count ?? 0); i += 1) next = dismissReward(next);
    expect(next.rewardQueue).toEqual([outfit]);
    expect(next.wordCards.tree?.masteryBadge).toBe(true);
    expect(next.wordCards.bird?.masteryBadge).toBe(true);
    expect(next.wordCards.fish?.masteryBadge).toBe(true);
    expect(next.titleParts).toEqual(save.titleParts);
    expect(next.titleGrantLedger).toEqual(save.titleGrantLedger);
    expect(next.titleReceipts).toEqual(save.titleReceipts);

    const known = [
      notice(RECOGNIZED_WORD_NOTICE, "tree"),
      notice(RECOGNIZED_WORD_NOTICE, "bird"),
      notice(MASTERY_BADGE_NOTICE, "fish 的词卡还在原处。"),
    ];
    const knownFace = rewardBatch(known);
    expect(knownFace?.count).toBe(2);
    expect(knownFace?.detail).toBe("你已经认识 2 个词。");
    expect(knownFace?.detail).not.toContain("tree");
    const scene = readFileSync(path.join(SRC, "game/scenes/OverworldScene.ts"), "utf8");
    expect(scene).toContain("next = dismissReward(next)");
    expect(scene).toMatch(/for \(let i = 0; i < count; i \+= 1\)/);
    const writers = tsFiles(SRC)
      .filter((file) => !file.endsWith(".test.ts"))
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        if (!text.includes("rewardQueue")) return [];
        return [...text.matchAll(/reward\(\s*(?:"([^"]+)"|([A-Z_]+))/g), ...text.matchAll(/notice\(\s*"([^"]+)"/g)].map(
          (match) => `${path.relative(SRC, file)}:${match[1] ?? match[2]}`,
        );
      })
      .sort();
    expect(writers).toEqual([
      "domain/chapter-rewards.ts:外观奖励",
      "domain/progress.ts:MASTERY_BADGE_NOTICE",
      "domain/progress.ts:得到星光绶带",
    ]);
    expect(writers.some((line) => line.includes(RECOGNIZED_WORD_NOTICE))).toBe(false);
  });

  it("keeps speakWord out of the village and map create methods", () => {
    const village = createBody(readFileSync(path.join(SRC, "game/scenes/OverworldScene.ts"), "utf8"));
    const map = createBody(readFileSync(path.join(SRC, "game/scenes/StageMapScene.ts"), "utf8"));
    for (const body of [village, map]) {
      expect(body).not.toContain("speakWord");
      expect(body).not.toMatch(/for\s*\([\s\S]*speakWord/);
      expect(body).not.toMatch(/while\s*\([\s\S]*speakWord/);
    }
  });
});
