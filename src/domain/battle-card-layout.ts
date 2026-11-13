/** Battle skill-card label geometry. Coordinates are top-left of the 140×176 card. */

export const BATTLE_CARD_W = 140;
export const BATTLE_CARD_H = 176;

export interface CardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BattleCardLayoutInput {
  name: string;
  /** Null on a base card, which has no ★N line. */
  star: string | null;
  energy: number;
  equipped: boolean;
}

export interface BattleCardLayout {
  name: CardBox;
  star: CardBox | null;
  /** Diamond cost marks. They sit on their own row, above the words. */
  diamonds: CardBox[];
  /** Corner medal. Null when the card has no level. */
  badge: CardBox | null;
  /** Folded order mark at the top right. Null when the card has no level. */
  order: CardBox | null;
}

const NAME_FONT = 16;
const STAR_FONT = 16;
const TEXT_H = 18;
const TEXT_GAP = 4;
const PIP = 16;
const PIP_GAP = 4;
const BADGE = 32;
const ORDER = 44;

/** Width at the card's label size. CJK and ★ use a full em so the box is not short. */
export function battleLabelWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === " ") width += fontSize * 0.33;
    else if (code >= 0x30 && code <= 0x39) width += fontSize * 0.62;
    else width += fontSize;
  }
  return Math.ceil(width);
}

function centeredText(text: string, fontSize: number, y: number): CardBox {
  const maxW = BATTLE_CARD_W - 16;
  const w = Math.min(maxW, Math.max(1, battleLabelWidth(text, fontSize)));
  return { x: (BATTLE_CARD_W - w) / 2, y, w, h: TEXT_H };
}

export function battleCardLayout(input: BattleCardLayoutInput): BattleCardLayout {
  const name = centeredText(input.name, NAME_FONT, 134);
  const star = input.star ? centeredText(input.star, STAR_FONT, name.y + TEXT_H + TEXT_GAP) : null;
  const count = Math.max(0, Math.floor(input.energy));
  const diamonds: CardBox[] = [];
  for (let i = 0; i < count; i += 1) {
    diamonds.push({ x: 10 + i * (PIP + PIP_GAP), y: 112, w: PIP, h: PIP });
  }
  const badge = input.equipped ? { x: 106, y: 52, w: BADGE, h: BADGE } : null;
  const order = input.equipped ? { x: 92, y: 4, w: ORDER, h: ORDER } : null;
  return { name, star, diamonds, badge, order };
}

/** Center of a top-left card box, in the container's center-origin space. */
export function cardBoxCenter(box: CardBox): { x: number; y: number } {
  return {
    x: box.x + box.w / 2 - BATTLE_CARD_W / 2,
    y: box.y + box.h / 2 - BATTLE_CARD_H / 2,
  };
}
