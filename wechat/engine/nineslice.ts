import { GameNode } from "./node";

export interface SliceInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 原来：warmSlice 传入 logicalW*2、logicalH*2，再 setScale(0.5)。
 * 现在：九块的源矩形按 insets 切，目标尺寸用节点的 width/height 乘 scale。
 * 为什么：调用方已经乘过 2。这里再乘一次会让面板小一半或大一倍。缺 insets 的抛错在 kit.ts，不在这里吞掉。
 */
export function nineSliceParts(width: number, height: number, insets: SliceInsets): Array<{ dx: number; dy: number; dw: number; dh: number }> {
  const midW = width - insets.left - insets.right;
  const midH = height - insets.top - insets.bottom;
  if (midW < 0 || midH < 0) throw new Error("nineslice insets exceed the frame");
  const cols = [0, insets.left, insets.left + midW];
  const rows = [0, insets.top, insets.top + midH];
  const widths = [insets.left, midW, insets.right];
  const heights = [insets.top, midH, insets.bottom];
  const parts = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      parts.push({ dx: cols[col], dy: rows[row], dw: widths[col], dh: heights[row] });
    }
  }
  return parts;
}

export class NineSlice extends GameNode {
  constructor(
    scene: unknown,
    x: number,
    y: number,
    readonly texture: string,
    readonly frame: string,
    width: number,
    height: number,
    readonly insets: SliceInsets,
  ) {
    super("nineslice", scene, x, y);
    this.originX = 0.5;
    this.originY = 0.5;
    this.width = width;
    this.height = height;
  }

  parts(): Array<{ dx: number; dy: number; dw: number; dh: number }> {
    return nineSliceParts(this.width, this.height, this.insets);
  }

  setFrame(frame: string): this {
    (this as { frame: string }).frame = frame;
    return this;
  }
}
