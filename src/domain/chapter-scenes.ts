import { FOREST_CHAPTER } from "./stages";

/** Scene groups from integration_v1.0. Forest is not one of them. */
export const SCENE_GROUP_IDS = ["home", "animals", "farm", "school", "food", "town", "weather", "journey"] as const;

export type SceneGroupId = (typeof SCENE_GROUP_IDS)[number];

/**
 * Grade chapter id to scene group. Journey uses the day art.
 * The night files are in the repo and are not listed here.
 */
export const CHAPTER_SCENE_GROUP: Record<string, SceneGroupId> = {
  pep_g3_01: "home",
  pep_g3_08: "home",
  pep_g4_05: "home",
  pep_g3_02: "animals",
  pep_g4_07: "farm",
  pep_g4_08: "farm",
  pep_g3_03: "farm",
  pep_g3_06: "school",
  pep_g3_05: "school",
  pep_g5_01: "school",
  pep_g5_02: "school",
  pep_g5_03: "food",
  pep_g6_02: "food",
  pep_g3_07: "food",
  pep_g4_02: "town",
  pep_g5_05: "town",
  pep_g3_04: "town",
  pep_g4_01: "town",
  pep_g4_06: "town",
  pep_g5_06: "town",
  pep_g5_07: "weather",
  pep_g4_03: "weather",
  pep_g5_04: "weather",
  pep_g4_04: "weather",
  pep_g5_09: "journey",
  pep_g5_08: "journey",
  pep_g6_01: "journey",
  pep_g6_03: "journey",
  pep_g6_04: "journey",
  pep_g6_05: "journey",
  pep_g6_06: "journey",
};

export interface ChapterBackdrop {
  groupId: SceneGroupId | "forest";
  mapKey: string;
  mapUrl: string;
  battleKey: string;
  battleUrl: string;
}

const FOREST_BACKDROP: ChapterBackdrop = {
  groupId: "forest",
  mapKey: "bg_map",
  mapUrl: "assets/warm/backgrounds/bg_map_forest_2x.webp",
  battleKey: "bg_forest",
  battleUrl: "assets/warm/backgrounds/bg_forest_battle_2x.webp",
};

/**
 * K35, Haru 18:56. Only pep_g6_01 uses the journey night set.
 * pep_g6_03, pep_g6_04, pep_g5_08, pep_g5_09, pep_g6_05, and pep_g6_06 stay on the day set.
 */
export const JOURNEY_NIGHT_CHAPTERS = ["pep_g6_01"] as const;

function sceneFile(group: SceneGroupId, kind: "map" | "battle", night: boolean): string {
  if (group === "journey") {
    if (night) return kind === "map" ? "bg_map_night.webp" : "bg_battle_night.webp";
    return kind === "map" ? "bg_map_day.webp" : "bg_battle_day.webp";
  }
  return kind === "map" ? "bg_map.webp" : "bg_battle.webp";
}

/** The background pair for one chapter. Forest keeps the existing warm keys. */
export function chapterBackdrop(chapterId: string): ChapterBackdrop {
  if (chapterId === FOREST_CHAPTER.chapter_id) return FOREST_BACKDROP;
  const group = CHAPTER_SCENE_GROUP[chapterId];
  if (!group) throw new Error(`No scene group for ${chapterId}`);
  const night = (JOURNEY_NIGHT_CHAPTERS as readonly string[]).includes(chapterId);
  const variant = group === "journey" ? (night ? "night" : "day") : "";
  return {
    groupId: group,
    mapKey: variant ? `chapter_map_${group}_${variant}` : `chapter_map_${group}`,
    mapUrl: `assets/chapter/scenes/${group}/${sceneFile(group, "map", night)}`,
    battleKey: variant ? `chapter_battle_${group}_${variant}` : `chapter_battle_${group}`,
    battleUrl: `assets/chapter/scenes/${group}/${sceneFile(group, "battle", night)}`,
  };
}

/** Journey night files. Only pep_g6_01 loads them. */
export function journeyNightUrls(): readonly string[] {
  return [
    "assets/chapter/scenes/journey/bg_map_night.webp",
    "assets/chapter/scenes/journey/bg_battle_night.webp",
  ];
}

/** Grade chapter id to the manifest minion. Forest is not in this map. */
export const CHAPTER_MINION_ID: Record<string, string> = {
  pep_g3_01: "cushion",
  pep_g3_08: "cushion",
  pep_g4_05: "cushion",
  pep_g3_02: "pawlet",
  pep_g4_07: "sprout",
  pep_g4_08: "sprout",
  pep_g3_03: "sprout",
  pep_g3_06: "rubkin",
  pep_g3_05: "rubkin",
  pep_g5_01: "rubkin",
  pep_g5_02: "rubkin",
  pep_g5_03: "steam",
  pep_g6_02: "steam",
  pep_g3_07: "steam",
  pep_g4_02: "lampkin",
  pep_g5_05: "lampkin",
  pep_g3_04: "lampkin",
  pep_g4_01: "lampkin",
  pep_g4_06: "lampkin",
  pep_g5_06: "lampkin",
  pep_g5_07: "leafkin",
  pep_g4_03: "leafkin",
  pep_g5_04: "leafkin",
  pep_g4_04: "leafkin",
  pep_g5_09: "knapsack",
  pep_g5_08: "knapsack",
  pep_g6_01: "knapsack",
  pep_g6_03: "knapsack",
  pep_g6_04: "knapsack",
  pep_g6_05: "knapsack",
  pep_g6_06: "knapsack",
};

const MINION_ATLAS: Record<string, "atlas_monsters_scenes" | "atlas_monsters_scenes_2"> = {
  cushion: "atlas_monsters_scenes",
  pawlet: "atlas_monsters_scenes",
  sprout: "atlas_monsters_scenes",
  rubkin: "atlas_monsters_scenes",
  steam: "atlas_monsters_scenes",
  lampkin: "atlas_monsters_scenes",
  leafkin: "atlas_monsters_scenes_2",
  knapsack: "atlas_monsters_scenes_2",
};

/**
 * Display names. sprout, steam, and lampkin were still 待定 in the manifest.
 * Those three use the names given for this pass.
 */
const MINION_NAME: Record<string, string> = {
  cushion: "抱枕灵",
  pawlet: "爪爪灵",
  sprout: "芽芽灵",
  rubkin: "橡皮灵",
  steam: "热气灵",
  lampkin: "路灯灵",
  leafkin: "风叶灵",
  knapsack: "行囊灵",
};

export interface ChapterMinion {
  id: string;
  name: string;
  atlasKey: string;
  imageUrl: string;
  dataUrl: string;
  idleFrame: string;
  hitFrame: string;
}

const FOREST_MINION: ChapterMinion = {
  id: "inkling",
  name: "",
  atlasKey: "atlas_monsters",
  imageUrl: "assets/warm/atlas/atlas_monsters.png",
  dataUrl: "assets/warm/atlas/atlas_monsters.json",
  idleFrame: "monster_inkling_idle",
  hitFrame: "monster_inkling_hit",
};

/** The minion for one chapter. Forest keeps inkling on the warm atlas. */
export function chapterMinion(chapterId: string): ChapterMinion {
  if (chapterId === FOREST_CHAPTER.chapter_id) return FOREST_MINION;
  const id = CHAPTER_MINION_ID[chapterId];
  const atlas = id ? MINION_ATLAS[id] : undefined;
  if (!id || !atlas) throw new Error(`No minion for ${chapterId}`);
  const name = MINION_NAME[id];
  if (!name) throw new Error(`No minion name for ${id}`);
  return {
    id,
    name,
    atlasKey: atlas,
    imageUrl: `assets/chapter/scenes/minions/${atlas}.png`,
    dataUrl: `assets/chapter/scenes/minions/${atlas}.json`,
    idleFrame: `monster_${id}_idle`,
    hitFrame: `monster_${id}_hit`,
  };
}
