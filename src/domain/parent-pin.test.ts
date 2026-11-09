import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import {
  ADULT_CHECK_FORM,
  PARENT_PIN_KEY,
  PIN_ITERATIONS,
  applyIfParentUnlocked,
  cooldownMsForGroup,
  createLocalPinVault,
  createMemoryPinStorage,
  createParentPinSession,
  createPbkdf2PinGate,
  pbkdf2PinGate,
  pinIsAcceptable,
  pinIsWeak,
  pinFormTitle,
} from "./parent-pin";
import { createSave, learnWord, setSelectedGrades } from "./progress";
import { serialize } from "./storage";

const PIN = "2591";
const NOW = 1_700_000_000_000;

function sessionFor(random: () => number = () => 0.2, storage = createMemoryPinStorage()) {
  const vault = createLocalPinVault(storage);
  const gate = createPbkdf2PinGate(1_000);
  return { storage, vault, gate, session: createParentPinSession({ gate, vault, random }) };
}

describe("parent PIN gate", () => {
  it("keeps the PIN out of storage and gives a new salt each time", async () => {
    const { storage, session } = sessionFor();
    const save = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: NOW,
      grades: ["G3"],
    });
    expect(session.phase).toBe("setup");
    expect(pinFormTitle(session.phase)).toBe("先设一个家长密码");
    expect((await session.submitPin("1234", "1234", NOW)).message).toContain("太简单");
    expect((await session.submitPin("0000", "0000", NOW)).message).toContain("太简单");
    expect(storage.dump()).toBe("");
    const set = await session.submitPin(PIN, PIN, NOW);
    expect(set.ok).toBe(true);
    const dumped = storage.dump();
    expect(dumped).not.toContain(`"${PIN}"`);
    expect(serialize(save)).not.toContain(PIN);
    expect(serialize(save)).not.toContain("parentPin");
    expect(serialize({ ...save, parentPin: { hash: PIN } } as typeof save)).not.toContain(`"${PIN}"`);
    const again = await createPbkdf2PinGate(1_000).protect(PIN);
    const other = await createPbkdf2PinGate(1_000).protect(PIN);
    expect(again.salt).not.toBe(other.salt);
    expect(again.hash).not.toBe(other.hash);
    expect(await createPbkdf2PinGate(1_000).matches(PIN, again)).toBe(true);
    expect(await createPbkdf2PinGate(1_000).matches("2592", again)).toBe(false);
    expect(pinIsWeak("0000")).toBe(true);
    expect(pinIsWeak("1234")).toBe(true);
    expect(pinIsAcceptable("1234567")).toBe(false);
    expect(pinIsAcceptable("12ab")).toBe(false);
  });

  it("records the measured iteration count on a new PIN", async () => {
    const record = await pbkdf2PinGate.protect("4826");
    expect(record).toMatchObject({ version: 1, algo: "PBKDF2-SHA256", iterations: PIN_ITERATIONS });
    expect(PIN_ITERATIONS).toBeGreaterThanOrEqual(100_000);
    expect(record.salt).toHaveLength(32);
    expect(JSON.stringify(record)).not.toContain("4826");
    expect(await pbkdf2PinGate.matches("4826", record)).toBe(true);
    expect(await pbkdf2PinGate.matches("4827", record)).toBe(false);
  });

  it("locks for 30 seconds on the fifth wrong entry, and the lock survives a reload", async () => {
    const { vault, gate, session } = sessionFor();
    expect((await session.submitPin(PIN, PIN, NOW)).ok).toBe(true);
    const entered = createParentPinSession({ gate, vault, random: () => 0.2 });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const wrong = await entered.submitPin("2592", "", NOW);
      expect(wrong).toMatchObject({ ok: false, message: "密码不对。" });
      expect(entered.cooldownRemaining(NOW)).toBe(0);
    }
    const fifth = await entered.submitPin("2592", "", NOW);
    expect(fifth.ok).toBe(false);
    expect(fifth.message).toContain("30 秒");
    expect(entered.cooldownRemaining(NOW)).toBe(30_000);
    const reloaded = createParentPinSession({ gate, vault, random: () => 0.2 });
    expect(reloaded.cooldownRemaining(NOW)).toBe(30_000);
    const during = await reloaded.submitPin(PIN, "", NOW + 1_000);
    expect(during.ok).toBe(false);
    expect(reloaded.unlocked).toBe(false);
    expect(reloaded.cooldownRemaining(NOW + 1_000)).toBe(29_000);
    const after = await reloaded.submitPin(PIN, "", NOW + 30_000);
    expect(after.ok).toBe(true);
    expect(reloaded.cooldownRemaining(NOW + 30_000)).toBe(0);
  });

  it("steps the cooldown to 1 minute and then 5 minutes", async () => {
    expect(cooldownMsForGroup(1)).toBe(30_000);
    expect(cooldownMsForGroup(2)).toBe(60_000);
    expect(cooldownMsForGroup(3)).toBe(300_000);
    expect(cooldownMsForGroup(4)).toBe(300_000);
    const { vault, gate } = sessionFor();
    const first = createParentPinSession({ gate, vault, random: () => 0.2 });
    await first.submitPin(PIN, PIN, NOW);
    let current = createParentPinSession({ gate, vault, random: () => 0.2 });
    let now = NOW;
    const expectLock = async (ms: number) => {
      for (let attempt = 0; attempt < 5; attempt += 1) await current.submitPin("2592", "", now);
      expect(current.cooldownRemaining(now)).toBe(ms);
      now += ms;
      current = createParentPinSession({ gate, vault, random: () => 0.2 });
      expect(current.cooldownRemaining(now)).toBe(0);
    };
    await expectLock(30_000);
    await expectLock(60_000);
    await expectLock(300_000);
    await expectLock(300_000);
  });

  it("resets only the PIN after the adult check and leaves progress and grades", async () => {
    const { storage, vault, gate, session } = sessionFor();
    await session.submitPin(PIN, PIN, NOW);
    let save = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: NOW,
      grades: ["G3", "G5"],
    });
    save = learnWord(save, "tree", new Date(NOW));
    save = setSelectedGrades(save, ["G5"]);
    const before = structuredClone(save);
    const locked = createParentPinSession({ gate, vault, random: () => 0 });
    expect(locked.phase).toBe("enter");
    locked.beginForgot();
    expect(locked.challenge).toMatchObject({ form: ADULT_CHECK_FORM, prompt: "10 × 10", answer: 100 });
    expect(locked.submitForgot("99", NOW)).toMatchObject({ ok: false });
    expect(vault.load().kind).toBe("ready");
    const reset = locked.submitForgot("100", NOW);
    expect(reset.ok).toBe(true);
    expect(reset.message).toContain("学习记录都还在");
    expect(locked.phase).toBe("setup");
    expect(locked.notice).toContain("学习记录都还在");
    expect(vault.load().kind).toBe("unset");
    expect(save).toEqual(before);
    expect(save.selectedGrades).toEqual(["G5"]);
    expect(save.wordCards.tree).toBeTruthy();
    expect(storage.dump()).not.toContain(`"${PIN}"`);
    expect(serialize(save)).not.toContain(PIN);
  });

  it("requires the PIN for both a tier change and a grade change", () => {
    const save = createSave({
      name: "小林",
      classId: "warrior",
      appearance: DEFAULT_APPEARANCE,
      now: NOW,
      grades: ["G3"],
    });
    expect(applyIfParentUnlocked(false, save, (current) => setSelectedGrades(current, ["G6"]))).toBe(save);
    expect(applyIfParentUnlocked(false, save, (current) => ({ ...current, parentGoalPreset: "easy" as const }))).toBe(save);
    expect(applyIfParentUnlocked(true, save, (current) => setSelectedGrades(current, ["G6"])).selectedGrades).toEqual(["G6"]);
    expect(applyIfParentUnlocked(true, save, (current) => ({ ...current, parentGoalPreset: "easy" as const })).parentGoalPreset).toBe("easy");
  });

  it("falls back to the forgot-PIN flow when the record is corrupt", async () => {
    const storage = createMemoryPinStorage();
    storage.setItem(PARENT_PIN_KEY, "{");
    const vault = createLocalPinVault(storage);
    const session = createParentPinSession({ gate: createPbkdf2PinGate(1_000), vault, random: () => 0.25 });
    expect(session.phase).toBe("forgot");
    expect(session.challenge?.form).toBe(ADULT_CHECK_FORM);
    await expect(session.submitPin(PIN, PIN, NOW)).resolves.toMatchObject({ ok: false });
    expect(session.unlocked).toBe(false);
    const answer = String(session.challenge?.answer);
    expect(session.submitForgot(answer, NOW).ok).toBe(true);
    expect(session.phase).toBe("setup");
    expect(vault.load().kind).toBe("unset");
    storage.setItem(PARENT_PIN_KEY, JSON.stringify({ version: 1, algo: "plain", pin: PIN }));
    const broken = createParentPinSession({ gate: createPbkdf2PinGate(1_000), vault, random: () => 0.25 });
    expect(broken.phase).toBe("forgot");
    expect(broken.submitForgot(String(broken.challenge?.answer), NOW).ok).toBe(true);
    expect(storage.getItem(PARENT_PIN_KEY)).toBeNull();
  });
});
