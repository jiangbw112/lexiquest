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
}

export interface RewardNotice {
  id: string;
  title: string;
  detail: string;
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

export interface ParentPinRecord {
  algorithm: "sha-256";
  salt: string;
  hash: string;
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
  /** Salted hash of the parent PIN. The PIN itself is not stored. */
  parentPin: ParentPinRecord | null;
  skillLevels: Record<string, number>;
  unlockedSkillIds: string[];
  equippedSkillIds: string[];
  ownedOutfitIds: string[];
  equippedOutfitId: string;
  xp: number;
  battlesWon: number;
  battlesLost: number;
  /** True after the forest boss is defeated. Mastery badges are not required. */
  chapterCleared: boolean;
  /** Wins of each exploration stage, keyed by the stage id. A stage clears at 1. */
  stageWins: Record<string, number>;
  /** Titles granted by the chapter. The completion title is provisional. */
  titles: string[];
  /** Grades the child is studying. At least one. Missing or empty saves become grade 3. */
  selectedGrades: GradeBand[];
  clockOffsetMs: number;
  rewardQueue: RewardNotice[];
}
