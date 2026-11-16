import { CLASS_IDS } from "./classes";
import { hasClearedAnyFinal } from "./exams";
import type { ClassId } from "./types";

/**
 * Source literal for the final-exam build. Nothing at runtime may set it.
 * Selection reads examProgress through hasClearedAnyFinal, not the reserved fields.
 */
export const INVENTOR_UNLOCK_ENABLED = true as const;

export const INVENTOR_LOCK_TITLE = "藏起来的职业";
/** Subtitle under the locked card. It is not the click dialog. */
export const INVENTOR_LOCK_NOTE = "打败期末大 Boss 后解锁";
/** CLASS_SPEC v1.0.3 §5.4.3 `lock.tip`. The dialog uses this whole sentence. */
export const INVENTOR_LOCK_TIP =
  "这里藏着一位新朋友。打败任意一个期末大 Boss，就能请它加入。";
export const INVENTOR_LOCK_TIP_BUTTON = "好的";
/** Same label as `INVENTOR_LOCK_TIP_BUTTON`. The dialog has this one button. */
export const INVENTOR_LOCK_BUTTON = INVENTOR_LOCK_TIP_BUTTON;
export const INVENTOR_SWITCH_LOCKED_TIP = "打败期末大 Boss 后才能换成它。";
export const INVENTOR_UNLOCK_MAIN = "你打败了期末大 Boss，发明家来找你了！";
export const INVENTOR_UNLOCK_SUB = "可以在技能页换成发明家。";
export const INVENTOR_UNLOCK_GO = "去看看";
export const INVENTOR_UNLOCK_LATER = "等会儿";

export interface ClassUnlockSave {
  unlockedClassIds?: readonly string[];
  examProgress?: Record<string, { cleared?: boolean } | undefined>;
}

/**
 * Inventor is selectable only after a whitelist final is cleared.
 * The other five classes are always open. The constant is not a runtime switch.
 */
export function isClassSelectable(id: ClassId, save: ClassUnlockSave | null | undefined): boolean {
  if (id !== "inventor") return true;
  if (!INVENTOR_UNLOCK_ENABLED) return false;
  return hasClearedAnyFinal(save);
}

/** Same gate as isClassSelectable. Create and load both use it. */
export function isClassUnlocked(classId: ClassId, save: ClassUnlockSave | null | undefined): boolean {
  return isClassSelectable(classId, save);
}

/** Missing, unknown, and still-locked ids play as the warrior. */
export function resolvedClassId(value: unknown, save: object | null | undefined): ClassId {
  if (typeof value !== "string" || !CLASS_IDS.includes(value as ClassId)) return "warrior";
  const id = value as ClassId;
  return isClassUnlocked(id, save) ? id : "warrior";
}

/** A locked card stays on the class the player already chose. */
export function selectClass(current: ClassId, requested: ClassId, save: object | null | undefined): ClassId {
  return isClassUnlocked(requested, save) ? requested : current;
}

/** Locked inventor returns the tip and must not change the selected class. */
export function lockedCardTip(id: ClassId, save: object | null | undefined): string | null {
  return isClassUnlocked(id, save) ? null : INVENTOR_LOCK_TIP;
}
