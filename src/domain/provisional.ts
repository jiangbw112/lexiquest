/**
 * v1 decisions live here, next to the sample-chapter ending that is still open.
 * Mastery, the 3-card skill cap, base-skill numbers, a wrong PvE answer, the
 * grade pause, and browser speech are decided. Friend 1v1 comparison is a
 * confirmed rule and is not configured here. Combat HP is separate MVP tuning.
 * `bossSprite` is `canopy`: the provisional v0.1 林冠 pack, not an actors-atlas frame.
 * `chapterBattle` holds the round-3 exploration numbers. Boss phase health differs by class.
 * A clear is meant to land in about 10–14 questions, with the boss shaken after 11 answers.
 */
export const PROVISIONAL = {
  label: "v1",
  mastery: {
    label: "v1",
    /** A correct review on at least this many different local calendar days. */
    minDistinctCalendarDays: 2,
    /** FSRS stability, in days, required once the day rule is met. */
    minStability: 7,
  },
  /**
   * Turning a grade off keeps its cards. Battle questions and due reviews pause
   * until that grade is selected again. FSRS is not rewritten while it is paused.
   */
  grades: {
    label: "v1",
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
    bossHp: 75,
    bossAttack: 4,
    bossSprite: "canopy",
    /** Two phases. Each phase uses `bossPhaseHpByClass`, not one shared total. */
    phases: [
      { hp: 75, note: "林心守护者挡住了去路。" },
      { hp: 75, note: "林心守护者进入第二阶段。" },
    ],
    bossPhaseHpByClass: {
      warrior: 75,
      mage: 90,
      ranger: 85,
      healer: 48,
      inventor: 70,
      explorer: 75,
    },
    /**
     * Paper numbers for a later exam boss. No fight reads them in 1.0.0.
     * Midterm is round(boss × 1.6). Final is round(boss × 1.4).
     */
    examBossPhaseHp: {
      midterm: { warrior: 120, mage: 144, ranger: 136, healer: 77, inventor: 112, explorer: 120 },
      final: { warrior: 105, mage: 126, ranger: 119, healer: 67, inventor: 98, explorer: 105 },
    },
    /** Boss spelling is also capped by this many questions, on top of the 30% share. */
    bossSpellingMax: 4,
    /** After this many answers in the whole fight, only a correct damaging action ends the phase. */
    shakenAfterQuestions: 11,
  },
  /**
   * Not decided. Change these after playtesting.
   * Exploration health is tuned for the warrior's real damage skills (about 3–5 hits).
   * The free base skill is weaker, so using only that filler takes longer.
   * Chapter cosmetics and titles live in forest-rewards.json.
   */
  chapterBattle: {
    label: "PROVISIONAL",
    explorationEnemyHpByStage: [40, 42, 44, 46],
    explorationEnemyHpByStageHealer: [26, 28, 28, 30],
    explorationEnemyAttack: 5,
    /** The first this many block or heal actions keep their full amount. */
    supportStreakFree: 2,
    recentQuestionWindow: 3,
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
