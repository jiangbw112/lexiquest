import { describe, expect, it } from "vitest";
import { pinIsAcceptable, sha256PinGate } from "./parent-pin";

describe("parent PIN gate", () => {
  it("stores a salted hash and has no reset", async () => {
    const pin = "2468";
    const record = await sha256PinGate.protect(pin);
    const other = await sha256PinGate.protect(pin);
    expect(await sha256PinGate.matches(pin, record)).toBe(true);
    expect(await sha256PinGate.matches("1357", record)).toBe(false);
    expect(JSON.stringify(record)).not.toContain(pin);
    expect(record.salt).not.toBe(other.salt);
    expect(record.hash).not.toBe(other.hash);
    expect(Object.keys(sha256PinGate).sort()).toEqual(["matches", "protect"]);
    expect(pinIsAcceptable("1234")).toBe(true);
    expect(pinIsAcceptable("12345678")).toBe(true);
    expect(pinIsAcceptable("123")).toBe(false);
    expect(pinIsAcceptable("123456789")).toBe(false);
    expect(pinIsAcceptable("12ab")).toBe(false);
  });
});
