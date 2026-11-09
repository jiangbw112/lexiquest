import type { Appearance } from "../domain/types";

/** The only painted hero in this chapter. Other classes stay in the domain model. */
export const P0_CLASS_ID = "warrior" as const;

export const P0_APPEARANCE: Appearance = {
  skinId: "peach",
  hairStyle: "ponytail",
  hairColorId: "brown",
  eyeStyle: "bright",
  clothColorId: "fern",
  glasses: false,
  freckles: true,
};

export const P0_NOTE = "这一章只能当战士。外形是暂定 v0.1，探险家和其他样子以后再加。";
export const PLACEHOLDER_NOTE = "占位图 PLACEHOLDER";
export const WARRIOR_ART_NOTE = "战士外形 · 暂定 v0.1";
export const DESKTOP_NOTE = "桌面浏览器 · 鼠标和键盘";
