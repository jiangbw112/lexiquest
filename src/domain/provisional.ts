/**
 * v1 decisions live here, next to the sample-chapter ending that is still open.
 * Mastery, the 3-card skill cap, base-skill numbers, a wrong PvE answer, the
 * grade pause, and browser speech are decided. Friend 1v1 comparison is a
 * confirmed rule and is not configured here. Combat HP is separate MVP tuning.
 * The 林冠 figure is still a placeholder: change `bossSprite` when its drawing arrives.
 */
export const PROVISIONAL = {
  label: "v1",
  mastery: {
    label: "v1",
    /** A correct review on at least this many different Asia/Shanghai days. */
    minDistinctCalendarDays: 2,
    /** FSRS stability, in days, required once the day rule is met. */
    minStability: 7,
    timeZone: "Asia/Shanghai",
  },
  /**
   * Turning a grade off keeps its cards. Battle questions and due reviews pause
   * until that grade is selected again. FSRS is not rewritten while it is paused.
   */
  grades: {
    label: "v1",
    defaultGrade: "G3" as const,
    minimumSampleWords: 4,
  },
  /**
   * Sample-chapter ending. Not a final story. Winning it does not change cards or memory.
   * `bossSprite` is the actors-atlas frame under `monster/`. It is "page" until the
   * 林冠 drawing is added; set it to that frame id and nothing else needs to change.
   */
  chapterEnding: {
    label: "PROVISIONAL",
    bossId: "canopy",
    bossName: "林冠",
    bossHp: 48,
    bossAttack: 7,
    bossSprite: "page",
  },
  skillCards: {
    label: "v1",
    /** At most this many real skill cards. Empty slots still fill with the base skill. */
    maxEquipped: 3,
    /** Share of the class starter's level-1 power. The filler stays weaker than that starter. */
    baseSkillPowerScale: 0.45,
    /** Energy to cast an auto-filled base skill. 0 lets a battle start with one real card. */
    baseSkillEnergyCost: 0,
    /** Wrong PvE answers multiply the card's level-1 power, not its upgraded power. */
    wrongAnswerMultiplier: 0.5,
  },
} as const;

export const STUDY_TIME_ZONE = PROVISIONAL.mastery.timeZone;
