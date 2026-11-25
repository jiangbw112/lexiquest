import { displayBox, type GameNode } from "./node";

/**
 * 原来：Phaser.Geom.Rectangle.Contains，容器还要加上 display origin。
 * 现在：命中用节点自己的显示盒，盒已经扣过 origin 和 scale。
 * 为什么：UI 热区和世界精灵不在同一个 scale 上，命中必须跟该节点的绘制盒走，不能再统一乘 1280 的 worldScale。
 */
export function hitContains(node: GameNode, x: number, y: number): boolean {
  if (!node.inputEnabled || !node.visible) return false;
  const box = node.hitRect
    ? {
        x: node.x - node.originX * node.width * node.scaleX + node.hitRect.x * node.scaleX,
        y: node.y - node.originY * node.height * node.scaleY + node.hitRect.y * node.scaleY,
        w: node.hitRect.width * node.scaleX,
        h: node.hitRect.height * node.scaleY,
      }
    : displayBox(node);
  return x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
}

export const Rectangle = {
  Contains(rect: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean {
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
  },
};

export class GeomRectangle {
  constructor(public x: number, public y: number, public width: number, public height: number) {}
  static Contains = Rectangle.Contains;
}
