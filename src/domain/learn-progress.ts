/** Learning counts come from word cards. They are not battle wins. */
export function cardProgress(
  save: { wordCards: Record<string, unknown> },
  wordIds: readonly string[],
): { learned: number; total: number } {
  return {
    learned: wordIds.filter((id) => save.wordCards[id]).length,
    total: wordIds.length,
  };
}

/** Null when this scope has no words for the selected grades, so the UI does not show 0/0. */
export function learnedWordsLine(progress: { learned: number; total: number }, scope: "本关" | "本章" | "已学"): string | null {
  if (progress.total <= 0) return null;
  if (scope === "已学") return `已学 ${progress.learned}/${progress.total} 个词`;
  return `${scope}已学 ${progress.learned}/${progress.total} 个词`;
}

export function battleClearLine(cleared: number, total: number): string {
  return `战斗 ${cleared}/${total} 关通过`;
}
