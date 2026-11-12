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

function sceneFile(group: SceneGroupId, kind: "map" | "battle"): string {
  if (group === "journey") return kind === "map" ? "bg_map_day.webp" : "bg_battle_day.webp";
  return kind === "map" ? "bg_map.webp" : "bg_battle.webp";
}

/** The background pair for one chapter. Forest keeps the existing warm keys. */
export function chapterBackdrop(chapterId: string): ChapterBackdrop {
  if (chapterId === FOREST_CHAPTER.chapter_id) return FOREST_BACKDROP;
  const group = CHAPTER_SCENE_GROUP[chapterId];
  if (!group) throw new Error(`No scene group for ${chapterId}`);
  return {
    groupId: group,
    mapKey: `chapter_map_${group}`,
    mapUrl: `assets/chapter/scenes/${group}/${sceneFile(group, "map")}`,
    battleKey: `chapter_battle_${group}`,
    battleUrl: `assets/chapter/scenes/${group}/${sceneFile(group, "battle")}`,
  };
}

/** Stored for later. The game does not load these. */
export function journeyNightUrls(): readonly string[] {
  return [
    "assets/chapter/scenes/journey/bg_map_night.webp",
    "assets/chapter/scenes/journey/bg_battle_night.webp",
  ];
}
