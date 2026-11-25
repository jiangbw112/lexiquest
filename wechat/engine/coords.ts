/**
 * 原来：整页按 1280×800 等比缩到窗口，正文会跟着变小。
 * 现在：世界层用 fit。UI 层用逻辑像素，不乘 worldScale。
 * 为什么：844×390 上 scale 是 0.4875，18px 设计字会变成约 8.8 逻辑像素。命中跟各自的层走，不把 UI 统一换算进世界坐标。
 * safeArea.right <= bottom 不在这里对调。合法横屏的刘海也会让 right 很小，只看这个不等式会把轴对错。
 */

export const WORLD_W = 1280;
export const WORLD_H = 800;

export interface ViewBox {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export function worldScale(view: ViewBox): number {
  return Math.min(view.w / WORLD_W, view.h / WORLD_H);
}

export function worldOffset(view: ViewBox): Point {
  const scale = worldScale(view);
  return {
    x: (view.w - WORLD_W * scale) / 2,
    y: (view.h - WORLD_H * scale) / 2,
  };
}

export function worldToScreen(point: Point, view: ViewBox): Point {
  const scale = worldScale(view);
  const offset = worldOffset(view);
  return { x: offset.x + point.x * scale, y: offset.y + point.y * scale };
}

export function screenToWorld(point: Point, view: ViewBox, rect = { left: 0, top: 0 }): Point {
  const scale = worldScale(view);
  const offset = worldOffset(view);
  return {
    x: (point.x - rect.left - offset.x) / scale,
    y: (point.y - rect.top - offset.y) / scale,
  };
}

export function uiRect(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number; layer: "ui" } {
  return { x, y, w, h, layer: "ui" };
}

export function logicalBodySize(designPx: number, view: ViewBox): number {
  return designPx * worldScale(view);
}

export const UI_BODY_PX = 16;
export const UI_HIT = 44;
export const UI_GAP = 8;
