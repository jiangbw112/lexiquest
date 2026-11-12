import type { SkillSlot } from "./skills";

/** Battle phases that exist today. There is no separate enemy-turn phase. */
export type SkillCardPhase = "question" | "choose" | "won" | "lost";

export type SkillCardFace = "ready" | "low_energy" | "disabled";

export type SkillCardPress = "cast" | "low-energy" | "ignore";

export function skillCardFace(input: {
  phase: SkillCardPhase;
  energy: number;
  energyCost: number;
  /** True while the enemy's hit or counterattack animation is still playing. */
  resolving?: boolean;
}): SkillCardFace {
  if (input.resolving || input.phase !== "choose") return "disabled";
  if (input.energy < input.energyCost) return "low_energy";
  return "ready";
}

/** Click and the 4/5/6 keys share this result. */
export function skillCardInput(face: SkillCardFace, via: "click" | "key"): SkillCardPress {
  if (via !== "click" && via !== "key") return "ignore";
  if (face === "ready") return "cast";
  if (face === "low_energy") return "low-energy";
  return "ignore";
}

export function skillCardInteractive(face: SkillCardFace): boolean {
  return face !== "disabled";
}

export type BattleControl = "action" | "skill" | "answer" | "leave";

/** During a question only the answers take the pointer. Action slots stay closed. */
export function battleControlOpen(phase: SkillCardPhase, control: BattleControl, resolving = false): boolean {
  if (resolving) return false;
  if (phase === "question") return control === "answer";
  if (phase === "won" || phase === "lost") return control === "leave";
  return control === "action" || control === "skill";
}

export interface SkillListFace {
  showLevel: boolean;
  showLock: boolean;
  level: number | null;
}

/** Unowned cards show a lock and no level. Owned cards show the saved level, equipped or not. */
export function skillListFace(input: { unlocked: boolean; level: number | undefined }): SkillListFace {
  if (!input.unlocked) return { showLevel: false, showLock: true, level: null };
  const level = Math.min(3, Math.max(1, input.level ?? 1));
  return { showLevel: true, showLock: false, level };
}

export function skillSlotIndexForKey(code: string): number | null {
  if (code === "Digit4") return 0;
  if (code === "Digit5") return 1;
  if (code === "Digit6") return 2;
  return null;
}

/** Both gray states use the batch-2 disabled frame. Ready cards use level or the base frame. */
export function skillCardFrame(face: SkillCardFace, origin: SkillSlot["origin"], level: number | null): string {
  if (face !== "ready") return "card_frame_disabled";
  if (origin === "base" || level == null) return "card_frame_base";
  if (level >= 3) return "card_frame_gold";
  if (level === 2) return "card_frame_silver";
  return "card_frame_bronze";
}

/** Card level on the skill page. The word "Lv" is not part of the face. */
export function starMark(level: number): string {
  const safe = Number.isFinite(level) ? Math.max(1, Math.round(level)) : 1;
  return `★${safe}`;
}

export function skillLevelFrame(level: number): string {
  if (level >= 3) return "card_lv_badge_gold";
  if (level === 2) return "card_lv_badge_silver";
  return "card_lv_badge_bronze";
}

/** Dot badge. The frame art has no digits. */
export function skillOrderFrame(order: number): string {
  const safe = Math.min(3, Math.max(1, order));
  return `equip_order_${safe}`;
}

export function skillIconFrame(skillId: string): string {
  if (skillId.endsWith("-base") || skillId.startsWith("basic-")) return "skill_base";
  return `skill_${skillId.replaceAll("-", "_")}`;
}
