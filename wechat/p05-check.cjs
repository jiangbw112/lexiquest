/**
 * Static, unit, and layout checks for the P0.5 skeleton.
 * This file is not a mini program runtime, not a wx mock, and not DevTools.
 * `node wechat/p05-check.cjs` from the repo root, or `node p05-check.cjs` here.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = __dirname;
const failures = [];
let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function assertClose(actual, expected, message) {
  assert(Math.abs(actual - expected) < 1e-6, `${message}: got ${actual}, expected ${expected}`);
}

function loadLayout() {
  const filename = path.join(root, "pages/game/layout.js");
  const code = fs.readFileSync(filename, "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    Math,
    Number,
    String,
  };
  vm.runInNewContext(code, sandbox, { filename });
  return sandbox.module.exports;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function methodBody(source, name) {
  const token = `\n  ${name}(`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`missing method ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unclosed method ${name}`);
}

function separation(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return Math.hypot(dx, dy);
}

function inside(container, rect, label) {
  assert(rect.x >= container.left - 0.05, `${label} left`);
  assert(rect.y >= container.top - 0.05, `${label} top`);
  assert(rect.x + rect.w <= container.right + 0.05, `${label} right`);
  assert(rect.y + rect.h <= container.bottom + 0.05, `${label} bottom`);
}

function assertTargets(api, layout, viewW, viewH, safe, label) {
  assert(layout && layout.fits, `${label} fits`);
  const play = api.viewRect(layout, layout.hits.play);
  const reset = api.viewRect(layout, layout.hits.reset);
  assert(play.w >= 44 - 1e-6 && play.h >= 44 - 1e-6, `${label} play hit`);
  assert(reset.w >= 44 - 1e-6 && reset.h >= 44 - 1e-6, `${label} reset hit`);
  assert(separation(play, reset) >= 8 - 1e-6, `${label} gap ${separation(play, reset)}`);
  const box = safe || { left: 0, top: 0, right: viewW, bottom: viewH };
  inside(box, play, `${label} play safe`);
  inside(box, reset, `${label} reset safe`);
  const boardW = api.DESIGN_W * layout.scale;
  const boardH = api.DESIGN_H * layout.scale;
  assertClose(layout.offsetX * 2 + boardW, viewW, `${label} center x`);
  assertClose(layout.offsetY * 2 + boardH, viewH, `${label} center y`);
  assertClose(boardW / api.DESIGN_W, boardH / api.DESIGN_H, `${label} uniform`);
  const limitW = viewW / api.DESIGN_W;
  const limitH = viewH / api.DESIGN_H;
  if (limitW < limitH - 1e-9) assertClose(layout.offsetX, 0, `${label} letterbox vertical only`);
  else if (limitH < limitW - 1e-9) assertClose(layout.offsetY, 0, `${label} letterbox horizontal only`);
  return { play, reset };
}

function finger(id, x, y) {
  return { identifier: id, x, y, clientX: x, clientY: y };
}

const api = loadLayout();

for (const file of ["app.js", "pages/game/layout.js", "pages/game/index.js", "p05-check.cjs"]) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });
  checks += 1;
}

assert(api.DESIGN_W === 1280 && api.DESIGN_H === 800, "design size");
assert(api.MIN_HIT_CSS === 44 && api.MIN_GAP_CSS === 8 && api.TOUCH_SLOP_CSS === 8, "hit and slop minimums");
assert(api.CANVAS_NODE_MISSING === "canvas node missing", "canvas missing string");
assert(api.CANVAS_CONTEXT_MISSING === "canvas 2d context missing", "context missing string");

const pixels = api.canvasPixels(844, 390, 3);
assert(pixels.dpr === 3 && pixels.width === 2532 && pixels.height === 1170, "landscape backing store");
const portraitPixels = api.canvasPixels(390, 844, 3);
assert(portraitPixels.width === 1170 && portraitPixels.height === 2532, "portrait backing store");
assert(api.canvasPixels(320, 568, 0).dpr === 1, "non-positive dpr falls back to 1");

const landscape = api.layoutView(844, 390, null);
const landscapeHits = assertTargets(api, landscape, 844, 390, null, "844x390");
assertClose(landscape.scale, 0.4875, "844x390 scale");
assertClose(landscape.offsetX, 110, "844x390 offsetX");
assertClose(landscape.offsetY, 0, "844x390 offsetY");

const wideSafe = { left: 40, top: 0, right: 800, bottom: 390 };
const withSafe = api.layoutView(844, 390, wideSafe);
assert(withSafe.scale === landscape.scale && withSafe.offsetX === landscape.offsetX && withSafe.offsetY === landscape.offsetY, "safe area does not change letterbox");
assertTargets(api, withSafe, 844, 390, wideSafe, "844x390 inset");

assertTargets(api, api.layoutView(932, 430, null), 932, 430, null, "932x430");
assertTargets(api, api.layoutView(390, 844, null), 390, 844, null, "390x844");
assertTargets(api, api.layoutView(320, 568, null), 320, 568, null, "320x568");
assertTargets(api, api.layoutView(1440, 900, null), 1440, 900, null, "1440x900");
const inset = { left: 120, top: 0, right: 800, bottom: 400 };
assertTargets(api, api.layoutView(800, 400, inset), 800, 400, inset, "800x400 inset 120");
assert(api.layoutView(0, 400, null) === null, "zero width has no layout");
assert(api.hitTest(landscape, 0, 0) === null, "letterbox corner misses");

const gapPoint = {
  x: landscapeHits.play.x + landscapeHits.play.w + 1,
  y: landscapeHits.play.y + landscapeHits.play.h / 2,
};
assert(api.hitTest(landscape, gapPoint.x, gapPoint.y) === null, "gap misses");

const classic = api.reconcileSafeArea({
  windowWidth: 812,
  windowHeight: 375,
  safeArea: { left: 0, right: 375, top: 44, bottom: 778, width: 375, height: 734 },
}, 812, 375);
assert(classic.swapped === true && classic.confidence === "swapped" && classic.sideUncertain === true, "portrait safeArea swaps when it overflows");
assert(classic.reason === "overflow-swapped-axes", "swap reason");
assert(classic.safeArea.left === 44 && classic.safeArea.right === 778 && classic.safeArea.top === 0 && classic.safeArea.bottom === 375, "swapped edges");
const inverse = api.reconcileSafeArea({
  windowWidth: 390,
  windowHeight: 844,
  safeArea: { left: 47, right: 844, top: 0, bottom: 390 },
}, 390, 844);
assert(inverse.swapped === true && inverse.sideUncertain === true, "landscape numbers on a portrait window also swap");
assert(inverse.safeArea.left === 0 && inverse.safeArea.top === 47 && inverse.safeArea.right === 390 && inverse.safeArea.bottom === 844, "inverse swapped edges");
assert(classic.rightLeqBottom === true, "classic case also has right<=bottom, but overflow is the cause");
const classicLayout = api.layoutView(812, 375, classic.safeArea);
assertTargets(api, classicLayout, 812, 375, classic.safeArea, "812x375 swapped safe");

const rightLeqBottomFits = api.reconcileSafeArea({
  windowWidth: 844,
  windowHeight: 390,
  safeArea: { left: 0, top: 0, right: 300, bottom: 390 },
}, 844, 390);
assert(rightLeqBottomFits.rightLeqBottom === true, "counterexample has right<=bottom");
assert(rightLeqBottomFits.swapped === false && rightLeqBottomFits.confidence === "ok", "right<=bottom alone does not swap");
assert(rightLeqBottomFits.safeArea.right === 300 && rightLeqBottomFits.safeArea.bottom === 390, "fitting safe area kept");

const portraitSafe = api.reconcileSafeArea({
  windowWidth: 390,
  windowHeight: 844,
  safeArea: { left: 0, top: 47, right: 390, bottom: 810 },
}, 390, 844);
assert(portraitSafe.rightLeqBottom === true && portraitSafe.swapped === false && portraitSafe.confidence === "ok", "portrait right<=bottom stays");

const bothOverflow = api.reconcileSafeArea({
  windowWidth: 400,
  windowHeight: 300,
  safeArea: { left: -5, top: -5, right: 500, bottom: 500 },
}, 400, 300);
assert(bothOverflow.swapped === false && bothOverflow.confidence === "uncertain" && bothOverflow.reason === "overflow-both-ways", "both axes overflow stays original");
assert(bothOverflow.safeArea.left === -5 && bothOverflow.safeArea.bottom === 500, "uncertain keeps original edges");

const rounding = api.reconcileSafeArea({
  windowWidth: 800,
  windowHeight: 400,
  safeArea: { left: 0, top: 0, right: 801, bottom: 401 },
}, 800, 400);
assert(rounding.swapped === false && rounding.confidence === "ok", "1px overflow is inside epsilon");

const clearOverflow = api.reconcileSafeArea({
  windowWidth: 800,
  windowHeight: 400,
  safeArea: { left: 0, right: 400, top: 0, bottom: 800 },
}, 800, 400);
assert(clearOverflow.swapped === true && clearOverflow.sideUncertain === true, "overflow that fits after swap");
assert(clearOverflow.safeArea.left === 0 && clearOverflow.safeArea.right === 800 && clearOverflow.safeArea.top === 0 && clearOverflow.safeArea.bottom === 400, "clear swap edges");

const missing = api.reconcileSafeArea({ windowWidth: 800, windowHeight: 400 }, 800, 400);
assert(missing.confidence === "missing" && missing.swapped === false, "missing safe area");
assert(missing.safeArea.left === 0 && missing.safeArea.right === 800 && missing.safeArea.bottom === 400, "missing uses full window");

const degenerate = api.reconcileSafeArea({
  windowWidth: 800,
  windowHeight: 400,
  safeArea: { left: 0, top: 0, right: 0, bottom: 0 },
}, 800, 400);
assert(degenerate.confidence === "missing" && degenerate.swapped === false && degenerate.safeArea.right === 800, "degenerate safe area uses full window");

const noWindow = api.reconcileSafeArea({}, 0, 0);
assert(noWindow.confidence === "missing" && noWindow.safeArea.right === 0, "no window");

const translated = api.safeAreaInCanvas({ left: 10, top: 20, right: 100, bottom: 80 }, { left: 5, top: 7 });
assert(translated.left === 5 && translated.top === 13 && translated.right === 95 && translated.bottom === 73, "safe area moves into canvas space");

const play = landscapeHits.play;
const reset = landscapeHits.reset;
const pcx = play.x + play.w / 2;
const pcy = play.y + play.h / 2;
const rcx = reset.x + reset.w / 2;
const rcy = reset.y + reset.h / 2;

const origin = { left: 0, top: 0 };
assert(api.canvasPoint(null, origin) === null, "null touch");
assert(api.canvasPoint({ pageX: 1, pageY: 2 }, origin) === null, "pageX alone is not a point");
const shifted = api.canvasPoint({ x: 15, y: 27, clientX: 15, clientY: 27 }, { left: 5, top: 7 });
assert(shifted.x === 10 && shifted.y === 20, "matching x/client subtracts rect");
const local = api.canvasPoint({ x: 10, y: 20, clientX: 15, clientY: 27 }, { left: 5, top: 7 });
assert(local.x === 10 && local.y === 20, "divergent x/y stays canvas-local");
const clientOnly = api.canvasPoint({ clientX: 15, clientY: 27 }, { left: 5, top: 7 });
assert(clientOnly.x === 10 && clientOnly.y === 20, "client-only subtracts rect");
const xyOnly = api.canvasPoint({ x: 15, y: 27 }, { left: 5, top: 7 });
assert(xyOnly.x === 15 && xyOnly.y === 27 && xyOnly.source === "local-assumed", "x/y without client stays canvas-local");
assert(shifted.source === "client", "matching x/client source is client");
assert(local.source === "local", "divergent x/y source is local");
assert(clientOnly.source === "client", "client-only source is client");
assert(api.outsideChebyshev(play, play.x + play.w + 8, pcy) === 8, "edge distance 8");
assert(api.outsideChebyshev(play, play.x + play.w + 8, play.y + play.h + 8) === 8, "corner tolerance is chebyshev");

function reduce(state, type, touches, liveTouches, layout, rect) {
  if (liveTouches === undefined) throw new Error("liveTouches is required");
  return api.reducePointer(state, {
    type,
    changedTouches: touches,
    liveTouches,
    layout: layout === undefined ? landscape : layout,
    rect: rect || origin,
  });
}

function pointerJson(pointer) {
  return JSON.stringify({
    id: pointer.id,
    target: pointer.target,
    cancelled: pointer.cancelled,
  });
}

let state = api.createPointerState();
let step = reduce(state, "start", [finger(7, pcx, pcy)], [finger(7, pcx, pcy)]);
assert(step.action === null && step.state.id === 7 && step.state.target === "play", "down highlights and does not activate");
step = reduce(step.state, "end", [finger(7, pcx, pcy)], []);
assert(step.action === "play" && step.state.id === null && step.state.target === null, "up-inside activates play");

state = api.createPointerState();
step = reduce(state, "start", [finger(1, rcx, rcy)], [finger(1, rcx, rcy)]);
step = reduce(step.state, "end", [finger(1, rcx, rcy)], []);
assert(step.action === "reset", "up-inside reset");

state = api.createPointerState();
step = reduce(state, "start", [finger(3, pcx, pcy)], [finger(3, pcx, pcy)]);
step = reduce(step.state, "move", [finger(3, play.x + play.w + 8, pcy)], [finger(3, play.x + play.w + 8, pcy)]);
assert(step.action === null && step.state.target === "play" && step.state.cancelled === false, "8px outside does not cancel");
step = reduce(step.state, "end", [finger(3, play.x + play.w + 8, pcy)], []);
assert(step.action === null, "release outside the rect does not activate");

state = api.createPointerState();
step = reduce(state, "start", [finger(4, pcx, pcy)], [finger(4, pcx, pcy)]);
step = reduce(step.state, "move", [finger(4, play.x + play.w + 8, play.y + play.h + 8)], [finger(4, play.x + play.w + 8, play.y + play.h + 8)]);
assert(step.state.cancelled === false && step.state.target === "play", "corner of the 8px box stays pressed");
step = reduce(step.state, "move", [finger(4, play.x + play.w + 9, pcy)], [finger(4, play.x + play.w + 9, pcy)]);
assert(step.action === null && step.state.target === null && step.state.cancelled === true, "more than 8px cancels");
step = reduce(step.state, "move", [finger(4, pcx, pcy)], [finger(4, pcx, pcy)]);
assert(step.state.target === null && step.state.cancelled === true, "moving back does not rearm");
step = reduce(step.state, "end", [finger(4, pcx, pcy)], []);
assert(step.action === null, "cancelled gesture does not activate on up");

state = api.createPointerState();
step = reduce(state, "start", [finger(0, pcx, pcy)], [finger(0, pcx, pcy)]);
assert(step.state.id === 0 && step.state.target === "play", "identifier 0 is a real pointer");
const heldZero = finger(0, pcx, pcy);
const blocked = reduce(step.state, "start", [finger(9, rcx, rcy)], [heldZero, finger(9, rcx, rcy)]);
assert(blocked.state.id === 0 && blocked.state.target === "play" && blocked.action === null, "second finger does not take the pointer");
const otherEnd = reduce(blocked.state, "end", [finger(9, rcx, rcy)], [heldZero]);
assert(otherEnd.state.id === 0 && otherEnd.state.target === "play" && otherEnd.action === null, "other finger end is ignored");
const otherMove = reduce(otherEnd.state, "move", [finger(9, 0, 0)], [heldZero]);
assert(otherMove.state.target === "play", "other finger move is ignored");
step = reduce(otherMove.state, "end", [finger(0, pcx, pcy)], []);
assert(step.action === "play", "tracked finger still activates");

state = api.createPointerState();
step = reduce(state, "start", [finger(1, 0, 0), finger(2, pcx, pcy)], [finger(1, 0, 0), finger(2, pcx, pcy)]);
assert(step.state.id === 1 && step.state.target === null, "only changedTouches[0] is tracked");
step = reduce(step.state, "end", [finger(2, pcx, pcy)], [finger(1, 0, 0)]);
assert(step.action === null && step.state.id === 1, "untracked finger cannot activate");

state = api.createPointerState();
step = reduce(state, "start", [finger(5, pcx, pcy)], [finger(5, pcx, pcy)]);
step = reduce(step.state, "cancel", [finger(8, pcx, pcy)], [finger(5, pcx, pcy)]);
assert(step.state.target === "play" && step.action === null, "another finger cancel keeps the press");
step = reduce(step.state, "cancel", [finger(5, pcx, pcy)], []);
assert(step.action === null && step.state.id === null && step.state.target === null, "tracked cancel clears without action");

state = api.createPointerState();
step = reduce(state, "start", [finger(6, pcx, pcy)], [finger(6, pcx, pcy)]);
step = reduce(step.state, "cancel", [], []);
assert(step.action === null && step.state.id === null, "cancel without a list clears the tracked pointer");
step = reduce(step.state, "end", [finger(6, pcx, pcy)], []);
assert(step.action === null, "end after cancel does not activate");

const rect = { left: 30, top: 12 };
const viewport = {
  identifier: 4,
  x: pcx + rect.left,
  y: pcy + rect.top,
  clientX: pcx + rect.left,
  clientY: pcy + rect.top,
};
state = api.createPointerState();
step = reduce(state, "start", [viewport], [viewport], landscape, rect);
assert(step.state.target === "play", "viewport point minus rect hits");
const divergent = {
  identifier: 4,
  x: pcx,
  y: pcy,
  clientX: pcx + 80,
  clientY: pcy + 40,
};
state = api.createPointerState();
step = reduce(state, "start", [divergent], [divergent], landscape, rect);
assert(step.state.target === "play", "canvas-local x/y is not subtracted twice");

state = api.createPointerState();
step = reduce(state, "start", [finger(7, pcx, pcy)], [finger(7, pcx, pcy)]);
const deadlockStart = pointerJson(step.state);
const deadlockStartAction = step.action;
step = reduce(step.state, "end", [finger(9, rcx, rcy)], []);
const deadlockForeignEnd = pointerJson(step.state);
const deadlockForeignAction = step.action;
assert(step.action === null && step.state.id === null && step.state.target === null, "end unrelated id + empty liveTouches clears");
step = reduce(step.state, "start", [finger(8, pcx, pcy)], [finger(8, pcx, pcy)]);
const deadlockNextStart = pointerJson(step.state);
const deadlockNextStartAction = step.action;
assert(step.state.id === 8 && step.state.target === "play" && step.state.cancelled === false, "next start after swallowed end enters press");
step = reduce(step.state, "end", [finger(8, pcx, pcy)], []);
const deadlockNextEnd = pointerJson(step.state);
const deadlockNextEndAction = step.action;
assert(step.action === "play" && step.state.id === null, "next end fires after the swallowed end");
console.log("deadlock fixed sequence");
console.log(`after start: ${deadlockStart} action ${deadlockStartAction}`);
console.log(`end changedTouches id 9, liveTouches []: ${deadlockForeignEnd} action ${deadlockForeignAction}`);
console.log(`next start: ${deadlockNextStart} action ${deadlockNextStartAction}`);
console.log(`next end: ${deadlockNextEnd} action ${deadlockNextEndAction}`);

state = api.createPointerState();
step = reduce(state, "start", [finger(7, pcx, pcy)], [finger(7, pcx, pcy)]);
step = reduce(step.state, "end", [finger(9, rcx, rcy)], [finger(7, pcx, pcy)]);
assert(step.state.id === 7 && step.state.target === "play" && step.action === null, "end unrelated id + live finger keeps the press");

state = api.createPointerState();
step = reduce(state, "start", [finger(7, pcx, pcy)], [finger(7, pcx, pcy)]);
step = reduce(step.state, "cancel", [finger(9, rcx, rcy)], []);
assert(step.action === null && step.state.id === null && step.state.target === null, "cancel unrelated id + empty liveTouches clears");

state = api.createPointerState();
step = reduce(state, "start", [finger(7, pcx, pcy)], [finger(7, pcx, pcy)]);
step = reduce(step.state, "start", [finger(3, rcx, rcy)], []);
assert(step.state.id === 3 && step.state.target === "reset" && step.state.cancelled === false, "start self-heal installs the new target");

state = api.createPointerState();
step = reduce(state, "start", [finger(7, pcx, pcy)], [finger(7, pcx, pcy)]);
step = reduce(step.state, "end", [finger(9, rcx, rcy)], null);
assert(step.state.id === 7 && step.state.target === "play" && step.action === null, "null liveTouches keeps the old end behavior");
step = reduce(step.state, "start", [finger(3, rcx, rcy)], []);
assert(step.state.id === 3 && step.state.target === "reset", "missing end self-heals on the next explicit start");

assert(api.shouldReleasePointer({ id: 7, target: "play", cancelled: false }, []) === true, "present-empty releases");
assert(api.shouldReleasePointer({ id: 7, target: "play", cancelled: false }, null) === false, "missing touches does not page-release");
assert(api.shouldReleasePointer({ id: 7, target: "play", cancelled: false }, undefined) === false, "absent touches field does not page-release");
assert(api.shouldReleasePointer({ id: null, target: null, cancelled: false }, []) === false, "idle pointer is not released");
assert(api.shouldReleasePointer({ id: 7, target: "play", cancelled: false }, [finger(7, pcx, pcy)]) === false, "a still-down finger is not page-released");

assert(api.paintedFrameNames(null).play === "btn_up" && api.paintedFrameNames("play").play === "btn_down", "play frames");
assert(api.paintedFrameNames("reset").reset === "mark" && api.paintedFrameNames("play").reset === "mark", "reset frame");
assert(api.atlasFailure("/assets/atlas/skeleton-atlas.png") === "atlas load failed: /assets/atlas/skeleton-atlas.png", "atlas failure line");
assert(api.audioFailure("decode") === "audio: decode", "audio failure line");
assert(api.audioFailure("") === "audio: unknown", "audio failure fallback");
assert(api.joinFailureLine("atlas load failed: /a", "audio: x") === "atlas load failed: /a · audio: x", "one failure line");
assert(api.joinFailureLine("", "") === "", "no failure");
assert(api.showsDebugLine("release") === false, "release hides debug");
assert(api.showsDebugLine("develop") === true && api.showsDebugLine("trial") === true, "non-release shows debug");
assert(api.showsDebugLine("") === true && api.showsDebugLine(undefined) === true, "unknown env is not treated as release");

const debug = api.formatDebugLine({
  windowWidth: 844,
  windowHeight: 390,
  dpr: 3,
  backingWidth: 2532,
  backingHeight: 1170,
  scale: landscape.scale,
  offsetX: landscape.offsetX,
  offsetY: landscape.offsetY,
  safeLeft: 0,
  safeTop: 0,
  safeRight: 844,
  safeBottom: 390,
  frames: "play=btn_up reset=mark",
  safeNote: api.safeAreaDebugNote(rightLeqBottomFits),
  rectLeft: 0,
  rectTop: 0,
});
for (const token of ["win 844x390", "dpr 3", "backing 2532x1170", "scale 0.4875", "off 110,0", "safe 0,0,844,390", "frames play=btn_up reset=mark", "safeArea ok", "rect 0,0", "point none"]) {
  assert(debug.includes(token), `debug line missing ${token}: ${debug}`);
}
const sourced = api.formatDebugLine({ pointSource: "local-assumed" });
assert(sourced.includes("point local-assumed"), "debug line prints the point source");
assert(api.safeAreaDebugNote(classic) === "swapped side-uncertain", "swap debug note");
assert(api.safeAreaDebugNote(bothOverflow) === "uncertain overflow-both-ways", "uncertain debug note");

const layoutSource = read("pages/game/layout.js");
assert(layoutSource.includes("不参与分支"), "safeArea comment explains the unused comparison");
assert(!/if\s*\(\s*rightLeqBottom/.test(layoutSource), "rightLeqBottom is not a branch");
assert(!/if\s*\(\s*sa\.right\s*<=\s*sa\.bottom\s*\)/.test(layoutSource), "right<=bottom is not a branch");
assert(layoutSource.includes("原来") && layoutSource.includes("现在") && layoutSource.includes("为什么"), "layout adaptation comments");

const pageSource = read("pages/game/index.js");
const wxml = read("pages/game/index.wxml");
assert(wxml.includes('bindtouchstart="onTouchStart"'), "touchstart");
assert(wxml.includes('bindtouchmove="onTouchMove"'), "touchmove");
assert(wxml.includes('bindtouchend="onTouchEnd"'), "touchend");
assert(wxml.includes('bindtouchcancel="onTouchCancel"'), "touchcancel");
assert(wxml.includes('wx:if="{{showCanvas}}"'), "canvas leaves the tree on fallback");
assert(wxml.includes("{{canvasNodeMissingText}}") && wxml.includes("{{canvasContextMissingText}}"), "node and context fallbacks are separate");
assert(!wxml.includes("<cover-view"), "cover-view is not the fallback");
assert(wxml.includes("需要复核"), "wxml discloses the canvas-missing deviation");
assert(pageSource.includes("需要复核"), "page discloses the canvas-missing deviation");
assert(pageSource.includes("visibilitychange"), "lifecycle comment names the old listener");
assert(pageSource.includes("wx.onWindowResize") && pageSource.includes("wx.offWindowResize"), "resize subscribe and unsubscribe");
assert(pageSource.includes("fields({ node: true, size: true, rect: true })"), "query asks for rect");
assert(pageSource.includes("replay: false"), "background state refuses replay");
assert(pageSource.includes("Array.isArray(event.touches)"), "page passes an array or null, not a missing field as empty");
assert(pageSource.includes("shouldReleasePointer"), "page fallback uses the empty-array gate");
assert(pageSource.includes("14px sans-serif"), "debug line is 14px");
assert(!pageSource.includes("12px"), "page has no 12px readable text");

const onShow = methodBody(pageSource, "onShow");
const onHide = methodBody(pageSource, "onHide");
const onUnload = methodBody(pageSource, "onUnload");
const applyAction = methodBody(pageSource, "applyAction");
assert(!onShow.includes(".play("), "onShow does not play");
assert(onShow.includes("measureAndLayout"), "onShow remeasures");
assert(onHide.includes("replay: false") && onHide.includes("stopAudio"), "onHide stops and does not arm replay");
assert(onUnload.includes("offWindowResize") && onUnload.includes("destroyAudio"), "onUnload removes listener and audio");
assert(applyAction.includes("audio.play()") && applyAction.includes("stopAudio()"), "play and reset actions");
const playCalls = pageSource.split(".play(").length - 1;
assert(playCalls === 1, `audio.play appears once, found ${playCalls}`);
assert(applyAction.includes(".play("), "the only play() is in applyAction");

for (const rel of ["pages/game/layout.js", "pages/game/index.js", "pages/game/index.wxml", "pages/game/index.wxss", "app.wxss"]) {
  const text = read(rel);
  assert(text.includes("原来") && text.includes("现在") && text.includes("为什么"), `${rel} has adaptation comments`);
}

const appJson = JSON.parse(read("app.json"));
const pageJson = JSON.parse(read("pages/game/index.json"));
const projectJson = JSON.parse(read("project.config.json"));
assert(appJson.window.pageOrientation === "landscape", "app orientation");
assert(appJson.window.navigationBarTitleText === "词境练习家", "product name");
assert(pageJson.pageOrientation === "landscape", "page orientation");
assert(appJson.resizable === true, "resizable is true");
assert(appJson.window.resizable === undefined, "resizable is not inside window");
const appText = read("app.json");
assert(appText.indexOf('"resizable"') >= 0 && appText.indexOf('"resizable"') < appText.indexOf('"window"'), "resizable is a top-level key before window");
assert(!pageJson.resizable, "page json does not set resizable");
assert(projectJson.appid === "wx63db876009dfe905", "supplied appid");
assert(!read("project.config.json").includes("touristappid"), "tourist appid removed");
assert(!read("project.config.json").includes("not supplied") && !read("project.config.json").includes("was not supplied"), "not-supplied sentence removed");
assert(projectJson.compileType === "miniprogram", "ordinary mini program");
assert(projectJson.projectname === "lexiquest-wechat", "repo english name");
const ignored = (projectJson.packOptions.ignore || []).some((item) => item && item.value === "p05-check.cjs");
assert(ignored, "node check is excluded from the mini program package");
const renderIgnored = (projectJson.packOptions.ignore || []).some((item) => item && item.value === "p06-render.cjs");
assert(renderIgnored, "probe renderer is excluded from the mini program package");
assert(read(".gitignore").includes("project.private.config.json"), "private config stays gitignored");
assert(!fs.existsSync(path.join(root, "project.private.config.json")), "private config is not in the tree");
// P0.5 禁止 engine。W3 起 wechat/engine 是移植用的小引擎，这一条改成目录必须在。
assert(fs.existsSync(path.join(root, "engine")), "engine directory is present");
assert(landscape.hits && landscape.hits.play && landscape.hits.reset, "skeleton hits remain");
assert(landscape.viewport && landscape.world && landscape.ui, "layout adds viewport world and ui");
assert(landscape.ui.minFont === 14 && landscape.ui.paddingX === 16 && landscape.ui.maxTextWidth === 480, "ui rules");
assert(landscape.world.scale === landscape.scale && landscape.world.coverScale >= landscape.scale, "letterbox stays min and cover is max");
assert(api.uiFontPx(12) === 14 && api.uiFontPx(16) === 14 && api.uiFontPx(18) === 16, "font map floor");
assert(api.uiFontPx(22) === 20 && api.uiFontPx(28) === 24 && api.uiFontPx(32) === 26, "font map titles");
const probeViews = [[844, 390], [667, 375], [1180, 820], [390, 844]];
for (const pair of probeViews) {
  const viewW = pair[0];
  const viewH = pair[1];
  for (const frame of ["title", "grade", "battle"]) {
    const probe = api.layoutProbe(frame, viewW, viewH, null);
    const problems = api.auditProbe(probe);
    assert(problems.length === 0, `${frame} ${viewW}x${viewH} ${problems.join("; ")}`);
    assert(probe.texts.length > 0 && probe.hits.length > 0, `${frame} ${viewW}x${viewH} has text and hits`);
    if (frame === "grade") assert(probe.hits.length === 6, "six grade buttons");
    if (frame === "battle") assert(probe.hits.length === 4 && probe.shapes.length === 1, "four options and an hp bar");
    if (viewH > viewW) assert(probe.texts.some((text) => text.id === "portrait"), "portrait hint");
    probe.texts.forEach((text) => {
      assert(text.fontPx >= 14, `${text.id} font ${text.fontPx}`);
    });
    probe.hits.forEach((hit) => {
      assert(hit.w >= 44 && hit.h >= 44, `${hit.id} ${hit.w}x${hit.h}`);
      assert(hit.fontPx >= 14, `${hit.id} label font`);
    });
  }
}

const codeExt = new Set([".js", ".json", ".wxml", ".wxss"]);
function walk(dir, out, extensions) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out, extensions);
    else if (extensions.has(path.extname(name)) && name !== "p05-check.cjs" && name !== "p06-render.cjs") out.push(full);
  }
}
const codeFiles = [];
walk(root, codeFiles, codeExt);
const code = codeFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert(!code.includes("<web-view"), "no web-view");
assert(!code.includes("weapp-adapter"), "no weapp-adapter");
assert(!/require\(\s*["']phaser["']\s*\)/.test(code), "no phaser require");
assert(!/appsecret/i.test(code), "no AppSecret in code");
const appIds = code.match(/wx[0-9a-f]{16}/gi) || [];
assert(appIds.length >= 1 && appIds.every((id) => id.toLowerCase() === "wx63db876009dfe905"), `only the supplied appid, found ${appIds.join(",")}`);

const png = fs.readFileSync(path.join(root, "assets/atlas/skeleton-atlas.png"));
assert(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47, "atlas png still present");
const atlas = JSON.parse(read("assets/atlas/skeleton-atlas.json"));
assert(atlas.frames.btn_up && atlas.frames.btn_down && atlas.frames.mark, "atlas frames");
const wav = fs.readFileSync(path.join(root, "assets/audio/tap.wav"));
assert(wav.slice(0, 4).toString("ascii") === "RIFF" && wav.slice(8, 12).toString("ascii") === "WAVE", "tap.wav still present");

if (failures.length) {
  console.error(`p05-check: ${failures.length} failed, ${checks} checks`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("p05-check: static/unit/layout only — not WeChat DevTools, not a device, not a wx mock runtime");
console.log(`checks ${checks}`);
console.log(`landscape 844x390 scale ${landscape.scale} offset ${landscape.offsetX},${landscape.offsetY} play ${landscapeHits.play.w}x${landscapeHits.play.h}`);
console.log(`safeArea swapped sample edges ${classic.safeArea.left},${classic.safeArea.top},${classic.safeArea.right},${classic.safeArea.bottom} sideUncertain ${classic.sideUncertain}`);
console.log(`safeArea right<=bottom kept right ${rightLeqBottomFits.safeArea.right} bottom ${rightLeqBottomFits.safeArea.bottom} swapped ${rightLeqBottomFits.swapped}`);
console.log(`debug ${debug}`);
