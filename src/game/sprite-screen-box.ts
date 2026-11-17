/**
 * Screen box of one trimmed atlas frame after Phaser draws it.
 * plant() sets an origin in trim space, then displayOrigin multiplies by the
 * untrimmed source size. setOrigin() multiplies the pivot by that same size.
 * Both then draw at -displayOrigin + spriteSourceSize, times scale.
 */

export interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasFrame {
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pivot?: { x: number; y: number };
}

export function drawnSpriteBox(
  frame: AtlasFrame,
  footX: number,
  footY: number,
  scale: number,
  mode: "plant" | "origin",
  pivot: { x: number; y: number },
): ScreenBox {
  const src = frame.spriteSourceSize;
  const realW = frame.sourceSize.w;
  const realH = frame.sourceSize.h;
  const trimW = src.w || 1;
  const trimH = src.h || 1;
  const displayOriginX = mode === "plant" ? ((pivot.x * realW - src.x) / trimW) * realW : pivot.x * realW;
  const displayOriginY = mode === "plant" ? ((pivot.y * realH - src.y) / trimH) * realH : pivot.y * realH;
  return {
    x: footX + (-displayOriginX + src.x) * scale,
    y: footY + (-displayOriginY + src.y) * scale,
    w: src.w * scale,
    h: src.h * scale,
  };
}

/**
 * Pivot applied on the untrimmed source, without the trim-space origin that
 * plant() actually uses. That shortcut sits about 35px below the real draw.
 */
export function naivePivotBox(
  frame: AtlasFrame,
  footX: number,
  footY: number,
  scale: number,
  pivot: { x: number; y: number },
): ScreenBox {
  const src = frame.spriteSourceSize;
  return {
    x: footX + (-pivot.x * frame.sourceSize.w + src.x) * scale,
    y: footY + (-pivot.y * frame.sourceSize.h + src.y) * scale,
    w: src.w * scale,
    h: src.h * scale,
  };
}
