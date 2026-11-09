/**
 * Browser localStorage cache for this MVP only.
 * It is not authoritative progress: another device, a cleared browser, or a
 * future account server would not honor it. Rewards granted here must be
 * re-checked before any server grants the same reward.
 */
import { isAppearance } from "./appearance";
import { CLASS_IDS } from "./classes";
import type { ClassId, SaveData } from "./types";

export const SAVE_KEY = "lexiquest.save.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    return value as unknown as SaveData;
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
