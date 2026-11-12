/** HP the bars are allowed to show. Separate from the already-resolved fight. */
export interface HpReadout {
  playerHp: number;
  enemyHp: number;
}

export interface HpStep {
  target: "player" | "enemy";
  amount: number;
}

/** How long a bar may glide after the hit. The value itself changes at the hit. */
export const HP_BAR_TWEEN_MS = 80;

/** A lunge starts on the HP from before the action. The resolved total stays hidden. */
export function hpAtMotionStart(before: HpReadout): HpReadout {
  return { playerHp: before.playerHp, enemyHp: before.enemyHp };
}

export function applyHpStep(shown: HpReadout, step: HpStep): HpReadout {
  if (step.target === "player") return { playerHp: shown.playerHp + step.amount, enemyHp: shown.enemyHp };
  return { playerHp: shown.playerHp, enemyHp: shown.enemyHp + step.amount };
}

/** `appliedCount` is how many steps have already reached their hit. */
export function hpAfterSteps(before: HpReadout, steps: readonly HpStep[], appliedCount: number): HpReadout {
  const count = Math.max(0, Math.min(appliedCount, steps.length));
  let shown = hpAtMotionStart(before);
  for (let index = 0; index < count; index += 1) shown = applyHpStep(shown, steps[index]!);
  return shown;
}

/** Consume the step that belongs to the floater just spawned. */
export function takeHpStep(
  steps: readonly HpStep[],
  target: HpStep["target"],
  amount: number,
): { step: HpStep | null; rest: HpStep[] } {
  const index = steps.findIndex((step) => step.target === target && step.amount === amount);
  if (index < 0) return { step: null, rest: [...steps] };
  return { step: steps[index]!, rest: steps.filter((_, item) => item !== index) };
}

/**
 * Results and a scene change show the fight's final HP.
 * A bar that is still waiting on the last hit must not be what gets handed off.
 */
export function hpForHandoff(displayed: HpReadout, finalHp: HpReadout): HpReadout {
  if (displayed.playerHp === finalHp.playerHp && displayed.enemyHp === finalHp.enemyHp) return finalHp;
  return { playerHp: finalHp.playerHp, enemyHp: finalHp.enemyHp };
}
