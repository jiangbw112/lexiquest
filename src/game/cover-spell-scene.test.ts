import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cover spell scene contract", () => {
  const review = readFileSync(new URL("./scenes/ReviewScene.ts", import.meta.url), "utf8");
  const progress = readFileSync(new URL("../domain/progress.ts", import.meta.url), "utf8");
  const battle = readFileSync(new URL("./scenes/BattleScene.ts", import.meta.url), "utf8");
  const exam = readFileSync(new URL("./scenes/ExamBattleScene.ts", import.meta.url), "utf8");
  const form = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

  it("keeps 盖住拼 off the shared mastery writer and off the old spelling button", () => {
    const coverStart = review.indexOf("private submitCover");
    const spellStart = review.indexOf("private submitSpelling");
    const drawStart = review.indexOf("private draw(");
    expect(coverStart).toBeGreaterThan(-1);
    expect(spellStart).toBeGreaterThan(coverStart);
    expect(drawStart).toBeGreaterThan(spellStart);
    const cover = review.slice(coverStart, spellStart);
    const spell = review.slice(spellStart, drawStart);
    expect(cover).toContain("applyCoverSpell");
    expect(cover).toContain("studyNow(current)");
    expect(cover).toContain("deviceTimeZone()");
    expect(cover).not.toContain("notePracticeAnswer");
    expect(cover).not.toContain("reviewWord(");
    expect(cover).not.toContain("learnWord");
    expect(cover).not.toContain("showSpellingHint");
    expect(spell).toContain("notePracticeAnswer");
    expect(spell).not.toContain("applyCoverSpell");
    expect(review).toContain("盖住拼");
    expect(review).toContain("coverSpellOffered");
    expect(review).toContain("COVER_SPELL_SAVE_FAILED");
    expect(review).toContain("setSpellFormLock(true)");
    expect(review).toContain("if (this.coverId || this.spellId) return;");
    const keys = review.slice(review.indexOf("keydown"), review.indexOf("private badgeLit"));
    expect(keys.indexOf("spell-form")).toBeGreaterThan(-1);
    expect(keys.indexOf("spell-form")).toBeLessThan(keys.indexOf("reviewClockCommand"));
    expect(review).not.toContain("noteIndependentSpelling");
    expect(progress).not.toContain("applyCoverSpell");
    expect(progress).not.toContain("COVER_SPELL");
    expect(battle).not.toContain("applyCoverSpell");
    expect(exam).not.toContain("applyCoverSpell");
    expect(form).toContain('id="spell-scrim" hidden');
    expect(form).toContain('id="spell-give-up" type="button" hidden');
    expect(form).toContain('id="spell-replay" type="button" hidden');
    expect(form).toContain('id="spell-label"');
  });
});
