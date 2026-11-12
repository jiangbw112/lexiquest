import type { ClassId } from "./types";

/** Present only on a hidden class. 1.0.0 stores it and does not read it. */
export interface ClassUnlockSpec {
  type: "firstClearFinalBoss";
  status: "reserved" | "enabled";
  enabledInVersion: string;
  enabledIn100: false;
}

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
  hidden?: boolean;
  unlock?: ClassUnlockSpec;
}

/** MVP combat tuning. Not the unapproved badge or speed numbers. */
export const CLASSES: ClassDef[] = [
  {
    id: "warrior",
    name: "战士",
    blurb: "冲到前面，边打边挡。",
    talent: "攻击和格挡更强",
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
    maxHp: 46,
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
    blurb: "脚步轻快，能量来得快。",
    talent: "答对能量多，每场能换一次牌",
    maxHp: 46,
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
    maxHp: 46,
    attack: 7,
    heal: 8,
    block: 5,
    energyGain: 2,
    skillPower: 1.1,
    skillCostDelta: -1,
    xpBonus: 1,
    color: "#d0892f",
    hidden: true,
    unlock: {
      type: "firstClearFinalBoss",
      status: "reserved",
      enabledInVersion: "finalBossRelease",
      enabledIn100: false,
    },
  },
  {
    id: "explorer",
    name: "探险家",
    blurb: "先看清前面的路，再出手。",
    talent: "能先看到下一题考什么",
    maxHp: 46,
    attack: 7,
    heal: 8,
    block: 5,
    energyGain: 2,
    skillPower: 1.05,
    skillCostDelta: 0,
    xpBonus: 1,
    color: "#2f7ea8",
  },
];

export function classById(id: ClassId): ClassDef {
  const found = CLASSES.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown class ${id}`);
  return found;
}

export const CLASS_IDS: ClassId[] = CLASSES.map((item) => item.id);
