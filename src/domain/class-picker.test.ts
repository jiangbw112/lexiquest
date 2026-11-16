import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSES, classById } from "./classes";
import { classPrimaryStroke, LOCKED_CARD_STROKE, STARTER_CARD_LABEL, starterCardLine, starterCardName } from "./class-picker";
import { skillById, starterSkillId } from "./skills";

const CHARSET = readFileSync(new URL("../../build/fonts/charset_core.txt", import.meta.url), "utf8");

describe("class picker card copy and strokes", () => {
  it("reads each class talent and starter card from the class and skill tables", () => {
    expect(STARTER_CARD_LABEL).toBe("起始卡");
    for (const def of CLASSES) {
      expect(def.talent.length).toBeGreaterThan(0);
      expect(starterCardName(def.id)).toBe(skillById(starterSkillId(def.id))?.name);
      expect(starterCardLine(def.id)).toBe(`${STARTER_CARD_LABEL} ${skillById(starterSkillId(def.id))?.name}`);
      const drawn = `${def.name}${def.blurb}${def.talent}${starterCardLine(def.id)}`;
      for (const ch of drawn) {
        if (ch.trim() === "") continue;
        expect(CHARSET.includes(ch), `${def.id} ${ch} U+${ch.codePointAt(0)?.toString(16)}`).toBe(true);
      }
    }
    expect(starterCardName("warrior")).toBe("盾击");
    expect(starterCardName("mage")).toBe("火花");
    expect(starterCardName("ranger")).toBe("瞄准");
    expect(starterCardName("healer")).toBe("光愈");
    expect(starterCardName("inventor")).toBe("齿轮弹");
    expect(starterCardName("explorer")).toBe("探路杖");
    expect(starterCardLine("warrior")).toBe("起始卡 盾击");
  });

  it("uses each class primary for the selected stroke, and a neutral gray for a locked card", () => {
    expect(classPrimaryStroke(classById("warrior"))).toBe(0xc4533a);
    expect(classPrimaryStroke(classById("mage"))).toBe(0x6d5bd0);
    expect(classPrimaryStroke(classById("ranger"))).toBe(0x2f8f62);
    expect(classPrimaryStroke(classById("healer"))).toBe(0xd06a8a);
    expect(classPrimaryStroke(classById("inventor"))).toBe(0xd0892f);
    expect(classPrimaryStroke(classById("explorer"))).toBe(0x2f7ea8);
    const strokes = CLASSES.map((def) => classPrimaryStroke(def));
    expect(new Set(strokes).size).toBe(CLASSES.length);
    const red = (LOCKED_CARD_STROKE >> 16) & 255;
    const green = (LOCKED_CARD_STROKE >> 8) & 255;
    const blue = LOCKED_CARD_STROKE & 255;
    expect(red).toBe(green);
    expect(green).toBe(blue);
    expect(LOCKED_CARD_STROKE).not.toBe(0x3b2a20);
    for (const stroke of strokes) expect(stroke).not.toBe(LOCKED_CARD_STROKE);

    const create = readFileSync(new URL("../game/scenes/CreateScene.ts", import.meta.url), "utf8");
    const skills = readFileSync(new URL("../game/scenes/SkillsScene.ts", import.meta.url), "utf8");
    const cards = create.slice(create.indexOf("CLASSES.forEach"), create.indexOf("const chosen"));
    expect(cards).toContain("def.talent");
    expect(cards).toContain("starterCardLine(def.id)");
    expect(cards).toContain("classPrimaryStroke(def)");
    expect(cards).toContain("LOCKED_CARD_STROKE");
    expect(cards).not.toContain("0xc4533a");
    expect(cards).not.toContain('"?');
    expect(cards).not.toContain("fontSize: \"48px\"");
    expect(cards).toContain("INVENTOR_LOCK_TITLE");
    expect(cards).toContain("INVENTOR_LOCK_NOTE");
    const switchCards = skills.slice(skills.indexOf("private drawSwitch"), skills.indexOf("private pickClass"));
    expect(switchCards).toContain("!unlocked ? LOCKED_CARD_STROKE : selected ? 0xc4533a : 0x3b2a20");
    expect(switchCards).toContain("INVENTOR_LOCK_NOTE");

    const p0 = readFileSync(new URL("../game/p0.ts", import.meta.url), "utf8");
    expect(p0).not.toContain("P0_CLASS_ID");
    expect(p0).toContain("P0_APPEARANCE");
  });
});
