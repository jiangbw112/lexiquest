import type { Appearance } from "../domain/types";

/** Default look for a new hero. The class is chosen on the create screen. */
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
