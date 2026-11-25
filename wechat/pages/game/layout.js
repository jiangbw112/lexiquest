/**
 * Design-space layout for the P0/P0.5 page only.
 * This is not wechat/engine (that directory is P1 and is not created here).
 *
 * 原来：Phaser.Scale.FIT + CENTER_BOTH 把 1280×800 放进 #game，canvas 像素由 Phaser 按设备像素比处理，input.touch 为 false。
 * 现在：页面自己算等比缩放、letterbox、安全区，并把窗口逻辑像素换回设计坐标做命中。横屏只改页面方向，不改这套缩放。
 * 为什么：小程序画布没有 Phaser 的 Scale，触点是窗口逻辑像素，热区必须在设计坐标和窗口逻辑像素两边都够大。
 */

const DESIGN_W = 1280;
const DESIGN_H = 800;
const MIN_HIT_CSS = 44;
const MIN_GAP_CSS = 8;
const TOUCH_SLOP_CSS = 8;
const SAFE_EDGE_EPS = 1;
const CANVAS_NODE_MISSING = "canvas node missing";
const CANVAS_CONTEXT_MISSING = "canvas 2d context missing";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveNumber(value) {
  return finiteNumber(value) && value > 0;
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
 * 原来：P0 把 wx.getWindowInfo().safeArea 的四边直接交给 layoutView，默认它们和 windowWidth/windowHeight 同一坐标系。
 * 现在：只有原矩形越出当前窗口、且把 left/right 与 top/bottom 对调后能落进窗口时才对调。
 *       safeArea.right <= safeArea.bottom 只记在结果里，不参与分支。对调后仍把侧向标成不确定。
 * 为什么：横屏后部分 iOS 微信仍按竖屏坐标给 safeArea，bottom 会大于当前 windowHeight。
 *       合法横屏也可能因为侧边刘海让 right 很小，从而 right <= bottom；只看这个不等式会把没反的轴对调错。
 *       对调方向固定是 portrait 的 top/bottom 放到 landscape 的 left/right。
 *       getWindowInfo 看不出顺时针还是逆时针，刘海可能在另一侧，所以侧向不能当成已确认。
 *       原矩形已经在窗口内就一律不对调。两边都越界也不对调，留给 layoutView 夹紧。
 *       safeArea.width/height 若和四边不一致，仍以四边为准，因为布局只用四边。
 */
function reconcileSafeArea(info, fallbackW, fallbackH) {
  const ww = info && positiveNumber(info.windowWidth) ? info.windowWidth : fallbackW;
  const wh = info && positiveNumber(info.windowHeight) ? info.windowHeight : fallbackH;
  const empty = {
    safeArea: { left: 0, top: 0, right: 0, bottom: 0 },
    swapped: false,
    sideUncertain: false,
    confidence: "missing",
    reason: "missing-or-degenerate",
    rightLeqBottom: false,
  };
  if (!positiveNumber(ww) || !positiveNumber(wh)) return empty;
  const full = { left: 0, top: 0, right: ww, bottom: wh };
  const sa = info && info.safeArea;
  if (!sa || !finiteNumber(sa.left) || !finiteNumber(sa.top) || !finiteNumber(sa.right) || !finiteNumber(sa.bottom)
    || !(sa.right > sa.left) || !(sa.bottom > sa.top)) {
    return {
      safeArea: full,
      swapped: false,
      sideUncertain: false,
      confidence: "missing",
      reason: "missing-or-degenerate",
      rightLeqBottom: false,
    };
  }
  const original = { left: sa.left, top: sa.top, right: sa.right, bottom: sa.bottom };
  const swapped = { left: sa.top, top: sa.left, right: sa.bottom, bottom: sa.right };
  const rightLeqBottom = sa.right <= sa.bottom;
  const originalOverflows = boxOverflows(original, ww, wh);
  const swappedOverflows = boxOverflows(swapped, ww, wh);
  // 分支只看越界，不看 rightLeqBottom。
  if (originalOverflows && !swappedOverflows) {
    return {
      safeArea: swapped,
      swapped: true,
      sideUncertain: true,
      confidence: "swapped",
      reason: "overflow-swapped-axes",
      rightLeqBottom,
    };
  }
  if (originalOverflows && swappedOverflows) {
    return {
      safeArea: original,
      swapped: false,
      sideUncertain: false,
      confidence: "uncertain",
      reason: "overflow-both-ways",
      rightLeqBottom,
    };
  }
  return {
    safeArea: original,
    swapped: false,
    sideUncertain: false,
    confidence: "ok",
    reason: "fits-window",
    rightLeqBottom,
  };
}

function boxOverflows(box, width, height) {
  return box.left < -SAFE_EDGE_EPS
    || box.top < -SAFE_EDGE_EPS
    || box.right > width + SAFE_EDGE_EPS
    || box.bottom > height + SAFE_EDGE_EPS
    || !(box.right > box.left)
    || !(box.bottom > box.top);
}

function safeAreaInCanvas(safe, rect) {
  const left = rect && finiteNumber(rect.left) ? rect.left : 0;
  const top = rect && finiteNumber(rect.top) ? rect.top : 0;
  return {
    left: safe.left - left,
    top: safe.top - top,
    right: safe.right - left,
    bottom: safe.bottom - top,
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

/**
 * 原来：P0 优先取 touch.x/y，否则 clientX/clientY，并默认画布在窗口 (0,0)，不减 rect。
 * 现在：selectorQuery 同时取 rect。x/y 与 clientX/clientY 不同时，x/y 已是画布坐标，不减。
 *       两者相同，或只有 client，则减去 rect.left/top。rect 缺省或是 0 时减 0，结果与 P0 重合。
 *       只有 x/y、没有 client，且 rect 不是原点时，仍按视口坐标去减。这一支无法分辨“已经是画布坐标”的运行时，可能减多一次。
 * 为什么：官方 Touch 的 clientX/clientY 相对页面可视区域，不是相对画布。画布不在 (0,0) 时不减会点偏。
 *       基础库有时另外给 canvas 局部 x/y。两套都在且数值不同，才说明 x/y 已经是局部坐标，不能再减。
 */
function canvasPoint(touch, rect) {
  if (!touch) return null;
  const left = rect && finiteNumber(rect.left) ? rect.left : 0;
  const top = rect && finiteNumber(rect.top) ? rect.top : 0;
  const hasXY = finiteNumber(touch.x) && finiteNumber(touch.y);
  const hasClient = finiteNumber(touch.clientX) && finiteNumber(touch.clientY);
  if (hasXY && hasClient) {
    const same = Math.abs(touch.x - touch.clientX) < 0.5 && Math.abs(touch.y - touch.clientY) < 0.5;
    if (!same) return { x: touch.x, y: touch.y };
    return { x: touch.clientX - left, y: touch.clientY - top };
  }
  if (hasClient) return { x: touch.clientX - left, y: touch.clientY - top };
  if (hasXY) return { x: touch.x - left, y: touch.y - top };
  return null;
}

function outsideChebyshev(rect, x, y) {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  const dx = x < rect.x ? rect.x - x : (x > right ? x - right : 0);
  const dy = y < rect.y ? rect.y - y : (y > bottom ? y - bottom : 0);
  return Math.max(dx, dy);
}

function createPointerState() {
  return { id: null, target: null, cancelled: false };
}

function findTouch(list, id) {
  if (!list || typeof list.length !== "number") return null;
  for (let i = 0; i < list.length; i += 1) {
    const touch = list[i];
    if (touch && touch.identifier === id) return touch;
  }
  return null;
}

/**
 * 原来：Phaser 有 pointerdown / pointerup / pointerover。P0 只绑了 touchstart，按下就出声，右键负责复位，没有移出取消。
 * 现在：只认 changedTouches[0].identifier 这一支指针。按下进入目标的按下态，不发声。
 *       抬起时仍在该热区内才返回 play 或 reset。移出热区超过 8 个窗口逻辑像素则取消，再移回来也不重新点亮。
 *       touchcancel 不触发动作。容差是热区外扩 8px 的轴对齐边（切比雪夫），恰好 8 不取消。
 * 为什么：小程序没有 hover，pointerover 没有对应事件。双指如果各算各的，会把左右两个热区一起触发。
 *       8px 用窗口逻辑像素，不用设计坐标，也不用设备像素；scale 小于 1 时设计坐标里的 8 会比手指上的 8 更小。
 */
function reducePointer(state, event) {
  const next = {
    id: state && typeof state.id === "number" ? state.id : null,
    target: state && (state.target === "play" || state.target === "reset") ? state.target : null,
    cancelled: !!(state && state.cancelled),
  };
  const type = event && event.type;
  const touches = event && event.changedTouches ? event.changedTouches : [];
  if (type === "start") {
    if (next.id !== null) return { state: next, action: null };
    const first = touches[0];
    if (!first || typeof first.identifier !== "number") return { state: next, action: null };
    next.id = first.identifier;
    const point = canvasPoint(first, event && event.rect);
    if (point && event && event.layout) {
      const hit = hitTest(event.layout, point.x, point.y);
      if (hit === "play" || hit === "reset") {
        next.target = hit;
        next.cancelled = false;
      }
    }
    return { state: next, action: null };
  }
  if (next.id === null) return { state: next, action: null };
  if (type === "cancel") {
    const listed = findTouch(touches, next.id);
    if (!listed && touches.length > 0) return { state: next, action: null };
    return { state: createPointerState(), action: null };
  }
  const touch = findTouch(touches, next.id);
  if (!touch) return { state: next, action: null };
  const point = canvasPoint(touch, event && event.rect);
  if (type === "move") {
    if (!point || !next.target || next.cancelled || !event.layout) return { state: next, action: null };
    const rect = viewRect(event.layout, event.layout.hits[next.target]);
    if (outsideChebyshev(rect, point.x, point.y) > TOUCH_SLOP_CSS) {
      next.target = null;
      next.cancelled = true;
    }
    return { state: next, action: null };
  }
  if (type === "end") {
    let action = null;
    if (point && next.target && !next.cancelled && event.layout) {
      const local = viewToDesign(event.layout, point.x, point.y);
      if (contains(event.layout.hits[next.target], local)) action = next.target;
    }
    return { state: createPointerState(), action };
  }
  return { state: next, action: null };
}

function paintedFrameNames(pressTarget) {
  return {
    play: pressTarget === "play" ? "btn_down" : "btn_up",
    reset: "mark",
  };
}

function atlasFailure(src) {
  return `atlas load failed: ${src}`;
}

function audioFailure(errMsg) {
  return `audio: ${errMsg || "unknown"}`;
}

function joinFailureLine(atlasMsg, audioMsg) {
  const parts = [];
  if (atlasMsg) parts.push(atlasMsg);
  if (audioMsg) parts.push(audioMsg);
  return parts.join(" · ");
}

function showsDebugLine(envVersion) {
  return envVersion !== "release";
}

function trimNum(value) {
  if (!finiteNumber(value)) return "?";
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

function safeAreaDebugNote(decision) {
  if (!decision) return "missing";
  if (decision.confidence === "ok") return "ok";
  if (decision.confidence === "swapped") return "swapped side-uncertain";
  return `${decision.confidence} ${decision.reason}`;
}

function formatDebugLine(info) {
  const frames = info && info.frames ? info.frames : "play=btn_up reset=mark";
  return [
    `win ${trimNum(info && info.windowWidth)}x${trimNum(info && info.windowHeight)}`,
    `dpr ${trimNum(info && info.dpr)}`,
    `backing ${trimNum(info && info.backingWidth)}x${trimNum(info && info.backingHeight)}`,
    `scale ${trimNum(info && info.scale)}`,
    `off ${trimNum(info && info.offsetX)},${trimNum(info && info.offsetY)}`,
    `safe ${trimNum(info && info.safeLeft)},${trimNum(info && info.safeTop)},${trimNum(info && info.safeRight)},${trimNum(info && info.safeBottom)}`,
    `frames ${frames}`,
    `safeArea ${info && info.safeNote ? info.safeNote : "missing"}`,
    `rect ${trimNum(info && info.rectLeft)},${trimNum(info && info.rectTop)}`,
  ].join(" ");
}

module.exports = {
  DESIGN_W,
  DESIGN_H,
  MIN_HIT_CSS,
  MIN_GAP_CSS,
  TOUCH_SLOP_CSS,
  SAFE_EDGE_EPS,
  CANVAS_NODE_MISSING,
  CANVAS_CONTEXT_MISSING,
  canvasPixels,
  reconcileSafeArea,
  safeAreaInCanvas,
  layoutView,
  hitTest,
  viewRect,
  canvasPoint,
  outsideChebyshev,
  createPointerState,
  reducePointer,
  paintedFrameNames,
  atlasFailure,
  audioFailure,
  joinFailureLine,
  showsDebugLine,
  safeAreaDebugNote,
  formatDebugLine,
};
