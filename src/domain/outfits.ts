export type HatKind = "leaf" | "star" | null;

export interface OutfitDef {
  id: string;
  name: string;
  description: string;
  how: string;
  cape: string | null;
  hat: HatKind;
  sash: string | null;
}

export const OUTFITS: OutfitDef[] = [
  {
    id: "traveler",
    name: "旅行短衣",
    description: "出发时就穿着的衣服，可以随时换回来。",
    how: "创建角色时就有",
    cape: null,
    hat: null,
    sash: null,
  },
  {
    id: "forest-cape",
    name: "林间斗篷",
    description: "赢下第一场词灵对战得到的斗篷。",
    how: "战胜墨团后获得",
    cape: "#1f7a4d",
    hat: "leaf",
    sash: null,
  },
  {
    id: "star-sash",
    name: "星光绶带",
    description: "收集这一章的词卡后得到的绶带。",
    how: "收集这一章的词卡后获得",
    cape: null,
    hat: "star",
    sash: "#f0b429",
  },
];

export function outfitById(id: string): OutfitDef {
  return OUTFITS.find((outfit) => outfit.id === id) ?? OUTFITS[0]!;
}
