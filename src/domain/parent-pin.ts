/**
 * Gate against a child accidentally changing grades or the daily goal.
 * Clearing this browser's data removes it. This is not authentication.
 * The vault and the gate are separate so a later server can replace either one.
 *
 * Iteration count was measured once on this runtime: PBKDF2-SHA256 at 100,000
 * iterations took about 20 ms, well under 300 ms, so the floor is kept.
 */
export const PARENT_PIN_KEY = "lexiquest.parent-pin.v1";
export const PARENT_PIN_ATTEMPTS_KEY = "lexiquest.parent-pin.attempts.v1";
export const PIN_ITERATIONS = 100_000;
export const PIN_ATTEMPT_LIMIT = 5;
export const PIN_COOLDOWN_STEPS_MS = [30_000, 60_000, 300_000] as const;

/**
 * Tech default, pending product and design confirmation.
 * A randomized two-digit by two-digit multiplication. Swap this function when the check changes.
 */
export const ADULT_CHECK_FORM = "two-digit-multiplication";

export interface ParentPinRecord {
  version: 1;
  algo: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  hash: string;
}

export interface PinAttempts {
  consecutiveWrong: number;
  lockedUntil: number | null;
}

export interface AdultCheck {
  form: typeof ADULT_CHECK_FORM;
  prompt: string;
  answer: number;
}

export type PinPhase = "setup" | "enter" | "forgot";

export interface ParentPinGate {
  protect(pin: string): Promise<ParentPinRecord>;
  matches(pin: string, record: ParentPinRecord): Promise<boolean>;
}

export interface PinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ParentPinVault {
  load(): { kind: "unset" } | { kind: "ready"; record: ParentPinRecord } | { kind: "corrupt" };
  store(record: ParentPinRecord): void;
  clear(): void;
  loadAttempts(): PinAttempts;
  storeAttempts(attempts: PinAttempts): void;
}

const EMPTY_ATTEMPTS: PinAttempts = { consecutiveWrong: 0, lockedUntil: null };

export function pinIsAcceptable(pin: string): boolean {
  return /^[0-9]{4,6}$/.test(pin);
}

/** Repeated digits and straight runs, such as 0000 and 1234. */
export function pinIsWeak(pin: string): boolean {
  if (!pinIsAcceptable(pin)) return false;
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map((digit) => Number(digit));
  const ascending = digits.every((digit, index) => index === 0 || digit === (digits[index - 1] ?? 0) + 1);
  const descending = digits.every((digit, index) => index === 0 || digit === (digits[index - 1] ?? 0) - 1);
  return ascending || descending;
}

export function cooldownMsForGroup(group: number): number {
  const index = Math.min(Math.max(group, 1), PIN_COOLDOWN_STEPS_MS.length) - 1;
  return PIN_COOLDOWN_STEPS_MS[index] ?? PIN_COOLDOWN_STEPS_MS[PIN_COOLDOWN_STEPS_MS.length - 1]!;
}

export function cooldownLabel(remainingMs: number): string {
  const total = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `请等 ${total} 秒后再试。`;
  if (seconds === 0) return `请等 ${minutes} 分后再试。`;
  return `请等 ${minutes} 分 ${seconds} 秒后再试。`;
}

export function pinFormTitle(phase: PinPhase): string {
  if (phase === "setup") return "先设一个家长密码";
  if (phase === "forgot") return "忘记密码";
  return "输入家长密码";
}

export function multiplicationCheck(random: () => number = Math.random): AdultCheck {
  const left = 10 + Math.floor(random() * 90);
  const right = 10 + Math.floor(random() * 90);
  return { form: ADULT_CHECK_FORM, prompt: `${left} × ${right}`, answer: left * right };
}

export function applyIfParentUnlocked<T>(unlocked: boolean, current: T, edit: (current: T) => T): T {
  if (!unlocked) return current;
  return edit(current);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function isPinRecord(value: unknown): value is ParentPinRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as ParentPinRecord;
  return (
    record.version === 1 &&
    record.algo === "PBKDF2-SHA256" &&
    typeof record.iterations === "number" &&
    record.iterations >= 1 &&
    record.iterations <= 2_000_000 &&
    typeof record.salt === "string" &&
    /^[0-9a-f]{32}$/.test(record.salt) &&
    typeof record.hash === "string" &&
    /^[0-9a-f]{64}$/.test(record.hash)
  );
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return hex(new Uint8Array(bits));
}

export function createPbkdf2PinGate(iterations = PIN_ITERATIONS): ParentPinGate {
  return {
    async protect(pin: string) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      return {
        version: 1,
        algo: "PBKDF2-SHA256",
        iterations,
        salt: hex(salt),
        hash: await derive(pin, salt, iterations),
      };
    },
    async matches(pin, record) {
      if (!isPinRecord(record)) return false;
      try {
        const hash = await derive(pin, fromHex(record.salt), record.iterations);
        return hash === record.hash;
      } catch {
        return false;
      }
    },
  };
}

export const pbkdf2PinGate: ParentPinGate = createPbkdf2PinGate(PIN_ITERATIONS);

export function createMemoryPinStorage(): PinStorage & { dump(): string } {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
    dump: () => [...items.entries()].map(([key, value]) => `${key}=${value}`).join("\n"),
  };
}

export function createLocalPinVault(storage: PinStorage): ParentPinVault {
  return {
    load() {
      const raw = storage.getItem(PARENT_PIN_KEY);
      if (!raw) return { kind: "unset" };
      try {
        const value: unknown = JSON.parse(raw);
        if (!isPinRecord(value)) return { kind: "corrupt" };
        return { kind: "ready", record: value };
      } catch {
        return { kind: "corrupt" };
      }
    },
    store(record) {
      storage.setItem(PARENT_PIN_KEY, JSON.stringify(record));
    },
    clear() {
      storage.removeItem(PARENT_PIN_KEY);
    },
    loadAttempts() {
      const raw = storage.getItem(PARENT_PIN_ATTEMPTS_KEY);
      if (!raw) return { ...EMPTY_ATTEMPTS };
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object") return { ...EMPTY_ATTEMPTS };
        const attempts = value as PinAttempts;
        const consecutiveWrong = typeof attempts.consecutiveWrong === "number" && attempts.consecutiveWrong > 0
          ? Math.floor(attempts.consecutiveWrong)
          : 0;
        const lockedUntil = typeof attempts.lockedUntil === "number" ? attempts.lockedUntil : null;
        return { consecutiveWrong, lockedUntil };
      } catch {
        return { ...EMPTY_ATTEMPTS };
      }
    },
    storeAttempts(attempts) {
      storage.setItem(PARENT_PIN_ATTEMPTS_KEY, JSON.stringify(attempts));
    },
  };
}

export function browserParentPinVault(): ParentPinVault {
  return createLocalPinVault(localStorage);
}

const RESET_NOTICE = "密码已重置。学习记录都还在。请再设一次。";
const CORRUPT_NOTICE = "这台电脑上的家长密码读不出来。答对下面的题后可以重新设置。学习记录不会被清掉。";

export interface ParentPinSession {
  readonly phase: PinPhase;
  readonly unlocked: boolean;
  readonly notice: string | null;
  readonly challenge: AdultCheck | null;
  cooldownRemaining(now: number): number;
  beginForgot(): void;
  submitPin(pin: string, confirm: string, now: number): Promise<{ ok: boolean; message: string }>;
  submitForgot(answer: string, now: number): { ok: boolean; message: string };
}

export function createParentPinSession(options: {
  gate: ParentPinGate;
  vault: ParentPinVault;
  random?: () => number;
}): ParentPinSession {
  const random = options.random ?? Math.random;
  const loaded = options.vault.load();
  let phase: PinPhase = loaded.kind === "unset" ? "setup" : loaded.kind === "corrupt" ? "forgot" : "enter";
  let record = loaded.kind === "ready" ? loaded.record : null;
  let attempts = options.vault.loadAttempts();
  let unlocked = false;
  let notice: string | null = loaded.kind === "corrupt" ? CORRUPT_NOTICE : null;
  let challenge: AdultCheck | null = phase === "forgot" ? multiplicationCheck(random) : null;

  const persistAttempts = () => options.vault.storeAttempts(attempts);

  const session: ParentPinSession = {
    get phase() {
      return phase;
    },
    get unlocked() {
      return unlocked;
    },
    get notice() {
      return notice;
    },
    get challenge() {
      return challenge;
    },
    cooldownRemaining(now: number) {
      if (attempts.lockedUntil === null || attempts.lockedUntil <= now) return 0;
      return attempts.lockedUntil - now;
    },
    beginForgot() {
      phase = "forgot";
      challenge = multiplicationCheck(random);
    },
    async submitPin(pin: string, confirm: string, now: number) {
      const remaining = session.cooldownRemaining(now);
      if (remaining > 0) return { ok: false, message: cooldownLabel(remaining) };
      if (phase === "forgot") return { ok: false, message: "请先回答上面的题目。" };
      if (phase === "setup") {
        if (!pinIsAcceptable(pin)) return { ok: false, message: "请用 4 到 6 位数字。" };
        if (pinIsWeak(pin)) return { ok: false, message: "这个数字太简单了，换一个吧。" };
        if (pin !== confirm) return { ok: false, message: "两次输入不一致。" };
        const protectedPin = await options.gate.protect(pin);
        options.vault.store(protectedPin);
        record = protectedPin;
        attempts = { ...EMPTY_ATTEMPTS };
        persistAttempts();
        phase = "enter";
        unlocked = true;
        return { ok: true, message: "" };
      }
      if (!record) return { ok: false, message: "请先回答上面的题目。" };
      const matched = await options.gate.matches(pin, record);
      if (!matched) {
        const consecutiveWrong = attempts.consecutiveWrong + 1;
        const group = consecutiveWrong / PIN_ATTEMPT_LIMIT;
        const lockedUntil = consecutiveWrong % PIN_ATTEMPT_LIMIT === 0 ? now + cooldownMsForGroup(group) : null;
        attempts = { consecutiveWrong, lockedUntil };
        persistAttempts();
        if (lockedUntil !== null) return { ok: false, message: cooldownLabel(lockedUntil - now) };
        return { ok: false, message: "密码不对。" };
      }
      attempts = { ...EMPTY_ATTEMPTS };
      persistAttempts();
      unlocked = true;
      return { ok: true, message: "" };
    },
    submitForgot(answer: string) {
      if (!challenge) challenge = multiplicationCheck(random);
      if (Number(answer.trim()) !== challenge.answer) return { ok: false, message: "答案不对。" };
      options.vault.clear();
      record = null;
      attempts = { ...EMPTY_ATTEMPTS };
      persistAttempts();
      challenge = null;
      phase = "setup";
      notice = RESET_NOTICE;
      unlocked = false;
      return { ok: true, message: RESET_NOTICE };
    },
  };
  return session;
}
