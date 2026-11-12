import { CLASS_IDS } from "./classes";
import type { ClassId } from "./types";

/**
 * K22 hard lock for 1.0.0. This is a source literal. A later version turns it
 * on by editing this line and shipping a new build. Nothing at runtime may set it.
 */
export const INVENTOR_UNLOCK_ENABLED = false as const;

export const INVENTOR_LOCK_NOTE = "通关任意一个期末 Boss 后解锁";

export interface ClassUnlockSave {
  unlockedClassIds?: readonly string[];
}

/**
 * Inventor is not selectable while the constant is false, and that path does not
 * read the save. The other five classes are always open.
 */
export function isClassSelectable(id: ClassId, save: ClassUnlockSave | null | undefined): boolean {
  if (id !== "inventor") return true;
  if (!INVENTOR_UNLOCK_ENABLED) return false;
  return save?.unlockedClassIds?.includes(id) === true;
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
