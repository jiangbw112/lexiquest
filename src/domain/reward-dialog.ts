import type { RewardNotice } from "./types";

/**
 * One notice per word, written by `reviewWord` the first time a mastery badge lights.
 * The detail names that one English word. The village shows a run of these as one line.
 */
export const MASTERY_BADGE_NOTICE = "熟练徽章亮了";

/**
 * Village popups have used this title with one English word in the detail.
 * No function in this repo pushes it onto `rewardQueue`. A run already stored
 * on a save is still collapsed, the same way as a mastery-badge run.
 */
export const RECOGNIZED_WORD_NOTICE = "已认识";

const perWordLine: Record<string, (count: number) => string> = {
  [MASTERY_BADGE_NOTICE]: (count) => `有 ${count} 张词卡的熟练徽章亮了。`,
  [RECOGNIZED_WORD_NOTICE]: (count) => `你已经认识 ${count} 个词。`,
};

export interface RewardBatch {
  /** How many head notices one confirmation clears. */
  count: number;
  title: string;
  detail: string;
}

/**
 * The village dialog for the front of `rewardQueue`.
 * A run of the same per-word title becomes one sentence. Appearance rewards,
 * the star sash, and every other title stay as the single head notice.
 * An empty queue returns null, so the village adds no dialog of its own.
 */
export function rewardBatch(queue: readonly RewardNotice[]): RewardBatch | null {
  const head = queue[0];
  if (!head) return null;
  const line = perWordLine[head.title];
  if (!line) return { count: 1, title: head.title, detail: head.detail };
  let count = 1;
  while (queue[count]?.title === head.title) count += 1;
  return { count, title: head.title, detail: line(count) };
}
