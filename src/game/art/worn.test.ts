import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { outfitExtraFrames, outfitHatFrame, villageCosmeticNudge, villageCosmeticScale, villageHatPlacement, villageOutfitFrames, wornCosmeticIds } from "./worn";

describe("worn appearance", () => {
  it("adds and removes every outfit piece", () => {
    expect(outfitExtraFrames("traveler")).toEqual([]);
    expect(outfitExtraFrames("forest-cape")).toEqual(["side/cape", "side/hat-leaf"]);
    expect(outfitExtraFrames("star-sash")).toEqual(["side/sash", "side/hat-star"]);
    expect(outfitHatFrame("traveler")).toBeNull();
    expect(outfitHatFrame("forest-cape")).toBe("side/hat-leaf");
    expect(outfitHatFrame("star-sash")).toBe("side/hat-star");
    expect(villageOutfitFrames("traveler")).not.toContain("top/cape");
    expect(villageOutfitFrames("traveler")).not.toContain("top/sash");
    expect(villageOutfitFrames("forest-cape")).toContain("top/cape");
    expect(villageOutfitFrames("forest-cape")).not.toContain("top/sash");
    expect(villageOutfitFrames("star-sash")).toContain("top/sash");
    expect(villageOutfitFrames("star-sash")).not.toContain("top/cape");
  });

  it("parks plaza hats and cosmetics on the doll instead of the feet", () => {
    const leaf = villageHatPlacement("side/hat-leaf");
    const star = villageHatPlacement("side/hat-star");
    expect(leaf.scale).toBeGreaterThan(0);
    expect(star.y).toBeGreaterThan(0);
    const wreath = villageCosmeticNudge("forest_wreath");
    const pin = villageCosmeticNudge("acorn_pin");
    expect(wreath.y).toBeLessThan(pin.y);
    expect(pin.y).toBeLessThan(0);
    expect(villageCosmeticScale("forest_leaf_cape")).toBeGreaterThan(villageCosmeticScale("acorn_pin"));
    expect(villageCosmeticNudge("missing")).toEqual({ x: 0, y: 0 });
  });

  it("keeps the three chapter cosmetics in draw order", () => {
    expect(wornCosmeticIds(["forest_wreath", "missing", "acorn_pin"])).toEqual(["acorn_pin", "forest_wreath"]);
    expect(wornCosmeticIds([])).toEqual([]);
  });

  it("passes the equipped outfit into the side view and keeps actor clothes off the plaza", () => {
    const battle = readFileSync(new URL("../scenes/BattleScene.ts", import.meta.url), "utf8");
    const wardrobe = readFileSync(new URL("../scenes/WardrobeScene.ts", import.meta.url), "utf8");
    const ending = readFileSync(new URL("../scenes/EndingScene.ts", import.meta.url), "utf8");
    const results = readFileSync(new URL("../scenes/BattleResultsScene.ts", import.meta.url), "utf8");
    const village = readFileSync(new URL("../scenes/OverworldScene.ts", import.meta.url), "utf8");
    const warrior = readFileSync(new URL("./warrior-sprite.ts", import.meta.url), "utf8");
    const side = readFileSync(new URL("./class-sprite.ts", import.meta.url), "utf8");
    expect(battle).toContain("save.equippedOutfitId");
    expect(wardrobe).toContain("save.equippedOutfitId");
    expect(ending).toContain("save.equippedOutfitId");
    expect(results).toContain("this.view.equippedOutfitId");
    expect(village).toContain("new ClassTopSprite");
    expect(village).not.toContain("applyAppearance");
    expect(side).toContain("outfitExtraFrames");
    expect(warrior).toContain("outfitExtraFrames");
  });
});
