/**
 * Grade-chapter bosses from integration_v1.0.2.
 * Forest stays on canopy and is not in this map.
 *
 * 好吃又健康 waits here for the scene v1.0.3 food boss.
 * Replace `PEP_G3_07_BOSS` only: id, display name, and the four frame files.
 * Other chapters keep the name in chapters_v0.2.json.
 */
const PEP_G3_07_ID = "toychest";

export const PEP_G3_07_BOSS = {
  id: PEP_G3_07_ID,
  nameZh: "玩具箱守护者",
  frames: {
    idle: `boss_${PEP_G3_07_ID}_w_idle@2x`,
    attack: `boss_${PEP_G3_07_ID}_w_attack@2x`,
    hit: `boss_${PEP_G3_07_ID}_w_hit@2x`,
    defeat: `boss_${PEP_G3_07_ID}_w_defeat@2x`,
  },
} as const;

export const PEP_G3_07_BOSS_ID = PEP_G3_07_BOSS.id;

/** The chapter file still has a boss_name_zh. This chapter does not use it. */
export function chapterBossDisplayName(chapterId: string, fileName: string): string {
  if (chapterId === "pep_g3_07") return PEP_G3_07_BOSS.nameZh;
  return fileName;
}

export const CHAPTER_BOSS_ID: Record<string, string> = {
  pep_g3_01: "family_album",
  pep_g3_08: "piggybank",
  pep_g4_05: "sleeplamp",
  pep_g3_02: "tigerkin",
  pep_g4_07: "bowlkin",
  pep_g4_08: "emptybowl",
  pep_g3_03: "duckbrush",
  pep_g3_06: "penciler",
  pep_g3_05: "giftbox",
  pep_g5_01: "smilesign",
  pep_g5_02: "weekcal",
  pep_g5_03: "lotusk",
  pep_g6_02: "sleepmoon",
  pep_g3_07: PEP_G3_07_BOSS_ID,
  pep_g4_02: "lookout",
  pep_g5_05: "turnsign",
  pep_g3_04: "envelope",
  pep_g4_01: "wreath",
  pep_g4_06: "pricetag",
  pep_g5_06: "dragonboat",
  pep_g5_07: "camelbell",
  pep_g4_03: "windsock",
  pep_g5_04: "waterfall",
  pep_g4_04: "desk",
  pep_g5_09: "travelmap",
  pep_g5_08: "bootprint",
  pep_g6_01: "starlight",
  pep_g6_03: "marble",
  pep_g6_04: "warmsun",
  pep_g6_05: "heightrod",
  pep_g6_06: "oldalbum",
};

export const CHAPTER_BOSS_POSES = ["idle", "attack", "hit", "defeat"] as const;

export type ChapterBossPose = (typeof CHAPTER_BOSS_POSES)[number];

/** Shared playback rate. Clip length follows however many frames the atlas actually has. */
export const CHAPTER_BOSS_FPS = 8;

/** On-screen height. The loaded frame's source height supplies the scale, so a same-name art swap can change pixels. */
export const CHAPTER_BOSS_DISPLAY_HEIGHT = 384;

const BOSS_IDS = new Set(Object.values(CHAPTER_BOSS_ID));

export function isChapterBossId(id: string | undefined): id is string {
  return Boolean(id && BOSS_IDS.has(id));
}

export function chapterBossId(chapterId: string): string {
  const id = CHAPTER_BOSS_ID[chapterId];
  if (!id) throw new Error(`No boss for ${chapterId}`);
  return id;
}

export function chapterBossTextureKey(bossId: string, pose: ChapterBossPose): string {
  return `boss_${bossId}_${pose}`;
}

export function chapterBossAsset(bossId: string, pose: ChapterBossPose): { imageUrl: string; dataUrl: string } {
  const file = bossId === PEP_G3_07_BOSS.id ? PEP_G3_07_BOSS.frames[pose] : `boss_${bossId}_w_${pose}@2x`;
  const dir = `assets/chapter/bosses/${bossId}`;
  return { imageUrl: `${dir}/${file}.png`, dataUrl: `${dir}/${file}.json` };
}
