import "./install-host";
import chapters from "../../src/domain/chapters/chapters_v0.2.json";
import gloss from "../../src/domain/chapters/gloss_overlap_pairs_v0.2.json";
import { installChapterPlan } from "../../src/domain/chapter-plan";
import Phaser from "phaser";
import { BattleScene } from "../../src/game/scenes/BattleScene";
import { ExamBattleScene } from "../../src/game/scenes/ExamBattleScene";
import { BattleResultsScene } from "../../src/game/scenes/BattleResultsScene";
import { BootScene } from "../../src/game/scenes/BootScene";
import { CollectionScene } from "../../src/game/scenes/CollectionScene";
import { CreateScene } from "../../src/game/scenes/CreateScene";
import { GradeScene } from "../../src/game/scenes/GradeScene";
import { DuelScene } from "../../src/game/scenes/DuelScene";
import { EndingScene } from "../../src/game/scenes/EndingScene";
import { GuideScene } from "../../src/game/scenes/GuideScene";
import { LearnScene } from "../../src/game/scenes/LearnScene";
import { OverworldScene } from "../../src/game/scenes/OverworldScene";
import { ProfilesScene } from "../../src/game/scenes/ProfilesScene";
import { ReviewScene } from "../../src/game/scenes/ReviewScene";
import { SkillsScene } from "../../src/game/scenes/SkillsScene";
import { StageMapScene } from "../../src/game/scenes/StageMapScene";
import { TitleScene } from "../../src/game/scenes/TitleScene";
import { WardrobeScene } from "../../src/game/scenes/WardrobeScene";
import { TEXT_CACHE_FIELDS, easeValue, hitContains, liveTimerCount, nineSliceParts, orderByDepth } from "../engine/phaser-shim";
import { pbkdf2Hex } from "../platform/pbkdf2";
import { StorageLimitError, createMemoryArea, utf8Size, writeLimited } from "../platform/storage";
import { randomUuid, uuidV4FromBytes, weakRandomUuid } from "../platform/random";
import { UI_BODY_PX, UI_GAP, UI_HIT, logicalBodySize, screenFontPx, screenToWorld, uiRect, worldScale, worldToScreen } from "../engine/coords";
import { layoutFrame, paintFrame, pressFrame } from "../engine/paint";
import { createSave } from "../../src/domain/progress";
import { findPlayChapter } from "../../src/domain/chapter-plan";
import { initialMapStageId, stageStatuses } from "../../src/domain/stages";
import { bootSave, createProfile, getSave } from "../../src/game/session";
import { shellCopy } from "../platform/host-copy";
import { missingSpeech } from "../platform/speech";

/**
 * 原来：src/main.ts 用 Phaser.WEBGL 把 18 个场景挂到 #game。
 * 现在：同一批场景类交给自写 Game，画布由调用方传入。
 * 为什么：不改场景文件。installChapterPlan 在本包里先执行，BootScene 再调 ensureChapterPlan 时计划已经在。
 */
installChapterPlan(chapters, gloss);

export const SCENES = [
  BootScene,
  ProfilesScene,
  TitleScene,
  GradeScene,
  CreateScene,
  OverworldScene,
  LearnScene,
  StageMapScene,
  BattleScene,
  ExamBattleScene,
  BattleResultsScene,
  CollectionScene,
  ReviewScene,
  SkillsScene,
  WardrobeScene,
  EndingScene,
  DuelScene,
  GuideScene,
];

export function createGame(canvas?: { width: number; height: number; getBoundingClientRect?: () => { left: number; top: number; width: number; height: number }; addEventListener?: (event: string, fn: () => void) => void }, options: { width?: number; height?: number } = {}) {
  const view = canvas ?? {
    width: options.width ?? 1280,
    height: options.height ?? 800,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: options.width ?? 1280, height: options.height ?? 800 }),
    addEventListener: () => undefined,
  };
  return new Phaser.Game({
    type: Phaser.CANVAS,
    canvas: view,
    width: options.width ?? view.width,
    height: options.height ?? view.height,
    scene: SCENES,
  });
}

const PRACTICE_LOOK = {
  skinId: "peach",
  hairStyle: "bob" as const,
  hairColorId: "brown",
  eyeStyle: "bright" as const,
  clothColorId: "fern",
  glasses: false,
  freckles: false,
};

/** Builds one graded profile and selects it. BootScene's bootSave() clears the session, so call this after boot. */
export function openPractice(now = Date.parse("2026-03-01T00:00:00Z")) {
  bootSave();
  const save = createSave({
    name: "学习者",
    classId: "warrior",
    appearance: PRACTICE_LOOK,
    now,
    grades: ["G3"],
  });
  const added = createProfile(save);
  if (!added.ok) throw new Error(added.reason);
  const live = getSave();
  if (!live) throw new Error("profile was not selected");
  const chapter = findPlayChapter(live);
  return { save: live, chapterId: chapter.id, stageId: initialMapStageId(stageStatuses(live)) };
}

export {
  Phaser,
  TEXT_CACHE_FIELDS,
  easeValue,
  hitContains,
  liveTimerCount,
  nineSliceParts,
  orderByDepth,
  pbkdf2Hex,
  StorageLimitError,
  createMemoryArea,
  utf8Size,
  writeLimited,
  randomUuid,
  uuidV4FromBytes,
  weakRandomUuid,
  worldToScreen,
  screenToWorld,
  uiRect,
  logicalBodySize,
  worldScale,
  UI_BODY_PX,
  UI_HIT,
  UI_GAP,
  screenFontPx,
  layoutFrame,
  paintFrame,
  pressFrame,
  createSave,
  createProfile,
  getSave,
  bootSave,
  findPlayChapter,
  initialMapStageId,
  stageStatuses,
  shellCopy,
  missingSpeech,
};
