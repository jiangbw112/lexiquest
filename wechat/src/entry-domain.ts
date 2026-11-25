import chapters from "../../src/domain/chapters/chapters_v0.2.json";
import gloss from "../../src/domain/chapters/gloss_overlap_pairs_v0.2.json";
import { CATALOG_WORDS, SAMPLE_WORDS } from "../../src/domain/catalog";
import { installChapterPlan } from "../../src/domain/chapter-plan";
import { loadSave, writeSave, SAVE_KEY } from "../../src/domain/storage";
import { newSlotId } from "../../src/domain/profiles";
import { skillsForClass, starterSkillId } from "../../src/domain/skills";
import { resolvedClassId } from "../../src/domain/class-unlock";
import { createSave } from "../../src/domain/progress";
import { GAME_W, GAME_H, cjkWrap, wrapCjkText, parchmentTitleY, SAFE } from "../../src/game/layout";

/**
 * 原来：网页用 import.meta.glob 和 ensureChapterPlan 的 fetch。
 * 现在：静态 import 两份 JSON，只调 installChapterPlan。
 * 为什么：不改 catalog.ts / chapter-plan.ts。不调用 ensureChapterPlan，避免再走 fetch。
 */
installChapterPlan(chapters, gloss);

export {
  CATALOG_WORDS,
  SAMPLE_WORDS,
  installChapterPlan,
  loadSave,
  writeSave,
  SAVE_KEY,
  newSlotId,
  skillsForClass,
  starterSkillId,
  resolvedClassId,
  createSave,
  GAME_W,
  GAME_H,
  cjkWrap,
  wrapCjkText,
  parchmentTitleY,
  SAFE,
};
