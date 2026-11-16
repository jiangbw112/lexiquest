import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clearPinErrorText } from "./pin-error";

describe("parent pin error", () => {
  it("clears #pin-error and leaves other nodes alone", () => {
    const error = { textContent: "两次输入不一致。" };
    const root = {
      getElementById(id: string) {
        return id === "pin-error" ? error : null;
      },
    };
    clearPinErrorText(root);
    expect(error.textContent).toBe("");
    clearPinErrorText({ getElementById: () => null });
  });

  it("clears the message when the parent page is cancelled and when it opens again", () => {
    const guide = readFileSync(new URL("./scenes/GuideScene.ts", import.meta.url), "utf8");
    const open = guide.indexOf("this.bindPinForm()");
    const render = guide.indexOf("this.renderPinForm()");
    const cancel = guide.indexOf('if (event.code === "Escape") this.scene.start("overworld")');
    const back = guide.indexOf('uiLabel("返回")');
    expect(open).toBeGreaterThan(0);
    expect(render).toBeGreaterThan(open);
    expect(guide.slice(open, render)).toContain("clearPinErrorText(document)");
    expect(guide).toContain('this.events.once("shutdown", ()');
    expect(guide.split("clearPinErrorText(document)").length - 1).toBe(2);
    expect(cancel).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
    expect(guide.slice(back, back + 80)).toContain('this.scene.start("overworld")');
    const pin = readFileSync(new URL("../domain/parent-pin.ts", import.meta.url), "utf8");
    expect(pin).toContain('return { ok: false, message: "两次输入不一致。" }');
    expect(guide).toContain("error.textContent = result.ok ? (this.pinSession.notice ?? \"\") : result.message");
    expect(guide).toContain('error?.textContent.startsWith("请等")');
  });
});
