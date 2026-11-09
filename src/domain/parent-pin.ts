/**
 * Parent PIN gate shared by grade changes and the daily-goal tier.
 * The hash lives only on this device. Forgot-PIN recovery is not decided yet,
 * so this interface has no reset. Swap the object when the tech lead picks a store.
 */
import type { ParentPinRecord } from "./types";

export type { ParentPinRecord };

export interface ParentPinGate {
  protect(pin: string): Promise<ParentPinRecord>;
  matches(pin: string, record: ParentPinRecord): Promise<boolean>;
}

/** Four to eight digits. The rule sits beside the gate so a later store can keep it. */
export function pinIsAcceptable(pin: string): boolean {
  return /^[0-9]{4,8}$/.test(pin);
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function digest(text: string): Promise<string> {
  const hashed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return hex(hashed);
}

export const sha256PinGate: ParentPinGate = {
  async protect(pin: string) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    return { algorithm: "sha-256", salt, hash: await digest(`${salt}:${pin}`) };
  },
  async matches(pin, record) {
    if (record.algorithm !== "sha-256") return false;
    const hash = await digest(`${record.salt}:${pin}`);
    return hash === record.hash;
  },
};
