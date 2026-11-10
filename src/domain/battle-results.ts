/**
 * Battle results. Stars, the word chips, and the reward summary are pure.
 * The results scene only reads them. It does not write the save.
 */
import { wordById } from "./catalog";
import { displayTitle, FOREST_REWARDS } from "./chapter-rewards";
import { COSMETIC_LABEL } from "./cosmetic-label";
import { deviceTimeZone, localDayKey } from "./local-day";
import { levelFromXp } from "./progress";
import { skillIconFrame } from "./skill-card-face";
import { skillById } from "./skills";
import type { SaveData } from "./types";

export type StarCount = 1 | 2 | 3;

export interface ResultAnswer {
  wordId: string;
  correct: boolean;
  kind: string;
}

export interface ResultWord {
  wordId: string;
  english: string;
  gloss: string;
  correct: boolean;
}

export interface ResultItem {
  id: string;
  heading: string;
  line: string;
  atlas: "atlas_results" | "atlas_skills";
  frame: string;
}

export interface CardUpgrade {
  id: string;
  name: string;
  from: number;
  to: number;
}

export interface BattleResultsView {
  won: boolean;
  stars: StarCount | null;
  stageId: number;
  boss: boolean;
  firstChapterClear: boolean;
  practiceOnly: boolean;
  thirdReplayReward: boolean;
  newRecord: boolean;
  correct: number;
  total: number;
  words: ResultWord[];
  extraWords: number;
  anyUncorrected: boolean;
  xpBefore: number;
  xpAfter: number;
  card: CardUpgrade | null;
  items: ResultItem[];
  equippedCosmeticIds: string[];
  praise: string;
}

/** Integer thresholds. A loss has no stars. Question count and time do not reduce them. */
export function starsFor(correct: number, total: number, won: boolean): StarCount | null {
  if (!won) return null;
  if (total === 0) return 3;
  const miss = total - correct;
  if (correct * 5 >= total * 4 || miss <= 1) return 3;
  if (correct * 5 >= total * 3) return 2;
  return 1;
}

export function praiseFor(stars: StarCount): string {
  if (stars === 3) return "太棒了！";
  if (stars === 2) return "打得真好！";
  return "赢啦！继续加油！";
}

const THUMB: Record<string, string> = {
  "forest-cape": "thumb_outfit_forest_cape",
  forest_leaf_cape: "thumb_cos_forest_leaf_cape",
  acorn_pin: "thumb_cos_acorn_pin",
  forest_wreath: "thumb_cos_forest_wreath",
};

export function wordsForResults(answers: readonly ResultAnswer[]): {
  words: ResultWord[];
  extra: number;
  anyUncorrected: boolean;
  correct: number;
  total: number;
} {
  const seen = new Map<string, boolean>();
  const order: string[] = [];
  for (const answer of answers) {
    if (!seen.has(answer.wordId)) {
      order.push(answer.wordId);
      seen.set(answer.wordId, answer.correct);
    } else if (answer.correct) {
      seen.set(answer.wordId, true);
    }
  }
  const ranked = [...order.filter((id) => seen.get(id)), ...order.filter((id) => !seen.get(id))];
  const words = ranked.slice(0, 8).map((id) => {
    const word = wordById(id);
    return {
      wordId: id,
      english: word?.english ?? id,
      gloss: word?.chinese ?? "",
      correct: seen.get(id) === true,
    };
  });
  return {
    words,
    extra: Math.max(0, ranked.length - 8),
    anyUncorrected: ranked.some((id) => seen.get(id) !== true),
    correct: answers.filter((answer) => answer.correct).length,
    total: answers.length,
  };
}

function cosmeticOrder(): string[] {
  return [
    ...FOREST_REWARDS.clear_reward.cosmetic_ids,
    ...FOREST_REWARDS.mastery_milestones.flatMap((milestone) => milestone.cosmetic_ids),
  ];
}

function added(before: readonly string[], after: readonly string[]): string[] {
  const owned = new Set(before);
  return after.filter((id) => !owned.has(id));
}

export function buildResultsView(input: {
  before: SaveData;
  after: SaveData;
  answers: readonly ResultAnswer[];
  stageId: number;
  boss: boolean;
  now: number;
}): BattleResultsView {
  const words = wordsForResults(input.answers);
  const won = input.after.battlesWon === input.before.battlesWon + 1;
  const stars = starsFor(words.correct, words.total, won);
  const day = localDayKey(new Date(input.now), deviceTimeZone());
  const beforeReplay = input.before.replayWinsByDay?.[day] ?? 0;
  const afterReplay = input.after.replayWinsByDay?.[day] ?? 0;
  const practiceOnly = won && input.after.xp === input.before.xp;
  const key = String(input.stageId);
  const previous = input.before.bestStars?.[key];
  const next = input.after.bestStars?.[key];
  const hadRecord = previous === 1 || previous === 2 || previous === 3;
  const newRecord = hadRecord && next != null && next > previous;
  const skillId = input.after.equippedSkillIds[0];
  const fromLevel = skillId ? (input.before.skillLevels[skillId] ?? 1) : 1;
  const toLevel = skillId ? (input.after.skillLevels[skillId] ?? 1) : 1;
  const card = skillId && toLevel > fromLevel
    ? { id: skillId, name: skillById(skillId)?.name ?? "技能", from: fromLevel, to: toLevel }
    : null;
  const items: ResultItem[] = [];
  if (added(input.before.ownedOutfitIds, input.after.ownedOutfitIds).includes("forest-cape")) {
    items.push({
      id: "forest-cape",
      heading: "新外观 · 林间斗篷",
      line: "已经穿上啦，可以去衣柜看看",
      atlas: "atlas_results",
      frame: THUMB["forest-cape"] ?? "thumb_outfit_forest_cape",
    });
  }
  for (const id of added(input.before.unlockedSkillIds, input.after.unlockedSkillIds)) {
    items.push({
      id,
      heading: "新技能卡",
      line: skillById(id)?.name ?? "技能",
      atlas: "atlas_skills",
      frame: skillIconFrame(id),
    });
  }
  for (const id of cosmeticOrder()) {
    if (!added(input.before.unlockedCosmeticIds, input.after.unlockedCosmeticIds).includes(id)) continue;
    items.push({
      id,
      heading: `新外观 · ${COSMETIC_LABEL[id] ?? id}`,
      line: "已经穿上啦，可以去衣柜看看",
      atlas: "atlas_results",
      frame: THUMB[id] ?? "thumb_title_ribbon",
    });
  }
  for (const id of added(input.before.unlockedTitleIds, input.after.unlockedTitleIds)) {
    items.push({
      id,
      heading: `新称号 · ${displayTitle(FOREST_REWARDS, id).shownZh}`,
      line: "可以在衣柜里换称号",
      atlas: "atlas_results",
      frame: "thumb_title_ribbon",
    });
  }
  return {
    won,
    stars,
    stageId: input.stageId,
    boss: input.boss,
    firstChapterClear: won && input.boss && !input.before.chapterCleared && input.after.chapterCleared,
    practiceOnly,
    thirdReplayReward: won && !practiceOnly && beforeReplay === 2 && afterReplay === 3,
    newRecord,
    correct: words.correct,
    total: words.total,
    words: words.words,
    extraWords: words.extra,
    anyUncorrected: words.anyUncorrected,
    xpBefore: input.before.xp,
    xpAfter: input.after.xp,
    card,
    items,
    equippedCosmeticIds: input.after.equippedCosmeticIds,
    praise: stars ? praiseFor(stars) : "",
  };
}

/** Listed rows stay as rows. Anything past the cap is a "+N 件" badge, not a button. */
export function visibleItems(items: readonly ResultItem[], practice: boolean): { shown: ResultItem[]; extra: number } {
  const limit = practice ? 2 : 3;
  if (items.length <= limit) return { shown: [...items], extra: 0 };
  return { shown: items.slice(0, limit), extra: items.length - limit };
}

/** Art README v1.0. The badge is not a button and does not say where the rest went. */
export function moreBadgeLabel(extra: number): string {
  return `+${extra} 件`;
}

export interface XpFillSegment {
  from: number;
  to: number;
}

/**
 * One segment stays inside the current level.
 * Crossing a level fills the bar, then starts again from empty up to the final remainder.
 * 220 → 240 is the boss first-clear case: half full, then full, then empty.
 */
export function xpBarSegments(beforeXp: number, afterXp: number): XpFillSegment[] {
  const before = levelFromXp(Math.max(0, beforeXp));
  const after = levelFromXp(Math.max(0, afterXp));
  const start = before.into / before.span;
  const end = after.into / after.span;
  if (after.level > before.level) return [{ from: start, to: 1 }, { from: 0, to: end }];
  return [{ from: start, to: end }];
}

/**
 * Two word rows end at y=360, and the reward block is laid out under that.
 * A shorter list moves that block up by the unused height so the gap stays put.
 */
export function resultsLowerShift(wordCount: number, extraWords: number): number {
  const rows = wordCount <= 0 ? 0 : Math.ceil(wordCount / 4);
  const chipBottom = rows === 0 ? 186 : 220 + (rows - 1) * 76 + 64;
  const blockBottom = extraWords > 0 ? chipBottom + 28 : chipBottom;
  return Math.max(0, 360 - blockBottom);
}

const RESULTS_PANEL_TOP = 116;
const RESULTS_PANEL_BOTTOM = 704;
const RESULTS_HEADER_TOP = 130;

/**
 * A card, item list, or the loss box already fills the parchment.
 * Practice-only and XP-only stacks are short, so they move down together
 * and sit in the middle instead of leaving the lower half empty.
 */
export function resultsStackNudge(
  wordCount: number,
  extraWords: number,
  mode: "tall" | "practice" | "xp",
): number {
  if (mode === "tall") return 0;
  const shift = resultsLowerShift(wordCount, extraWords);
  const bottom = (mode === "practice" ? 540 : 480) - shift;
  const pad = 36;
  const slack = RESULTS_PANEL_BOTTOM - pad - bottom;
  if (slack < 72) return 0;
  const block = bottom - RESULTS_HEADER_TOP;
  const inner = RESULTS_PANEL_BOTTOM - pad - RESULTS_PANEL_TOP;
  return Math.max(0, Math.round((inner - block) / 2 - (RESULTS_HEADER_TOP - RESULTS_PANEL_TOP)));
}

export const MAP_RESULT_FRAMES = ["map_star_on", "map_star_off", "map_node_boss_cleared"] as const;

/** Nodes and stars share one paint. Missing any of these frames means the map atlas is not ready. */
export function mapResultsFramesReady(hasFrame: (frame: string) => boolean): boolean {
  return MAP_RESULT_FRAMES.every((frame) => hasFrame(frame));
}

const MAP_NODES = [
  { x: 230, y: 620 },
  { x: 430, y: 490 },
  { x: 250, y: 350 },
  { x: 470, y: 220 },
  { x: 690, y: 400 },
] as const;

/** Star-row center. Stage 1 shifts right so it clears the village button. */
export function mapStarCenter(index: number): { x: number; y: number } {
  const node = MAP_NODES[index] ?? MAP_NODES[0];
  if (index === 0) return { x: node.x + 64, y: node.y + 91 };
  if (index === 4) return { x: node.x, y: node.y + 112 };
  return { x: node.x, y: node.y + 91 };
}

export const RESULTS_LAYOUT = {
  panel: { x: 835, y: 410, w: 770, h: 588 },
  continueButton: { x: 835, y: 744, w: 260, h: 56 },
  retryButton: { x: 720, y: 744, w: 240, h: 56 },
  mapButton: { x: 960, y: 744, w: 200, h: 56 },
  practiceCard: { x: 835, y: 475, w: 680, h: 110 },
  practiceItems: { x: 835, y: 616, w: 680, h: 140 },
} as const;

export const LOSS_ENCOURAGEMENT = "打输了不会丢东西，放心再来！";
export const PRACTICE_LINE_1 = "今天的再战奖励领完啦，明天再来。";
export const PRACTICE_LINE_2 = "练习也很棒！";
export const PRACTICE_NOTICE = "今天再战的奖励都拿到啦！";
export const MAP_PRACTICE_NOTE = "今天再战的奖励领完啦，还可以练习。";
export const MASTERY_ITEM_LINE = "熟练徽章攒够啦，得到新外观！";
