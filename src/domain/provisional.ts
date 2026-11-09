/**
 * Product numbers that are not approved yet.
 * Friend 1v1 comparison is a confirmed rule and is not configured here.
 * Combat HP is separate MVP tuning.
 */
export const PROVISIONAL = {
  label: "PROVISIONAL",
  mastery: {
    label: "PROVISIONAL",
    /** Reviews must fall on at least this many local calendar days. */
    minDistinctCalendarDays: 2,
    /** FSRS stability required once the day rule is met. */
    minStability: 4,
    timeZone: "Asia/Shanghai",
  },
  /**
   * Skill-card numbers Bowen has not locked. The rules are fixed:
   * at most 3 carried cards, empty slots fill with a weaker class base skill,
   * and a wrong PvE answer uses only a reduced base effect.
   */
  /**
   * Sample-chapter ending. Not a final story. The boss figure reuses the page placeholder.
   * Winning it does not change word cards or review memory.
   */
  /**
   * Grade filter. Collected cards and their due reviews stay when a grade is turned off.
   * New learning, and battle questions that are not drawn from the due list, use the selection.
   */
  grades: {
    label: "PROVISIONAL",
    defaultGrade: "G3" as const,
    minimumSampleWords: 4,
  },
  chapterEnding: {
    label: "PROVISIONAL",
    bossId: "canopy",
    bossName: "林冠",
    bossHp: 48,
    bossAttack: 7,
  },
  skillCards: {
    label: "CONFIGURABLE",
    /** Share of the class starter's level-1 power. The filler stays weaker than that starter. */
    baseSkillPowerScale: 0.45,
    /** Energy to cast an auto-filled base skill. 0 lets a battle start with one real card. */
    baseSkillEnergyCost: 0,
    /** Wrong PvE answers multiply the card's level-1 power, not its upgraded power. */
    wrongAnswerMultiplier: 0.5,
  },
} as const;

export const STUDY_TIME_ZONE = PROVISIONAL.mastery.timeZone;
