import type { Appearance, EyeStyle, HairStyle } from "./types";

export interface Swatch {
  id: string;
  label: string;
  color: string;
}

export const SKINS: Swatch[] = [
  { id: "sand", label: "暖米", color: "#f6d3b0" },
  { id: "peach", label: "杏子", color: "#f3bc96" },
  { id: "amber", label: "蜂蜜", color: "#e0a36a" },
  { id: "copper", label: "铜棕", color: "#c68658" },
  { id: "bronze", label: "秋棕", color: "#8d5a3c" },
  { id: "earth", label: "深棕", color: "#5c3a2e" },
];

export const HAIR_COLORS: Swatch[] = [
  { id: "ink", label: "墨黑", color: "#241c1a" },
  { id: "brown", label: "栗色", color: "#6b3e2e" },
  { id: "auburn", label: "赤褐", color: "#a34b32" },
  { id: "honey", label: "蜜金", color: "#e0b15a" },
  { id: "dusk", label: "夜蓝", color: "#2c3e73" },
  { id: "leaf", label: "松绿", color: "#2f6b4f" },
];

export const CLOTH_COLORS: Swatch[] = [
  { id: "fern", label: "林绿", color: "#2f8f62" },
  { id: "sea", label: "海蓝", color: "#2f6f9f" },
  { id: "clay", label: "陶土", color: "#d06a45" },
  { id: "plum", label: "梅紫", color: "#7d5ea8" },
  { id: "sun", label: "向日葵", color: "#e2a325" },
  { id: "inkblue", label: "墨蓝", color: "#31415f" },
];

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: "short", label: "短发" },
  { id: "bob", label: "齐耳" },
  { id: "ponytail", label: "马尾" },
  { id: "curly", label: "卷发" },
  { id: "bun", label: "丸子" },
  { id: "spiky", label: "冲天" },
];

export const EYE_STYLES: { id: EyeStyle; label: string }[] = [
  { id: "round", label: "圆眼" },
  { id: "bright", label: "亮眼" },
  { id: "calm", label: "细眼" },
];

export const DEFAULT_APPEARANCE: Appearance = {
  skinId: "peach",
  hairStyle: "bob",
  hairColorId: "brown",
  eyeStyle: "bright",
  clothColorId: "fern",
  glasses: false,
  freckles: true,
};

export function swatchColor(list: Swatch[], id: string, fallback: string): string {
  return list.find((item) => item.id === id)?.color ?? fallback;
}

export function isAppearance(value: unknown): value is Appearance {
  if (typeof value !== "object" || value === null) return false;
  const look = value as Appearance;
  return (
    SKINS.some((item) => item.id === look.skinId) &&
    HAIR_COLORS.some((item) => item.id === look.hairColorId) &&
    CLOTH_COLORS.some((item) => item.id === look.clothColorId) &&
    HAIR_STYLES.some((item) => item.id === look.hairStyle) &&
    EYE_STYLES.some((item) => item.id === look.eyeStyle) &&
    typeof look.glasses === "boolean" &&
    typeof look.freckles === "boolean"
  );
}

export function randomAppearance(seed: number): Appearance {
  const pick = <T,>(items: readonly T[], salt: number): T =>
    items[Math.abs(seed + salt) % items.length] as T;
  return {
    skinId: pick(SKINS, 3).id,
    hairStyle: pick(HAIR_STYLES, 7).id,
    hairColorId: pick(HAIR_COLORS, 11).id,
    eyeStyle: pick(EYE_STYLES, 13).id,
    clothColorId: pick(CLOTH_COLORS, 17).id,
    glasses: seed % 2 === 0,
    freckles: seed % 3 !== 0,
  };
}

export function sanitizeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 12) return null;
  for (let index = 0; index < name.length; index += 1) {
    if (name.charCodeAt(index) < 32) return null;
  }
  return name;
}
