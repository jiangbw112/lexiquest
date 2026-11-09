import { wordById } from "./catalog";
import { uiLabel } from "./ui-label";
import { stageWins, type ForestStage, type StageStatus } from "./stages";
import type { SaveData } from "./types";

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
  wins: number | null;
  words: MapWordFace[];
  unlockLine: string | null;
  note: string | null;
  buttons: MapPanelButton[];
}

const BOSS_LOCK_LINE = "通过前 4 关并学完 28 个词";

function faces(stage: ForestStage, save: SaveData, mode: "hide" | "learned" | "all"): MapWordFace[] {
  return stage.new_words.map((id) => {
    const word = wordById(id);
    if (!word) throw new Error(`stage word ${id} is not in the catalog`);
    const known = Boolean(save.wordCards[id]);
    const show = mode === "all" || (mode === "learned" && known);
    return { id, english: show ? word.english : null, interactive: show };
  });
}

/** Right-hand map panel. Counts and words come from the chapter file and the save. */
export function mapPanel(save: SaveData, stage: ForestStage, status: StageStatus): MapPanel {
  const total = stage.new_words.length;
  const learned = stage.new_words.filter((id) => save.wordCards[id]).length;
  const base = {
    stageId: stage.id,
    title: stage.name_zh,
    status,
    learned,
    total,
  };
  if (status === "skipped") {
    return {
      ...base,
      goal: null,
      statusLabel: "已跳过",
      showLock: false,
      wins: null,
      words: [],
      unlockLine: null,
      note: "所选年级没有这一关的新词",
      buttons: [],
    };
  }
  const boss = stage.type === "boss";
  if (status === "locked" && !boss) {
    const after = stage.unlock && "after_stage" in stage.unlock ? stage.unlock.after_stage : null;
    return {
      ...base,
      goal: stage.goal_zh,
      statusLabel: "未开启",
      showLock: true,
      wins: null,
      words: faces(stage, save, "hide"),
      unlockLine: after === null ? null : `通过第 ${after} 关后开启`,
      note: null,
      buttons: [{ id: "fight", label: uiLabel("未开启"), enabled: false, tone: "primary" }],
    };
  }
  if (boss && status === "locked") {
    return {
      ...base,
      goal: stage.goal_zh,
      statusLabel: "未开启",
      showLock: true,
      wins: null,
      words: faces(stage, save, "learned"),
      unlockLine: BOSS_LOCK_LINE,
      note: null,
      buttons: [{ id: "fight", label: uiLabel("挑战林心守护者"), enabled: false, tone: "coral" }],
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
      note: null,
      buttons: [{ id: "fight", label: uiLabel("挑战林心守护者"), enabled: true, tone: "coral" }],
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
      note: null,
      buttons: [
        { id: "learn", label: uiLabel("去学堂"), enabled: true, tone: "secondary" },
        { id: "fight", label: uiLabel("再战"), enabled: true, tone: "coral" },
      ],
    };
  }
  const cleared = status === "cleared";
  return {
    ...base,
    goal: null,
    statusLabel: cleared ? "已通过" : "进行中",
    showLock: false,
    wins: stageWins(save, stage.id),
    words: faces(stage, save, cleared ? "all" : "learned"),
    unlockLine: null,
    note: null,
    buttons: [
      { id: "learn", label: uiLabel("去学堂"), enabled: true, tone: "secondary" },
      { id: "fight", label: uiLabel(cleared ? "再战" : "小战斗"), enabled: true, tone: cleared ? "coral" : "primary" },
    ],
  };
}
