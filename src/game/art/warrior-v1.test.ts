import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import hashes from "./asset-hashes.json";

const manifest = JSON.parse(readFileSync("public/assets/classes/v1.0/manifest.json", "utf8")) as {
  dashRules: Record<string, string>;
  animations: { key: string; textureKey: string; frames: string[] }[];
};

describe("warrior v1.0 on the v1.0.1 manifest", () => {
  it("keeps the inventor dash rule after the warrior merge", () => {
    expect(manifest.dashRules.inventor).toContain("1/3");
    expect(manifest.dashRules.inventor).toContain("齿轮");
    expect(Object.keys(manifest.dashRules)).toEqual(expect.arrayContaining([
      "warrior", "explorer", "mage", "ranger", "healer", "inventor",
    ]));
  });

  it("resolves every warrior side anim key to frames in its atlas", () => {
    const sheets: Record<string, { frames: Record<string, unknown> }> = {
      "cls:warrior:side": JSON.parse(readFileSync("public/assets/classes/v1.0/side/cls_warrior_side@2x.json", "utf8")),
      "cls:shared:side": JSON.parse(readFileSync("public/assets/classes/v1.0/side/cls_shared_side@2x.json", "utf8")),
    };
    const warrior = manifest.animations.filter((anim) => anim.textureKey === "cls:warrior:side" || anim.key.startsWith("char_warrior_"));
    expect(warrior.length).toBeGreaterThan(0);
    for (const anim of manifest.animations.filter((item) => item.textureKey === "cls:warrior:side")) {
      const sheet = sheets[anim.textureKey];
      expect(sheet, anim.key).toBeTruthy();
      for (const frame of anim.frames) expect(sheet.frames[frame], `${anim.key} ${frame}`).toBeTruthy();
    }
  });
});

describe("class asset hashes", () => {
  it("matches the recorded sha256 for each new or replaced file", () => {
    for (const [file, expected] of Object.entries(hashes)) {
      const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
      expect(digest, file).toBe(expected);
    }
  });
});
