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

/** Village house outline. The points sit above and below the polygon's position. */
export const VILLAGE_HOUSE_POINTS = [0, -28, 54, -8, 54, 34, 0, 54, -54, 34, -54, -8];

function pointInPolygon(points: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let inside = false;
  for (let i = -1, j = points.length - 1; ++i < points.length; j = i) {
    const ix = points[i]!.x;
    const iy = points[i]!.y;
    const jx = points[j]!.x;
    const jy = points[j]!.y;
    if (((iy <= y && y < jy) || (jy <= y && y < iy)) && x < ((jx - ix) * (y - iy)) / (jy - iy) + ix) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Polygon input points already include the shape's display origin.
 * Subtract it so the test uses the same coordinates as the drawn vertices.
 */
export function polygonContainsAtVisual(
  polygon: { points: readonly { x: number; y: number }[] },
  x: number,
  y: number,
  target: { displayOriginX: number; displayOriginY: number },
): boolean {
  return pointInPolygon(polygon.points, x - target.displayOriginX, y - target.displayOriginY);
}
