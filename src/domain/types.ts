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

export interface SaveData {
  version: 1;
  createdAt: number;
  player: PlayerProfile;
  wordCards: Record<string, WordCardRecord>;
  memory: Record<string, MemoryRecord>;
  skillLevels: Record<string, number>;
  unlockedSkillIds: string[];
  equippedSkillIds: string[];
  ownedOutfitIds: string[];
  equippedOutfitId: string;
  xp: number;
  battlesWon: number;
  battlesLost: number;
  clockOffsetMs: number;
  rewardQueue: RewardNotice[];
}
