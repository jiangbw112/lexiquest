/**
 * DES-05 numbers that are not approved yet.
 * Decided v1 values stay in `provisional.ts`. Change these without touching those.
 * Every field below is a proposal.
 */
export const PROPOSALS = {
  label: "PROPOSAL",
  status: "待审，不是已定的 v1",
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
    timeZone: "Asia/Shanghai",
    /** The study day rolls at this hour in `timeZone`, not at midnight and not in the device zone. */
    dayBoundaryHour: 4,
    goalMax: { light: 8, standard: 15, more: 25 },
    /** New words to learn when nothing is due. */
    learnFallback: { light: 2, standard: 3, more: 5 },
    /** Practice rounds when nothing is due and no new words are left. Practice does not change FSRS. */
    practiceRounds: 3,
    cosmeticTokenReward: 1,
    /** Days since the last completed goal, used only for the gentle opening line. */
    reminderRecentDays: 2,
    reminderMidDays: 6,
    reminderLongDays: 7,
  },
} as const;

export type ProposalPreset = keyof typeof PROPOSALS.dailyGoal.goalMax;
