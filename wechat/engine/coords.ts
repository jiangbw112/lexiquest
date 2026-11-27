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
  /**
   * Canvas-space safe rectangle from the page's window measurement.
   * Absent in the Chrome adapter, which has no WeChat window API.
   */
  safe?: { left: number; top: number; right: number; bottom: number };
  /** Canvas-space menu-button capsule, when the page could read it. */
  capsule?: { left: number; top: number; right: number; bottom: number };
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

/**
 * 原来：设计字号乘 worldScale。844×390 上 18 变成约 8.78。
 * 现在：与 pages/game/layout.js 的 uiFontPx 同一张表，正文落在 14 以上，不再乘 worldScale。
 * 为什么：世界层继续等比缩放，文字按逻辑像素排。18 对应 16，不是 8.78。
 */
const SCREEN_FONT: Record<number, number> = { 12: 14, 14: 14, 16: 14, 18: 16, 20: 18, 22: 20, 28: 24, 32: 26 };

export function screenFontPx(designPx: number): number {
  const px = Number(designPx);
  let mapped = SCREEN_FONT[32];
  if (!(px > 0) || px <= 14) mapped = SCREEN_FONT[12];
  else if (px <= 16) mapped = SCREEN_FONT[16];
  else if (px <= 18) mapped = SCREEN_FONT[18];
  else if (px <= 20) mapped = SCREEN_FONT[20];
  else if (px <= 22) mapped = SCREEN_FONT[22];
  else if (px <= 28) mapped = SCREEN_FONT[28];
  return Math.max(14, mapped);
}
