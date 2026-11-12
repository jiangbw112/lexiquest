import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_IDS } from "../../domain/classes";
import { DASH_RULES, atlasFile, classAssetPath, countClassAnimKeys, topFacing } from "./class-atlas";

describe("class atlases", () => {
  it("points each class at its v1.0 sheet", () => {
    expect(classAssetPath("ranger", "side")).toBe("assets/classes/v1.0/side/cls_ranger_side@2x.png");
    expect(classAssetPath("mage", "top")).toBe("assets/classes/v1.0/top/cls_mage_top@2x.png");
    expect(atlasFile("cls:portraits_locked")).toEqual({ png: "portrait/cls_portraits_locked@2x.png", json: "portrait/cls_portraits_locked@2x.json" });
    expect(atlasFile("cls:wreath@1x")).toEqual({ png: "wreath/cls_wreath@1x.png", json: "wreath/cls_wreath@1x.json" });
    expect(atlasFile("cls:shared:top@1x")?.png).toBe("top/cls_shared_top@1x.png");
    for (const id of CLASS_IDS) {
      expect(classAssetPath(id, "side")).toBe(`assets/classes/v1.0/side/cls_${id}_side@2x.png`);
      expect(classAssetPath(id, "top")).toBe(`assets/classes/v1.0/top/cls_${id}_top@2x.png`);
    }
  });

  it("mirrors east when the hero faces west", () => {
    expect(topFacing("w")).toEqual({ dir: "e", flipX: true });
    expect(topFacing("e")).toEqual({ dir: "e", flipX: false });
    expect(topFacing("n")).toEqual({ dir: "n", flipX: false });
    expect(topFacing("s")).toEqual({ dir: "s", flipX: false });
  });

  it("gives every class a v1.0.1 dash rule, including the inventor step", () => {
    expect(Object.keys(DASH_RULES).sort()).toEqual([...CLASS_IDS].sort());
    expect(DASH_RULES.inventor.attack).toBe("stepThird");
    expect(DASH_RULES.inventor.stepFraction).toBeCloseTo(1 / 3, 5);
    expect(DASH_RULES.warrior.attack).toBe("dashToEnemy");
    expect(DASH_RULES.healer.heal).toBe("stay");
  });

  it("builds 513 animation keys from the layer tables", () => {
    expect(countClassAnimKeys()).toBe(513);
  });

  it("leaves the boot preload list unchanged", () => {
    const source = readFileSync(new URL("../scenes/BootScene.ts", import.meta.url), "utf8");
    const preload = source.slice(source.indexOf("preload(): void {"), source.indexOf("create(): void {"));
    expect(preload).toContain('this.load.atlas("actors"');
    expect(preload).toContain("queueWarriorAtlases(this)");
    expect(preload).toContain("queueChapterCosmetics(this)");
    expect(preload).toContain('queueWarm(this, ["atlas_ui_core", "atlas_village"], ["bg_home", "bg_village"])');
    expect(preload).toContain('this.load.image("logo_title"');
    expect(preload).not.toContain("assets/classes");
    expect(preload).not.toContain("queueClass");
  });
});
