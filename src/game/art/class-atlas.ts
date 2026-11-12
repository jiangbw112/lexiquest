/**
 * Six-class atlas keys for integration atlas v1.0.1.
 * PNG and sheet JSON match v1.0 byte for byte. v1.0.1 only adds dash rules.
 * The manifest stays out of the bundle (sha256 ed5d077744f8806a…).
 * Wreath placement is loaded with the wreath atlas from wreath/places.json.
 */
import { CLASS_IDS } from "../../domain/classes";
import type { ClassId } from "../../domain/types";

export const CLASS_ASSET_ROOT = "assets/classes/v1.0";
export const CLASS_SIDE_ORIGIN = { x: 0.5, y: 0.875 } as const; // foot pivot (256,448) in 512²
export const CLASS_TOP_ORIGIN = { x: 0.5, y: 1 } as const;
export const CLASS_SIDE_SCALE = 0.5; // @2x → 1 logical px

/** Sheet path for a class atlas key. Names follow cls_<id>_<view>@2x, with @1x only where a half-size sheet exists. */
export function atlasFile(key: string): { png: string; json: string } | null {
  const half = key.endsWith("@1x");
  const bare = half ? key.slice(0, -3) : key;
  if (!bare.startsWith("cls:")) return null;
  const body = bare.slice(4);
  const scale = half ? "@1x" : "@2x";
  let folder: string;
  let stem: string;
  if (body === "portraits" || body === "portraits_locked") {
    if (half) return null;
    folder = "portrait";
    stem = `cls_${body}`;
  } else if (body === "wreath") {
    folder = "wreath";
    stem = "cls_wreath";
  } else {
    const [id, view] = body.split(":");
    if (!id || (view !== "side" && view !== "top")) return null;
    if (id !== "shared" && !CLASS_IDS.includes(id as ClassId)) return null;
    folder = view;
    stem = `cls_${id}_${view}`;
  }
  const file = `${stem}${scale}`;
  return { png: `${folder}/${file}.png`, json: `${folder}/${file}.json` };
}

export type ClassView = "side" | "top" | "top@1x";

/** 每职需要的图集 key（共用外貌 + 本职）。全部懒加载。 */
export function classAtlasKeys(id: ClassId, view: ClassView): string[] {
  return [`cls:shared:${view}`, `cls:${id}:${view}`];
}

export const WREATH_ATLAS = { "@2x": "cls:wreath", "@1x": "cls:wreath@1x" } as const;
export const PORTRAIT_ATLAS = "cls:portraits";
export const PORTRAIT_LOCKED_ATLAS = "cls:portraits_locked";
export const PORTRAIT_LOCKED_FRAME = "portrait_inventor_locked";
export const portraitFrame = (id: ClassId, view: "side" | "top_s") => `portrait_${id}_${view}`;

/** animKey = `${layerPrefix}:${anim}`；frame = `${layerPrefix}_${anim}_${NN}` */
export const classAnimKey = (layerPrefix: string, anim: string) => `${layerPrefix}:${anim}`;

export const SIDE_ANIMS = {
  idle: { frameCount: 4, fps: 6, repeat: -1 },
  walk: { frameCount: 6, fps: 10, repeat: -1 },
  attack: { frameCount: 5, fps: 12, repeat: 0 },
  hit: { frameCount: 2, fps: 8, repeat: 0 },
  victory: { frameCount: 4, fps: 8, repeat: 0 },
  dash: { frameCount: 1, fps: 1, repeat: -1 },
} as const;
export const TOP_ANIMS = {
  idle: { frameCount: 1, fps: 1, repeat: -1 },
  walk: { frameCount: 6, fps: 10, repeat: -1 },
} as const;

export type DashMove = "dashToEnemy" | "stepThird";
export interface DashRule {
  attack: DashMove;
  stepFraction?: number;
  firesProjectile: boolean;
  projectileHint?: "orb" | "arrow" | "lightDot" | "gear";
  heal?: "stay";
}
/** Attack step from integration atlas v1.0.1. Inventor steps a third, then fires a gear. */
export const DASH_RULES: Record<ClassId, DashRule> = {
  warrior: { attack: "dashToEnemy", firesProjectile: false },
  explorer: { attack: "dashToEnemy", firesProjectile: false },
  mage: { attack: "stepThird", stepFraction: 1 / 3, firesProjectile: true, projectileHint: "orb" },
  ranger: { attack: "stepThird", stepFraction: 1 / 3, firesProjectile: true, projectileHint: "arrow" },
  healer: { attack: "stepThird", stepFraction: 1 / 3, firesProjectile: true, projectileHint: "lightDot", heal: "stay" },
  inventor: { attack: "stepThird", stepFraction: 1 / 3, firesProjectile: true, projectileHint: "gear" },
};

/** P-4：帽子是否隐藏 hair_top / hairTop */
export const HIDES_HAIR_TOP: Record<ClassId, boolean> = {"mage": true, "ranger": false, "healer": true, "inventor": true, "explorer": true, "warrior": false};

/** P-7：戴花环时要隐藏的层（只有战士的盔缨） */
export const WREATH_HIDES: Record<ClassId, readonly string[]> = {
  warrior: ["outfit_head_plume", "outfitHeadPlume"], mage: [], ranger: [], healer: [], inventor: [], explorer: [],
};

/** 侧视层序（back→front），每职。attack 时 *Cls 手臂变体替换共用 body_back/body_front。 */
export const SIDE_LAYERS: Record<ClassId, readonly { id: string; slot: string; z: number; texture: string; replaces?: string; onlyDuring?: readonly string[] }[]> = {
  warrior: [
    { id: "char_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:side" },
    { id: "char_fx_speed_e", slot: "fx_speed", z: 1, texture: "cls:shared:side" },
    { id: "char_warrior_back_e", slot: "back", z: 5, texture: "cls:warrior:side" },
    { id: "char_warrior_handMain_e", slot: "hand_main", z: 10, texture: "cls:warrior:side" },
    { id: "char_heroA_bodyBack_e", slot: "body_back", z: 20, texture: "cls:shared:side" },
    { id: "char_heroA_bodyBackWarrior_e", slot: "body_back", z: 20, texture: "cls:warrior:side", replaces: "char_heroA_bodyBack_e", onlyDuring: ["attack"] },
    { id: "char_warrior_outfitBack_e", slot: "outfit_back", z: 25, texture: "cls:warrior:side" },
    { id: "char_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:side" },
    { id: "char_warrior_outfitBody_e", slot: "outfit_body", z: 40, texture: "cls:warrior:side" },
    { id: "char_warrior_waist_e", slot: "waist", z: 45, texture: "cls:warrior:side" },
    { id: "char_warrior_backFront_e", slot: "back_front", z: 46, texture: "cls:warrior:side" },
    { id: "char_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:side" },
    { id: "char_warrior_outfitHeadPlume_e", slot: "outfit_head_plume", z: 59, texture: "cls:warrior:side" },
    { id: "char_warrior_outfitHeadNoPlume_e", slot: "outfit_head_noplume", z: 60, texture: "cls:warrior:side" },
    { id: "char_heroA_bodyFront_e", slot: "body_front", z: 70, texture: "cls:shared:side" },
    { id: "char_heroA_bodyFrontWarrior_e", slot: "body_front", z: 70, texture: "cls:warrior:side", replaces: "char_heroA_bodyFront_e", onlyDuring: ["attack"] },
    { id: "char_warrior_outfitFront_e", slot: "outfit_front", z: 75, texture: "cls:warrior:side" },
    { id: "char_warrior_handOff_e", slot: "hand_off", z: 80, texture: "cls:warrior:side" },
  ],
  mage: [
    { id: "char_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:side" },
    { id: "char_fx_speed_e", slot: "fx_speed", z: 1, texture: "cls:shared:side" },
    { id: "char_mage_handMain_e", slot: "hand_main", z: 10, texture: "cls:mage:side" },
    { id: "char_heroA_bodyBack_e", slot: "body_back", z: 20, texture: "cls:shared:side" },
    { id: "char_heroA_bodyBackMage_e", slot: "body_back", z: 20, texture: "cls:mage:side", replaces: "char_heroA_bodyBack_e", onlyDuring: ["attack"] },
    { id: "char_mage_outfitBack_e", slot: "outfit_back", z: 25, texture: "cls:mage:side" },
    { id: "char_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:side" },
    { id: "char_mage_outfitBody_e", slot: "outfit_body", z: 40, texture: "cls:mage:side" },
    { id: "char_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:side" },
    { id: "char_mage_outfitHead_e", slot: "outfit_head", z: 60, texture: "cls:mage:side" },
    { id: "char_heroA_bodyFront_e", slot: "body_front", z: 70, texture: "cls:shared:side" },
    { id: "char_heroA_bodyFrontMage_e", slot: "body_front", z: 70, texture: "cls:mage:side", replaces: "char_heroA_bodyFront_e", onlyDuring: ["attack"] },
    { id: "char_mage_outfitFront_e", slot: "outfit_front", z: 75, texture: "cls:mage:side" },
  ],
  ranger: [
    { id: "char_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:side" },
    { id: "char_fx_speed_e", slot: "fx_speed", z: 1, texture: "cls:shared:side" },
    { id: "char_ranger_back_e", slot: "back", z: 5, texture: "cls:ranger:side" },
    { id: "char_heroA_bodyBack_e", slot: "body_back", z: 20, texture: "cls:shared:side" },
    { id: "char_heroA_bodyBackRanger_e", slot: "body_back", z: 20, texture: "cls:ranger:side", replaces: "char_heroA_bodyBack_e", onlyDuring: ["attack"] },
    { id: "char_ranger_outfitBack_e", slot: "outfit_back", z: 25, texture: "cls:ranger:side" },
    { id: "char_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:side" },
    { id: "char_ranger_outfitBody_e", slot: "outfit_body", z: 40, texture: "cls:ranger:side" },
    { id: "char_ranger_backFront_e", slot: "back_front", z: 46, texture: "cls:ranger:side" },
    { id: "char_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:side" },
    { id: "char_ranger_outfitHead_e", slot: "outfit_head", z: 60, texture: "cls:ranger:side" },
    { id: "char_heroA_bodyFront_e", slot: "body_front", z: 70, texture: "cls:shared:side" },
    { id: "char_heroA_bodyFrontRanger_e", slot: "body_front", z: 70, texture: "cls:ranger:side", replaces: "char_heroA_bodyFront_e", onlyDuring: ["attack"] },
    { id: "char_ranger_outfitFront_e", slot: "outfit_front", z: 75, texture: "cls:ranger:side" },
    { id: "char_ranger_handOff_e", slot: "hand_off", z: 80, texture: "cls:ranger:side" },
  ],
  healer: [
    { id: "char_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:side" },
    { id: "char_fx_speed_e", slot: "fx_speed", z: 1, texture: "cls:shared:side" },
    { id: "char_heroA_bodyBack_e", slot: "body_back", z: 20, texture: "cls:shared:side" },
    { id: "char_heroA_bodyBackHealer_e", slot: "body_back", z: 20, texture: "cls:healer:side", replaces: "char_heroA_bodyBack_e", onlyDuring: ["attack"] },
    { id: "char_healer_outfitBack_e", slot: "outfit_back", z: 25, texture: "cls:healer:side" },
    { id: "char_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:side" },
    { id: "char_healer_outfitBody_e", slot: "outfit_body", z: 40, texture: "cls:healer:side" },
    { id: "char_healer_waist_e", slot: "waist", z: 45, texture: "cls:healer:side" },
    { id: "char_healer_backFront_e", slot: "back_front", z: 46, texture: "cls:healer:side" },
    { id: "char_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:side" },
    { id: "char_healer_outfitHead_e", slot: "outfit_head", z: 60, texture: "cls:healer:side" },
    { id: "char_heroA_bodyFront_e", slot: "body_front", z: 70, texture: "cls:shared:side" },
    { id: "char_heroA_bodyFrontHealer_e", slot: "body_front", z: 70, texture: "cls:healer:side", replaces: "char_heroA_bodyFront_e", onlyDuring: ["attack"] },
    { id: "char_healer_outfitFront_e", slot: "outfit_front", z: 75, texture: "cls:healer:side" },
    { id: "char_healer_handOff_e", slot: "hand_off", z: 80, texture: "cls:healer:side" },
  ],
  inventor: [
    { id: "char_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:side" },
    { id: "char_fx_speed_e", slot: "fx_speed", z: 1, texture: "cls:shared:side" },
    { id: "char_heroA_bodyBack_e", slot: "body_back", z: 20, texture: "cls:shared:side" },
    { id: "char_heroA_bodyBackInventor_e", slot: "body_back", z: 20, texture: "cls:inventor:side", replaces: "char_heroA_bodyBack_e", onlyDuring: ["attack"] },
    { id: "char_inventor_outfitBack_e", slot: "outfit_back", z: 25, texture: "cls:inventor:side" },
    { id: "char_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:side" },
    { id: "char_inventor_outfitBody_e", slot: "outfit_body", z: 40, texture: "cls:inventor:side" },
    { id: "char_inventor_waist_e", slot: "waist", z: 45, texture: "cls:inventor:side" },
    { id: "char_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:side" },
    { id: "char_inventor_outfitHead_e", slot: "outfit_head", z: 60, texture: "cls:inventor:side" },
    { id: "char_heroA_bodyFront_e", slot: "body_front", z: 70, texture: "cls:shared:side" },
    { id: "char_heroA_bodyFrontInventor_e", slot: "body_front", z: 70, texture: "cls:inventor:side", replaces: "char_heroA_bodyFront_e", onlyDuring: ["attack"] },
    { id: "char_inventor_outfitFront_e", slot: "outfit_front", z: 75, texture: "cls:inventor:side" },
    { id: "char_inventor_handOff_e", slot: "hand_off", z: 80, texture: "cls:inventor:side" },
  ],
  explorer: [
    { id: "char_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:side" },
    { id: "char_fx_speed_e", slot: "fx_speed", z: 1, texture: "cls:shared:side" },
    { id: "char_explorer_back_e", slot: "back", z: 5, texture: "cls:explorer:side" },
    { id: "char_explorer_handMain_e", slot: "hand_main", z: 10, texture: "cls:explorer:side" },
    { id: "char_heroA_bodyBack_e", slot: "body_back", z: 20, texture: "cls:shared:side" },
    { id: "char_heroA_bodyBackExplorer_e", slot: "body_back", z: 20, texture: "cls:explorer:side", replaces: "char_heroA_bodyBack_e", onlyDuring: ["attack"] },
    { id: "char_explorer_outfitBack_e", slot: "outfit_back", z: 25, texture: "cls:explorer:side" },
    { id: "char_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:side" },
    { id: "char_explorer_outfitBody_e", slot: "outfit_body", z: 40, texture: "cls:explorer:side" },
    { id: "char_explorer_backFront_e", slot: "back_front", z: 46, texture: "cls:explorer:side" },
    { id: "char_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:side" },
    { id: "char_explorer_outfitHead_e", slot: "outfit_head", z: 60, texture: "cls:explorer:side" },
    { id: "char_heroA_bodyFront_e", slot: "body_front", z: 70, texture: "cls:shared:side" },
    { id: "char_heroA_bodyFrontExplorer_e", slot: "body_front", z: 70, texture: "cls:explorer:side", replaces: "char_heroA_bodyFront_e", onlyDuring: ["attack"] },
    { id: "char_explorer_outfitFront_e", slot: "outfit_front", z: 75, texture: "cls:explorer:side" },
  ],
};

/** 俯视层（每职每向），z 按方向；w = e 镜像（scaleX = -1）。 */
export const TOP_LAYERS: Record<ClassId, Record<"s" | "n" | "e", readonly { id: string; slot: string; z: number; texture: string }[]>> = {
  warrior: {
    s: [{ id: "top_heroA_shadow_s", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_warrior_back_s", slot: "back", z: 5, texture: "cls:warrior:top" }, { id: "top_warrior_handMain_s", slot: "handMain", z: 10, texture: "cls:warrior:top" }, { id: "top_heroA_body_s", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_warrior_outfit_s", slot: "outfit", z: 40, texture: "cls:warrior:top" }, { id: "top_warrior_waist_s", slot: "waist", z: 45, texture: "cls:warrior:top" }, { id: "top_heroA_hair_s", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_s", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_warrior_outfitHeadPlume_s", slot: "outfitHeadPlume", z: 58, texture: "cls:warrior:top" }, { id: "top_warrior_outfitHead_s", slot: "outfitHead", z: 60, texture: "cls:warrior:top" }, { id: "top_warrior_handOff_s", slot: "handOff", z: 80, texture: "cls:warrior:top" }],
    n: [{ id: "top_heroA_shadow_n", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_warrior_handMain_n", slot: "handMain", z: 10, texture: "cls:warrior:top" }, { id: "top_warrior_handOff_n", slot: "handOff", z: 12, texture: "cls:warrior:top" }, { id: "top_heroA_body_n", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_warrior_outfit_n", slot: "outfit", z: 40, texture: "cls:warrior:top" }, { id: "top_warrior_back_n", slot: "back", z: 49, texture: "cls:warrior:top" }, { id: "top_heroA_hair_n", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_n", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_warrior_outfitHead_n", slot: "outfitHead", z: 60, texture: "cls:warrior:top" }, { id: "top_warrior_outfitHeadPlume_n", slot: "outfitHeadPlume", z: 61, texture: "cls:warrior:top" }],
    e: [{ id: "top_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_warrior_back_e", slot: "back", z: 5, texture: "cls:warrior:top" }, { id: "top_warrior_handMain_e", slot: "handMain", z: 10, texture: "cls:warrior:top" }, { id: "top_heroA_bodyBack_e", slot: "bodyBack", z: 20, texture: "cls:shared:top" }, { id: "top_warrior_outfitBack_e", slot: "outfitBack", z: 25, texture: "cls:warrior:top" }, { id: "top_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_warrior_outfit_e", slot: "outfit", z: 40, texture: "cls:warrior:top" }, { id: "top_warrior_waist_e", slot: "waist", z: 45, texture: "cls:warrior:top" }, { id: "top_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_warrior_outfitHeadPlume_e", slot: "outfitHeadPlume", z: 59, texture: "cls:warrior:top" }, { id: "top_warrior_outfitHead_e", slot: "outfitHead", z: 60, texture: "cls:warrior:top" }, { id: "top_heroA_bodyFront_e", slot: "bodyFront", z: 70, texture: "cls:shared:top" }, { id: "top_warrior_outfitFront_e", slot: "outfitFront", z: 75, texture: "cls:warrior:top" }, { id: "top_warrior_handOff_e", slot: "handOff", z: 80, texture: "cls:warrior:top" }],
  },
  mage: {
    s: [{ id: "top_heroA_shadow_s", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_mage_handMain_s", slot: "handMain", z: 10, texture: "cls:mage:top" }, { id: "top_heroA_body_s", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_mage_outfit_s", slot: "outfit", z: 40, texture: "cls:mage:top" }, { id: "top_heroA_hair_s", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_s", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_mage_outfitHead_s", slot: "outfitHead", z: 60, texture: "cls:mage:top" }],
    n: [{ id: "top_heroA_shadow_n", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_mage_handMain_n", slot: "handMain", z: 10, texture: "cls:mage:top" }, { id: "top_heroA_body_n", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_mage_outfit_n", slot: "outfit", z: 40, texture: "cls:mage:top" }, { id: "top_heroA_hair_n", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_n", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_mage_outfitHead_n", slot: "outfitHead", z: 60, texture: "cls:mage:top" }],
    e: [{ id: "top_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_mage_handMain_e", slot: "handMain", z: 10, texture: "cls:mage:top" }, { id: "top_heroA_bodyBack_e", slot: "bodyBack", z: 20, texture: "cls:shared:top" }, { id: "top_mage_outfitBack_e", slot: "outfitBack", z: 25, texture: "cls:mage:top" }, { id: "top_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_mage_outfit_e", slot: "outfit", z: 40, texture: "cls:mage:top" }, { id: "top_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_mage_outfitHead_e", slot: "outfitHead", z: 60, texture: "cls:mage:top" }, { id: "top_heroA_bodyFront_e", slot: "bodyFront", z: 70, texture: "cls:shared:top" }, { id: "top_mage_outfitFront_e", slot: "outfitFront", z: 75, texture: "cls:mage:top" }],
  },
  ranger: {
    s: [{ id: "top_heroA_shadow_s", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_ranger_back_s", slot: "back", z: 5, texture: "cls:ranger:top" }, { id: "top_heroA_body_s", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_ranger_outfit_s", slot: "outfit", z: 40, texture: "cls:ranger:top" }, { id: "top_ranger_backFront_s", slot: "back_front", z: 46, texture: "cls:ranger:top" }, { id: "top_heroA_hair_s", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_s", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_ranger_outfitHead_s", slot: "outfitHead", z: 60, texture: "cls:ranger:top" }, { id: "top_ranger_handOff_s", slot: "handOff", z: 80, texture: "cls:ranger:top" }],
    n: [{ id: "top_heroA_shadow_n", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_ranger_handOff_n", slot: "handOff", z: 12, texture: "cls:ranger:top" }, { id: "top_heroA_body_n", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_ranger_outfit_n", slot: "outfit", z: 40, texture: "cls:ranger:top" }, { id: "top_ranger_back_n", slot: "back", z: 49, texture: "cls:ranger:top" }, { id: "top_heroA_hair_n", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_n", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_ranger_outfitHead_n", slot: "outfitHead", z: 60, texture: "cls:ranger:top" }],
    e: [{ id: "top_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_ranger_back_e", slot: "back", z: 5, texture: "cls:ranger:top" }, { id: "top_heroA_bodyBack_e", slot: "bodyBack", z: 20, texture: "cls:shared:top" }, { id: "top_ranger_outfitBack_e", slot: "outfitBack", z: 25, texture: "cls:ranger:top" }, { id: "top_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_ranger_outfit_e", slot: "outfit", z: 40, texture: "cls:ranger:top" }, { id: "top_ranger_backFront_e", slot: "back_front", z: 46, texture: "cls:ranger:top" }, { id: "top_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_ranger_outfitHead_e", slot: "outfitHead", z: 60, texture: "cls:ranger:top" }, { id: "top_heroA_bodyFront_e", slot: "bodyFront", z: 70, texture: "cls:shared:top" }, { id: "top_ranger_outfitFront_e", slot: "outfitFront", z: 75, texture: "cls:ranger:top" }, { id: "top_ranger_handOff_e", slot: "handOff", z: 80, texture: "cls:ranger:top" }],
  },
  healer: {
    s: [{ id: "top_heroA_shadow_s", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_heroA_body_s", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_healer_outfit_s", slot: "outfit", z: 40, texture: "cls:healer:top" }, { id: "top_healer_waist_s", slot: "waist", z: 45, texture: "cls:healer:top" }, { id: "top_healer_backFront_s", slot: "back_front", z: 46, texture: "cls:healer:top" }, { id: "top_heroA_hair_s", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_s", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_healer_outfitHead_s", slot: "outfitHead", z: 60, texture: "cls:healer:top" }, { id: "top_healer_handOff_s", slot: "handOff", z: 80, texture: "cls:healer:top" }],
    n: [{ id: "top_heroA_shadow_n", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_healer_handOff_n", slot: "handOff", z: 12, texture: "cls:healer:top" }, { id: "top_heroA_body_n", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_healer_outfit_n", slot: "outfit", z: 40, texture: "cls:healer:top" }, { id: "top_healer_waist_n", slot: "waist", z: 45, texture: "cls:healer:top" }, { id: "top_healer_backFront_n", slot: "back_front", z: 46, texture: "cls:healer:top" }, { id: "top_heroA_hair_n", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_n", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_healer_outfitHead_n", slot: "outfitHead", z: 60, texture: "cls:healer:top" }],
    e: [{ id: "top_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_heroA_bodyBack_e", slot: "bodyBack", z: 20, texture: "cls:shared:top" }, { id: "top_healer_outfitBack_e", slot: "outfitBack", z: 25, texture: "cls:healer:top" }, { id: "top_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_healer_outfit_e", slot: "outfit", z: 40, texture: "cls:healer:top" }, { id: "top_healer_waist_e", slot: "waist", z: 45, texture: "cls:healer:top" }, { id: "top_healer_backFront_e", slot: "back_front", z: 46, texture: "cls:healer:top" }, { id: "top_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_healer_outfitHead_e", slot: "outfitHead", z: 60, texture: "cls:healer:top" }, { id: "top_heroA_bodyFront_e", slot: "bodyFront", z: 70, texture: "cls:shared:top" }, { id: "top_healer_outfitFront_e", slot: "outfitFront", z: 75, texture: "cls:healer:top" }, { id: "top_healer_handOff_e", slot: "handOff", z: 80, texture: "cls:healer:top" }],
  },
  inventor: {
    s: [{ id: "top_heroA_shadow_s", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_heroA_body_s", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_inventor_outfit_s", slot: "outfit", z: 40, texture: "cls:inventor:top" }, { id: "top_inventor_waist_s", slot: "waist", z: 45, texture: "cls:inventor:top" }, { id: "top_heroA_hair_s", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_s", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_inventor_outfitHead_s", slot: "outfitHead", z: 60, texture: "cls:inventor:top" }, { id: "top_inventor_handOff_s", slot: "handOff", z: 80, texture: "cls:inventor:top" }],
    n: [{ id: "top_heroA_shadow_n", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_inventor_handOff_n", slot: "handOff", z: 12, texture: "cls:inventor:top" }, { id: "top_heroA_body_n", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_inventor_outfit_n", slot: "outfit", z: 40, texture: "cls:inventor:top" }, { id: "top_inventor_waist_n", slot: "waist", z: 45, texture: "cls:inventor:top" }, { id: "top_heroA_hair_n", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_n", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_inventor_outfitHead_n", slot: "outfitHead", z: 60, texture: "cls:inventor:top" }],
    e: [{ id: "top_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_heroA_bodyBack_e", slot: "bodyBack", z: 20, texture: "cls:shared:top" }, { id: "top_inventor_outfitBack_e", slot: "outfitBack", z: 25, texture: "cls:inventor:top" }, { id: "top_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_inventor_outfit_e", slot: "outfit", z: 40, texture: "cls:inventor:top" }, { id: "top_inventor_waist_e", slot: "waist", z: 45, texture: "cls:inventor:top" }, { id: "top_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_inventor_outfitHead_e", slot: "outfitHead", z: 60, texture: "cls:inventor:top" }, { id: "top_heroA_bodyFront_e", slot: "bodyFront", z: 70, texture: "cls:shared:top" }, { id: "top_inventor_outfitFront_e", slot: "outfitFront", z: 75, texture: "cls:inventor:top" }, { id: "top_inventor_handOff_e", slot: "handOff", z: 80, texture: "cls:inventor:top" }],
  },
  explorer: {
    s: [{ id: "top_heroA_shadow_s", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_explorer_back_s", slot: "back", z: 5, texture: "cls:explorer:top" }, { id: "top_explorer_handMain_s", slot: "handMain", z: 10, texture: "cls:explorer:top" }, { id: "top_heroA_body_s", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_explorer_outfit_s", slot: "outfit", z: 40, texture: "cls:explorer:top" }, { id: "top_explorer_backFront_s", slot: "back_front", z: 46, texture: "cls:explorer:top" }, { id: "top_heroA_hair_s", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_s", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_explorer_outfitHead_s", slot: "outfitHead", z: 60, texture: "cls:explorer:top" }],
    n: [{ id: "top_heroA_shadow_n", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_explorer_handMain_n", slot: "handMain", z: 10, texture: "cls:explorer:top" }, { id: "top_heroA_body_n", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_explorer_outfit_n", slot: "outfit", z: 40, texture: "cls:explorer:top" }, { id: "top_explorer_back_n", slot: "back", z: 49, texture: "cls:explorer:top" }, { id: "top_heroA_hair_n", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_heroA_hairTop_n", slot: "hairTop", z: 52, texture: "cls:shared:top" }, { id: "top_explorer_outfitHead_n", slot: "outfitHead", z: 60, texture: "cls:explorer:top" }],
    e: [{ id: "top_heroA_shadow_e", slot: "shadow", z: 0, texture: "cls:shared:top" }, { id: "top_explorer_back_e", slot: "back", z: 5, texture: "cls:explorer:top" }, { id: "top_explorer_handMain_e", slot: "handMain", z: 10, texture: "cls:explorer:top" }, { id: "top_heroA_bodyBack_e", slot: "bodyBack", z: 20, texture: "cls:shared:top" }, { id: "top_explorer_outfitBack_e", slot: "outfitBack", z: 25, texture: "cls:explorer:top" }, { id: "top_heroA_body_e", slot: "body", z: 30, texture: "cls:shared:top" }, { id: "top_explorer_outfit_e", slot: "outfit", z: 40, texture: "cls:explorer:top" }, { id: "top_explorer_backFront_e", slot: "back_front", z: 46, texture: "cls:explorer:top" }, { id: "top_heroA_hair_e", slot: "hair", z: 50, texture: "cls:shared:top" }, { id: "top_explorer_outfitHead_e", slot: "outfitHead", z: 60, texture: "cls:explorer:top" }, { id: "top_heroA_bodyFront_e", slot: "bodyFront", z: 70, texture: "cls:shared:top" }, { id: "top_explorer_outfitFront_e", slot: "outfitFront", z: 75, texture: "cls:explorer:top" }],
  },
};

export type SideLayer = (typeof SIDE_LAYERS)[ClassId][number];
export type TopLayer = (typeof TOP_LAYERS)[ClassId]["s"][number];
export type ClassSideAnim = keyof typeof SIDE_ANIMS;
export type ClassTopAnim = keyof typeof TOP_ANIMS;
export type TopCardinal = "s" | "n" | "e";
export type TopFacing = TopCardinal | "w";

/** Side-view depths added with the v1.0 slot table. */
export const CLASS_EXTRA_SLOT_Z = {
  fx_speed: 1,
  hair_back: 3,
  waist: 45,
  back_front: 46,
  hair_top: 52,
  cosmetic_head_back: 57,
  outfit_head_plume: 59,
  outfit_head_noplume: 60,
} as const;

export function classAssetPath(id: ClassId, view: ClassView): string {
  const file = atlasFile(`cls:${id}:${view}`);
  if (!file) throw new Error(`missing atlas cls:${id}:${view}`);
  return `${CLASS_ASSET_ROOT}/${file.png}`;
}

/** West uses the east sheet, mirrored. */
export function topFacing(dir: TopFacing): { dir: TopCardinal; flipX: boolean } {
  if (dir === "w") return { dir: "e", flipX: true };
  return { dir, flipX: false };
}

export function directionFromDelta(dx: number, dy: number): TopFacing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "w" : "e";
  return dy < 0 ? "n" : "s";
}

/** Shared body layers are listed on every class. Count each anim key once. */
export function animsForSideLayer(layer: { slot: string; onlyDuring?: readonly string[] }): ClassSideAnim[] {
  if (layer.slot === "fx_speed") return ["dash"];
  if (layer.onlyDuring) return [...layer.onlyDuring] as ClassSideAnim[];
  return ["idle", "walk", "attack", "hit", "victory", "dash"];
}

export function countClassAnimKeys(): number {
  const keys = new Set<string>();
  for (const layers of Object.values(SIDE_LAYERS)) {
    for (const layer of layers) {
      for (const anim of animsForSideLayer(layer)) keys.add(classAnimKey(layer.id, anim));
    }
  }
  for (const byDir of Object.values(TOP_LAYERS)) {
    for (const layers of Object.values(byDir)) {
      for (const layer of layers) {
        keys.add(classAnimKey(layer.id, "idle"));
        keys.add(classAnimKey(layer.id, "walk"));
      }
    }
  }
  return keys.size;
}

export function sideFrameName(layerId: string, anim: string, index: number): string {
  return `${layerId}_${anim}_${String(index).padStart(2, "0")}`;
}
