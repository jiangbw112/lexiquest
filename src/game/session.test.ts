import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../domain/appearance";
import { createSave } from "../domain/progress";
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
  selectProfile,
  sessionAccepts,
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
    expect(sessionAccepts(bound.generation, bound.profileId)).toBe(false);
    expect(commit({ ...stale, xp: stale.xp + 5 })).toBe(false);
    expect(getSave()?.player.name).toBe("Momo");
    expect(getSave()?.xp).toBe(0);
    expect(loadStoredProfile(bound.slotId)?.xp).toBe(stale.xp);
    expect(loadStoredProfile(bound.slotId)?.player.name).toBe("小林");
    expect(localStorage.getItem(SAVE_KEY)).toBe(legacy);
    const momoSlot = captureProfileBinding()?.slotId ?? "";
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

describe("character screens", () => {
  it("opens the picker first, keeps exam writes on the captured character, and gates deletion", () => {
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
