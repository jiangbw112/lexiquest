import { gradeGate } from "../domain/progress";
import type { SaveData } from "../domain/types";

interface SceneHost {
  scene: { start: (key: string, data?: { mode: string }) => void };
}

/**
 * Empty grades close learn and battle and open the grade picker.
 * That picker is for a save that is already empty. The parent page does not write an empty list.
 */
export function redirectUngraded(host: SceneHost, save: SaveData): boolean {
  const gate = gradeGate(save);
  if (gate === "ready") return false;
  host.scene.start("grades", { mode: gate });
  return true;
}
