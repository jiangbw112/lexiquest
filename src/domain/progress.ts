import { sanitizeName } from "./appearance";
import { applyChapterRewards } from "./chapter-rewards";
import { grantWordCard, setMasteryBadge } from "./cards";
import { CHAPTER_BOSS_ID } from "./battle";
import { PROVISIONAL } from "./provisional";
import {
  bossReady,
  chapterLearnedCount,
  chapterWordIds,
  FOREST_CHAPTER,
  FOREST_WORD_COUNT,
  clearedStageCount,
  litMasteryCount,
  explorationStageByEncounter,
  masteryLabel,
  stageById,
  stageCleared,
  stageWordIds,
  wordsUntilBoss,
} from "./stages";
import { classById } from "./classes";
import { isChapterExtra, normalizeGrades, sampleWords, wordById, wordsForGrades } from "./catalog";
import { OUTFITS } from "./outfits";
import { compareRounds, type DuelAnswer } from "./duel";
import { deviceTimeZone, ensureDailyGoal, noteDueReview, noteLearned, notePracticeAnswer } from "./parent";
import { applyReview, badgeTone, introduceMemory, isDue, masteryDecision } from "./review";
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
  const selectedGrades = normalizeGrades(input.grades);
  const save: SaveData = {
    version: 1,
    createdAt: input.now,
    player: { name, classId: input.classId, appearance: input.appearance },
    wordCards: {},
    memory: {},
    spellingMemory: {},
    dailyStats: {},
    dueAnswers: [],
    parentGoalPreset: "normal",
    dailyGoal: null,
    goalDaysTotal: 0,
    lastGoalCompletedDayKey: null,
    goalCalendar: {},
    cosmeticTokens: 0,
    lastTimezone: null,
    clockAnomaly: false,
    skillLevels: { [starter]: 1 },
    unlockedSkillIds: [starter],
    equippedSkillIds: [starter],
    ownedOutfitIds: ["traveler"],
    equippedOutfitId: "traveler",
    xp: 0,
    battlesWon: 0,
    battlesLost: 0,
    chapterCleared: false,
    stageWins: {},
    titles: [],
    unlockedCosmeticIds: [],
    unlockedTitleIds: [],
    equippedCosmeticIds: [],
    equippedTitleId: null,
    masteryMilestonesClaimed: [],
    clearRewardClaimed: false,
    selectedGrades,
    gradesConfirmed: selectedGrades.length > 0,
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

export function learnWord(save: SaveData, wordId: string, now: Date, timeZone = deviceTimeZone()): SaveData {
  const word = wordById(wordId);
  if (!word) return save;
  if (!gradeIsOpen(save, wordId)) return save;
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
        reward("得到星光绶带", "森林章节的词卡收集齐了。这是服装奖励。词卡还在，熟练徽章要靠以后的复习。"),
      ),
    };
  }
  return refreshUnlocks(noteLearned(next, wordId, now, timeZone));
}

export function gradeIsOpen(save: SaveData, wordId: string): boolean {
  if (normalizeGrades(save.selectedGrades).length === 0) return false;
  if (isChapterExtra(wordId)) return true;
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

export function reviewWord(save: SaveData, wordId: string, rating: Grade, now: Date, timeZone = deviceTimeZone()): SaveData {
  const existing = save.memory[wordId];
  const card = save.wordCards[wordId];
  if (!existing || !card) return save;
  if (!gradeIsOpen(save, wordId)) return save;
  const ready = ensureDailyGoal(save, now, timeZone);
  const wasDue = isDue(existing, now);
  if (!wasDue && ready.dailyGoal?.mode === "practice_fallback") {
    return notePracticeAnswer(ready, wordId, now, timeZone);
  }
  const beforeTone = badgeTone(card, existing, now);
  const updated = applyReview(existing, rating, now);
  const decision = masteryDecision(updated);
  let wordCards: Record<string, WordCardRecord> = ready.wordCards;
  let rewardQueue = ready.rewardQueue;
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
  return settleChapterRewards(
    noteDueReview(
      {
        ...ready,
        memory: { ...ready.memory, [wordId]: updated },
        wordCards,
        rewardQueue,
      },
      { wordId, rating, at: now, dueFirst: wasDue, beforeTone, track: "meaning", timeZone },
    ),
    now,
  );
}

function settleChapterRewards(save: SaveData, now: Date): SaveData {
  return applyChapterRewards(save, litMasteryCount(save, now), chapterWordIds().length);
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
  return `所选年级里只有 ${sampleCount} 个词，还不够对战（至少 ${minimum} 个）。请再选一个年级。已经收下的词卡和复习都还在。`;
}

/** Writes a non-empty grade list. An empty list is not a save: the previous grades stay. */
export function setSelectedGrades(save: SaveData, grades: readonly string[]): SaveData {
  const selectedGrades = normalizeGrades(grades);
  if (selectedGrades.length === 0) return save;
  return { ...save, selectedGrades, gradesConfirmed: true };
}

/** True whenever no grade is selected. Learning and battle stay closed. */
export function needsGradeChoice(save: Pick<SaveData, "selectedGrades">): boolean {
  return save.selectedGrades.length === 0;
}

export type GradeGate = "ready" | "migrate" | "ask-parent";

/**
 * ready: at least one grade.
 * migrate: an older save that never stored a grade. That page may write the first choice.
 * ask-parent: the save is already empty and grades were confirmed. The child cannot write a
 * new choice there. The parent page cannot create this state; it refuses to store an empty list.
 */
export function gradeGate(save: Pick<SaveData, "selectedGrades" | "gradesConfirmed">): GradeGate {
  if (save.selectedGrades.length > 0) return "ready";
  return save.gradesConfirmed ? "ask-parent" : "migrate";
}

/** What the village should tell the child to do next. */
export function questLine(save: SaveData): string {
  const tooSmall = selectionBattleNotice(selectedSampleWords(save).length);
  if (tooSmall) return tooSmall;
  const now = studyNow(save);
  const progress = `已学 ${chapterLearnedCount(save)}/${FOREST_WORD_COUNT}，已清关 ${clearedStageCount(save)}/5，掌握 ${masteryLabel(save, now)}。`;
  if (save.chapterCleared) {
    return `森林冒险通关了。${progress}复习会让灰掉的徽章再亮。`;
  }
  const next = nextForestStage(save);
  if (!next) return `去对战，挑战林心守护者。${progress}`;
  if (next.type === "boss") {
    return bossReady(save)
      ? `可以挑战林心守护者了。${progress}`
      : `林心守护还锁着。还差 ${wordsUntilBoss(save)} 个词。${progress}`;
  }
  const ids = stageWordIds(save, next);
  const wins = save.stageWins[String(next.id)] ?? 0;
  if (ids.length === 0) {
    const need = FOREST_CHAPTER.stage_clear.min_battle_wins;
    return `下一关是${next.name_zh}。没有要学的新词，赢 ${need} 场小战斗就算通过。小战斗 ${wins} 胜。${progress}`;
  }
  const got = ids.filter((id) => save.wordCards[id]).length;
  return `下一关是${next.name_zh}。新词 ${got}/${ids.length}，小战斗 ${wins} 胜。${progress}`;
}

function nextForestStage(save: SaveData) {
  const stages = [1, 2, 3, 4, 5].map((id) => stageById(id)).filter((stage) => stage !== undefined);
  const open = stages.find((stage) => stage.type !== "boss" && !stageCleared(save, stage));
  return open ?? stageById(5);
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
  const rewardQueue = pushReward(save.rewardQueue, reward("对战胜利", detail, String(now)));
  let chapterCleared = save.chapterCleared;
  const stage = explorationStageByEncounter(encounterId);
  const stageWins = stage
    ? { ...save.stageWins, [String(stage.id)]: (save.stageWins[String(stage.id)] ?? 0) + 1 }
    : save.stageWins;
  if (encounterId === CHAPTER_BOSS_ID && bossReady(save) && !chapterCleared) {
    chapterCleared = true;
  }
  const next: SaveData = {
    ...save,
    battlesWon: save.battlesWon + 1,
    xp: save.xp + xpGain,
    skillLevels,
    ownedOutfitIds: owned,
    equippedOutfitId,
    chapterCleared,
    stageWins,
    memory: save.memory,
    wordCards: save.wordCards,
    rewardQueue,
  };
  return settleChapterRewards(refreshUnlocks(next), new Date(now));
}
