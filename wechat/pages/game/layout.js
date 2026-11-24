/**
 * Design-space layout for the P0 page only.
 * This is not wechat/engine (that directory is P1 and is not created here).
 *
 * 原来：Phaser.Scale.FIT + CENTER_BOTH 把 1280×800 放进 #game，canvas 像素由 Phaser 按设备像素比处理，input.touch 为 false。
 * 现在：页面自己算等比缩放、letterbox、安全区，并把窗口逻辑像素换回设计坐标做命中。
 * 为什么：小程序画布没有 Phaser 的 Scale，触点是窗口逻辑像素，热区必须在设计坐标和窗口逻辑像素两边都够大。
 */

const DESIGN_W = 1280;
const DESIGN_H = 800;
const MIN_HIT_CSS = 44;
const MIN_GAP_CSS = 8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function canvasPixels(viewW, viewH, dpr) {
  const ratio = typeof dpr === "number" && dpr > 0 ? dpr : 1;
  return {
    dpr: ratio,
    width: Math.max(1, Math.round(viewW * ratio)),
    height: Math.max(1, Math.round(viewH * ratio)),
  };
}

/**
 * @param {number} viewW window logical pixels (CSS px), not device pixels
 * @param {number} viewH window logical pixels
 * @param {{left:number, top:number, right:number, bottom:number} | null} safe
 *        safe edges in the same logical-pixel space as viewW/viewH
 */
function layoutView(viewW, viewH, safe) {
  if (!(viewW > 0) || !(viewH > 0)) return null;
  const box = safe || { left: 0, top: 0, right: viewW, bottom: viewH };
  const scale = Math.min(viewW / DESIGN_W, viewH / DESIGN_H);
  const offsetX = (viewW - DESIGN_W * scale) / 2;
  const offsetY = (viewH - DESIGN_H * scale) / 2;
  const hit = Math.max(MIN_HIT_CSS, MIN_HIT_CSS / scale);
  const gap = Math.max(MIN_GAP_CSS, MIN_GAP_CSS / scale);
  const usable = {
    x: clamp((box.left - offsetX) / scale, 0, DESIGN_W),
    y: clamp((box.top - offsetY) / scale, 0, DESIGN_H),
    right: clamp((box.right - offsetX) / scale, 0, DESIGN_W),
    bottom: clamp((box.bottom - offsetY) / scale, 0, DESIGN_H),
  };
  const titleSize = Math.max(MIN_HIT_CSS, 32 / scale);
  const titleBlock = titleSize * 1.25;
  const x = usable.x + gap;
  const y = usable.y + titleBlock + gap;
  const play = { id: "play", x, y, w: hit, h: hit };
  let reset = { id: "reset", x: x + hit + gap, y, w: hit, h: hit };
  if (reset.x + reset.w > usable.right - gap) {
    reset = { id: "reset", x, y: y + hit + gap, w: hit, h: hit };
  }
  const needRight = Math.max(play.x + play.w, reset.x + reset.w);
  const needBottom = Math.max(play.y + play.h, reset.y + reset.h);
  const fits = usable.right > usable.x
    && usable.bottom > usable.y
    && play.x >= usable.x - 0.01
    && play.y >= usable.y - 0.01
    && needRight <= usable.right + 0.01
    && needBottom <= usable.bottom + 0.01;
  return {
    scale,
    offsetX,
    offsetY,
    hit,
    gap,
    titleSize,
    usable,
    fits,
    title: { x: usable.x + gap, y: usable.y, size: titleSize },
    hits: { play, reset },
  };
}

function viewToDesign(layout, viewX, viewY) {
  return {
    x: (viewX - layout.offsetX) / layout.scale,
    y: (viewY - layout.offsetY) / layout.scale,
  };
}

function contains(rect, point) {
  return point.x >= rect.x
    && point.y >= rect.y
    && point.x < rect.x + rect.w
    && point.y < rect.y + rect.h;
}

function hitTest(layout, viewX, viewY) {
  if (!layout || !(layout.scale > 0)) return null;
  const point = viewToDesign(layout, viewX, viewY);
  if (contains(layout.hits.play, point)) return "play";
  if (contains(layout.hits.reset, point)) return "reset";
  return null;
}

function viewRect(layout, rect) {
  return {
    x: layout.offsetX + rect.x * layout.scale,
    y: layout.offsetY + rect.y * layout.scale,
    w: rect.w * layout.scale,
    h: rect.h * layout.scale,
  };
}

module.exports = {
  DESIGN_W,
  DESIGN_H,
  MIN_HIT_CSS,
  MIN_GAP_CSS,
  canvasPixels,
  layoutView,
  hitTest,
  viewRect,
};
