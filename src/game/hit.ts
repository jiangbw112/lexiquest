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

/**
 * `map_word_card` is 160×80. At scale 0.5 the picture is 80×40.
 * The rectangle starts 8 texture pixels above the frame, so the click
 * area is 80×48: 4 logical pixels past the art on the top and the bottom.
 * Phaser adds the image origin before testing this rectangle.
 */
export const MAP_WORD_CARD_HIT: HitRect = { x: 0, y: -8, width: 160, height: 96 };

/** World offset from a word card's center. Scale is 0.5 and the origin is the frame center. */
export function pointerHitsMapWordCard(dx: number, dy: number): boolean {
  const scale = 0.5;
  const x = dx / scale + 80;
  const y = dy / scale + 40;
  return rectContains(MAP_WORD_CARD_HIT, x, y);
}
