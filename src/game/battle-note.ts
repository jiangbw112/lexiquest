/** The two answer lines. They stay on screen as soon as the question resolves. */
const ANSWER_FEEDBACK = ["答对了，全力发动。", "答错了，只有减弱的基础效果。"] as const;

export interface BattleNotePlan {
  /** Visible before the lunge or projectile. */
  feedback: string;
  /** Player's own result. Shown when that hit, heal, or block lands. */
  action: string;
  /** Counterattack, including a miss and the loss ending. Shown on the monster's hit. */
  counter: string;
}

export type NoteStage = "start" | "player-hit" | "monster-hit" | "final";

function splitClauses(full: string): string[] {
  const clauses: string[] = [];
  let rest = full;
  while (rest.length > 0) {
    const end = rest.indexOf("。");
    if (end < 0) {
      clauses.push(rest);
      break;
    }
    clauses.push(rest.slice(0, end + 1));
    rest = rest.slice(end + 1);
  }
  return clauses;
}

function isAnswerFeedback(clause: string): boolean {
  return (ANSWER_FEEDBACK as readonly string[]).includes(clause);
}

function isCounterClause(clause: string): boolean {
  return clause.startsWith("受到了伤害") || clause.startsWith("这次没有受到伤害");
}

/**
 * Split one resolved `lastNote` without changing its characters.
 * Answer feedback is immediate. The player's result waits for that hit.
 * The injury sentence waits for the monster's hit. A win or phase line
 * rides with the blow that ended the counter.
 */
export function planBattleNote(full: string): BattleNotePlan {
  const parts = splitClauses(full);
  const first = parts[0];
  if (!first || !isAnswerFeedback(first)) return { feedback: full, action: "", counter: "" };
  const rest = parts.slice(1);
  const counterAt = rest.findIndex(isCounterClause);
  if (counterAt < 0) return { feedback: first, action: rest.join(""), counter: "" };
  return {
    feedback: first,
    action: rest.slice(0, counterAt).join(""),
    counter: rest.slice(counterAt).join(""),
  };
}

/** Text on screen after the named beat. `final` is the sentence the battle already stored. */
export function shownBattleNote(full: string, stage: NoteStage): string {
  const plan = planBattleNote(full);
  if (stage === "start") return plan.feedback;
  if (stage === "player-hit") return plan.feedback + plan.action;
  if (stage === "monster-hit") return plan.feedback + plan.action + plan.counter;
  return noteForHandoff(plan.feedback, full);
}

/**
 * A scene change or the results screen keeps every sentence.
 * A bar of text that is still waiting on the last hit is not what gets handed off.
 */
export function noteForHandoff(shown: string, full: string): string {
  if (shown === full) return full;
  return full;
}
