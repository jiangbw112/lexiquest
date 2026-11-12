import { CLASS_IDS } from "./classes";
import type { ClassId } from "./types";

/** A save may later record a final-exam boss. That boss is not in 1.0.0. */
export interface FinalBossMark {
  finalBossCleared?: boolean;
}

export const INVENTOR_LOCK_NOTE = "通关任意一个期末 Boss 后解锁";

/**
 * Reads the final-exam boss mark. Nothing in 1.0.0 writes it, so this is false
 * until a later version stores the clear.
 */
export function readFinalBossCleared(save: object | null | undefined): boolean {
  if (!save || !("finalBossCleared" in save)) return false;
  return (save as FinalBossMark).finalBossCleared === true;
}

function devForceUnlockClasses(): boolean {
  // Production builds replace `import.meta.env.DEV` with false and drop this body.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).get("unlockClasses") === "1";
  }
  return false;
}

/** Inventor stays locked until any final-exam boss is cleared. The other five are always open. */
export function isClassUnlocked(classId: ClassId, save: object | null | undefined): boolean {
  if (classId !== "inventor") return true;
  if (devForceUnlockClasses()) return true;
  return readFinalBossCleared(save);
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
