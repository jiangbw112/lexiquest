import { gradeGate } from "../domain/progress";
import type { SaveData } from "../domain/types";

interface SceneHost {
  scene: { start: (key: string, data?: { mode: string }) => void };
}

/**
 * Empty grades close learn and battle.
 * An unconfirmed empty save opens the grade picker. A confirmed empty save asks the parent
 * instead, and that page does not write grades. The parent page does not create either state.
 */
export function redirectUngraded(host: SceneHost, save: SaveData): boolean {
  const gate = gradeGate(save);
  if (gate === "ready") return false;
  host.scene.start("grades", { mode: gate });
  return true;
}
