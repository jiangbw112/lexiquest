import { isDesktopShell, shellCopy } from "../domain/host-copy";
import { syncUnlocks } from "../domain/progress";
import { loadSave, writeSave } from "../domain/storage";
import type { SaveData } from "../domain/types";
import { probeNote, setProbeProvider } from "./probe";

let current: SaveData | null = null;

export function saveCacheNotice(): string {
  return shellCopy(isDesktopShell()).saveCacheNotice;
}

export function bootSave(): SaveData | null {
  const loaded = loadSave();
  current = loaded ? syncUnlocks(loaded) : null;
  setProbeProvider(() => ({
    learned: current ? Object.keys(current.wordCards).length : 0,
    equippedSkills: current ? current.equippedSkillIds.length : 0,
  }));
  return current;
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
