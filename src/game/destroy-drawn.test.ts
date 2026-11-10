import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { destroyDrawn } from "./destroy-drawn";

describe("destroyDrawn", () => {
  it("turns input off before destroy, so a hidden control cannot be clicked", () => {
    const order: string[] = [];
    destroyDrawn([
      {
        disableInteractive() {
          order.push("off");
        },
        destroy() {
          order.push("gone");
        },
      },
    ]);
    expect(order).toEqual(["off", "gone"]);
  });

  it("copies the list before destroying, so a live display list can shrink", () => {
    const nodes = [{ destroy() { nodes.pop(); } }, { destroy() { nodes.pop(); } }];
    destroyDrawn(nodes);
    expect(nodes).toEqual([]);
  });
});

describe("learn question controls", () => {
  const source = readFileSync(new URL("./scenes/LearnScene.ts", import.meta.url), "utf8");

  it("destroys the previous frame instead of removeAll(true)", () => {
    expect(source).toContain("destroyDrawn(this.children.list)");
    expect(source).not.toContain("removeAll(true)");
    expect(source).toContain('learn:actions:closed');
    expect(source).toContain('learn:actions:open');
    expect(source).toContain('setDefaultCursor("default")');
  });

  it("creates 听一听 and 选意思 only on the study card", () => {
    const study = source.slice(source.indexOf('if (this.phase === "study")'), source.indexOf("if (this.question)"));
    const question = source.slice(source.indexOf("if (this.question)"));
    expect(study).toContain("听一听");
    expect(study).toContain("选意思");
    expect(question).not.toContain("听一听");
    expect(question).not.toContain("选意思");
  });
});

describe("player-facing skill rules", () => {
  it("keeps decimals, ratios, and multipliers off the skill page and the guide", () => {
    const skills = readFileSync(new URL("./scenes/SkillsScene.ts", import.meta.url), "utf8");
    const guide = readFileSync(new URL("./scenes/GuideScene.ts", import.meta.url), "utf8");
    const plain = "基础招式更弱，不花能量。答错时，效果只有答对的一半。";
    expect(skills).toContain(plain);
    expect(guide).toContain(plain);
    expect(skills).not.toMatch(/0\.45|×0\.|wrongAnswerMultiplier|baseSkillPowerScale|baseSkillEnergyCost/);
    expect(guide).not.toMatch(/0\.45|×0\.|wrongAnswerMultiplier|baseSkillPowerScale/);
  });
});
