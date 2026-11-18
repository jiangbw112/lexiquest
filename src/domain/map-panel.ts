import { MAP_PRACTICE_NOTE } from "./battle-results";
import { wordById } from "./catalog";
import { cardProgress, learnedWordsLine } from "./learn-progress";
import { deviceTimeZone, localDayKey } from "./local-day";
import { studyNow } from "./progress";
import { clipMissingWords, gradePracticeEntries, namedWords, studyWordIds } from "./study-copy";
import { uiLabel } from "./ui-label";
import { bossUnlockLine, FOREST_CHAPTER, stageLearnMoreLine, stageWins, stageWordIds, stageWordsStillToLearn, type ForestStage, type StageStatus } from "./stages";
import type { GradeBand, SaveData } from "./types";
import type { PlayChapter } from "./chapter-plan";

export interface MapWordFace {
  id: string;
  /** English from the catalog. Null means the card shows 「?」 and is not clickable. */
  english: string | null;
  interactive: boolean;
}

export interface MapPanelButton {
  id: "learn" | "fight";
  label: string;
  enabled: boolean;
  tone: "primary" | "secondary" | "coral";
  grade?: GradeBand;
  wordIds?: string[];
  chapterId?: string;
}

export interface MapPanel {
  stageId: number;
  title: string;
  goal: string | null;
  status: StageStatus;
  statusLabel: string;
  showLock: boolean;
  learned: number;
  total: number;
  /** Null when the stage has no learnable words, so the panel does not show 0/0 or 0/n. */
  progressLabel: string | null;
  wins: number | null;
  words: MapWordFace[];
  unlockLine: string | null;
  /** English and Chinese of boss-gate words that still need a card. */
  missingLines: string[];
  note: string | null;
  /** Best stars for this stage. Null means there is no record, so the map draws nothing. */
  bestStars: 1 | 2 | 3 | null;
  buttons: MapPanelButton[];
}

function bestOf(save: SaveData, stageId: number): 1 | 2 | 3 | null {
  const value = save.bestStars?.[String(stageId)];
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function practiceFull(save: SaveData): boolean {
  const day = localDayKey(studyNow(save), deviceTimeZone());
  return (save.replayWinsByDay?.[day] ?? 0) >= 3;
}

function faces(stage: ForestStage, save: SaveData, mode: "hide" | "learned" | "all"): MapWordFace[] {
  return stage.new_words.map((id) => {
    const word = wordById(id);
    if (!word) throw new Error(`stage word ${id} is not in the catalog`);
    const known = Boolean(save.wordCards[id]);
    // Cleared stages pass "all". A word that was never learned still shows "?" and stays closed.
    const show = mode !== "hide" && known;
    return { id, english: show ? word.english : null, interactive: show };
  });
}

/** Right-hand map panel. Counts and words come from the chapter file and the save. */
export interface MapPanelCounts {
  wins: number;
  bestStars: 1 | 2 | 3 | null;
  /** Used only while the stage is locked. */
  lockedLine?: string;
  bossLabel?: string;
}

export function mapPanel(
  save: SaveData,
  stage: ForestStage,
  status: StageStatus,
  counts?: MapPanelCounts,
  chapter?: Pick<PlayChapter, "id" | "grade" | "wordIds">,
): MapPanel {
  const progress = cardProgress(save, stageWordIds(save, stage));
  const learned = progress.learned;
  const total = progress.total;
  const boss = stage.type === "boss";
  const progressLabel = learnedWordsLine(progress, "本关");
  const base = {
    stageId: stage.id,
    title: stage.name_zh,
    status,
    learned,
    total,
    progressLabel,
    bestStars: counts ? counts.bestStars : bestOf(save, stage.id),
  };
  const bossLabel = counts?.bossLabel ?? uiLabel("挑战林心守护者");
  if (status === "locked" && !boss) {
    const after = stage.unlock && "after_stage" in stage.unlock ? stage.unlock.after_stage : null;
    return {
      ...base,
      goal: stage.goal_zh,
      statusLabel: "未开启",
      showLock: true,
      wins: null,
      words: faces(stage, save, "hide"),
      unlockLine: counts?.lockedLine ?? (after === null ? null : `通过第 ${after} 关后开启`),
      missingLines: [],
      note: null,
      buttons: [{ id: "fight", label: uiLabel("未开启"), enabled: false, tone: "primary" }],
    };
  }
  if (boss && status === "locked") {
    const gate = bossGateFaces(save, chapter);
    return {
      ...base,
      goal: stage.goal_zh,
      statusLabel: "未开启",
      showLock: true,
      wins: null,
      words: gate.lines.length > 0 ? [] : faces(stage, save, "learned"),
      unlockLine: counts?.lockedLine ?? bossUnlockLine(),
      missingLines: gate.lines,
      note: null,
      buttons: [
        ...gate.entries,
        { id: "fight" as const, label: bossLabel, enabled: false, tone: "coral" as const },
      ],
    };
  }
  if (boss && status === "open") {
    return {
      ...base,
      goal: stage.goal_zh,
      statusLabel: "可挑战",
      showLock: false,
      wins: null,
      words: faces(stage, save, "learned"),
      unlockLine: null,
      missingLines: [],
      note: null,
      buttons: [{ id: "fight", label: bossLabel, enabled: true, tone: "coral" }],
    };
  }
  if (boss && status === "cleared") {
    return {
      ...base,
      goal: stage.goal_zh,
      statusLabel: "已通过",
      showLock: false,
      wins: null,
      words: faces(stage, save, "all"),
      unlockLine: null,
      missingLines: [],
      note: null,
      buttons: [
        { id: "learn", label: uiLabel("去学堂"), enabled: true, tone: "secondary" },
        { id: "fight", label: uiLabel("再战"), enabled: true, tone: "coral" },
      ],
    };
  }
  const cleared = status === "cleared";
  const winsNeeded = FOREST_CHAPTER.stage_clear.min_battle_wins;
  const emptyLearn = stageWordIds(save, stage).length === 0;
  const learnMore = stageLearnMoreLine(stageWordsStillToLearn(save, stage));
  return {
    ...base,
    goal: emptyLearn ? `赢 ${winsNeeded} 场小战斗` : null,
    statusLabel: cleared ? "已通过" : "进行中",
    showLock: false,
    wins: counts ? counts.wins : stageWins(save, stage.id),
    words: faces(stage, save, cleared ? "all" : "learned"),
    unlockLine: null,
    missingLines: [],
    note: learnMore
      ? learnMore
      : cleared && practiceFull(save)
        ? MAP_PRACTICE_NOTE
        : !cleared && emptyLearn
          ? `这一关没有要学的新词。赢 ${winsNeeded} 场小战斗就算通过。`
          : null,
    buttons: [
      { id: "learn", label: uiLabel("去学堂"), enabled: true, tone: "secondary" },
      { id: "fight", label: uiLabel(cleared ? "再战" : "小战斗"), enabled: true, tone: cleared ? "coral" : "primary" },
    ],
  };
}

function bossGateFaces(
  save: SaveData,
  chapter?: Pick<PlayChapter, "id" | "grade" | "wordIds">,
): { lines: string[]; entries: MapPanelButton[] } {
  const scope = chapter ?? {
    id: FOREST_CHAPTER.chapter_id,
    grade: "mixed" as const,
    wordIds: [],
  };
  const play: PlayChapter = {
    id: scope.id,
    name: "",
    bossName: "",
    grade: scope.grade,
    index: 0,
    stages: [],
    wordIds: [...scope.wordIds],
  };
  const missing = namedWords(studyWordIds(save, play).filter((id) => !save.wordCards[id]));
  if (missing.length === 0) return { lines: [], entries: [] };
  if (scope.grade !== "mixed") {
    return {
      lines: clipMissingWords([missing.map((word) => `${word.english} ${word.chinese}`).join("、")], 48),
      entries: [{
        id: "learn",
        label: "去学堂学这几个",
        enabled: true,
        tone: "secondary",
        grade: scope.grade,
        wordIds: missing.map((word) => word.id),
        chapterId: scope.id,
      }],
    };
  }
  const groups = gradePracticeEntries(save, missing);
  const first = groups[0];
  return {
    lines: clipMissingWords(groups.map((group) => group.line), 48),
    entries: first
      ? [{
          id: "learn" as const,
          label: first.label,
          enabled: true,
          tone: "secondary" as const,
          grade: first.grade,
          wordIds: first.wordIds,
          chapterId: scope.id,
        }]
      : [],
  };
}
