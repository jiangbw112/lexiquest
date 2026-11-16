import rules from "./chapters/forest-stage-rules.json";

/**
 * The only clear check.
 * A non-boss stage is cleared by one recorded win. Learning words does not clear it.
 * A boss stage and its chapter are cleared only when that boss has been beaten.
 * An exam is cleared only by its own record. Stage wins never count as an exam or a chapter.
 */
export const FOREST_CHAPTER_ID = rules.chapter_id;
const MIN_BATTLE_WINS = rules.stage_clear.min_battle_wins;

export interface ClearSave {
  chapterCleared?: boolean;
  stageWins?: Record<string, number>;
  chapterProgress?: Record<string, { cleared?: boolean; stageWins?: Record<string, number> }>;
  examProgress?: Record<string, { cleared?: boolean }>;
}

export type ClearQuery =
  | { kind: "stage"; chapterId: string; stage: { id: number; type: string } }
  | { kind: "chapter"; chapterId: string }
  | { kind: "exam"; examId: string };

export function isCleared(save: ClearSave, query: ClearQuery): boolean {
  if (query.kind === "exam") return save.examProgress?.[query.examId]?.cleared === true;
  if (query.kind === "chapter") return chapterFlag(save, query.chapterId);
  if (query.stage.type === "boss") return chapterFlag(save, query.chapterId);
  return stageWinCount(save, query.chapterId, query.stage.id) >= MIN_BATTLE_WINS;
}

function chapterFlag(save: ClearSave, chapterId: string): boolean {
  if (chapterId === FOREST_CHAPTER_ID) return save.chapterCleared === true;
  return save.chapterProgress?.[chapterId]?.cleared === true;
}

function stageWinCount(save: ClearSave, chapterId: string, stageId: number): number {
  const key = String(stageId);
  if (chapterId === FOREST_CHAPTER_ID) return save.stageWins?.[key] ?? 0;
  return save.chapterProgress?.[chapterId]?.stageWins?.[key] ?? 0;
}
