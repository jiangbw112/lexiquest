/** Rectangle passed to Phaser after it adds the container's display origin. */
export interface HitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Hit rectangle for a Container whose children are centered on its origin.
 *
 * Phaser adds `displayOrigin` (half the container size) before the contains
 * test. A rectangle that already starts at (-width/2, -height/2) therefore
 * covers only the top-left quarter and spills outside the art. The rectangle
 * from (0, 0) lines up with the visible control.
 */
export function containerHitArea(width: number, height: number): HitRect {
  return { x: 0, y: 0, width, height };
}

function rectContains(rect: HitRect, x: number, y: number): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.x <= x && rect.x + rect.width >= x && rect.y <= y && rect.y + rect.height >= y;
}

/** Same test Phaser runs: translate into the container, then add its display origin. */
export function pointerHitsContainer(width: number, height: number, localX: number, localY: number): boolean {
  return rectContains(containerHitArea(width, height), localX + width / 2, localY + height / 2);
}

/** Logical size of one village entrance. The texture is this size at 2×, and the hit area is the whole frame. */
export const VILLAGE_BUILDING_WIDTH = 136;
export const VILLAGE_BUILDING_HEIGHT = 128;

/** Sign label center, measured from the top-left of the building frame. */
export const VILLAGE_SIGN = { x: 68, y: 113.5 } as const;

/** Same point, relative to the container origin at the frame center. */
export function villageSignLocal(): { x: number; y: number } {
  return {
    x: VILLAGE_SIGN.x - VILLAGE_BUILDING_WIDTH / 2,
    y: VILLAGE_SIGN.y - VILLAGE_BUILDING_HEIGHT / 2,
  };
}

/** SPEC A5 / A2.1: the stretched card and its hit area are the same 80×48. */
export const MAP_WORD_CARD_WIDTH = 80;
export const MAP_WORD_CARD_HEIGHT = 48;
export const MAP_WORD_CARD_ROW = 56;
export const MAP_WORD_CARD_COL = 86;

/**
 * NineSlice is created at 160×96 and scaled by 0.5.
 * Phaser adds the display origin before the contains test, so the rect starts at 0,0.
 */
export const MAP_WORD_CARD_HIT: HitRect = { x: 0, y: 0, width: 160, height: 96 };

export function mapWordCardCenter(panelX: number, cursor: number, index: number): { x: number; y: number } {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: panelX - 84 + column * MAP_WORD_CARD_COL,
    y: cursor + 24 + row * MAP_WORD_CARD_ROW,
  };
}

/** Positive means clear space between the two 80×48 hit boxes on that axis. */
export function mapWordCardSeparation(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.abs(a.x - b.x) - MAP_WORD_CARD_WIDTH,
    y: Math.abs(a.y - b.y) - MAP_WORD_CARD_HEIGHT,
  };
}

export function mapWordCardsOverlap(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < MAP_WORD_CARD_WIDTH && Math.abs(a.y - b.y) < MAP_WORD_CARD_HEIGHT;
}

/** Offset from a word card's center. The box is the visible 80×48, edges included. */
export function pointerHitsMapWordCard(dx: number, dy: number): boolean {
  const x = dx + MAP_WORD_CARD_WIDTH / 2;
  const y = dy + MAP_WORD_CARD_HEIGHT / 2;
  return rectContains({ x: 0, y: 0, width: MAP_WORD_CARD_WIDTH, height: MAP_WORD_CARD_HEIGHT }, x, y);
}
