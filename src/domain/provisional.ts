/**
 * v1 decisions live here, next to the sample-chapter ending that is still open.
 * Mastery, the 3-card skill cap, base-skill numbers, a wrong PvE answer, the
 * grade pause, and browser speech are decided. Friend 1v1 comparison is a
 * confirmed rule and is not configured here. Combat HP is separate MVP tuning.
 * `bossSprite` is `canopy`: the provisional v0.1 林冠 pack, not an actors-atlas frame.
 * `chapterBattle` holds numbers that are not decided yet. Boss phase health is v1 tuning
 * so a clear lands near the confirmed 8–12 successful damage casts.
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
   * `bossSprite` selects the provisional v0.1 林冠 pack (`boss_canopy_{anim}`).
   */
  chapterEnding: {
    label: "v1",
    bossId: "canopy",
    bossName: "林心守护者",
    bossHp: 65,
    bossAttack: 5,
    bossSprite: "canopy",
    /** Two phases. 65 + 65 is about 12 盾击, 9 战吼, and 7 旋风斩 at level 1. */
    phases: [
      { hp: 65, note: "林心守护者挡住了去路。" },
      { hp: 65, note: "林心守护者进入第二阶段。" },
    ],
  },
  /**
   * Not decided. Change these after playtesting.
   * Exploration health is tuned for the warrior's real damage skills (about 3–5 hits).
   * The free base skill is weaker, so using only that filler takes longer.
   * An empty cosmetic id means the chapter clear grants no outfit yet.
   */
  chapterBattle: {
    label: "PROVISIONAL",
    explorationEnemyHp: 44,
    explorationEnemyAttack: 6,
    recentQuestionWindow: 3,
    completionTitle: "林心探索者",
    completionCosmeticId: "",
  },
  skillCards: {
    label: "v1",
    /** Confirmed v1. At most this many real skill cards. Empty slots still fill with the base skill. */
    maxEquipped: 3,
    /** Confirmed v1. Share of the class starter's level-1 power. The filler stays weaker than that starter. */
    baseSkillPowerScale: 0.45,
    /** Confirmed v1. Energy to cast an auto-filled base skill. 0 lets a battle start with one real card. */
    baseSkillEnergyCost: 0,
    /** Confirmed v1. Wrong PvE answers multiply the card's level-1 power, not its upgraded power. */
    wrongAnswerMultiplier: 0.5,
  },
} as const;

export const STUDY_TIME_ZONE = PROVISIONAL.mastery.timeZone;
