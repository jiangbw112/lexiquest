import { isDesktopShell, shellCopy } from "../domain/host-copy";
import { syncUnlocks } from "../domain/progress";
import { SAVE_KEY, deserialize, writeSave } from "../domain/storage";
import { wardrobeWearDiffers } from "../domain/wardrobe-list";
import type { SaveData } from "../domain/types";
import { probeNote, setProbeProvider } from "./probe";

let current: SaveData | null = null;

export function saveCacheNotice(): string {
  return shellCopy(isDesktopShell()).saveCacheNotice;
}

export function bootSave(): SaveData | null {
  const raw = readStoredSave();
  const loaded = raw ? deserialize(raw) : null;
  current = loaded ? syncUnlocks(loaded) : null;
  if (raw && current) {
    try {
      const stored = JSON.parse(raw) as SaveData;
      if (wardrobeWearDiffers(stored, current)) writeSave(current);
    } catch {
      // deserialize already accepted this text.
    }
  }
  setProbeProvider(() => ({
    learned: current ? Object.keys(current.wordCards).length : 0,
    equippedSkills: current ? current.equippedSkillIds.length : 0,
  }));
  return current;
}

function readStoredSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function getSave(): SaveData | null {
  return current;
}

export function commit(next: SaveData | null): boolean {
  current = next;
  const ok = writeSave(next);
  probeNote(ok ? "save:cache" : "save:failed");
  return ok;
}

export function mutate(update: (save: SaveData) => SaveData): SaveData | null {
  if (!current) return null;
  const next = update(current);
  commit(next);
  return next;
}

/** Same write as mutate, plus whether the cache accepted it. A failed write keeps the new save in memory. */
export function mutateCommitted(update: (save: SaveData) => SaveData): { save: SaveData | null; saved: boolean } {
  if (!current) return { save: null, saved: false };
  const next = update(current);
  return { save: next, saved: commit(next) };
}
