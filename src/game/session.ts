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
  const issued = generation;
  slotId = nextSlotId;
  profileId = synced.profileId ?? null;
  current = synced;
  if (profileId && raw) {
    try {
      const stored = JSON.parse(raw) as SaveData;
      if (wardrobeWearDiffers(stored, synced)) writeActiveProfile(synced, issued);
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
  return deleteStoredProfile(slotId);
}

/** Removes one roster slot. The caller has to decide that this delete is allowed. */
function deleteStoredProfile(target: string): boolean {
  const seen = generation;
  try {
    if (!deleteProfile(browserStore, target)) return false;
  } catch {
    return false;
  }
  if (generation === seen && slotId === target) releaseSession();
  return true;
}

/** Deletes one unreadable slot. A locked gate, a first press, or a readable slot does not write. */
export function deleteUnreadableProfile(target: string, confirmation: { unlocked: boolean; confirmed: boolean }): boolean {
  if (!confirmation.unlocked || !confirmation.confirmed) return false;
  let cardReadable: boolean;
  try {
    const card = listProfileCards().find((item) => item.slotId === target);
    cardReadable = card?.readable !== false;
  } catch {
    return false;
  }
  if (cardReadable) return false;
  return deleteStoredProfile(target);
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

function leaseHolds(next: SaveData, seenGeneration: number): boolean {
  return slotId !== null && profileId === next.profileId && seenGeneration === generation && next.profileId.length > 0;
}

let profileWriteFailures = 0;

/**
 * The next `count` active-profile writes fail before touching storage.
 * Used by tests and by the dev `coverFail=1` reproduction. A rejected lease
 * does not consume a failure.
 */
export function armProfileWriteFailures(count: number): void {
  profileWriteFailures = Number.isInteger(count) && count > 0 ? count : 0;
}

/** Writes the active slot only while `seenGeneration` is still the current lease. */
export function writeActiveProfile(next: SaveData, seenGeneration: number): boolean {
  if (!leaseHolds(next, seenGeneration) || !slotId) return false;
  if (profileWriteFailures > 0) {
    profileWriteFailures -= 1;
    return false;
  }
  const slot = slotId;
  const ownedId = profileId;
  let dropped = false;
  const guarded: ByteStore = {
    get(key) {
      return browserStore.get(key);
    },
    set(key, value) {
      if (!leaseHolds(next, seenGeneration) || slotId !== slot || profileId !== ownedId) {
        dropped = true;
        throw new Error("lease");
      }
      browserStore.set(key, value);
    },
    remove(key) {
      browserStore.remove(key);
    },
  };
  const ok = writeProfile(guarded, slot, next);
  return ok && !dropped && leaseHolds(next, seenGeneration) && slotId === slot && profileId === ownedId;
}

export function commit(next: SaveData | null, seenGeneration?: number): boolean {
  if (!next || seenGeneration === undefined || !leaseHolds(next, seenGeneration)) {
    probeNote("save:failed");
    return false;
  }
  const ok = writeActiveProfile(next, seenGeneration);
  if (!ok || !leaseHolds(next, seenGeneration)) {
    probeNote("save:failed");
    return false;
  }
  current = next;
  probeNote("save:cache");
  return true;
}

export function mutate(update: (save: SaveData) => SaveData): SaveData | null {
  if (!current || !slotId) return null;
  const seen = generation;
  const next = update(current);
  if (generation !== seen) return null;
  commit(next, seen);
  return next;
}

/** Same write as mutate, plus whether the cache accepted it. A failed write leaves the cache and disk on the previous save. The returned save is the unsaved next object, so callers have to check `saved`. */
export function mutateCommitted(update: (save: SaveData) => SaveData): { save: SaveData | null; saved: boolean } {
  if (!current || !slotId) return { save: null, saved: false };
  const seen = generation;
  const next = update(current);
  if (generation !== seen) return { save: current, saved: false };
  return { save: next, saved: commit(next, seen) };
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
