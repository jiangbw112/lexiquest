import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../domain/appearance";
import { applyChapterRewards } from "../domain/chapter-rewards";
import { createSave, learnWord } from "../domain/progress";
import { SAVE_KEY, deserialize, serialize } from "../domain/storage";
import {
  bootSave,
  captureProfileBinding,
  commit,
  createProfile,
  deleteActiveProfile,
  getSave,
  importProfileText,
  listProfileCards,
  loadStoredProfile,
  mutateCommitted,
  releaseSession,
  selectProfile,
  sessionAccepts,
  writeActiveProfile,
} from "./session";

const NOW = Date.parse("2026-03-01T02:00:00Z");

function installStorage(): Storage {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key) ?? null : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  return storage;
}

function make(name: string) {
  return createSave({
    name,
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3"],
  });
}

describe("character session", () => {
  beforeEach(() => {
    installStorage();
  });

  it("starts on the picker and does not keep a stale write on another character", () => {
    const legacy = serialize(make("小林"));
    localStorage.setItem(SAVE_KEY, legacy);
    expect(bootSave()).toBeNull();
    expect(getSave()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBe(legacy);
    const first = listProfileCards()[0];
    if (!first) throw new Error("missing migrated character");
    expect(selectProfile(first.slotId)?.player.name).toBe("小林");
    const bound = captureProfileBinding();
    if (!bound) throw new Error("binding");
    const stale = getSave();
    if (!stale) throw new Error("stale");
    expect(createProfile(make("Momo")).ok).toBe(true);
    expect(getSave()?.player.name).toBe("Momo");
    const momoSlot = captureProfileBinding()?.slotId ?? "";
    const linKey = `lexiquest.profile.v1.${bound.slotId}`;
    const momoKey = `lexiquest.profile.v1.${momoSlot}`;
    const linRaw = localStorage.getItem(linKey);
    const momoRaw = localStorage.getItem(momoKey);
    expect(sessionAccepts(bound.generation, bound.profileId)).toBe(false);
    expect(commit({
      ...stale,
      xp: stale.xp + 5,
      selectedGrades: ["G6"],
      player: { ...stale.player, appearance: { ...stale.player.appearance, hairStyle: "ponytail" } },
    })).toBe(false);
    expect(localStorage.getItem(linKey)).toBe(linRaw);
    expect(localStorage.getItem(momoKey)).toBe(momoRaw);
    expect(getSave()?.player.name).toBe("Momo");
    expect(getSave()?.xp).toBe(0);
    expect(loadStoredProfile(bound.slotId)?.xp).toBe(stale.xp);
    expect(loadStoredProfile(bound.slotId)?.player.name).toBe("小林");
    expect(localStorage.getItem(SAVE_KEY)).toBe(legacy);
    expect(deleteActiveProfile()).toBe(true);
    expect(getSave()).toBeNull();
    expect(loadStoredProfile(bound.slotId)?.player.name).toBe("小林");
    expect(loadStoredProfile(momoSlot)).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBe(legacy);
    const before = localStorage.getItem(SAVE_KEY);
    expect(importProfileText("{").ok).toBe(false);
    expect(importProfileText(serialize(stale))).toMatchObject({ ok: false, reason: "collision" });
    expect(localStorage.getItem(SAVE_KEY)).toBe(before);
    expect(deserialize(localStorage.getItem(`lexiquest.profile.v1.${bound.slotId}`) ?? "")?.player.name).toBe("小林");
  });
});

describe("write lease on disk", () => {
  let dir = "";

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  function installDisk(): void {
    dir = mkdtempSync(join(tmpdir(), "lexiquest-lease-"));
    const fileOf = (key: string) => join(dir, encodeURIComponent(key));
    const storage: Storage = {
      get length() {
        return 0;
      },
      clear() {},
      getItem(key) {
        const file = fileOf(key);
        return existsSync(file) ? readFileSync(file, "utf8") : null;
      },
      key() {
        return null;
      },
      removeItem(key) {
        const file = fileOf(key);
        if (existsSync(file)) unlinkSync(file);
      },
      setItem(key, value) {
        writeFileSync(fileOf(key), String(value));
      },
    };
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  }

  function diskText(key: string): string {
    return readFileSync(join(dir, encodeURIComponent(key)), "utf8");
  }

  function playToSixteen(): { slotId: string; key: string; stale: NonNullable<ReturnType<typeof getSave>>; staleGen: number; raw: string } {
    installDisk();
    expect(bootSave()).toBeNull();
    const added = createProfile(make("小林"));
    if (!added.ok) throw new Error(added.reason);
    const learned = mutateCommitted((save) => learnWord(save, "tree", new Date(NOW)));
    expect(learned.saved).toBe(true);
    const stale = getSave();
    const lease = captureProfileBinding();
    if (!stale || !lease) throw new Error("stale");
    const rewarded = mutateCommitted((save) => applyChapterRewards({
      ...learnWord(save, "arm", new Date(NOW)),
      chapterCleared: true,
    }, 0, 28));
    expect(rewarded.saved).toBe(true);
    const key = `lexiquest.profile.v1.${added.slotId}`;
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("raw");
    const fresh = deserialize(raw);
    expect(fresh?.xp).toBe(16);
    expect(fresh?.wordCards.tree).toBeTruthy();
    expect(fresh?.wordCards.arm).toBeTruthy();
    expect(fresh?.equippedCosmeticIds).toContain("forest_leaf_cape");
    expect(fresh?.rewardQueue.length).toBeGreaterThan(0);
    return { slotId: added.slotId, key, stale, staleGen: lease.generation, raw };
  }

  function expectKept(key: string, raw: string): void {
    expect(localStorage.getItem(key)).toBe(raw);
    expect(diskText(key)).toBe(raw);
    const fresh = deserialize(raw);
    expect(fresh?.xp).toBe(16);
    expect(fresh?.wordCards.tree).toBeTruthy();
    expect(fresh?.wordCards.arm).toBeTruthy();
    expect(fresh?.equippedCosmeticIds).toContain("forest_leaf_cape");
    expect(fresh?.rewardQueue.length).toBeGreaterThan(0);
  }

  it("rejects the old snapshot after the same character is selected again", () => {
    const { slotId, key, stale, staleGen } = playToSixteen();
    releaseSession();
    expect(selectProfile(slotId)?.xp).toBe(16);
    const kept = localStorage.getItem(key);
    if (!kept) throw new Error("kept");
    expectKept(key, kept);
    expect(commit(stale)).toBe(false);
    expect(commit(stale, staleGen)).toBe(false);
    expect(writeActiveProfile(stale, staleGen)).toBe(false);
    expectKept(key, kept);
    expect(mutateCommitted((save) => learnWord(save, "apple", new Date(NOW))).saved).toBe(true);
    expect(loadStoredProfile(slotId)?.xp).toBe(24);
    expect(commit(stale, staleGen)).toBe(false);
    expect(writeActiveProfile(stale, staleGen)).toBe(false);
    expect(loadStoredProfile(slotId)?.xp).toBe(24);
    expect(loadStoredProfile(slotId)?.wordCards.arm).toBeTruthy();
    expect(loadStoredProfile(slotId)?.wordCards.tree).toBeTruthy();
    expect(diskText(key)).toBe(localStorage.getItem(key));
  });

  it("rejects the old snapshot after switching away and back", () => {
    const { slotId, key, stale, staleGen } = playToSixteen();
    const other = createProfile(make("Momo"));
    if (!other.ok) throw new Error(other.reason);
    const otherKey = `lexiquest.profile.v1.${other.slotId}`;
    const otherRaw = localStorage.getItem(otherKey);
    expect(selectProfile(slotId)?.player.name).toBe("小林");
    const kept = localStorage.getItem(key);
    if (!kept) throw new Error("kept");
    expect(commit(stale)).toBe(false);
    expect(commit(stale, staleGen)).toBe(false);
    expect(writeActiveProfile(stale, staleGen)).toBe(false);
    expectKept(key, kept);
    expect(localStorage.getItem(otherKey)).toBe(otherRaw);
    expect(diskText(otherKey)).toBe(otherRaw);
  });
});

describe("character screens", () => {
  it("keeps the picker, exam key, and parent-delete wiring in source", () => {
    const boot = readFileSync(new URL("./scenes/BootScene.ts", import.meta.url), "utf8");
    expect(boot).toContain('this.scene.start("profiles")');
    const profiles = readFileSync(new URL("./scenes/ProfilesScene.ts", import.meta.url), "utf8");
    const opening = profiles.slice(profiles.indexOf("create():"), profiles.indexOf("private choose"));
    expect(opening).not.toContain("selectProfile(");
    const exam = readFileSync(new URL("./scenes/ExamBattleScene.ts", import.meta.url), "utf8");
    const persist = exam.slice(exam.indexOf("private persist("), exam.indexOf("private intermission"));
    expect(persist.indexOf("sessionAccepts")).toBeLessThan(persist.indexOf("commitExamSnapshot"));
    expect(persist).toContain("this.profileKey");
    expect(persist).not.toContain("SAVE_KEY");
    const guide = readFileSync(new URL("./scenes/GuideScene.ts", import.meta.url), "utf8");
    const remove = guide.slice(guide.indexOf("private deleteCharacter"), guide.indexOf("private draw"));
    expect(remove.indexOf("this.pinSession.unlocked")).toBeLessThan(remove.indexOf("deleteActiveProfile"));
    const notes = guide.slice(guide.indexOf("private drawNotes"), guide.indexOf("uiLabel(this.confirming"));
    expect(notes).toContain("if (!this.pinSession.unlocked) return;");
    expect(notes).toContain("再按一次，删除这个角色");
  });
});
