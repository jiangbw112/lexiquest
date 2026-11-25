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
const BG_W = 2048;
const BG_H = 800;
const UI_PAD_X = 16;
const UI_MIN_FONT = 14;
const UI_MAX_TEXT = 480;
const UI_LINE = 1.35;
const UI_FONT_SCALE = {
  12: 14,
  14: 14,
  16: 14,
  18: 16,
  20: 18,
  22: 20,
  28: 24,
  32: 26,
};

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
 * 原来：场景正文按 1280×800 的设计字号再乘 worldScale。手机横屏 18 设计 px 只剩大约 8.4–9.3 逻辑 px。
 * 现在：世界层仍用 1280×800，worldScale = min(w/1280, h/800)，背景按 2048×800 做 cover（max）。
 *       文字和热区直接用逻辑像素，不再乘 worldScale。可读字最低 14。文档里的注释 12 与这条矛盾，取 14。
 * 为什么：只有 iPad 的旧缩放能读。位置和字号不能只改一边，否则会叠住或继续缩到不可读。这是重排，不是一个倍率。
 */
function uiFontPx(designPx) {
  const px = Number(designPx);
  let mapped = UI_FONT_SCALE[32];
  if (!(px > 0) || px <= 14) mapped = UI_FONT_SCALE[12];
  else if (px <= 16) mapped = UI_FONT_SCALE[16];
  else if (px <= 18) mapped = UI_FONT_SCALE[18];
  else if (px <= 20) mapped = UI_FONT_SCALE[20];
  else if (px <= 22) mapped = UI_FONT_SCALE[22];
  else if (px <= 28) mapped = UI_FONT_SCALE[28];
  return Math.max(UI_MIN_FONT, mapped);
}

function uiContentRect(viewW, viewH, safeArea) {
  const left = Math.max(0, safeArea.left) + UI_PAD_X;
  const right = Math.min(viewW, safeArea.right) - UI_PAD_X;
  const top = Math.max(0, safeArea.top);
  const bottom = Math.min(viewH, safeArea.bottom);
  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  };
}

/**
 * @param {number} viewW window logical pixels (CSS px), not device pixels
 * @param {number} viewH window logical pixels
 * @param {{left:number, top:number, right:number, bottom:number} | null} safe
 *        safe edges in the same logical-pixel space as viewW/viewH
 * @param {number} [dpr]
 */
function layoutView(viewW, viewH, safe, dpr) {
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
  const ratio = typeof dpr === "number" && dpr > 0 ? dpr : 1;
  const safeArea = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  const coverScale = Math.max(viewW / BG_W, viewH / BG_H);
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
    viewport: { w: viewW, h: viewH, dpr: ratio, safeArea },
    world: {
      scale,
      offsetX,
      offsetY,
      coverScale,
      coverOffsetX: (viewW - BG_W * coverScale) / 2,
      coverOffsetY: (viewH - BG_H * coverScale) / 2,
    },
    ui: {
      paddingX: UI_PAD_X,
      minTouch: MIN_HIT_CSS,
      gap: MIN_GAP_CSS,
      maxTextWidth: UI_MAX_TEXT,
      minFont: UI_MIN_FONT,
      fontScale: UI_FONT_SCALE,
      content: uiContentRect(viewW, viewH, safeArea),
    },
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
 *       P0.5 在只有 x/y、没有 client 时仍减去 rect，注释里写过可能减多一次。
 * 现在：x/y 与 client 不同，按画布局部坐标，不减，source 为 local。
 *       两者相同或只有 client，减去 rect.left/top，source 为 client。
 *       只有 x/y 时不再减 rect，当成已经是画布局部坐标，source 为 local-assumed。
 * 为什么：画布一旦不在 (0,0)，对局部坐标再减 rect 会整屏点偏。source 进调试行，真机点偏时能看出是哪条假设。
 */
function canvasPoint(touch, rect) {
  if (!touch) return null;
  const left = rect && finiteNumber(rect.left) ? rect.left : 0;
  const top = rect && finiteNumber(rect.top) ? rect.top : 0;
  const hasXY = finiteNumber(touch.x) && finiteNumber(touch.y);
  const hasClient = finiteNumber(touch.clientX) && finiteNumber(touch.clientY);
  if (hasXY && hasClient) {
    const same = Math.abs(touch.x - touch.clientX) < 0.5 && Math.abs(touch.y - touch.clientY) < 0.5;
    if (!same) return { x: touch.x, y: touch.y, source: "local" };
    return { x: touch.clientX - left, y: touch.clientY - top, source: "client" };
  }
  if (hasClient) return { x: touch.clientX - left, y: touch.clientY - top, source: "client" };
  if (hasXY) return { x: touch.x, y: touch.y, source: "local-assumed" };
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

function pointerResult(state, action, pointSource) {
  return { state, action, pointSource: pointSource || null };
}

/**
 * 原来：Phaser 有 pointerdown / pointerup / pointerover。P0 只绑了 touchstart，按下就出声。
 *       P0.5 只看 changedTouches。里面没有被跟踪的 id 时状态不清除，下一发 start 被永久挡住。
 * 现在：end 分三支。changedTouches 含被跟踪 id 就正常结算。
 *       liveTouches 明确给出且不含该 id，视为手指已离开，清空且 action 为 null。
 *       liveTouches 含该 id，是别的手指抬起，保持现状。
 *       liveTouches 为 null（字段缺失，不是空数组）维持旧行为，不在这里清空。
 *       start 时若 liveTouches 明确给出且不含旧 id，先清空再接收新按下。
 *       cancel 在 liveTouches 明确为空或不含该 id 时清空；仍含该 id 则不取消。null 时沿用旧规则。
 * 为什么：别的手指抬起，和自己的 end 被吞掉，以前无法区分。空数组表示屏上已经没有触点。
 *       字段缺失不能当成空数组，否则会把还在屏上的另一指一起取消。
 *       8px 仍是热区外扩的轴对齐边，恰好 8 不取消。
 */
function reducePointer(state, event) {
  const next = {
    id: state && typeof state.id === "number" ? state.id : null,
    target: state && (state.target === "play" || state.target === "reset") ? state.target : null,
    cancelled: !!(state && state.cancelled),
  };
  const type = event && event.type;
  const touches = event && event.changedTouches ? event.changedTouches : [];
  const live = event ? event.liveTouches : null;
  if (type === "start") {
    if (next.id !== null && Array.isArray(live) && !findTouch(live, next.id)) {
      next.id = null;
      next.target = null;
      next.cancelled = false;
    }
    if (next.id !== null) return pointerResult(next, null, null);
    const first = touches[0];
    if (!first || typeof first.identifier !== "number") return pointerResult(next, null, null);
    next.id = first.identifier;
    const point = canvasPoint(first, event && event.rect);
    if (point && event && event.layout) {
      const hit = hitTest(event.layout, point.x, point.y);
      if (hit === "play" || hit === "reset") {
        next.target = hit;
        next.cancelled = false;
      }
    }
    return pointerResult(next, null, point && point.source);
  }
  if (next.id === null) return pointerResult(next, null, null);
  if (type === "cancel") {
    const listed = findTouch(touches, next.id);
    if (listed || touches.length === 0) return pointerResult(createPointerState(), null, null);
    if (Array.isArray(live) && !findTouch(live, next.id)) return pointerResult(createPointerState(), null, null);
    return pointerResult(next, null, null);
  }
  if (type === "end") {
    const ended = findTouch(touches, next.id);
    if (ended) {
      const point = canvasPoint(ended, event && event.rect);
      let action = null;
      if (point && next.target && !next.cancelled && event.layout) {
        const local = viewToDesign(event.layout, point.x, point.y);
        if (contains(event.layout.hits[next.target], local)) action = next.target;
      }
      return pointerResult(createPointerState(), action, point && point.source);
    }
    if (Array.isArray(live)) {
      if (findTouch(live, next.id)) return pointerResult(next, null, null);
      return pointerResult(createPointerState(), null, null);
    }
    return pointerResult(next, null, null);
  }
  const touch = findTouch(touches, next.id);
  if (!touch) return pointerResult(next, null, null);
  const point = canvasPoint(touch, event && event.rect);
  if (type === "move") {
    if (!point || !next.target || next.cancelled || !event.layout) return pointerResult(next, null, point && point.source);
    const rect = viewRect(event.layout, event.layout.hits[next.target]);
    if (outsideChebyshev(rect, point.x, point.y) > TOUCH_SLOP_CSS) {
      next.target = null;
      next.cancelled = true;
    }
    return pointerResult(next, null, point && point.source);
  }
  return pointerResult(next, null, point && point.source);
}

/**
 * 原来：页面没有第二条兜底。end 没带上被跟踪 id 时，按下态可以一直留着。
 * 现在：只有 touches 是数组且长度为 0 时返回 true。字段缺失（null / undefined）返回 false。
 * 为什么：空数组是“屏上没有触点”。字段缺失是“这次没报”，不能扩大成多指取消。
 *       缺失时保持 reducePointer 的旧结果，等下一次 start 带来明确的 liveTouches 再自愈。
 */
function shouldReleasePointer(pointer, touches) {
  if (!pointer || typeof pointer.id !== "number") return false;
  if (!Array.isArray(touches)) return false;
  return touches.length === 0;
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
  const source = info && info.pointSource ? info.pointSource : "none";
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
    `point ${source}`,
  ].join(" ");
}

const PROBE_COPY = {
  title: "词境练习家",
  tagline: "认识单词，收集词卡，和词灵比试。",
  start: "开始冒险 Enter",
  gradeTitle: "选年级",
  grades: ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
  gradeNote: "新的冒险从选年级开始。三到六年级可以多选。选好以后再起名字。",
  hp: "生命 8/8",
  prompt: "air 是什么意思？",
  options: ["空气", "也", "大约；关于", "在…之后"],
  example: "例句：今天的空气很新鲜。",
  portrait: "请转到横屏。",
};

function textWidth(text, fontPx) {
  let width = 0;
  const chars = Array.from(String(text));
  for (let i = 0; i < chars.length; i += 1) {
    width += chars[i].codePointAt(0) <= 0x7f ? fontPx * 0.56 : fontPx;
  }
  return width;
}

function wrapLines(text, fontPx, maxWidth) {
  const chars = Array.from(String(text));
  const lines = [];
  let line = "";
  for (let i = 0; i < chars.length; i += 1) {
    const next = line + chars[i];
    if (line && textWidth(next, fontPx) > maxWidth) {
      lines.push(line);
      line = chars[i];
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (!lines.length) lines.push("");
  return lines;
}

function pushText(texts, id, text, x, y, fontPx, maxWidth) {
  const lines = wrapLines(text, fontPx, maxWidth);
  const lineH = fontPx * UI_LINE;
  const w = lines.reduce((max, line) => Math.max(max, textWidth(line, fontPx)), 0);
  const h = lines.length * lineH;
  texts.push({
    id,
    text,
    lines,
    x,
    y,
    w,
    h,
    fontPx,
    lineH,
    maxWidth,
  });
  return h;
}

function layoutTitleProbe(texts, hits, content, y, maxText) {
  y += pushText(texts, "title", PROBE_COPY.title, content.x, y, uiFontPx(32), maxText) + MIN_GAP_CSS;
  y += pushText(texts, "tagline", PROBE_COPY.tagline, content.x, y, uiFontPx(22), maxText) + MIN_GAP_CSS;
  const fontPx = uiFontPx(18);
  const w = Math.max(MIN_HIT_CSS, Math.ceil(textWidth(PROBE_COPY.start, fontPx) + 16));
  hits.push({
    id: "start",
    x: content.x,
    y,
    w: Math.min(w, content.w),
    h: MIN_HIT_CSS,
    label: PROBE_COPY.start,
    fontPx,
  });
  return y + MIN_HIT_CSS;
}

function layoutGradeProbe(texts, hits, content, y, maxText) {
  y += pushText(texts, "grade-title", PROBE_COPY.gradeTitle, content.x, y, uiFontPx(28), maxText) + MIN_GAP_CSS;
  const fontPx = uiFontPx(16);
  const right = content.x + content.w;
  let cursor = content.x;
  let rowY = y;
  PROBE_COPY.grades.forEach((label, index) => {
    const w = Math.max(MIN_HIT_CSS, Math.ceil(textWidth(label, fontPx) + 16));
    if (cursor > content.x && cursor + w > right + 0.01) {
      rowY += MIN_HIT_CSS + MIN_GAP_CSS;
      cursor = content.x;
    }
    hits.push({
      id: `grade-${index}`,
      x: cursor,
      y: rowY,
      w,
      h: MIN_HIT_CSS,
      label,
      fontPx,
    });
    cursor += w + MIN_GAP_CSS;
  });
  y = rowY + MIN_HIT_CSS + MIN_GAP_CSS;
  y += pushText(texts, "grade-note", PROBE_COPY.gradeNote, content.x, y, uiFontPx(16), maxText);
  return y;
}

function layoutBattleProbe(texts, hits, shapes, content, y, maxText) {
  const hpPx = uiFontPx(16);
  const hpH = pushText(texts, "hp", PROBE_COPY.hp, content.x, y, hpPx, maxText);
  const hp = texts[texts.length - 1];
  const barX = hp.x + hp.w + MIN_GAP_CSS;
  const barW = Math.min(160, content.x + content.w - barX);
  shapes.push({
    id: "hp-bar",
    x: barX,
    y,
    w: Math.max(44, barW),
    h: Math.max(hpPx, 14),
  });
  y += Math.max(hpH, hpPx) + MIN_GAP_CSS;
  y += pushText(texts, "prompt", PROBE_COPY.prompt, content.x, y, uiFontPx(24), maxText) + MIN_GAP_CSS;
  const fontPx = uiFontPx(18);
  const colGap = MIN_GAP_CSS;
  const colW = (content.w - colGap) / 2;
  const labels = PROBE_COPY.options;
  const useTwo = colW >= MIN_HIT_CSS && labels.every((label) => textWidth(label, fontPx) + 16 <= colW);
  if (useTwo) {
    labels.forEach((label, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      hits.push({
        id: `opt-${index}`,
        x: content.x + col * (colW + colGap),
        y: y + row * (MIN_HIT_CSS + MIN_GAP_CSS),
        w: colW,
        h: MIN_HIT_CSS,
        label,
        fontPx,
      });
    });
    y += 2 * MIN_HIT_CSS + MIN_GAP_CSS;
  } else {
    labels.forEach((label, index) => {
      hits.push({
        id: `opt-${index}`,
        x: content.x,
        y,
        w: content.w,
        h: MIN_HIT_CSS,
        label,
        fontPx,
      });
      y += MIN_HIT_CSS + MIN_GAP_CSS;
    });
    y -= MIN_GAP_CSS;
  }
  y += MIN_GAP_CSS;
  y += pushText(texts, "example", PROBE_COPY.example, content.x, y, uiFontPx(16), maxText);
  return y;
}

/**
 * 探针帧用逻辑像素排文字和热区，不接引擎图集。骨架的 play/reset hits 仍在 layoutView.hits。
 * 竖屏只加一句提示，不白屏。放不下时由 auditProbe 报出，不删年级或选项。
 */
function layoutProbe(frame, viewW, viewH, safe) {
  const layout = layoutView(viewW, viewH, safe, 1);
  if (!layout) return null;
  const content = layout.ui.content;
  const texts = [];
  const hits = [];
  const shapes = [];
  let y = content.y;
  const maxText = Math.min(UI_MAX_TEXT, content.w);
  if (viewH > viewW) {
    y += pushText(texts, "portrait", PROBE_COPY.portrait, content.x, y, uiFontPx(16), maxText) + MIN_GAP_CSS;
  }
  if (frame === "title") layoutTitleProbe(texts, hits, content, y, maxText);
  else if (frame === "grade") layoutGradeProbe(texts, hits, content, y, maxText);
  else if (frame === "battle") layoutBattleProbe(texts, hits, shapes, content, y, maxText);
  return {
    frame,
    viewport: layout.viewport,
    world: layout.world,
    ui: layout.ui,
    texts,
    hits,
    shapes,
    content,
    portrait: viewH > viewW,
  };
}

function edgeGap(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  if (dx === 0 && dy === 0) return 0;
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return null;
}

function auditProbe(view) {
  const problems = [];
  if (!view) return ["no layout"];
  const content = view.content;
  const safe = view.viewport.safeArea;
  const solids = [];
  view.texts.forEach((text) => {
    if (text.fontPx < UI_MIN_FONT - 0.01) problems.push(`${text.id} font ${text.fontPx}`);
    text.lines.forEach((line) => {
      if (textWidth(line, text.fontPx) > text.maxWidth + 0.01) problems.push(`${text.id} wider than max`);
    });
    if (text.w > UI_MAX_TEXT + 0.01) problems.push(`${text.id} over 480`);
    if (text.x < content.x - 0.01 || text.x + text.w > content.x + content.w + 0.01) {
      problems.push(`${text.id} outside content x`);
    }
    if (text.y < safe.top - 0.01 || text.y + text.h > safe.bottom + 0.01) problems.push(`${text.id} outside safe y`);
    if (text.y + text.h > content.y + content.h + 0.01) problems.push(`${text.id} overflow`);
    solids.push({ id: text.id, x: text.x, y: text.y, w: text.w, h: text.h });
  });
  view.hits.forEach((hit) => {
    if (hit.w < MIN_HIT_CSS - 0.01 || hit.h < MIN_HIT_CSS - 0.01) problems.push(`${hit.id} hit ${hit.w}x${hit.h}`);
    if (hit.fontPx < UI_MIN_FONT - 0.01) problems.push(`${hit.id} label font`);
    if (textWidth(hit.label, hit.fontPx) + 8 > hit.w + 0.01 || hit.fontPx * UI_LINE > hit.h + 0.01) {
      problems.push(`${hit.id} label clipped`);
    }
    if (hit.x < content.x - 0.01 || hit.y < content.y - 0.01
      || hit.x + hit.w > content.x + content.w + 0.01
      || hit.y + hit.h > content.y + content.h + 0.01) {
      problems.push(`${hit.id} outside content`);
    }
    solids.push(hit);
  });
  (view.shapes || []).forEach((shape) => {
    if (shape.w < 44 - 0.01 || shape.h < 14 - 0.01) problems.push(`${shape.id} small`);
    if (shape.x < content.x - 0.01 || shape.x + shape.w > content.x + content.w + 0.01) {
      problems.push(`${shape.id} outside content`);
    }
    if (shape.y < safe.top - 0.01 || shape.y + shape.h > safe.bottom + 0.01) problems.push(`${shape.id} outside safe`);
    solids.push(shape);
  });
  for (let i = 0; i < solids.length; i += 1) {
    for (let j = i + 1; j < solids.length; j += 1) {
      const gap = edgeGap(solids[i], solids[j]);
      if (gap !== null && gap < MIN_GAP_CSS - 0.05) {
        problems.push(`gap ${solids[i].id} ${solids[j].id} ${gap}`);
      }
    }
  }
  return problems;
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
  uiFontPx,
  layoutProbe,
  auditProbe,
  shouldReleasePointer,
  PROBE_COPY,
  textWidth,
};
