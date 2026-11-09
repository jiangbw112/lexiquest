import { classById } from "./classes";
import type { ClassDef } from "./classes";
import { PROVISIONAL } from "./provisional";
import type { ClassId } from "./types";

export type SkillCardRules = {
  baseSkillPowerScale: number;
  baseSkillEnergyCost: number;
  wrongAnswerMultiplier: number;
};

export const SKILL_CARD_RULES: SkillCardRules = PROVISIONAL.skillCards;

export const MAX_EQUIPPED_SKILLS = 3;
export const MAX_SKILL_LEVEL = 3;

export type SkillKind = "damage" | "guard" | "heal" | "strike-guard";

export interface SkillDef {
  id: string;
  classId: ClassId;
  name: string;
  description: string;
  cost: number;
  kind: SkillKind;
  power: number;
  order: number;
}

export const SKILLS: SkillDef[] = [
  { id: "warrior-bash", classId: "warrior", name: "盾击", description: "撞上去，并挡住下一次一些伤害。", cost: 2, kind: "strike-guard", power: 10, order: 0 },
  { id: "warrior-shout", classId: "warrior", name: "战吼", description: "大喊一声，打出更重的一击。", cost: 2, kind: "damage", power: 14, order: 1 },
  { id: "warrior-hold", classId: "warrior", name: "坚守", description: "举起盾，接下词灵的冲撞。", cost: 1, kind: "guard", power: 12, order: 2 },
  { id: "warrior-spin", classId: "warrior", name: "旋风斩", description: "转一圈，把词灵推远。", cost: 3, kind: "damage", power: 18, order: 3 },
  { id: "mage-spark", classId: "mage", name: "火花", description: "一簇小火苗，明亮但不烫手。", cost: 2, kind: "damage", power: 12, order: 0 },
  { id: "mage-ward", classId: "mage", name: "星盾", description: "用光做成的盾。", cost: 2, kind: "guard", power: 11, order: 1 },
  { id: "mage-glow", classId: "mage", name: "微光", description: "暖暖的光，补回一些体力。", cost: 2, kind: "heal", power: 12, order: 2 },
  { id: "mage-star", classId: "mage", name: "星落", description: "一颗小星星落在词灵面前。", cost: 3, kind: "damage", power: 18, order: 3 },
  { id: "ranger-aim", classId: "ranger", name: "瞄准", description: "看准再出手。", cost: 2, kind: "damage", power: 12, order: 0 },
  { id: "ranger-step", classId: "ranger", name: "疾走", description: "侧步躲开下一击。", cost: 1, kind: "guard", power: 10, order: 1 },
  { id: "ranger-herb", classId: "ranger", name: "草药", description: "路边的叶子也能帮忙。", cost: 2, kind: "heal", power: 9, order: 2 },
  { id: "ranger-volley", classId: "ranger", name: "连射", description: "快速的两下。", cost: 3, kind: "damage", power: 16, order: 3 },
  { id: "healer-cure", classId: "healer", name: "治愈", description: "认真地包扎一下。", cost: 2, kind: "heal", power: 14, order: 0 },
  { id: "healer-guard", classId: "healer", name: "守护", description: "先护住自己。", cost: 2, kind: "guard", power: 11, order: 1 },
  { id: "healer-light", classId: "healer", name: "光击", description: "柔和的光也能把词灵推开。", cost: 2, kind: "damage", power: 9, order: 2 },
  { id: "healer-cheer", classId: "healer", name: "鼓舞", description: "推开词灵，并挡住接下来的一些伤害。", cost: 3, kind: "strike-guard", power: 10, order: 3 },
  { id: "inventor-gear", classId: "inventor", name: "齿轮弹", description: "弹出一颗圆圆的齿轮。", cost: 2, kind: "damage", power: 11, order: 0 },
  { id: "inventor-pad", classId: "inventor", name: "减震垫", description: "软垫接住下一次撞击。", cost: 1, kind: "guard", power: 11, order: 1 },
  { id: "inventor-fix", classId: "inventor", name: "修理", description: "拧紧松掉的部分，恢复体力。", cost: 2, kind: "heal", power: 10, order: 2 },
  { id: "inventor-over", classId: "inventor", name: "超载", description: "小机器全力转一圈。", cost: 3, kind: "damage", power: 17, order: 3 },
  { id: "explorer-staff", classId: "explorer", name: "探路杖", description: "用杖尖点醒词灵。", cost: 2, kind: "damage", power: 11, order: 0 },
  { id: "explorer-bandage", classId: "explorer", name: "绷带", description: "背包里永远有一条干净绷带。", cost: 2, kind: "heal", power: 10, order: 1 },
  { id: "explorer-map", classId: "explorer", name: "地图光", description: "地图闪一下，照出躲避的方向。", cost: 1, kind: "guard", power: 10, order: 2 },
  { id: "explorer-find", classId: "explorer", name: "发现一击", description: "找到词灵的破绽。", cost: 3, kind: "damage", power: 16, order: 3 },
];

export function skillsForClass(classId: ClassId): SkillDef[] {
  return SKILLS.filter((skill) => skill.classId === classId).sort((a, b) => a.order - b.order);
}

export function skillById(id: string): SkillDef | undefined {
  return SKILLS.find((skill) => skill.id === id);
}

export function skillEnergyCost(skill: SkillDef, classDef: ClassDef): number {
  return Math.max(1, skill.cost + classDef.skillCostDelta);
}

export function skillMagnitude(skill: SkillDef, classDef: ClassDef, level: number): number {
  const safeLevel = Math.min(MAX_SKILL_LEVEL, Math.max(1, level));
  const levelScale = 1 + (safeLevel - 1) * 0.3;
  return Math.max(1, Math.round(skill.power * classDef.skillPower * levelScale));
}

export function equipSkillIds(
  equipped: readonly string[],
  skillId: string,
  options: { unlocked: readonly string[]; known: readonly string[]; max?: number },
): { ok: boolean; reason?: "limit" | "locked" | "unknown"; equipped: string[] } {
  const max = options.max ?? MAX_EQUIPPED_SKILLS;
  const current = [...equipped];
  if (!options.known.includes(skillId)) return { ok: false, reason: "unknown", equipped: current };
  if (!options.unlocked.includes(skillId)) return { ok: false, reason: "locked", equipped: current };
  if (current.includes(skillId)) return { ok: true, equipped: current };
  if (current.length >= max) return { ok: false, reason: "limit", equipped: current };
  return { ok: true, equipped: [...current, skillId] };
}

export function starterSkillId(classId: ClassId): string {
  const first = skillsForClass(classId)[0];
  if (!first) throw new Error(`No skills for ${classId}`);
  return first.id;
}

export interface SkillSlot {
  index: number;
  skillId: string;
  name: string;
  kind: SkillKind;
  /** Equipped cards are the player's. Base slots only exist to fill an empty loadout. */
  origin: "equipped" | "base";
  /** Used on a correct answer. Includes skill level. */
  fullPower: number;
  /** Level-1 power, or the weaker filler power. A wrong answer reduces this, not fullPower. */
  basePower: number;
  energyCost: number;
}

/** Weaker than the class starter at level 1. Scale is configurable and still clamped below the starter. */
export function classBasePower(classId: ClassId, rules: SkillCardRules = SKILL_CARD_RULES): number {
  const starter = skillsForClass(classId)[0];
  if (!starter) throw new Error(`No skills for ${classId}`);
  const full = skillMagnitude(starter, classById(classId), 1);
  const scaled = Math.round(full * rules.baseSkillPowerScale);
  return Math.max(1, Math.min(full - 1, scaled));
}

/**
 * Always returns 3 slots. Real cards stay in front, in equip order.
 * Missing slots become that class's base skill and are not saved as owned cards.
 */
export function fillSkillSlots(
  classId: ClassId,
  equippedSkillIds: readonly string[],
  skillLevels: Record<string, number>,
  rules: SkillCardRules = SKILL_CARD_RULES,
): SkillSlot[] {
  const hero = classById(classId);
  const slots: SkillSlot[] = [];
  for (const id of equippedSkillIds) {
    if (slots.length >= MAX_EQUIPPED_SKILLS) break;
    const skill = skillById(id);
    if (!skill || skill.classId !== classId) continue;
    const level = skillLevels[id] ?? 1;
    slots.push({
      index: slots.length,
      skillId: skill.id,
      name: skill.name,
      kind: skill.kind,
      origin: "equipped",
      fullPower: skillMagnitude(skill, hero, level),
      basePower: skillMagnitude(skill, hero, 1),
      energyCost: skillEnergyCost(skill, hero),
    });
  }
  const starter = skillsForClass(classId)[0];
  if (!starter) throw new Error(`No skills for ${classId}`);
  const filler = classBasePower(classId, rules);
  while (slots.length < MAX_EQUIPPED_SKILLS) {
    slots.push({
      index: slots.length,
      skillId: `${classId}-base`,
      name: "基础招式",
      kind: starter.kind,
      origin: "base",
      fullPower: filler,
      basePower: filler,
      energyCost: Math.max(0, rules.baseSkillEnergyCost),
    });
  }
  return slots;
}

/** Correct casts use the upgraded power. Wrong casts use basePower times the configurable multiplier. */
export function castEffect(slot: SkillSlot, correct: boolean, multiplier: number): number {
  if (correct) return slot.fullPower;
  const safe = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 0;
  return Math.max(0, Math.round(slot.basePower * safe));
}

export function skillCostFor(classId: ClassId, skillId: string): number {
  const skill = skillById(skillId);
  if (!skill) throw new Error(`Unknown skill ${skillId}`);
  return skillEnergyCost(skill, classById(classId));
}
