import { isDesktopShell, shellCopy } from "../domain/host-copy";
import {
  ROSTER_KEY,
  addProfile,
  clearLiveProfiles,
  deleteProfile,
  ensureProfiles,
  importNewProfile,
  loadProfile,
  profileCards,
  profileKey,
  readRoster,
  writeProfile,
  type ByteStore,
  type ProfileCard,
  type ProfileFailure,
  type ProfileWrite,
} from "../domain/profiles";
import { syncUnlocks } from "../domain/progress";
import { deserialize } from "../domain/storage";
import { wardrobeWearDiffers } from "../domain/wardrobe-list";
import type { SaveData } from "../domain/types";
import { probeNote, setProbeProvider } from "./probe";

let generation = 0;
let slotId: string | null = null;
let profileId: string | null = null;
let current: SaveData | null = null;
let bootIssue: ProfileFailure | null = null;

const browserStore: ByteStore = {
  get(key) {
    return localStorage.getItem(key);
  },
  set(key, value) {
    localStorage.setItem(key, value);
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

export interface ProfileBinding {
  generation: number;
  slotId: string;
  profileId: string;
  key: string;
}

export function saveCacheNotice(): string {
  return shellCopy(isDesktopShell()).saveCacheNotice;
}

export function profileBootIssue(): ProfileFailure | null {
  return bootIssue;
}

export function liveProfileCount(): number {
  try {
    return readRoster(browserStore)?.slots.length ?? 0;
  } catch {
    return 0;
  }
}

export function listProfileCards(): ProfileCard[] {
  try {
    return profileCards(browserStore);
  } catch {
    return [];
  }
}

/** Opens the roster and migrates a legacy save. It does not select a character. */
export function bootSave(): SaveData | null {
  releaseSession();
  try {
    const opened = ensureProfiles(browserStore, Date.now());
    bootIssue = opened.ok ? null : opened.reason;
  } catch {
    bootIssue = "write";
  }
  publishProbe();
  return null;
}

export function captureProfileBinding(): ProfileBinding | null {
  if (!slotId || !profileId) return null;
  return { generation, slotId, profileId, key: profileKey(slotId) };
}

export function sessionAccepts(seenGeneration: number, seenProfileId: string): boolean {
  return slotId !== null && profileId === seenProfileId && generation === seenGeneration && seenProfileId.length > 0;
}

export function activeProfileKey(): string | null {
  return slotId ? profileKey(slotId) : null;
}

export function selectProfile(nextSlotId: string): SaveData | null {
  let raw: string | null;
  try {
    if (!readRoster(browserStore)?.slots.some((slot) => slot.id === nextSlotId)) return null;
    raw = browserStore.get(profileKey(nextSlotId));
  } catch {
    return null;
  }
  const loaded = raw ? deserialize(raw) : null;
  if (!loaded?.profileId) return null;
  const synced = syncUnlocks(loaded);
  generation += 1;
  slotId = nextSlotId;
  profileId = synced.profileId ?? null;
  current = synced;
  if (profileId && raw) {
    try {
      const stored = JSON.parse(raw) as SaveData;
      if (wardrobeWearDiffers(stored, synced)) writeProfile(browserStore, nextSlotId, synced);
    } catch {
      /* the selected character is already in memory */
    }
  }
  publishProbe();
  return current;
}

export function createProfile(save: SaveData): ProfileWrite {
  let added: ProfileWrite;
  try {
    added = addProfile(browserStore, save, Date.now());
  } catch {
    return { ok: false, reason: "write" };
  }
  if (!added.ok) return added;
  if (!selectProfile(added.slotId)) return { ok: false, reason: "write" };
  return added;
}

export function importProfileText(text: string): ProfileWrite {
  try {
    return importNewProfile(browserStore, text, Date.now());
  } catch {
    return { ok: false, reason: "write" };
  }
}

export function deleteActiveProfile(): boolean {
  if (!slotId) return false;
  const target = slotId;
  const seen = generation;
  try {
    if (!deleteProfile(browserStore, target)) return false;
  } catch {
    return false;
  }
  if (generation === seen && slotId === target) releaseSession();
  return true;
}

export function clearAllProfiles(): boolean {
  try {
    if (!clearLiveProfiles(browserStore)) return false;
  } catch {
    return false;
  }
  releaseSession();
  return true;
}

export function releaseSession(): void {
  generation += 1;
  slotId = null;
  profileId = null;
  current = null;
  publishProbe();
}

export function getSave(): SaveData | null {
  return current;
}

export function commit(next: SaveData | null): boolean {
  if (!next || !slotId || !profileId || next.profileId !== profileId) {
    probeNote("save:failed");
    return false;
  }
  const ok = writeProfile(browserStore, slotId, next);
  if (profileId === next.profileId && slotId) current = next;
  probeNote(ok ? "save:cache" : "save:failed");
  return ok;
}

export function mutate(update: (save: SaveData) => SaveData): SaveData | null {
  if (!current || !slotId) return null;
  const seen = generation;
  const next = update(current);
  if (generation !== seen) return null;
  commit(next);
  return next;
}

/** Same write as mutate, plus whether the cache accepted it. A failed write keeps the new save in memory. */
export function mutateCommitted(update: (save: SaveData) => SaveData): { save: SaveData | null; saved: boolean } {
  if (!current || !slotId) return { save: null, saved: false };
  const seen = generation;
  const next = update(current);
  if (generation !== seen) return { save: current, saved: false };
  return { save: next, saved: commit(next) };
}

function publishProbe(): void {
  setProbeProvider(() => ({
    learned: current ? Object.keys(current.wordCards).length : 0,
    equippedSkills: current ? current.equippedSkillIds.length : 0,
  }));
}

export function rosterKeyForTests(): string {
  return ROSTER_KEY;
}

export function loadStoredProfile(nextSlotId: string): SaveData | null {
  try {
    return loadProfile(browserStore, nextSlotId);
  } catch {
    return null;
  }
}
