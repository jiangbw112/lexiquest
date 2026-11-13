import { describe, expect, it } from "vitest";
import { answerQuestion, splitDelayDamage, startBattle, takeAction, type BattleState } from "./battle";
import { CLASSES, classById } from "./classes";
import { isClassSelectable } from "./class-unlock";
import { PROVISIONAL } from "./provisional";
import { starMark, skillIconFrame } from "./skill-card-face";
import {
  classBaseHeal,
  classBasePower,
  hasDamageCard,
  showNoDamageHint,
  skillById,
  skillHealMagnitude,
  skillMagnitude,
  skillsForClass,
  starterSkillId,
} from "./skills";

const LEARNED = ["tree", "bird", "fish", "sun", "map", "run"];

function fight(classId: BattleState["classId"], equipped: string[], levels: Record<string, number> = {}): BattleState {
  return {
    ...startBattle({
      encounterId: "inkling",
      classId,
      learnedIds: LEARNED,
      equippedSkillIds: equipped,
      skillLevels: levels,
      seed: 3,
      enemy: { name: "词灵", maxHp: 80, attack: 4, sprite: "inkling" },
    }),
    energy: 8,
    playerHp: 20,
    enemyHp: 80,
  };
}

function cast(state: BattleState, slotIndex: number, correct: boolean): BattleState {
  const asked = takeAction(state, { type: "skill", slotIndex });
  if (!asked.ok || !asked.state.question) throw new Error(asked.reason ?? "no question");
  const question = asked.state.question;
  const choice = question.kind === "spelling"
    ? (correct ? question.answer : "nope")
    : (correct ? question.answerId : question.choices.find((item) => item.id !== question.answerId)?.id ?? "nope");
  return answerQuestion(asked.state, choice);
}

describe("class spec v1.0.3 batch 1", () => {
  it("stores the six class rows, with inventor hidden and reserved", () => {
    expect(CLASSES.map((item) => item.maxHp)).toEqual([42, 46, 46, 40, 46, 46]);
    expect(classById("explorer").xpBonus).toBe(1);
    expect(classById("warrior")).toMatchObject({ blurb: "冲到前面，边打边挡。", talent: "攻击和格挡更强" });
    expect(classById("ranger").blurb).toBe("脚步轻快，能量来得快。");
    expect(classById("explorer").talent).toBe("能先看到下一题考什么");
    const inventor = classById("inventor");
    expect(inventor.hidden).toBe(true);
    expect(inventor.unlock).toEqual({
      type: "firstClearFinalBoss",
      status: "reserved",
      enabledInVersion: "finalBossRelease",
      enabledIn100: false,
    });
    expect(isClassSelectable("inventor", { unlockedClassIds: ["inventor"] })).toBe(false);
  });

  it("uses healer-beam and splits gear damage by the star table", () => {
    const healer = classById("healer");
    const beam = skillById("healer-beam");
    expect(starterSkillId("healer")).toBe("healer-beam");
    expect(skillsForClass("healer").map((skill) => skill.id)).toEqual(["healer-beam", "healer-cure", "healer-guard", "healer-light"]);
    expect(skillById("healer-cheer")).toBeUndefined();
    expect(skillIconFrame("healer-beam")).toBe("skill_healer_beam");
    expect(beam && skillMagnitude(beam, healer, 1)).toBe(7);
    expect(beam && skillHealMagnitude(beam, healer, 1)).toBe(10);
    expect(classBasePower("healer")).toBe(3);
    expect(classBaseHeal("healer")).toBe(5);
    expect(classBasePower("warrior")).toBe(5);
    expect(classBasePower("mage")).toBe(6);
    expect(classBasePower("ranger")).toBe(6);
    expect(classBasePower("inventor")).toBe(5);
    expect(classBasePower("explorer")).toBe(5);
    const spark = skillById("mage-spark")!;
    expect([1, 2, 3].map((level) => skillMagnitude(spark, classById("mage"), level))).toEqual([14, 18, 22]);
    const gear = skillById("inventor-gear")!;
    const inventor = classById("inventor");
    expect([1, 2, 3].map((level) => splitDelayDamage(skillMagnitude(gear, inventor, level)))).toEqual([
      { now: 5, later: 5 },
      { now: 7, later: 6 },
      { now: 8, later: 8 },
    ]);
    expect(splitDelayDamage(Math.round(skillMagnitude(gear, inventor, 1) * 0.5))).toEqual({ now: 3, later: 2 });
    expect(skillById("inventor-over")?.kind).toBe("damage");
    expect(hasDamageCard(["healer-beam"])).toBe(true);
    expect(showNoDamageHint("healer", ["healer-beam"])).toBe(false);
    expect(showNoDamageHint("healer", ["healer-cure"])).toBe(true);
    expect(starMark(1)).toBe("★1");
    expect(starMark(3)).toBe("★3");
  });

  it("derives exam boss health from the chapter boss table", () => {
    const boss = PROVISIONAL.chapterEnding.bossPhaseHpByClass;
    const exam = PROVISIONAL.chapterEnding.examBossPhaseHp;
    for (const id of Object.keys(boss) as (keyof typeof boss)[]) {
      expect(exam.midterm[id]).toBe(Math.round(boss[id] * 1.6));
      expect(exam.final[id]).toBe(Math.round(boss[id] * 1.4));
    }
  });

  it("heals after the beam's damage and does not halve that heal", () => {
    const open = { ...fight("healer", ["healer-beam"], { "healer-beam": 1 }), enemyAttack: 0 };
    const hit = cast(open, 0, true);
    expect(hit.enemyHp).toBe(73);
    expect(hit.playerHp).toBe(30);
    expect(hit.supportStreak).toBe(0);
    const tired = cast({ ...open, supportStreak: 4 }, 0, true);
    expect(tired.playerHp - open.playerHp).toBe(10);
    expect(tired.enemyHp).toBe(73);
    const wrong = cast(open, 0, false);
    expect(wrong.enemyHp).toBe(76);
    expect(wrong.playerHp).toBe(25);
    const shaken = cast({
      ...open,
      shaken: true,
      phases: [{ hp: 80, note: "第一阶段。" }, { hp: 40, note: "第二阶段。" }],
      phaseIndex: 0,
      enemyHp: 20,
    }, 0, true);
    expect(shaken.phaseIndex).toBe(1);
    expect(shaken.enemyHp).toBe(40);
    expect(shaken.supportStreak).toBe(0);
  });

  it("lands the rest of a gear after the counter, and drops it when the turn ends", () => {
    const open = fight("inventor", ["inventor-gear"], { "inventor-gear": 1 });
    const hit = cast(open, 0, true);
    expect(hit.turnDeltas).toEqual([
      { target: "enemy", amount: -5 },
      { target: "player", amount: -4 },
      { target: "enemy", amount: -5 },
    ]);
    expect(hit.enemyHp).toBe(70);
    expect(hit.lastNote).toContain("齿轮还在转");

    const wrong = cast({ ...open, enemyAttack: 0 }, 0, false);
    expect(wrong.turnDeltas).toEqual([
      { target: "enemy", amount: -3 },
      { target: "enemy", amount: -2 },
    ]);

    const whiff = cast({
      ...open,
      rules: { ...open.rules, wrongAnswerMultiplier: 0 },
      enemyAttack: 9,
    }, 0, false);
    expect(whiff.enemyHp).toBe(80);
    expect(whiff.playerHp).toBe(20);
    expect(whiff.phase).toBe("choose");

    const slain = cast({ ...open, enemyHp: 4, enemyMaxHp: 4 }, 0, true);
    expect(slain.phase).toBe("won");
    expect(slain.playerHp).toBe(20);
    expect(slain.turnDeltas.filter((delta) => delta.target === "enemy")).toEqual([{ target: "enemy", amount: -4 }]);

    const down = cast({ ...open, playerHp: 2 }, 0, true);
    expect(down.phase).toBe("lost");
    expect(down.enemyHp).toBe(75);
    expect(down.turnDeltas.filter((delta) => delta.target === "enemy")).toEqual([{ target: "enemy", amount: -5 }]);

    const shaken = cast({
      ...open,
      shaken: true,
      phases: [{ hp: 80, note: "第一阶段。" }, { hp: 40, note: "第二阶段。" }],
      phaseIndex: 0,
      enemyHp: 50,
    }, 0, true);
    expect(shaken.phaseIndex).toBe(1);
    expect(shaken.enemyHp).toBe(40);
    expect(shaken.turnDeltas.filter((delta) => delta.target === "enemy")).toHaveLength(1);
    expect(shaken.lastNote).not.toContain("齿轮还在转");

    const finish = cast({ ...open, enemyHp: 8, enemyAttack: 0 }, 0, true);
    expect(finish.phase).toBe("won");
    expect(finish.turnDeltas).toEqual([
      { target: "enemy", amount: -5 },
      { target: "enemy", amount: -3 },
    ]);

    const over = cast({ ...fight("inventor", ["inventor-over"], { "inventor-over": 1 }), enemyAttack: 0 }, 0, true);
    expect(over.turnDeltas.filter((delta) => delta.target === "enemy")).toHaveLength(1);
    expect(over.lastNote).not.toContain("齿轮还在转");
  });
});
