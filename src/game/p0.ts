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

export const P0_NOTE = "这一章只能当战士。";
