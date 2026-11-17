/** Battle and exam control geometry shared by the scenes and the reveal tests. */

export const BATTLE_NOTE = { x: 490, y: 182, w: 680, h: 52 } as const;
export const BATTLE_HP_PLAYER = { x: 350, y: 92, w: 400, h: 104 } as const;
export const BATTLE_HP_ENEMY = { x: 930, y: 92, w: 400, h: 104 } as const;
export const BATTLE_WOOD = { x: 640, y: 686, w: 1056, h: 204 } as const;
export const BATTLE_ACTION_Y = 680;
export const BATTLE_ACTION_W = 148;
export const BATTLE_ACTION_H = 56;
export const BATTLE_ACTION_X = [200, 360, 520] as const;
export const BATTLE_LEAVE = { x: 640, y: 680, w: 240, h: 56 } as const;
export const BATTLE_CARD_LEFT = 670;
export const BATTLE_CARD_TOP = 592;
export const BATTLE_CARD_PITCH = 160;
export const RANGER_SWAP = { x: 640, y: 300, readyW: 140, readyH: 48, usedW: 240, usedH: 48 } as const;
export const SCOUT_HINT = { x: 640, y: 500, wrap: 420, fontPx: 16 } as const;
export const BATTLE_HERO_SCALE = 0.72;
export const BATTLE_FOOT_Y = 520;
export const MONSTER_SCALE = 0.45;
export const MONSTER_ORIGIN = { x: 0.5, y: 0.977 } as const;
export const BATTLE_TITLE_Y = 250;
export const TITLE_CHIP_W = 560;
export const TITLE_CHIP_H = 72;
export const TITLE_CHIP_SCALE = 0.5;
export const BATTLE_SHAKEN = { x: 750, y: 148, wrap: 360, fontPx: 16 } as const;
export const BATTLE_QUESTION = { x: 640, y: 696, w: 1100, h: 172 } as const;
export const EXAM_STRIKE_BUTTON = { x: 640, y: 700, w: 180, h: 56 } as const;
export const EXAM_NAME = { x: 760, y: 56, fontPx: 28 } as const;
export const EXAM_PHASE_TEXT = { x: 760, y: 132, fontPx: 18 } as const;
export const EXAM_PROMPT = { x: 160, y: 560, wrap: 960, fontPx: 28 } as const;

export function centerBox(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  return { x: x - w / 2, y: y - h / 2, w, h };
}
