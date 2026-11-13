/**
 * Confirmed v1 numbers for the parent page and the daily goal.
 * They stay in this module so they can be changed without editing the other v1 rules.
 * The study day uses the device time zone. It is not fixed to Asia/Shanghai.
 */
export const PROPOSALS = {
  label: "v1",
  status: "已确认 v1",
  parentProgress: {
    /** Study days in the “keeps getting it wrong” window, including today. */
    struggleWindowDays: 14,
    /** Due first-answers marked Again. */
    struggleAgainCount: 3,
    /** Share of due first-answers marked Again. */
    struggleAgainRate: 0.5,
    /** Minimum due first-answers before the rate rule applies. */
    struggleMinDueAnswers: 3,
    /** A grey badge plus this many recent due Agains also lists the word. */
    struggleGreyWindowDays: 7,
    struggleGreyRecentAgain: 1,
    /** How many struggle words the parent page shows before “查看全部”. */
    struggleListLimit: 10,
    /** Study days in the “近 7 天” window, including today. */
    recentWindowDays: 7,
  },
  dailyGoal: {
    goalMax: { easy: 8, normal: 15, more: 25 },
    /** Daily new-word target. Reaching it reminds the child. It does not stop the next word. */
    newWordTarget: { easy: 3, normal: 5, more: 8 },
    /** New words to learn when nothing is due. */
    learnFallback: { easy: 2, normal: 3, more: 5 },
    /** Answered questions on learned words when nothing is due and no new words are left. */
    practiceQuestions: 3,
    cosmeticTokenReward: 1,
    /** Days since the last completed goal, used only for the gentle opening line. */
    reminderRecentDays: 2,
    reminderMidDays: 6,
    reminderLongDays: 7,
  },
} as const;

export type ProposalPreset = keyof typeof PROPOSALS.dailyGoal.goalMax;
