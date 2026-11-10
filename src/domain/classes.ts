import type { ClassId } from "./types";

export interface ClassDef {
  id: ClassId;
  name: string;
  blurb: string;
  talent: string;
  maxHp: number;
  attack: number;
  heal: number;
  block: number;
  energyGain: number;
  skillPower: number;
  skillCostDelta: number;
  xpBonus: number;
  color: string;
}

/** MVP combat tuning. Not the unapproved badge or speed numbers. */
export const CLASSES: ClassDef[] = [
  {
    id: "warrior",
    name: "战士",
    blurb: "身体结实，一击更重。",
    talent: "生命和攻击更高",
    maxHp: 42,
    attack: 8,
    heal: 8,
    block: 6,
    energyGain: 2,
    skillPower: 1.05,
    skillCostDelta: 0,
    xpBonus: 1,
    color: "#c4533a",
  },
  {
    id: "mage",
    name: "法师",
    blurb: "技能更亮，要记得攒能量。",
    talent: "技能伤害更高",
    maxHp: 36,
    attack: 7,
    heal: 8,
    block: 4,
    energyGain: 2,
    skillPower: 1.35,
    skillCostDelta: 0,
    xpBonus: 1,
    color: "#6d5bd0",
  },
  {
    id: "ranger",
    name: "游侠",
    blurb: "走得轻，答对时能量更多。",
    talent: "答对获得更多能量",
    maxHp: 38,
    attack: 7,
    heal: 8,
    block: 5,
    energyGain: 3,
    skillPower: 1.1,
    skillCostDelta: 0,
    xpBonus: 1,
    color: "#2f8f62",
  },
  {
    id: "healer",
    name: "治愈师",
    blurb: "会照顾同伴，也能照顾自己。",
    talent: "治疗更强",
    maxHp: 40,
    attack: 6,
    heal: 10,
    block: 5,
    energyGain: 2,
    skillPower: 1,
    skillCostDelta: 0,
    xpBonus: 1,
    color: "#d06a8a",
  },
  {
    id: "inventor",
    name: "发明家",
    blurb: "小机关让技能更省能量。",
    talent: "技能消耗更低",
    maxHp: 36,
    attack: 7,
    heal: 8,
    block: 5,
    energyGain: 2,
    skillPower: 1.1,
    skillCostDelta: -1,
    xpBonus: 1,
    color: "#d0892f",
  },
  {
    id: "explorer",
    name: "探险家",
    blurb: "把每场胜利都记在地图上。",
    talent: "胜利经验更多",
    maxHp: 38,
    attack: 7,
    heal: 8,
    block: 5,
    energyGain: 2,
    skillPower: 1.05,
    skillCostDelta: 0,
    xpBonus: 1.25,
    color: "#2f7ea8",
  },
];

export function classById(id: ClassId): ClassDef {
  const found = CLASSES.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown class ${id}`);
  return found;
}

export const CLASS_IDS: ClassId[] = CLASSES.map((item) => item.id);
