import { describe, expect, it } from "vitest";
import { classById } from "./classes";
import { PROVISIONAL } from "./provisional";
import {
  castEffect,
  classBasePower,
  equipSkillIds,
  fillSkillSlots,
  MAX_EQUIPPED_SKILLS,
  skillById,
  skillMagnitude,
  skillsForClass,
  skillsInEquipOrder,
  SKILL_CARD_RULES,
} from "./skills";

describe("skill cards", () => {
  it("equips at most three skills and does not treat word ids as skills", () => {
    const known = skillsForClass("mage").map((skill) => skill.id);
    const unlocked = known;
    expect(MAX_EQUIPPED_SKILLS).toBe(3);

    let equipped: string[] = [];
    for (const id of known.slice(0, 3)) {
      const result = equipSkillIds(equipped, id, { unlocked, known });
      expect(result.ok).toBe(true);
      equipped = result.equipped;
    }
    expect(equipped).toHaveLength(3);

    const fourth = equipSkillIds(equipped, known[3]!, { unlocked, known });
    expect(fourth.ok).toBe(false);
    expect(fourth.reason).toBe("limit");
    expect(fourth.equipped).toEqual(equipped);

    const opened = equipped.filter((id) => id !== known[1]);
    const swapped = equipSkillIds(opened, known[3]!, { unlocked, known });
    expect(swapped.ok).toBe(true);
    expect(swapped.equipped).toEqual([known[0], known[2], known[3]]);

    const wordCard = equipSkillIds(equipped, "lantern", { unlocked, known });
    expect(wordCard.ok).toBe(false);
    expect(wordCard.reason).toBe("unknown");
  });

  it("fills empty slots with a weaker configurable base skill and never carries a fourth card", () => {
    expect(PROVISIONAL.skillCards.label).toBe("v1");
    expect(MAX_EQUIPPED_SKILLS).toBe(3);
    const one = fillSkillSlots("warrior", ["warrior-bash"], { "warrior-bash": 1 });
    expect(one).toHaveLength(MAX_EQUIPPED_SKILLS);
    expect(one.filter((slot) => slot.origin === "equipped").map((slot) => slot.skillId)).toEqual(["warrior-bash"]);
    expect(one.filter((slot) => slot.origin === "base")).toHaveLength(2);
    expect(one[1]?.energyCost).toBe(SKILL_CARD_RULES.baseSkillEnergyCost);
    const starter = skillById("warrior-bash");
    const starterPower = skillMagnitude(starter!, classById("warrior"), 1);
    expect(one[1]?.fullPower).toBeLessThan(starterPower);
    expect(one[1]?.fullPower).toBe(classBasePower("warrior"));
    expect(one[0]?.level).toBe(1);
    expect(one[1]?.level).toBeNull();

    const gentle = { ...SKILL_CARD_RULES, baseSkillPowerScale: 0.2 };
    const sturdier = { ...SKILL_CARD_RULES, baseSkillPowerScale: 0.8 };
    expect(classBasePower("warrior", sturdier)).toBeGreaterThan(classBasePower("warrior", gentle));
    expect(classBasePower("warrior", sturdier)).toBeLessThan(starterPower);

    const four = fillSkillSlots(
      "warrior",
      ["warrior-bash", "warrior-shout", "warrior-hold", "warrior-spin"],
      {},
    );
    expect(four).toHaveLength(3);
    expect(four.every((slot) => slot.origin === "equipped")).toBe(true);
    expect(four.map((slot) => slot.skillId)).not.toContain("warrior-spin");
  });

  it("uses the full leveled effect when the answer is right and a reduced base effect when it is wrong", () => {
    const [slot] = fillSkillSlots("warrior", ["warrior-shout"], { "warrior-shout": 3 });
    expect(slot?.level).toBe(3);
    expect(slot?.fullPower).toBeGreaterThan(slot?.basePower ?? 0);
    expect(castEffect(slot!, true, 0.25)).toBe(slot?.fullPower);
    expect(castEffect(slot!, false, 0.5)).toBe(Math.round((slot?.basePower ?? 0) * 0.5));
    expect(castEffect(slot!, false, 0.5)).toBeLessThan(slot?.fullPower ?? 0);
    expect(castEffect(slot!, false, 0.2)).toBeLessThan(castEffect(slot!, false, 0.5));
    expect(castEffect(slot!, false, Number.NaN)).toBe(0);
  });

  it("rejects a skill the child has not unlocked", () => {
    const known = skillsForClass("warrior").map((skill) => skill.id);
    const result = equipSkillIds([], known[1]!, { unlocked: [known[0]!], known });
    expect(result).toMatchObject({ ok: false, reason: "locked", equipped: [] });
  });

  it("lists equipped skills first, in equip order", () => {
    const ordered = skillsInEquipOrder("warrior", ["warrior-hold", "warrior-bash"]);
    expect(ordered.map((skill) => skill.id)).toEqual([
      "warrior-hold",
      "warrior-bash",
      "warrior-shout",
      "warrior-spin",
    ]);
  });
});
