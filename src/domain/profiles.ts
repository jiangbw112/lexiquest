/**
 * Up to six local characters. The legacy single save stays byte-for-byte.
 * There is no character password and no account sync. The parent PIN stays
 * on its own keys and is not stored in a character.
 */
import { sha256Hex } from "./sha256";
import { SAVE_KEY, deserialize, serialize } from "./storage";
import type { GoalPreset, GradeBand, SaveData } from "./types";

export const ROSTER_KEY = "lexiquest.profiles.v1";
export const PROFILE_KEY_PREFIX = "lexiquest.profile.v1.";
export const MAX_PROFILES = 6;

export interface ByteStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface ProfileSlot {
  id: string;
  createdAt: number;
}

export interface LegacyMigration {
  status: "done" | "unreadable";
  legacyKey: typeof SAVE_KEY;
  legacySha256: string;
  /** Empty when the legacy file could not be read. */
  slotId: string;
  migratedAt: number;
}

export interface ProfileRoster {
  version: 1;
  slots: ProfileSlot[];
  migration: LegacyMigration | null;
}

export interface ProfileCard {
  slotId: string;
  readable: boolean;
  name: string;
  grades: string;
  learned: number;
  cleared: boolean;
  preset: string;
  profileId: string | null;
}

export type ProfileFailure = "full" | "corrupt" | "collision" | "write" | "roster" | "corrupt-legacy" | "missing";

export type ProfileWrite =
  | { ok: true; slotId: string; roster: ProfileRoster }
  | { ok: false; reason: ProfileFailure };

export type EnsureProfiles =
  | { ok: true; roster: ProfileRoster; migrated: boolean }
  | { ok: false; reason: "roster" | "corrupt-legacy" | "write" | "full" | "collision" };

const SLOT_ID = /^[a-z0-9_]{8,48}$/;
const GRADE_LABEL: Record<GradeBand, string> = {
  G3: "三年级",
  G4: "四年级",
  G5: "五年级",
  G6: "六年级",
};
const PRESET_LABEL: Record<GoalPreset, string> = {
  easy: "轻松",
  normal: "标准",
  more: "多一点",
};

export function profileKey(slotId: string): string {
  return `${PROFILE_KEY_PREFIX}${slotId}`;
}

export function newSlotId(random: () => string = () => globalThis.crypto.randomUUID()): string {
  return `p_${random().replace(/-/g, "")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProfileId(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { profileId?: unknown };
    return typeof value.profileId === "string" && value.profileId.length > 0 ? value.profileId : null;
  } catch {
    return null;
  }
}

function legacySha(raw: string): string {
  return sha256Hex(raw);
}

function migrationSlotId(raw: string): string {
  return `mig_${legacySha(raw).slice(0, 16)}`;
}

export function readRoster(store: ByteStore): ProfileRoster | null {
  let raw: string | null;
  try {
    raw = store.get(ROSTER_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  return parseRoster(raw);
}

function parseRoster(raw: string): ProfileRoster | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.slots)) return null;
    const slots: ProfileSlot[] = [];
    const seen = new Set<string>();
    for (const entry of value.slots) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !SLOT_ID.test(entry.id)) return null;
      if (typeof entry.createdAt !== "number" || !Number.isFinite(entry.createdAt)) return null;
      if (seen.has(entry.id)) return null;
      seen.add(entry.id);
      slots.push({ id: entry.id, createdAt: entry.createdAt });
    }
    const migration = parseMigration(value.migration);
    if (value.migration != null && !migration) return null;
    return { version: 1, slots, migration };
  } catch {
    return null;
  }
}

function parseMigration(value: unknown): LegacyMigration | null {
  if (value == null) return null;
  if (!isRecord(value)) return null;
  if (value.status !== "done" && value.status !== "unreadable") return null;
  if (value.legacyKey !== SAVE_KEY) return null;
  if (typeof value.legacySha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.legacySha256)) return null;
  if (typeof value.slotId !== "string") return null;
  if (value.status === "done" && !SLOT_ID.test(value.slotId)) return null;
  if (value.status === "unreadable" && value.slotId !== "") return null;
  if (typeof value.migratedAt !== "number" || !Number.isFinite(value.migratedAt)) return null;
  return {
    status: value.status,
    legacyKey: SAVE_KEY,
    legacySha256: value.legacySha256,
    slotId: value.slotId,
    migratedAt: value.migratedAt,
  };
}

function writeRoster(store: ByteStore, roster: ProfileRoster): boolean {
  const raw = JSON.stringify(roster);
  try {
    store.set(ROSTER_KEY, raw);
    return store.get(ROSTER_KEY) === raw;
  } catch {
    return false;
  }
}

function safeGet(store: ByteStore, key: string): string | null {
  try {
    return store.get(key);
  } catch {
    return null;
  }
}

/** Writes a character that is already on disk. A different profileId is refused. */
export function writeProfile(store: ByteStore, slotId: string, save: SaveData): boolean {
  if (!SLOT_ID.test(slotId) || !save.profileId) return false;
  const key = profileKey(slotId);
  const existing = safeGet(store, key);
  if (existing === null) return false;
  const storedId = readProfileId(existing);
  if (storedId && storedId !== save.profileId) return false;
  const raw = serialize(save);
  try {
    store.set(key, raw);
    return store.get(key) === raw;
  } catch {
    return false;
  }
}

function putNewProfile(store: ByteStore, slotId: string, raw: string): boolean {
  const key = profileKey(slotId);
  if (safeGet(store, key) !== null) return false;
  try {
    store.set(key, raw);
    if (store.get(key) !== raw) {
      try {
        store.remove(key);
      } catch {
        /* the roster never points here */
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function removeKey(store: ByteStore, key: string): void {
  try {
    store.remove(key);
  } catch {
    /* an unlisted file is not another character's save */
  }
}

export function loadProfile(store: ByteStore, slotId: string): SaveData | null {
  const raw = safeGet(store, profileKey(slotId));
  if (!raw) return null;
  return deserialize(raw);
}

export function profileCards(store: ByteStore): ProfileCard[] {
  const roster = readRoster(store);
  if (!roster) return [];
  return roster.slots.map((slot) => {
    const save = loadProfile(store, slot.id);
    if (!save) {
      return {
        slotId: slot.id,
        readable: false,
        name: "读不了",
        grades: "",
        learned: 0,
        cleared: false,
        preset: "",
        profileId: null,
      };
    }
    const grades = save.selectedGrades.map((grade) => GRADE_LABEL[grade]).filter(Boolean).join("、");
    return {
      slotId: slot.id,
      readable: true,
      name: save.player.name,
      grades: grades || "还没选年级",
      learned: Object.keys(save.wordCards).length,
      cleared: save.chapterCleared === true,
      preset: PRESET_LABEL[save.parentGoalPreset] ?? "",
      profileId: save.profileId ?? null,
    };
  });
}

export function ensureProfiles(store: ByteStore, now: number): EnsureProfiles {
  const rosterRaw = safeGet(store, ROSTER_KEY);
  const legacy = safeGet(store, SAVE_KEY);
  if (rosterRaw) {
    const roster = parseRoster(rosterRaw);
    if (!roster) return { ok: false, reason: "roster" };
    if (roster.migration?.status === "done") return { ok: true, roster, migrated: false };
    if (roster.migration?.status === "unreadable") {
      if (legacy && legacySha(legacy) === roster.migration.legacySha256) return { ok: true, roster, migrated: false };
      if (legacy && legacySha(legacy) !== roster.migration.legacySha256) return migrateLegacy(store, roster, legacy, now);
      return { ok: true, roster, migrated: false };
    }
    if (legacy) return migrateLegacy(store, roster, legacy, now);
    return { ok: true, roster, migrated: false };
  }
  if (!legacy) {
    const empty: ProfileRoster = { version: 1, slots: [], migration: null };
    if (!writeRoster(store, empty)) return { ok: false, reason: "write" };
    return { ok: true, roster: empty, migrated: false };
  }
  const parsed = deserialize(legacy);
  const empty: ProfileRoster = { version: 1, slots: [], migration: null };
  if (!parsed) return markUnreadable(store, empty, legacy, now);
  return migrateLegacy(store, empty, legacy, now);
}

function markUnreadable(store: ByteStore, base: ProfileRoster, legacy: string, now: number): EnsureProfiles {
  const before = legacy;
  const roster: ProfileRoster = {
    version: 1,
    slots: base.slots,
    migration: {
      status: "unreadable",
      legacyKey: SAVE_KEY,
      legacySha256: legacySha(legacy),
      slotId: "",
      migratedAt: now,
    },
  };
  if (!writeRoster(store, roster)) return { ok: false, reason: "write" };
  if (safeGet(store, SAVE_KEY) !== before) return { ok: false, reason: "write" };
  return { ok: true, roster, migrated: false };
}

function migrateLegacy(store: ByteStore, base: ProfileRoster, legacy: string, now: number): EnsureProfiles {
  const save = deserialize(legacy);
  if (!save?.profileId) {
    if (base.migration?.status === "unreadable") return { ok: true, roster: base, migrated: false };
    return markUnreadable(store, base, legacy, now);
  }
  const slotId = migrationSlotId(legacy);
  const body = serialize(save);
  const key = profileKey(slotId);
  const listed = base.slots.some((slot) => slot.id === slotId);
  const existing = safeGet(store, key);
  if (listed && existing && readProfileId(existing) && readProfileId(existing) !== save.profileId) {
    return { ok: false, reason: "collision" };
  }
  if (!listed || existing === null) {
    try {
      store.set(key, body);
      if (store.get(key) !== body) return { ok: false, reason: "write" };
    } catch {
      return { ok: false, reason: "write" };
    }
  }
  if (safeGet(store, SAVE_KEY) !== legacy) return { ok: false, reason: "write" };
  const slots = listed ? base.slots : [...base.slots, { id: slotId, createdAt: save.createdAt || now }];
  if (slots.length > MAX_PROFILES && !listed) {
    removeKey(store, key);
    return { ok: false, reason: "full" };
  }
  const roster: ProfileRoster = {
    version: 1,
    slots,
    migration: {
      status: "done",
      legacyKey: SAVE_KEY,
      legacySha256: legacySha(legacy),
      slotId,
      migratedAt: base.migration?.status === "done" ? base.migration.migratedAt : now,
    },
  };
  if (!writeRoster(store, roster)) return { ok: false, reason: "write" };
  if (safeGet(store, SAVE_KEY) !== legacy) return { ok: false, reason: "write" };
  return { ok: true, roster, migrated: true };
}

export function addProfile(store: ByteStore, save: SaveData, now: number, slotId = newSlotId()): ProfileWrite {
  const ensured = ensureProfiles(store, now);
  if (!ensured.ok) return ensured;
  if (ensured.roster.slots.length >= MAX_PROFILES) return { ok: false, reason: "full" };
  if (!save.profileId) return { ok: false, reason: "corrupt" };
  const raw = serialize(save);
  if (!deserialize(raw)) return { ok: false, reason: "corrupt" };
  if (profileIds(store, ensured.roster).has(save.profileId)) return { ok: false, reason: "collision" };
  if (!SLOT_ID.test(slotId) || ensured.roster.slots.some((slot) => slot.id === slotId)) return { ok: false, reason: "write" };
  const legacy = safeGet(store, SAVE_KEY);
  if (!putNewProfile(store, slotId, raw)) return { ok: false, reason: "write" };
  const roster: ProfileRoster = {
    ...ensured.roster,
    slots: [...ensured.roster.slots, { id: slotId, createdAt: save.createdAt || now }],
  };
  if (!writeRoster(store, roster)) {
    removeKey(store, profileKey(slotId));
    return { ok: false, reason: "write" };
  }
  if (safeGet(store, SAVE_KEY) !== legacy) return { ok: false, reason: "write" };
  return { ok: true, slotId, roster };
}

function profileIds(store: ByteStore, roster: ProfileRoster): Set<string> {
  const ids = new Set<string>();
  for (const slot of roster.slots) {
    const id = readProfileId(safeGet(store, profileKey(slot.id)));
    if (id) ids.add(id);
  }
  return ids;
}

export function importNewProfile(store: ByteStore, text: string, now: number): ProfileWrite {
  const roster = readRoster(store);
  if (safeGet(store, ROSTER_KEY) && !roster) return { ok: false, reason: "roster" };
  if (roster && roster.slots.length >= MAX_PROFILES) return { ok: false, reason: "full" };
  const save = readImport(text);
  if (!save?.profileId) return { ok: false, reason: "corrupt" };
  return addProfile(store, save, now);
}

function readImport(text: string): SaveData | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (isRecord(value) && value.kind === "lexiquest-profile" && value.version === 1) {
    if (!isRecord(value.save)) return null;
    return deserialize(JSON.stringify(value.save));
  }
  return deserialize(text);
}

/** Second press on the same unreadable slot, after the parent PIN is open. */
export function unreadableDeleteStep(input: {
  unlocked: boolean;
  armedSlotId: string | null;
  slotId: string;
  readable: boolean;
}): { armedSlotId: string | null; remove: boolean } {
  if (!input.unlocked || input.readable || input.slotId.length === 0) return { armedSlotId: null, remove: false };
  if (input.armedSlotId !== input.slotId) return { armedSlotId: input.slotId, remove: false };
  return { armedSlotId: null, remove: true };
}

export function deleteProfile(store: ByteStore, slotId: string): boolean {
  const roster = readRoster(store);
  if (!roster || !roster.slots.some((slot) => slot.id === slotId)) return false;
  const legacy = safeGet(store, SAVE_KEY);
  const next: ProfileRoster = {
    ...roster,
    slots: roster.slots.filter((slot) => slot.id !== slotId),
  };
  if (!writeRoster(store, next)) return false;
  removeKey(store, profileKey(slotId));
  return safeGet(store, SAVE_KEY) === legacy;
}

/** Drops every live character. A finished migration stays finished, so the legacy file is not imported again. */
export function clearLiveProfiles(store: ByteStore): boolean {
  const roster = readRoster(store);
  if (!roster) return false;
  const legacy = safeGet(store, SAVE_KEY);
  const next: ProfileRoster = { version: 1, slots: [], migration: roster.migration };
  if (!writeRoster(store, next)) return false;
  for (const slot of roster.slots) removeKey(store, profileKey(slot.id));
  return safeGet(store, SAVE_KEY) === legacy;
}

/**
 * Puts the migrated character back to "not migrated" when the legacy bytes
 * still match the recorded SHA-256. Other characters stay.
 */
export function rollbackLegacyMigration(store: ByteStore): { ok: true; roster: ProfileRoster } | { ok: false; reason: string } {
  const roster = readRoster(store);
  if (!roster?.migration || roster.migration.status !== "done") return { ok: false, reason: "no-migration" };
  const legacy = safeGet(store, SAVE_KEY);
  if (legacy === null) return { ok: false, reason: "legacy-missing" };
  if (legacySha(legacy) !== roster.migration.legacySha256) return { ok: false, reason: "legacy-changed" };
  const slotId = roster.migration.slotId;
  const next: ProfileRoster = {
    version: 1,
    slots: roster.slots.filter((slot) => slot.id !== slotId),
    migration: null,
  };
  if (!writeRoster(store, next)) return { ok: false, reason: "write" };
  removeKey(store, profileKey(slotId));
  if (safeGet(store, SAVE_KEY) !== legacy) return { ok: false, reason: "legacy-changed" };
  return { ok: true, roster: next };
}
