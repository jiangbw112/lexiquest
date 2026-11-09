import spec from "./atlas-spec.json";
import { outfitById } from "../../domain/outfits";

export interface ViewSpec {
  width: number;
  height: number;
  originX: number;
  originY: number;
  frames: string[];
}

export interface AtlasSpec {
  placeholder: boolean;
  side: ViewSpec;
  top: ViewSpec;
  monster: ViewSpec;
}

export const ATLAS_SPEC = spec as AtlasSpec;

/** Back-to-front frames that should show for an outfit. Order follows the atlas spec. */
export function visibleFrames(view: "side" | "top", outfitId: string): string[] {
  const outfit = outfitById(outfitId);
  const use = new Set<string>();
  if (view === "side") {
    use.add("side/body");
    use.add("side/tunic");
    use.add("side/hair");
    use.add("side/emblem");
    if (outfit.cape) use.add("side/cape");
    if (outfit.sash) use.add("side/sash");
    if (outfit.hat === "leaf") use.add("side/hat-leaf");
    if (outfit.hat === "star") use.add("side/hat-star");
  } else {
    use.add("top/shadow");
    use.add("top/body");
    use.add("top/hair");
    if (outfit.cape) use.add("top/cape");
    if (outfit.sash) use.add("top/sash");
  }
  return ATLAS_SPEC[view].frames.filter((name) => use.has(name));
}
