import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../domain/appearance";
import { applyCoverSpell } from "../domain/cover-spell";
import { createSave, learnWord, noteIndependentSpelling } from "../domain/progress";
import { deserialize, serialize } from "../domain/storage";
import type { SaveData } from "../domain/types";
import {
  armProfileWriteFailures,
  captureProfileBinding,
  commit,
  createProfile,
  getSave,
  importProfileText,
  mutateCommitted,
  releaseSession,
  selectProfile,
} from "./session";

const LEARNED = new Date("2026-11-22T02:00:00Z");
const NEXT = new Date("2026-11-23T02:00:00Z");
const SH = "Asia/Shanghai";

function installStorage(): void {
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
}

function make(name: string): SaveData {
  return createSave({
    name,
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: LEARNED.getTime(),
    grades: ["G3"],
  });
}

function cover(save: SaveData, wordId: string, typed: string, now = NEXT): SaveData {
  return applyCoverSpell(save, { wordId, typed, now, timeZone: SH, badgeLit: false }).save;
}

describe("cover spell saves", () => {
  beforeEach(() => {
    installStorage();
    releaseSession();
    armProfileWriteFailures(0);
  });

  afterEach(() => {
    armProfileWriteFailures(0);
    releaseSession();
  });

  it("writes mastery and +30 together, and a failed write can be retried once", () => {
    const base = learnWord(make("小林"), "tree", LEARNED);
    const created = createProfile(base);
    if (!created.ok) throw new Error(created.reason);
    const key = `lexiquest.profile.v1.${created.slotId}`;
    const before = localStorage.getItem(key);
    if (!before) throw new Error("missing");
    armProfileWriteFailures(1);
    const failed = mutateCommitted((save) => cover(save, "tree", "tree"));
    expect(failed.saved).toBe(false);
    expect(getSave()?.xp).toBe(base.xp);
    expect(getSave()?.wordCards.tree?.spelledAloneAt).toBeUndefined();
    expect(localStorage.getItem(key)).toBe(before);
    const retry = mutateCommitted((save) => cover(save, "tree", "tree"));
    expect(retry.saved).toBe(true);
    expect(retry.save?.xp).toBe(base.xp + 30);
    expect(retry.save?.wordCards.tree?.spelledAloneAt).toBe(NEXT.getTime());
    expect(getSave()?.xp).toBe(base.xp + 30);
    const raw = localStorage.getItem(key) ?? "";
    const stored = deserialize(raw);
    expect(stored?.xp).toBe(base.xp + 30);
    expect(stored?.wordCards.tree?.spelledAloneAt).toBe(NEXT.getTime());
    expect(stored?.memory.tree?.fsrs).toEqual(base.memory.tree?.fsrs);
    const again = mutateCommitted((save) => cover(save, "tree", "tree"));
    expect(again.saved).toBe(true);
    expect(again.save?.xp).toBe(base.xp + 30);
    expect(getSave()?.xp).toBe(base.xp + 30);
  });

  it("keeps an old session from writing over another character or a newer visit", () => {
    const lin = createProfile(learnWord(make("小林"), "tree", LEARNED));
    if (!lin.ok) throw new Error(lin.reason);
    const linKey = `lexiquest.profile.v1.${lin.slotId}`;
    const linSeen = captureProfileBinding();
    const linSave = getSave();
    if (!linSeen || !linSave) throw new Error("lin");
    const momo = createProfile(learnWord(make("Momo"), "bird", LEARNED));
    if (!momo.ok) throw new Error(momo.reason);
    const momoKey = `lexiquest.profile.v1.${momo.slotId}`;
    const momoRaw = localStorage.getItem(momoKey);
    const linRaw = localStorage.getItem(linKey);
    const stale = cover(linSave, "tree", "tree");
    expect(commit(stale, linSeen.generation)).toBe(false);
    expect(localStorage.getItem(linKey)).toBe(linRaw);
    expect(localStorage.getItem(momoKey)).toBe(momoRaw);
    expect(getSave()?.player.name).toBe("Momo");
    expect(selectProfile(lin.slotId)?.player.name).toBe("小林");
    expect(commit(stale, linSeen.generation)).toBe(false);
    expect(localStorage.getItem(linKey)).toBe(linRaw);
    expect(localStorage.getItem(momoKey)).toBe(momoRaw);
    const fresh = mutateCommitted((save) => cover(save, "tree", "tree"));
    expect(fresh.saved).toBe(true);
    expect(getSave()?.xp).toBe(linSave.xp + 30);
    expect(localStorage.getItem(momoKey)).toBe(momoRaw);
    expect(deserialize(localStorage.getItem(momoKey) ?? "")?.wordCards.bird?.spelledAloneAt).toBeUndefined();
    expect(commit(linSave, linSeen.generation)).toBe(false);
    expect(getSave()?.xp).toBe(linSave.xp + 30);
    expect(deserialize(localStorage.getItem(linKey) ?? "")?.xp).toBe(linSave.xp + 30);
  });

  it("imports an old mastered save without back pay, and keeps illegal fields from paying", () => {
    const old = noteIndependentSpelling(learnWord(make("旧档"), "tree", LEARNED), "tree", NEXT);
    const text = serialize(old);
    const imported = importProfileText(text);
    if (!imported.ok) throw new Error(imported.reason);
    expect(importProfileText(text)).toMatchObject({ ok: false, reason: "collision" });
    expect(selectProfile(imported.slotId)?.xp).toBe(old.xp);
    const replay = mutateCommitted((save) => cover(save, "tree", "tree"));
    expect(replay.saved).toBe(true);
    expect(getSave()?.xp).toBe(old.xp);
    expect(getSave()?.wordCards.tree?.spelledAloneAt).toBe(NEXT.getTime());

    const plain = learnWord(make("缺字段"), "bird", LEARNED);
    const missing = importProfileText(serialize(plain));
    if (!missing.ok) throw new Error(missing.reason);
    expect(selectProfile(missing.slotId)?.wordCards.bird?.coverSpellRevealDay).toBeUndefined();
    const first = mutateCommitted((save) => cover(save, "bird", "bird"));
    expect(first.saved).toBe(true);
    expect(getSave()?.xp).toBe(plain.xp + 30);

    const broken = JSON.parse(serialize(learnWord(make("错值"), "tree", LEARNED))) as SaveData;
    const card = broken.wordCards.tree;
    if (!card) throw new Error("card");
    broken.wordCards.tree = { ...card, spelledAloneAt: "12345" as unknown as number, coverSpellRevealDay: "nope" };
    const bad = importProfileText(JSON.stringify(broken));
    if (!bad.ok) throw new Error(bad.reason);
    expect(selectProfile(bad.slotId)?.xp).toBe(broken.xp);
    const blocked = mutateCommitted((save) => cover(save, "tree", "tree"));
    expect(blocked.saved).toBe(true);
    expect(getSave()?.xp).toBe(broken.xp);
    expect(getSave()?.wordCards.tree?.spelledAloneAt).toBe("12345" as unknown as number);
  });
});
