/**
 * Forest chapter cosmetics and titles. Amounts, ids, and names come from
 * the reward config. Thresholds use ceil(total * ratio), not a fixed word count.
 */
import rewardFile from "./data/forest-rewards.json";
import type { RewardNotice, SaveData } from "./types";

export interface TitleEntry {
  zh: string;
  en: string;
  candidates_zh: string[];
  candidates_en: string[];
  default_candidate_index: number;
  final_name_selected_by_pm: boolean;
}

export interface MasteryMilestoneConfig {
  id: string;
  ratio: number;
  badge_lit_min: number | null;
  badge_lit_min_formula: string;
  cosmetic_ids: string[];
  title_id: string;
  grant_once: boolean;
}

export interface HideRule {
  when_equipped: string;
  hide_slots?: string[];
  hide_parts?: string[];
}

export interface ChapterRewardConfig {
  chapter_id: string;
  word_count_source: string;
  mastery_milestone_ratios: number[];
  clear_reward: { cosmetic_ids: string[]; title_id: string; grant_once: boolean };
  mastery_milestones: MasteryMilestoneConfig[];
  replay: { unique_cosmetics: boolean; extra_token_every_n_wins: number | null };
  titles: Record<string, TitleEntry>;
  slot_map: Record<string, string>;
  hide_rules: HideRule[];
  art_priority: string;
}

export const FOREST_REWARDS = rewardFile as ChapterRewardConfig;

/** The formula wins. A number stored on the milestone is only a cache. */
export function badgeLitMin(total: number, ratio: number): number {
  return Math.ceil(total * ratio);
}

export function displayTitle(config: ChapterRewardConfig, titleId: string): TitleEntry & { shownZh: string; shownEn: string } {
  const entry = config.titles[titleId];
  if (!entry) throw new Error(`Missing title ${titleId}`);
  const index = entry.default_candidate_index;
  return {
    ...entry,
    shownZh: entry.candidates_zh[index] ?? entry.zh,
    shownEn: entry.candidates_en[index] ?? entry.en,
  };
}

export function withRewardDefaults(save: SaveData): SaveData {
  const unlockedCosmeticIds = stringList(save.unlockedCosmeticIds);
  const unlockedTitleIds = stringList(save.unlockedTitleIds);
  const equippedCosmeticIds = stringList(save.equippedCosmeticIds).filter((id) => unlockedCosmeticIds.includes(id));
  const equippedTitleId = typeof save.equippedTitleId === "string" && unlockedTitleIds.includes(save.equippedTitleId)
    ? save.equippedTitleId
    : null;
  return {
    ...save,
    unlockedCosmeticIds,
    unlockedTitleIds,
    equippedCosmeticIds,
    equippedTitleId,
    masteryMilestonesClaimed: stringList(save.masteryMilestonesClaimed),
    clearRewardClaimed: save.clearRewardClaimed === true,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function notice(title: string, detail: string): RewardNotice {
  return { id: `${title}-${detail}`.slice(0, 140), title, detail };
}

function grantPieces(save: SaveData, config: ChapterRewardConfig, cosmeticIds: readonly string[], titleId: string): SaveData {
  const unlockedCosmeticIds = [...save.unlockedCosmeticIds];
  const equippedCosmeticIds = [...save.equippedCosmeticIds];
  for (const id of cosmeticIds) {
    if (unlockedCosmeticIds.includes(id)) continue;
    unlockedCosmeticIds.push(id);
    equippedCosmeticIds.push(id);
  }
  const unlockedTitleIds = save.unlockedTitleIds.includes(titleId) ? save.unlockedTitleIds : [...save.unlockedTitleIds, titleId];
  const title = displayTitle(config, titleId);
  const titles = save.titles.includes(title.shownZh) ? save.titles : [...save.titles, title.shownZh];
  const equippedTitleId = save.equippedTitleId ?? titleId;
  const detail = `得到${title.shownZh}。这只改外观，不改经验、复习和战斗数值。`;
  return {
    ...save,
    unlockedCosmeticIds,
    equippedCosmeticIds,
    unlockedTitleIds,
    equippedTitleId,
    titles,
    rewardQueue: [...save.rewardQueue, notice("外观奖励", detail)].slice(-6),
  };
}

/**
 * Grants the clear reward and any mastery milestone reached for the first time.
 * Does not change XP, FSRS memory, cards, combat stats, or the daily cosmetic token.
 */
export function applyChapterRewards(
  save: SaveData,
  lit: number,
  total: number,
  config: ChapterRewardConfig = FOREST_REWARDS,
): SaveData {
  let next = save;
  if (next.chapterCleared && !next.clearRewardClaimed && config.clear_reward.grant_once) {
    next = grantPieces(next, config, config.clear_reward.cosmetic_ids, config.clear_reward.title_id);
    next = { ...next, clearRewardClaimed: true };
  }
  for (const milestone of config.mastery_milestones) {
    if (!milestone.grant_once || next.masteryMilestonesClaimed.includes(milestone.id)) continue;
    if (lit < badgeLitMin(total, milestone.ratio)) continue;
    next = grantPieces(next, config, milestone.cosmetic_ids, milestone.title_id);
    next = { ...next, masteryMilestonesClaimed: [...next.masteryMilestonesClaimed, milestone.id] };
  }
  return next;
}

export function equipTitle(save: SaveData, titleId: string | null): SaveData {
  if (titleId !== null && !save.unlockedTitleIds.includes(titleId)) return save;
  return { ...save, equippedTitleId: titleId };
}

export function equipCosmetic(save: SaveData, cosmeticId: string): SaveData {
  if (!save.unlockedCosmeticIds.includes(cosmeticId) || save.equippedCosmeticIds.includes(cosmeticId)) return save;
  return { ...save, equippedCosmeticIds: [...save.equippedCosmeticIds, cosmeticId] };
}

export function unequipCosmetic(save: SaveData, cosmeticId: string): SaveData {
  return { ...save, equippedCosmeticIds: save.equippedCosmeticIds.filter((id) => id !== cosmeticId) };
}

export interface CosmeticVisibility {
  hiddenSlots: string[];
  hiddenParts: string[];
  /** Hide targets the current art pack does not draw as their own layer. */
  unmet: string[];
}

export function visibilityForCosmetics(
  config: ChapterRewardConfig,
  equipped: readonly string[],
  present: { slots: readonly string[]; parts: readonly string[] },
): CosmeticVisibility {
  const hiddenSlots: string[] = [];
  const hiddenParts: string[] = [];
  const unmet: string[] = [];
  for (const rule of config.hide_rules) {
    if (!equipped.includes(rule.when_equipped)) continue;
    for (const slot of rule.hide_slots ?? []) {
      if (present.slots.includes(slot)) hiddenSlots.push(slot);
      else unmet.push(slot);
    }
    for (const part of rule.hide_parts ?? []) {
      if (present.parts.includes(part)) hiddenParts.push(part);
      else unmet.push(part);
    }
  }
  return { hiddenSlots, hiddenParts, unmet };
}

/**
 * The cape targets `back`, which this pack does not draw.
 * The wreath hides the whole `outfit_head` layer. That layer is the helmet, plume included.
 */
export const CHAPTER_ART_LIMITS = [
  "披肩要藏职业 back（背包、箭袋）。战士 v0.1 没有 back 图，这一层没有画出来，所以没有可藏的背包。",
  "花环戴上时，整顶头盔藏起来。头盔是 outfit_head 这一层，羽饰也在里面，不另拆一层。",
] as const;
