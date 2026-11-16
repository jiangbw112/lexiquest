import type { ClassDef } from "./classes";
import { skillById, starterSkillId } from "./skills";
import type { ClassId } from "./types";

/**
 * Prefix for the starter card name on a selectable class card.
 * The talent line is the stored talent sentence. A separate talent label is omitted
 * because its second character is outside the core font subset.
 */
export const STARTER_CARD_LABEL = "起始卡";

/**
 * Locked class-card outline. Equal red, green, and blue, so it is gray.
 * CLASS_SPEC v1.0.3 is not in this repo, and no token here is named for this stroke.
 */
export const LOCKED_CARD_STROKE = 0x6e6e6e;

export function starterCardName(classId: ClassId): string {
  const skill = skillById(starterSkillId(classId));
  if (!skill) throw new Error(`No starter card for ${classId}`);
  return skill.name;
}

export function starterCardLine(classId: ClassId): string {
  return `${STARTER_CARD_LABEL} ${starterCardName(classId)}`;
}

/** Phaser stroke from the primary already stored on the class. */
export function classPrimaryStroke(def: ClassDef): number {
  const hex = def.color.startsWith("#") ? def.color.slice(1) : def.color;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Bad class color ${def.color}`);
  return Number.parseInt(hex, 16);
}
