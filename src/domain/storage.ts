/**
 * Browser localStorage cache for this MVP only.
 * It is not authoritative progress: another device, a cleared browser, or a
 * future account server would not honor it. Rewards granted here must be
 * re-checked before any server grants the same reward.
 */
import { isAppearance } from "./appearance";
import { normalizeGrades } from "./catalog";
import { CLASS_IDS } from "./classes";
import { withParentDefaults } from "./parent";
import type { ClassId, SaveData } from "./types";

export const SAVE_KEY = "lexiquest.save.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStageWins(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const wins: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) wins[key] = count;
  }
  return wins;
}

export function deserialize(raw: string): SaveData | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1) return null;
    if (!isRecord(value.player)) return null;
    const name = value.player.name;
    const classId = value.player.classId;
    const appearance = value.player.appearance;
    if (typeof name !== "string" || name.length < 1 || name.length > 12) return null;
    if (typeof classId !== "string" || !CLASS_IDS.includes(classId as ClassId)) return null;
    if (!isAppearance(appearance)) return null;
    if (!isRecord(value.wordCards) || !isRecord(value.memory) || !isRecord(value.skillLevels)) return null;
    if (!Array.isArray(value.equippedSkillIds) || !Array.isArray(value.unlockedSkillIds)) return null;
    if (!Array.isArray(value.ownedOutfitIds) || typeof value.equippedOutfitId !== "string") return null;
    if (!Array.isArray(value.rewardQueue)) return null;
    if (typeof value.xp !== "number" || typeof value.clockOffsetMs !== "number") return null;
    if (typeof value.battlesWon !== "number" || typeof value.battlesLost !== "number") return null;
    const save = value as unknown as SaveData;
    save.chapterCleared = value.chapterCleared === true;
    save.stageWins = readStageWins(value.stageWins);
    save.titles = Array.isArray(value.titles) ? value.titles.filter((item): item is string => typeof item === "string") : [];
    const grades = Array.isArray(value.selectedGrades)
      ? value.selectedGrades.filter((grade): grade is string => typeof grade === "string")
      : undefined;
    save.selectedGrades = normalizeGrades(grades);
    return withParentDefaults(save);
  } catch {
    return null;
  }
}

export function serialize(save: SaveData): string {
  return JSON.stringify(save);
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
}

export function writeSave(save: SaveData | null): boolean {
  try {
    if (!save) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, serialize(save));
    return true;
  } catch {
    return false;
  }
}
