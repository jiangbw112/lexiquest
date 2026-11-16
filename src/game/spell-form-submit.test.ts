import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function sceneSources(): { name: string; source: string }[] {
  const dir = new URL("./scenes/", import.meta.url);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({ name, source: readFileSync(new URL(name, dir), "utf8") }));
}

describe("spell form submit", () => {
  it("requires every spell-form scene to prevent the native submit", () => {
    const users = sceneSources().filter(({ source }) => source.includes("spell-form"));
    expect(users.length).toBeGreaterThan(0);
    for (const { name, source } of users) {
      const add = source.indexOf('addEventListener("submit"');
      expect(add, name).toBeGreaterThan(-1);
      const handler = source.slice(Math.max(0, add - 180), add);
      expect(handler, name).toContain("preventDefault()");
      expect(handler, name).toContain("submitSpelling()");
      expect(source, name).toContain('removeEventListener("submit"');
      expect(source, name).toContain("shutdown");
    }
  });

  it("judges one exam spelling submission once and drops the listener on the way out", () => {
    const scene = readFileSync(new URL("./scenes/ExamBattleScene.ts", import.meta.url), "utf8");
    expect(scene.match(/this\.submitSpelling\(\)/g)).toEqual(["this.submitSpelling()"]);
    expect(scene).not.toContain("window.addEventListener");
    expect(scene).not.toContain('event.key === "Enter"');
    expect(scene).toContain('once("shutdown", this.leave, this)');
    expect(scene).toContain('once("destroy", this.leave, this)');
    const form = new EventTarget();
    let judged = 0;
    const attach = () => {
      const submit = (event: Event) => {
        event.preventDefault();
        judged += 1;
      };
      form.addEventListener("submit", submit);
      return () => form.removeEventListener("submit", submit);
    };
    const first = attach();
    first();
    const second = attach();
    const event = new Event("submit", { cancelable: true });
    form.dispatchEvent(event);
    form.dispatchEvent(new Event("keydown", { cancelable: true }));
    expect(event.defaultPrevented).toBe(true);
    expect(judged).toBe(1);
    second();
    second();
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(judged).toBe(1);
  });
});
