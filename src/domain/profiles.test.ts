import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { DEFAULT_APPEARANCE } from "./appearance";
import { setGoalPreset } from "./parent";
import {
  MAX_PROFILES,
  ROSTER_KEY,
  addProfile,
  clearLiveProfiles,
  deleteProfile,
  ensureProfiles,
  importNewProfile,
  profileKey,
  readRoster,
  rollbackLegacyMigration,
  unreadableDeleteStep,
  writeProfile,
  type ByteStore,
} from "./profiles";
import { createSave, learnWord, reviewWord, setSelectedGrades } from "./progress";
import { sha256Hex } from "./sha256";
import { readFileSync } from "node:fs";
import { SAVE_KEY, deserialize, serialize } from "./storage";
import type { SaveData } from "./types";

const NOW = Date.parse("2026-03-01T02:00:00Z");

function memoryStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  let failKey = "";
  let failLeft = 0;
  const store: ByteStore & {
    failNext(key: string, times?: number): void;
    snapshot(): Record<string, string>;
  } = {
    get(key) {
      return data.has(key) ? data.get(key) ?? null : null;
    },
    set(key, value) {
      if (key === SAVE_KEY) throw new Error("legacy key must stay untouched");
      if (failKey === key && failLeft > 0) {
        failLeft -= 1;
        throw new Error("quota");
      }
      data.set(key, value);
    },
    remove(key) {
      if (key === SAVE_KEY) throw new Error("legacy key must stay untouched");
      data.delete(key);
    },
    failNext(key, times = 1) {
      failKey = key;
      failLeft = times;
    },
    snapshot() {
      return Object.fromEntries(data);
    },
  };
  return store;
}

function make(name: string, grades: SaveData["selectedGrades"] = ["G3"]): SaveData {
  return createSave({
    name,
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades,
  });
}

describe("sha256", () => {
  it("matches the empty string and abc", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("local character files", () => {
  it("migrates one legacy save, keeps the original bytes, and is idempotent", () => {
    const legacy = serialize(make("小林"));
    const store = memoryStore({ [SAVE_KEY]: legacy });
    const first = ensureProfiles(store, NOW);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.migrated).toBe(true);
    expect(first.roster.slots).toHaveLength(1);
    expect(first.roster.migration?.status).toBe("done");
    expect(store.get(SAVE_KEY)).toBe(legacy);
    const slotId = first.roster.slots[0]?.id ?? "";
    expect(slotId).toBe(`mig_${sha256Hex(legacy).slice(0, 16)}`);
    const loaded = deserialize(store.get(profileKey(slotId)) ?? "");
    expect(loaded?.player.name).toBe("小林");
    expect(loaded?.selectedGrades).toEqual(["G3"]);

    const again = ensureProfiles(store, NOW + 50);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.migrated).toBe(false);
    expect(again.roster.slots.map((slot) => slot.id)).toEqual([slotId]);
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(store.get(profileKey(slotId))).toBe(store.snapshot()[profileKey(slotId)]);
  });

  it("does not rewrite a migrated character when the tool starts again", () => {
    const legacy = serialize(make("小林"));
    const store = memoryStore({ [SAVE_KEY]: legacy });
    const opened = ensureProfiles(store, NOW);
    if (!opened.ok) throw new Error("migrate");
    const slotId = opened.roster.slots[0]?.id ?? "";
    const played = learnWord(deserialize(store.get(profileKey(slotId)) ?? "") ?? make("小林"), "tree", new Date(NOW));
    expect(writeProfile(store, slotId, played)).toBe(true);
    const stamped = store.get(profileKey(slotId));
    expect(ensureProfiles(store, NOW + 10).ok).toBe(true);
    expect(store.get(profileKey(slotId))).toBe(stamped);
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(deserialize(stamped ?? "")?.wordCards.tree).toBeTruthy();
  });

  it("leaves the legacy file in place when the character write fails, then retries the same slot", () => {
    const legacy = serialize(make("小林"));
    const store = memoryStore({ [SAVE_KEY]: legacy });
    const slotId = `mig_${sha256Hex(legacy).slice(0, 16)}`;
    store.failNext(profileKey(slotId));
    const failed = ensureProfiles(store, NOW);
    expect(failed).toEqual({ ok: false, reason: "write" });
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(store.get(ROSTER_KEY)).toBeNull();
    expect(store.get(profileKey(slotId))).toBeNull();

    store.failNext(ROSTER_KEY);
    const rosterFailed = ensureProfiles(store, NOW);
    expect(rosterFailed).toEqual({ ok: false, reason: "write" });
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(store.get(ROSTER_KEY)).toBeNull();
    expect(store.get(profileKey(slotId))).toBeTruthy();

    const retried = ensureProfiles(store, NOW + 5);
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.roster.slots.map((slot) => slot.id)).toEqual([slotId]);
    expect(store.get(SAVE_KEY)).toBe(legacy);
  });

  it("keeps an unreadable legacy file and does not invent a character", () => {
    const legacy = "{";
    const store = memoryStore({ [SAVE_KEY]: legacy });
    const opened = ensureProfiles(store, NOW);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.roster.slots).toEqual([]);
    expect(opened.roster.migration?.status).toBe("unreadable");
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(ensureProfiles(store, NOW + 1).ok).toBe(true);
    expect(readRoster(store)?.slots).toEqual([]);
    expect(store.get(SAVE_KEY)).toBe(legacy);
  });

  it("rolls the migrated character back to the original bytes and migrates the same slot again", () => {
    const legacy = serialize(make("小林"));
    const store = memoryStore({ [SAVE_KEY]: legacy });
    const opened = ensureProfiles(store, NOW);
    if (!opened.ok) throw new Error("migrate");
    const slotId = opened.roster.migration?.slotId ?? "";
    const extra = addProfile(store, make("Momo"), NOW + 1, "p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(extra.ok).toBe(true);
    const otherKey = profileKey("p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const otherRaw = store.get(otherKey);
    const rolled = rollbackLegacyMigration(store);
    expect(rolled.ok).toBe(true);
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(store.get(profileKey(slotId))).toBeNull();
    expect(store.get(otherKey)).toBe(otherRaw);
    expect(readRoster(store)?.migration).toBeNull();
    expect(readRoster(store)?.slots.map((slot) => slot.id)).toEqual(["p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);

    const again = ensureProfiles(store, NOW + 9);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.roster.slots.map((slot) => slot.id)).toEqual(["p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", slotId]);
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(deserialize(store.get(profileKey(slotId)) ?? "")?.player.name).toBe("小林");
    expect(store.get(otherKey)).toBe(otherRaw);
  });

  it("refuses rollback when the legacy bytes changed", () => {
    const legacy = serialize(make("小林"));
    const store = memoryStore({ [SAVE_KEY]: legacy });
    expect(ensureProfiles(store, NOW).ok).toBe(true);
    store.set = () => {
      throw new Error("no writes");
    };
    const data = store.snapshot();
    data[SAVE_KEY] = `${legacy} `;
    const dirty = memoryStore(data);
    const before = dirty.snapshot();
    expect(rollbackLegacyMigration(dirty)).toEqual({ ok: false, reason: "legacy-changed" });
    expect(dirty.snapshot()).toEqual(before);
  });

  it("isolates learning, review, grades, settings, appearance, clearance, and one-time rewards", () => {
    const store = memoryStore();
    const first = addProfile(store, make("小林", ["G3"]), NOW, "p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const second = addProfile(store, make("Momo", ["G4"]), NOW, "p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(first.ok && second.ok).toBe(true);
    const keyA = profileKey("p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const keyB = profileKey("p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const beforeB = store.get(keyB);
    let ada = deserialize(store.get(keyA) ?? "");
    if (!ada) throw new Error("ada");
    ada = learnWord(ada, "tree", new Date(NOW));
    ada = reviewWord(ada, "tree", Rating.Good, new Date(NOW + 86_400_000));
    ada = setSelectedGrades(ada, ["G5"]);
    ada = setGoalPreset(ada, "easy");
    ada = {
      ...ada,
      player: {
        ...ada.player,
        appearance: { ...ada.player.appearance, hairStyle: "ponytail", clothColorId: "sea" },
      },
      chapterCleared: true,
      stageWins: { s1: 1 },
      clearRewardClaimed: true,
      masteryMilestonesClaimed: ["m1"],
      rewardQueue: [{ id: "r1", title: "ok", detail: "once" }],
      unlockedCosmeticIds: ["forest_leaf_cape"],
      inventorUnlockReceipt: { eventId: "once", status: "pending" },
      spellingMemory: { ...ada.spellingMemory },
    };
    ada.spellingMemory.tree = ada.memory.tree ?? ada.spellingMemory.tree;
    expect(writeProfile(store, "p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ada)).toBe(true);
    expect(store.get(keyB)).toBe(beforeB);
    const loadedA = deserialize(store.get(keyA) ?? "");
    const loadedB = deserialize(beforeB ?? "");
    expect(loadedA?.wordCards.tree).toBeTruthy();
    expect(loadedA?.memory.tree?.reviewInstants.length).toBeGreaterThan(0);
    expect(loadedA?.spellingMemory.tree).toBeTruthy();
    expect(loadedA?.selectedGrades).toEqual(["G5"]);
    expect(loadedA?.parentGoalPreset).toBe("easy");
    expect(loadedA?.player.appearance.hairStyle).toBe("ponytail");
    expect(loadedA?.player.appearance.clothColorId).toBe("sea");
    expect(loadedA?.chapterCleared).toBe(true);
    expect(loadedA?.stageWins.s1).toBe(1);
    expect(loadedA?.clearRewardClaimed).toBe(true);
    expect(loadedA?.masteryMilestonesClaimed).toEqual(["m1"]);
    expect(loadedA?.rewardQueue.map((item) => item.id)).toEqual(["r1"]);
    expect(loadedA?.unlockedCosmeticIds).toEqual(["forest_leaf_cape"]);
    expect(loadedA?.inventorUnlockReceipt?.status).toBe("pending");
    expect(loadedB?.player.name).toBe("Momo");
    expect(loadedB?.selectedGrades).toEqual(["G4"]);
    expect(loadedB?.parentGoalPreset).toBe("normal");
    expect(loadedB?.wordCards.tree).toBeUndefined();
    expect(loadedB?.chapterCleared).toBe(false);
    expect(loadedB?.clearRewardClaimed).toBe(false);
    expect(loadedB?.rewardQueue).toEqual([]);
    expect(loadedB?.player.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it("refuses a write whose profile id belongs to another character", () => {
    const store = memoryStore();
    const ada = make("小林");
    const momo = make("Momo");
    expect(addProfile(store, ada, NOW, "p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").ok).toBe(true);
    expect(addProfile(store, momo, NOW, "p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb").ok).toBe(true);
    const beforeA = store.get(profileKey("p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const beforeB = store.get(profileKey("p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    const stolen = deserialize(beforeA ?? "");
    if (!stolen) throw new Error("ada");
    expect(writeProfile(store, "p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", { ...stolen, xp: 9 })).toBe(false);
    expect(store.get(profileKey("p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))).toBe(beforeA);
    expect(store.get(profileKey("p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"))).toBe(beforeB);
  });

  it("imports only a new character and leaves everyone when the file is bad, the list is full, or the write fails", () => {
    const store = memoryStore();
    const ada = make("小林");
    expect(addProfile(store, ada, NOW, "p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").ok).toBe(true);
    const before = store.snapshot();
    expect(importNewProfile(store, "not-json", NOW)).toEqual({ ok: false, reason: "corrupt" });
    expect(store.snapshot()).toEqual(before);
    expect(importNewProfile(store, serialize(ada), NOW)).toMatchObject({ ok: false, reason: "collision" });
    expect(store.snapshot()).toEqual(before);

    const wrapped = JSON.stringify({ kind: "lexiquest-profile", version: 1, save: JSON.parse(serialize(make("Momo"))) });
    const imported = importNewProfile(store, wrapped, NOW);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const momoRaw = store.get(profileKey(imported.slotId));
    expect(deserialize(momoRaw ?? "")?.player.name).toBe("Momo");
    expect(store.get(profileKey("p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))).toBe(before[profileKey("p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]);

    store.failNext(ROSTER_KEY);
    const failed = importNewProfile(store, serialize(make("Nori")), NOW);
    expect(failed).toEqual({ ok: false, reason: "write" });
    expect(readRoster(store)?.slots).toHaveLength(2);
    expect(store.get(profileKey("p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))).toBe(before[profileKey("p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]);
    expect(store.get(profileKey(imported.slotId))).toBe(momoRaw);
    const keys = Object.keys(store.snapshot()).filter((key) => key.startsWith("lexiquest.profile."));
    expect(keys).toHaveLength(2);

    const filler = memoryStore();
    for (let index = 0; index < MAX_PROFILES; index += 1) {
      const id = `p_${index.toString(16).padStart(32, "0")}`;
      expect(addProfile(filler, make(`N${index}`), NOW, id).ok).toBe(true);
    }
    const fullBefore = filler.snapshot();
    expect(importNewProfile(filler, serialize(make("Extra")), NOW)).toEqual({ ok: false, reason: "full" });
    expect(addProfile(filler, make("Extra2"), NOW)).toEqual({ ok: false, reason: "full" });
    expect(filler.snapshot()).toEqual(fullBefore);
  });

  it("deletes one character without touching the other or the legacy file", () => {
    const legacy = serialize(make("小林"));
    const store = memoryStore({ [SAVE_KEY]: legacy });
    const opened = ensureProfiles(store, NOW);
    if (!opened.ok) throw new Error("migrate");
    const legacySlot = opened.roster.slots[0]?.id ?? "";
    expect(addProfile(store, make("Momo"), NOW, "p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb").ok).toBe(true);
    const momo = store.get(profileKey("p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    expect(deleteProfile(store, legacySlot)).toBe(true);
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(store.get(profileKey(legacySlot))).toBeNull();
    expect(store.get(profileKey("p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"))).toBe(momo);
    expect(ensureProfiles(store, NOW + 3).ok).toBe(true);
    expect(readRoster(store)?.slots.map((slot) => slot.id)).toEqual(["p_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
    expect(store.get(SAVE_KEY)).toBe(legacy);
  });

  it("clears live characters without importing the legacy file back", () => {
    const legacy = serialize(make("小林"));
    const store = memoryStore({ [SAVE_KEY]: legacy });
    expect(ensureProfiles(store, NOW).ok).toBe(true);
    expect(clearLiveProfiles(store)).toBe(true);
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(readRoster(store)?.slots).toEqual([]);
    expect(readRoster(store)?.migration?.status).toBe("done");
    const again = ensureProfiles(store, NOW + 4);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.roster.slots).toEqual([]);
    expect(store.get(SAVE_KEY)).toBe(legacy);
    expect(Object.keys(store.snapshot()).filter((key) => key.startsWith("lexiquest.profile."))).toEqual([]);
  });

  it("does not change a broken roster or the characters it might still name", () => {
    const legacy = serialize(make("小林"));
    const store = memoryStore({
      [SAVE_KEY]: legacy,
      [ROSTER_KEY]: "{",
      [profileKey("p_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]: serialize(make("Momo")),
    });
    const before = store.snapshot();
    expect(ensureProfiles(store, NOW)).toEqual({ ok: false, reason: "roster" });
    expect(importNewProfile(store, serialize(make("Nori")), NOW)).toEqual({ ok: false, reason: "roster" });
    expect(store.snapshot()).toEqual(before);
  });

  it("migrates the desktop smoke legacy file without rewriting those bytes", () => {
    const legacySmokeSave = JSON.stringify(JSON.parse(readFileSync(new URL("../../desktop/legacy-smoke-save.json", import.meta.url), "utf8")));
    const data = new Map<string, string>();
    let legacyWrites = 0;
    const store: ByteStore = {
      get: (key) => data.get(key) ?? null,
      set(key, value) {
        if (key === SAVE_KEY) legacyWrites += 1;
        data.set(key, value);
      },
      remove(key) {
        data.delete(key);
      },
    };
    const empty = ensureProfiles(store, NOW);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.roster.slots).toEqual([]);
    store.set(SAVE_KEY, legacySmokeSave);
    expect(legacyWrites).toBe(1);
    const opened = ensureProfiles(store, NOW + 5);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.migrated).toBe(true);
    expect(opened.roster.migration?.status).toBe("done");
    expect(opened.roster.slots).toHaveLength(1);
    expect(store.get(SAVE_KEY)).toBe(legacySmokeSave);
    const loaded = deserialize(store.get(profileKey(opened.roster.slots[0]?.id ?? "")) ?? "");
    expect(loaded?.player.name).toBe("小林");
    const again = ensureProfiles(store, NOW + 10);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.migrated).toBe(false);
    expect(legacyWrites).toBe(1);
    expect(store.get(SAVE_KEY)).toBe(legacySmokeSave);
    expect(deserialize(store.get(profileKey(opened.roster.slots[0]?.id ?? "")) ?? "")?.player.name).toBe("小林");
  });

  it("requires the parent gate and a second press before an unreadable slot can be removed", () => {
    expect(unreadableDeleteStep({
      unlocked: false,
      armedSlotId: "p_bad",
      slotId: "p_bad",
      readable: false,
    })).toEqual({ armedSlotId: null, remove: false });
    const first = unreadableDeleteStep({
      unlocked: true,
      armedSlotId: null,
      slotId: "p_bad",
      readable: false,
    });
    expect(first).toEqual({ armedSlotId: "p_bad", remove: false });
    expect(unreadableDeleteStep({
      unlocked: true,
      armedSlotId: first.armedSlotId,
      slotId: "p_bad",
      readable: false,
    })).toEqual({ armedSlotId: null, remove: true });
    expect(unreadableDeleteStep({
      unlocked: true,
      armedSlotId: "p_bad",
      slotId: "p_good",
      readable: true,
    })).toEqual({ armedSlotId: null, remove: false });

    const store = memoryStore();
    const good = addProfile(store, make("小林"), NOW, "p_goodgoodgoodgoodgoodgoodgoodgood");
    const bad = addProfile(store, make("Ada"), NOW, "p_badbadbadbadbadbadbadbadbadbad");
    expect(good.ok && bad.ok).toBe(true);
    if (!good.ok || !bad.ok) return;
    const goodKey = profileKey(good.slotId);
    const badKey = profileKey(bad.slotId);
    const goodRaw = store.get(goodKey);
    store.set(badKey, "{");
    const before = store.snapshot();
    expect(deleteProfile(store, bad.slotId)).toBe(true);
    expect(store.get(goodKey)).toBe(goodRaw);
    expect(store.get(badKey)).toBeNull();
    expect(store.get(SAVE_KEY) ?? null).toBe(before[SAVE_KEY] ?? null);
    expect(readRoster(store)?.slots.map((slot) => slot.id)).toEqual([good.slotId]);
  });
});
