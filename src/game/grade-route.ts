import { gradeGate } from "../domain/progress";
import type { SaveData } from "../domain/types";

interface SceneHost {
  scene: { start: (key: string, data?: { mode: string }) => void };
}

/**
 * Empty grades close learn and battle.
 * A save that never had a grade still uses the migrate page.
 * A save whose grades a parent later cleared does not: that page writes grades without the PIN.
 */
export function redirectUngraded(host: SceneHost, save: SaveData): boolean {
  const gate = gradeGate(save);
  if (gate === "ready") return false;
  host.scene.start("grades", { mode: gate });
  return true;
}
