import { sanitizeName } from "./appearance";
import { grantWordCard, setMasteryBadge } from "./cards";
import { CHAPTER_BOSS_ID } from "./battle";
import { classById } from "./classes";
import { normalizeGrades, sampleWords, wordById, wordsForGrades } from "./catalog";
import { PROVISIONAL } from "./provisional";
import { OUTFITS } from "./outfits";
import { compareRounds, type DuelAnswer } from "./duel";
import { applyReview, introduceMemory, masteryDecision } from "./review";
import {
  equipSkillIds,
  MAX_EQUIPPED_SKILLS,
  MAX_SKILL_LEVEL,
  skillById,
  skillsForClass,
  starterSkillId,
} from "./skills";
import type { Appearance, ClassId, MemoryRecord, RewardNotice, SaveData, WordCardRecord } from "./types";
import type { Grade } from "ts-fsrs";

export const XP_PER_LEVEL = 40;
export const LEARN_XP = 8;

export function levelFromXp(xp: number): { level: number; into: number; span: number } {
  const span = XP_PER_LEVEL;
  return { level: Math.floor(xp / span) + 1, into: xp % span, span };
}

function reward(title: string, detail: string, stamp = ""): RewardNotice {
  return { id: `${stamp}${title}-${detail}`.slice(0, 140), title, detail };
}

function pushReward(queue: RewardNotice[], notice: RewardNotice): RewardNotice[] {
  return [...queue, notice].slice(-6);
}

export function syncUnlocks(save: SaveData): SaveData {
  return refreshUnlocks(save);
}

function refreshUnlocks(save: SaveData): SaveData {
  const list = skillsForClass(save.player.classId);
  const count = Object.keys(save.wordCards).length;
  const unlocked = new Set<string>();
  if (list[0]) unlocked.add(list[0].id);
  if (list[1] && count >= 3) unlocked.add(list[1].id);
  if (list[2] && save.battlesWon >= 1) unlocked.add(list[2].id);
  if (list[3] && count >= 4 && save.battlesWon >= 1) unlocked.add(list[3].id);
  const skillLevels = { ...save.skillLevels };
  for (const id of unlocked) {
    if (!skillLevels[id]) skillLevels[id] = 1;
  }
  const equipped = save.equippedSkillIds.filter((id) => unlocked.has(id)).slice(0, MAX_EQUIPPED_SKILLS);
  return {
    ...save,
    unlockedSkillIds: [...unlocked],
    equippedSkillIds: equipped,
    skillLevels,
  };
}

export function createSave(input: {
  name: string;
  classId: ClassId;
  appearance: Appearance;
  now: number;
  grades?: readonly string[];
}): SaveData {
  const name = sanitizeName(input.name);
  if (!name) throw new Error("Name must be 1–12 characters");
  const starter = starterSkillId(input.classId);
  const save: SaveData = {
    version: 1,
    createdAt: input.now,
    player: { name, classId: input.classId, appearance: input.appearance },
    wordCards: {},
    memory: {},
    skillLevels: { [starter]: 1 },
    unlockedSkillIds: [starter],
    equippedSkillIds: [starter],
    ownedOutfitIds: ["traveler"],
    equippedOutfitId: "traveler",
    xp: 0,
    battlesWon: 0,
    battlesLost: 0,
    chapterCleared: false,
    selectedGrades: normalizeGrades(input.grades),
    clockOffsetMs: 0,
    rewardQueue: [],
  };
  return refreshUnlocks(save);
}

export function studyNow(save: SaveData, realNow = Date.now()): Date {
  return new Date(realNow + save.clockOffsetMs);
}

export function shiftClock(save: SaveData, deltaMs: number): SaveData {
  return { ...save, clockOffsetMs: Math.max(0, save.clockOffsetMs + deltaMs) };
}

export function resetClock(save: SaveData): SaveData {
  return { ...save, clockOffsetMs: 0 };
}

export function learnWord(save: SaveData, wordId: string, now: Date): SaveData {
  const word = wordById(wordId);
  if (!word) return save;
  if (!normalizeGrades(save.selectedGrades).includes(word.grade)) return save;
  if (save.wordCards[wordId]) return save;
  const wordCards = grantWordCard(save.wordCards, wordId, now.getTime());
  const memory: Record<string, MemoryRecord> = {
    ...save.memory,
    [wordId]: introduceMemory(wordId, now),
  };
  let next: SaveData = {
    ...save,
    wordCards,
    memory,
    xp: save.xp + LEARN_XP,
  };
  const complete = sampleWords().every((item) => next.wordCards[item.id]);
  if (complete && !next.ownedOutfitIds.includes("star-sash")) {
    next = {
      ...next,
      ownedOutfitIds: [...next.ownedOutfitIds, "star-sash"],
      rewardQueue: pushReward(
        next.rewardQueue,
        reward("得到星光绶带", "示例词卡收集齐了。这是服装奖励。词卡还在，熟练徽章要靠以后的复习。"),
      ),
    };
  }
  return refreshUnlocks(next);
}

export function gradeIsOpen(save: SaveData, wordId: string): boolean {
  const word = wordById(wordId);
  return Boolean(word && normalizeGrades(save.selectedGrades).includes(word.grade));
}

export function learnedCountInGrade(save: SaveData, grade: string): number {
  return Object.keys(save.wordCards).filter((id) => wordById(id)?.grade === grade).length;
}

/** Shown when a grade with collected cards is turned off. The change is already saved. */
export function gradePauseNotice(gradeLabel: string, learnedCount: number): string {
  return `取消${gradeLabel}后，已学的${learnedCount}个单词卡会保留，但战斗里不会再考这些词，到期复习也会暂停；重新勾选即可恢复。`;
}

export function reviewWord(save: SaveData, wordId: string, rating: Grade, now: Date): SaveData {
  const existing = save.memory[wordId];
  const card = save.wordCards[wordId];
  if (!existing || !card) return save;
  if (!gradeIsOpen(save, wordId)) return save;
  const updated = applyReview(existing, rating, now);
  const decision = masteryDecision(updated);
  let wordCards: Record<string, WordCardRecord> = save.wordCards;
  let rewardQueue = save.rewardQueue;
  if (decision.award && !card.masteryBadge) {
    wordCards = setMasteryBadge(wordCards, wordId, true, now.getTime());
    const word = wordById(wordId);
    rewardQueue = pushReward(
      rewardQueue,
      reward(
        "熟练徽章亮了",
        `${word?.english ?? wordId} 的词卡还在原处。徽章到了复习时间会变灰，答对后再亮起来。`,
      ),
    );
  }
  return {
    ...save,
    memory: { ...save.memory, [wordId]: updated },
    wordCards,
    rewardQueue,
  };
}

/**
 * Same-device 1v1 is practice. The save, including FSRS memory, is not modified.
 */
export function practiceDuel(
  save: SaveData,
  answersA: readonly DuelAnswer[],
  answersB: readonly DuelAnswer[],
): { save: SaveData; comparison: ReturnType<typeof compareRounds> } {
  return { save, comparison: compareRounds(answersA, answersB) };
}

export function equipSkill(
  save: SaveData,
  skillId: string,
): { save: SaveData; ok: boolean; reason?: "limit" | "locked" | "unknown" } {
  const known = skillsForClass(save.player.classId).map((skill) => skill.id);
  const result = equipSkillIds(save.equippedSkillIds, skillId, {
    unlocked: save.unlockedSkillIds,
    known,
    max: MAX_EQUIPPED_SKILLS,
  });
  if (!result.ok) return { save, ok: false, reason: result.reason };
  return { save: { ...save, equippedSkillIds: result.equipped }, ok: true };
}

export function unequipSkill(save: SaveData, skillId: string): SaveData {
  return { ...save, equippedSkillIds: save.equippedSkillIds.filter((id) => id !== skillId) };
}

export function equipOutfit(save: SaveData, outfitId: string): SaveData {
  if (!save.ownedOutfitIds.includes(outfitId)) return save;
  if (!OUTFITS.some((outfit) => outfit.id === outfitId)) return save;
  return { ...save, equippedOutfitId: outfitId };
}

export function updateAppearance(save: SaveData, appearance: Appearance): SaveData {
  return { ...save, player: { ...save.player, appearance } };
}

export function dismissReward(save: SaveData): SaveData {
  return { ...save, rewardQueue: save.rewardQueue.slice(1) };
}

export function selectedSampleWords(save: SaveData) {
  return wordsForGrades(save.selectedGrades);
}

export function selectedCollected(save: SaveData): boolean {
  const words = selectedSampleWords(save);
  return words.length > 0 && words.every((word) => save.wordCards[word.id]);
}

/** Null when the selected grades have enough sample words to start a battle. */
export function selectionBattleNotice(sampleCount: number, minimum = PROVISIONAL.grades.minimumSampleWords): string | null {
  if (sampleCount >= minimum) return null;
  return `所选年级里只有 ${sampleCount} 个示例词，还不够对战（至少 ${minimum} 个）。请再选一个年级。已经收下的词卡和复习都还在。`;
}

export function setSelectedGrades(save: SaveData, grades: readonly string[]): SaveData {
  return { ...save, selectedGrades: normalizeGrades(grades) };
}

/** What the village should tell the child to do next. The ending line is provisional. */
export function questLine(save: SaveData): string {
  const pool = selectedSampleWords(save);
  const total = pool.length;
  const learned = pool.filter((word) => save.wordCards[word.id]).length;
  const tooSmall = selectionBattleNotice(total);
  if (tooSmall) return tooSmall;
  if (save.chapterCleared && learned >= total) {
    return `森林冒险暂定完成。所选年级的 ${total} 张词卡都在册子里。熟练徽章还是要靠复习。`;
  }
  if (learned < 4) {
    return `目标：学完所选年级的 ${total} 个词，再打败林冠。先去学堂，还差 ${4 - learned} 张才能对战。`;
  }
  if (save.battlesWon < 1) {
    return `已有 ${learned}/${total} 张所选年级的词卡。先去对战墨团。打出技能卡时要答一道学过的词。`;
  }
  if (learned < total) {
    return `已有 ${learned}/${total} 张所选年级的词卡。集齐后才能挑战林冠。别的年级在给家长里选。`;
  }
  return "所选年级的词卡齐了。去对战，选林冠。这是暂定结局，赢了这一章就算走完。";
}

/**
 * Records a win or loss. Word cards and memory are reused unchanged:
 * a battle never grants, removes, or reschedules a word.
 */
export function applyBattleOutcome(
  save: SaveData,
  outcome: "win" | "loss",
  now: number,
  encounterId?: string,
): SaveData {
  if (outcome === "loss") {
    return { ...save, battlesLost: save.battlesLost + 1, memory: save.memory, wordCards: save.wordCards };
  }
  const hero = classById(save.player.classId);
  const xpGain = Math.round(20 * hero.xpBonus);
  const skillLevels = { ...save.skillLevels };
  const first = save.equippedSkillIds[0];
  let skillNote = "";
  if (first) {
    const level = skillLevels[first] ?? 1;
    if (level < MAX_SKILL_LEVEL) {
      skillLevels[first] = level + 1;
      skillNote = `${skillById(first)?.name ?? "技能"} 升到 Lv.${level + 1}。`;
    }
  }
  let owned = save.ownedOutfitIds;
  let equippedOutfitId = save.equippedOutfitId;
  let outfitNote = "";
  if (!owned.includes("forest-cape")) {
    owned = [...owned, "forest-cape"];
    equippedOutfitId = "forest-cape";
    outfitNote = "得到林间斗篷。";
  }
  const detail = ["这场战斗没有改动任何词卡，也没有改动复习记忆。", skillNote, outfitNote, `经验 +${xpGain}。`]
    .filter(Boolean)
    .join("");
  let rewardQueue = pushReward(save.rewardQueue, reward("对战胜利", detail, String(now)));
  let chapterCleared = save.chapterCleared;
  if (encounterId === CHAPTER_BOSS_ID && selectedCollected(save) && !chapterCleared) {
    chapterCleared = true;
    rewardQueue = pushReward(
      rewardQueue,
      reward("暂定结局", "森林冒险的示例词卡和林冠都过了。这不是最终故事。词卡还在，复习记忆也没变。", String(now)),
    );
  }
  const next: SaveData = {
    ...save,
    battlesWon: save.battlesWon + 1,
    xp: save.xp + xpGain,
    skillLevels,
    ownedOutfitIds: owned,
    equippedOutfitId,
    chapterCleared,
    memory: save.memory,
    wordCards: save.wordCards,
    rewardQueue,
  };
  return refreshUnlocks(next);
}
