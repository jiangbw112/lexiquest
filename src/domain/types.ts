export type GradeBand = "G3" | "G4" | "G5" | "G6";
export type Semester = 1 | 2;

export type ClassId =
  | "warrior"
  | "mage"
  | "ranger"
  | "healer"
  | "inventor"
  | "explorer";

export type HairStyle = "short" | "bob" | "ponytail" | "curly" | "bun" | "spiky";
export type EyeStyle = "round" | "bright" | "calm";

export interface Appearance {
  skinId: string;
  hairStyle: HairStyle;
  hairColorId: string;
  eyeStyle: EyeStyle;
  clothColorId: string;
  glasses: boolean;
  freckles: boolean;
}

export interface WordCardRecord {
  wordId: string;
  collectedAt: number;
  masteryBadge: boolean;
  masteredAt?: number;
  /** True after the badge has been bright at least once. Grey does not clear it. */
  badgeEverOn?: boolean;
  badgeLastChangedAt?: number;
  /**
   * Set when the child spelled the word without the answer on screen.
   * A quiz, or a spelling attempt that showed the word, does not set this.
   * No spelling review interval is stored here.
   */
  spelledAloneAt?: number;
}

export interface StoredFsrs {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface MemoryRecord {
  wordId: string;
  fsrs: StoredFsrs;
  reviewInstants: number[];
  /** Distinct local days of reviews taken on the real clock. Missing on older saves. */
  realReviewDays?: string[];
}

export interface RewardNotice {
  id: string;
  title: string;
  detail: string;
}

export type TitleSlot = "prefix" | "suffix";
export type TitleJoin = "de" | "direct";
export type TitleGrantSource = "bossFirstClear" | "level" | "legacyTitle";

export type TitleSourceRule =
  | { kind: "level"; minLevel: number }
  | { kind: "examPrefix"; bossId: string }
  | { kind: "anyMid" | "anyFinal" | "graduation" };

export interface TitleDef {
  id: string;
  slot: TitleSlot;
  text: string;
  join?: TitleJoin;
  sourceRule: TitleSourceRule;
}

export interface TitleParts {
  unlockedPrefixIds: string[];
  unlockedSuffixIds: string[];
  equipped: { prefixId: string | null; suffixId: string | null };
  newIds: string[];
  via: Record<string, { source: string; at: number }>;
}

/**
 * Shape from TITLE_SPEC. This PR does not write it onto examProgress.
 * Graduation proof and exam phase records stay with the exam PR.
 */
export type FirstClearProof = {
  clearEventId: string;
  firstClearAt?: number;
  configPhaseCount?: number;
  gateVerified?: boolean;
  chapterConfigVersion?: string;
} & (
  | { kind: "finalPhaseVictory"; phaseCount: number }
  | { kind: "legacyCleared"; phaseCount?: number }
);

export interface TitleGrant {
  grantedAt: number;
  source: TitleGrantSource;
  evidenceId: string;
  partIds: string[];
  newPartIds: string[];
}

export interface TitleReceipt {
  id: string;
  eventId: string;
  grantKeys: string[];
  newPartIds: string[];
  status: "pending" | "presented";
}

export interface PlayerProfile {
  name: string;
  classId: ClassId;
  appearance: Appearance;
}

export type GoalPreset = "easy" | "normal" | "more";
export type GoalMode = "review" | "learn_fallback" | "practice_fallback";
export type MemoryTrack = "meaning" | "spelling";
export type DueRating = "again" | "hard" | "good" | "easy";

/** One due first-answer. Meaning and spelling stay separate until the parent view merges them. */
export interface DueAnswerLog {
  at: number;
  wordId: string;
  track: MemoryTrack;
  rating: DueRating;
  /** Grade actually sent to FSRS. Learning and Relearning Hard are stored as Good. */
  fsrsRating?: DueRating;
}

export interface DailyStat {
  learnedWordIds: string[];
  reviewedDueWordIds: string[];
  badgeFirstOnWordIds: string[];
  badgeRestoredWordIds: string[];
}

/** Snapshotted for one study day. The targets do not rise later that day. */
export interface DailyGoal {
  dayKey: string;
  snapshotDue: number;
  mode: GoalMode;
  targetReview: number;
  targetLearn: number;
  targetPractice: number;
  progressReview: number;
  progressLearn: number;
  progressPractice: number;
  completed: boolean;
  rewardClaimed: boolean;
}

export interface SaveData {
  version: 1;
  createdAt: number;
  player: PlayerProfile;
  wordCards: Record<string, WordCardRecord>;
  /** Meaning-track memory. Spelling, when present, lives in `spellingMemory`. */
  memory: Record<string, MemoryRecord>;
  spellingMemory: Record<string, MemoryRecord>;
  dailyStats: Record<string, DailyStat>;
  dueAnswers: DueAnswerLog[];
  parentGoalPreset: GoalPreset;
  dailyGoal: DailyGoal | null;
  goalDaysTotal: number;
  lastGoalCompletedDayKey: string | null;
  goalCalendar: Record<string, "completed" | "missed">;
  /** Appearance token. Completing a day's goal adds one. It does not change battle stats or XP. */
  cosmeticTokens: number;
  /** Last device time zone used to name a study day. History keys are not rewritten when it changes. */
  lastTimezone: string | null;
  /** True when the clock or zone moved to a study day earlier than the saved goal. Tokens stay. */
  clockAnomaly: boolean;
  skillLevels: Record<string, number>;
  unlockedSkillIds: string[];
  equippedSkillIds: string[];
  /**
   * Decks parked by class. A locked inventor save keeps its cards here
   * when the active class falls back to warrior. Unlock fields are not read.
   */
  equippedByClass?: Partial<Record<ClassId, string[]>>;
  ownedOutfitIds: string[];
  equippedOutfitId: string;
  xp: number;
  battlesWon: number;
  battlesLost: number;
  /** True after the forest boss is defeated. Mastery badges are not required. */
  chapterCleared: boolean;
  /** Wins of each exploration stage, keyed by the stage id. A stage clears at 1. Forest only. */
  stageWins: Record<string, number>;
  /**
   * Wins and clears for chapters after the forest.
   * Forest progress stays in `chapterCleared` and `stageWins`. Missing on older saves.
   */
  chapterProgress?: Record<string, { cleared: boolean; stageWins: Record<string, number> }>;
  /**
   * Last battle chapter that was actually entered.
   * Map browsing does not write it. Missing means the forest.
   */
  currentChapterId?: string;
  /**
   * Academy lesson L. The grade and chapter are stored together.
   * A paused grade keeps the pair, but the academy does not load those words.
   * Choosing a lesson or collecting a card does not write battle progress.
   */
  learnSelection?: {
    grade: GradeBand | "mixed";
    chapterId: string;
  };
  /**
   * Battle grade the child last chose. Missing until a grade fight or the grade picker.
   * When the parent turns that grade off, it stays so the map can ask instead of switching.
   */
  battleGrade?: GradeBand;
  /**
   * Continue chapter P, one id per grade.
   * Written when a legal open chapter fight starts, or when that chapter's boss is really cleared.
   * Browsing, page turns, and previews do not write it.
   */
  battleChapterByGrade?: Partial<Record<GradeBand, string>>;
  /** Display names already granted. The id list is `unlockedTitleIds`. */
  titles: string[];
  /** Chapter cosmetics granted once. They stay after a badge goes grey. */
  unlockedCosmeticIds: string[];
  unlockedTitleIds: string[];
  equippedCosmeticIds: string[];
  /** At most one. Null means the title is taken off. */
  equippedTitleId: string | null;
  masteryMilestonesClaimed: string[];
  clearRewardClaimed: boolean;
  /** Grades the child is studying. Empty until they pick at least one. Missing older saves stay empty. */
  selectedGrades: GradeBand[];
  /**
   * True after a non-empty grade choice has been written.
   * Older saves omit it. An empty list is not written by the parent page.
   */
  gradesConfirmed: boolean;
  clockOffsetMs: number;
  rewardQueue: RewardNotice[];
  /** Wins of an already-cleared exploration stage, keyed by the local day. */
  replayWinsByDay?: Record<string, number>;
  /**
   * Best star count for a stage, keyed by the stage id. Missing means no record yet.
   * A loss does not write it. Old saves omit the field and read as empty.
   */
  bestStars?: Record<string, 1 | 2 | 3>;
  /**
   * Reserved for the final-exam version. 1.0.0 does not read or write it,
   * and a value already in a save does not unlock inventor.
   */
  finalBossCleared?: boolean;
  /** Reserved. 1.0.0 ignores a value already in a save and does not add one. */
  unlockedClassIds?: ClassId[];
  /** Reserved. 1.0.0 ignores a value already in a save and does not add one. */
  inventorUnlockedAt?: number;
  /** Reserved. 1.0.0 ignores a value already in a save and does not add one. */
  inventorUnlockedBy?: string;
  /** Reserved. 1.0.0 does not backfill a clear into an unlock. */
  examProgress?: Record<string, { cleared?: boolean; bestPhase?: number }>;
  /**
   * Stable id for title events. Not derived from the player name.
   * Old saves receive one during title migration.
   */
  profileId?: string;
  /**
   * Title-subsystem migration mark. Missing means not migrated yet.
   * SaveData.version stays 1; a higher version would fail the current loader.
   */
  titleRulesVersion?: 1;
  titleParts?: TitleParts;
  titleGrantLedger?: Record<string, TitleGrant>;
  titleReceipts?: Record<string, TitleReceipt>;
}
