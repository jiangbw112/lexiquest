/**
 * P0.6 adversarial checks for the pointer reducer and the canvas point source.
 *
 * This drives pages/game/layout.js directly in Node. It is NOT a device test:
 * it cannot prove that WeChat delivers touches the way this script assumes,
 * nor that audio plays. It only proves the reducer's own decisions.
 *
 * Usage: node tools/p06-adversarial.cjs
 */

const path = require("path");
const L = require(path.join(__dirname, "..", "pages/game", "layout.js"));

let checks = 0;
const failures = [];
const notes = [];
function ok(cond, name, detail) {
  checks += 1;
  if (!cond) failures.push(detail ? `${name} — ${detail}` : name);
}
function note(cond, name, detail) {
  checks += 1;
  if (!cond) failures.push(detail ? `${name} — ${detail}` : name);
  else notes.push(detail ? `${name} — ${detail}` : name);
}

const VIEW = { w: 844, h: 390 };
const layout = L.layoutView(VIEW.w, VIEW.h, null, 3);
const rect = { left: 0, top: 0 };
const play = L.viewRect(layout, layout.hits.play);
const cx = play.x + play.w / 2;
const cy = play.y + play.h / 2;

function touch(id, x, y) {
  return { identifier: id, x, y, clientX: x, clientY: y };
}
function ev(type, changed, live, extra) {
  return Object.assign({
    type,
    changedTouches: changed,
    liveTouches: live,
    rect,
    layout,
  }, extra || {});
}

function pressStart(state, id, x, y, live) {
  return L.reducePointer(state, ev("start", [touch(id, x, y)], live === undefined ? [touch(id, x, y)] : live));
}

// 1. Press, drag 60px out, release: cancel and no action.
{
  let r = pressStart(L.createPointerState(), 1, cx, cy);
  ok(r.state.target === "play", "press inside arms play", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("move", [touch(1, cx, cy - 60)], [touch(1, cx, cy - 60)]));
  ok(r.state.cancelled === true && r.state.target === null, "drag 60px out cancels", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("end", [touch(1, cx, cy - 60)], []));
  ok(r.action === null, "release after drag-out has no action", String(r.action));
  ok(r.state.id === null && r.state.target === null, "release after drag-out clears state", JSON.stringify(r.state));
}

// 2. Drag exactly 8px keeps the press; 9px cancels (slop boundary).
{
  const edge = L.viewRect(layout, layout.hits.play);
  let r = pressStart(L.createPointerState(), 1, cx, cy);
  r = L.reducePointer(r.state, ev("move", [touch(1, cx, edge.y - 8)], [touch(1, cx, edge.y - 8)]));
  ok(r.state.cancelled === false, "8px outside keeps the press", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("move", [touch(1, cx, edge.y - 9)], [touch(1, cx, edge.y - 9)]));
  ok(r.state.cancelled === true, "9px outside cancels", JSON.stringify(r.state));
}

// 3. Press and release inside: one play action, state cleared.
{
  let r = pressStart(L.createPointerState(), 1, cx, cy);
  r = L.reducePointer(r.state, ev("end", [touch(1, cx, cy)], []));
  ok(r.action === "play", "release inside plays once", String(r.action));
  ok(r.state.id === null, "release inside clears state", JSON.stringify(r.state));
}

// 4. Twenty rapid taps: every one plays, never stuck down.
{
  let state = L.createPointerState();
  let plays = 0;
  for (let i = 0; i < 20; i += 1) {
    let r = pressStart(state, 3, cx, cy);
    state = r.state;
    r = L.reducePointer(state, ev("end", [touch(3, cx, cy)], []));
    state = r.state;
    if (r.action === "play") plays += 1;
  }
  ok(plays === 20, "20 rapid taps each play", `plays=${plays}`);
  ok(state.id === null && state.target === null, "20 rapid taps leave no stuck press", JSON.stringify(state));
}

// 5. Second finger must not steal; lifting it must not cancel the first.
{
  let r = pressStart(L.createPointerState(), 1, cx, cy);
  r = L.reducePointer(r.state, ev("start", [touch(2, cx + 10, cy + 10)], [touch(1, cx, cy), touch(2, cx + 10, cy + 10)]));
  ok(r.state.id === 1 && r.state.target === "play", "second finger cannot steal the pointer", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("end", [touch(2, cx + 10, cy + 10)], [touch(1, cx, cy)]));
  ok(r.state.id === 1 && r.state.target === "play" && r.action === null, "other finger lift keeps the main press", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("end", [touch(1, cx, cy)], []));
  ok(r.action === "play", "main finger still finishes with one play", String(r.action));
}

// 6. identifier === 0 works end to end.
{
  let r = pressStart(L.createPointerState(), 0, cx, cy);
  ok(r.state.id === 0 && r.state.target === "play", "identifier 0 arms the press", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("end", [touch(0, cx, cy)], []));
  ok(r.action === "play" && r.state.id === null, "identifier 0 finishes", JSON.stringify(r.state));
}

// 7. The old deadlock: end omits the tracked id and omits `touches`.
//    State is kept (documented), then the next start with an explicit list self-heals.
{
  let r = pressStart(L.createPointerState(), 7, cx, cy);
  r = L.reducePointer(r.state, ev("end", [], null));
  ok(r.state.id === 7, "end without touches keeps state (documented, not a deadlock)", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("start", [touch(8, cx, cy)], [touch(8, cx, cy)]));
  ok(r.state.id === 8 && r.state.target === "play", "next start self-heals the stale id", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("end", [touch(8, cx, cy)], []));
  ok(r.action === "play", "self-healed press still plays", String(r.action));
}

// 8. end omits the id but touches is an explicit empty array: clears.
{
  let r = pressStart(L.createPointerState(), 7, cx, cy);
  r = L.reducePointer(r.state, ev("end", [], []));
  ok(r.state.id === null && r.action === null, "explicit empty touches clears on end", JSON.stringify(r.state));
  r = pressStart(r.state, 9, cx, cy);
  ok(r.state.id === 9, "a new press works after that clear", JSON.stringify(r.state));
}

// 9. touchcancel clears when the finger is gone, keeps when it is still listed.
{
  let r = pressStart(L.createPointerState(), 1, cx, cy);
  const other = L.reducePointer(r.state, ev("cancel", [touch(2, cx, cy)], [touch(1, cx, cy)]));
  ok(other.state.id === 1, "cancel of another finger keeps the main press", JSON.stringify(other.state));
  const kept = L.reducePointer(r.state, ev("cancel", [touch(1, cx, cy)], [touch(1, cx, cy)]));
  ok(kept.state.id === null, "cancel listing the tracked finger clears it", JSON.stringify(kept.state));
  const cleared = L.reducePointer(r.state, ev("cancel", [], []));
  ok(cleared.state.id === null, "cancel with an empty list clears", JSON.stringify(cleared.state));
  // Documented deviation: the comment says cancel keeps the press when liveTouches still
  // lists the finger, but an explicit empty changedTouches short-circuits before that check.
  const emptyButLive = L.reducePointer(r.state, ev("cancel", [], [touch(1, cx, cy)]));
  note(emptyButLive.state.id === null,
    "cancel with empty changedTouches clears even when liveTouches still lists the finger",
    JSON.stringify(emptyButLive.state));
}

// 10. canvasPoint sources, with a nonzero canvas rect.
{
  const off = { left: 37, top: 11 };
  const atOrigin = L.canvasPoint({ x: 100, y: 50, clientX: 100, clientY: 50 }, { left: 0, top: 0 });
  ok(atOrigin.source === "client" && atOrigin.x === 100 && atOrigin.y === 50,
    "equal x/y and client at rect 0 resolves to 100,50", JSON.stringify(atOrigin));
  const localOnly = L.canvasPoint({ x: 100, y: 50 }, off);
  ok(localOnly.source === "local-assumed" && localOnly.x === 100, "x/y only is not shifted by rect", JSON.stringify(localOnly));
  const clientOnly = L.canvasPoint({ clientX: 137, clientY: 61 }, off);
  ok(clientOnly.source === "client" && clientOnly.x === 100, "client only subtracts rect", JSON.stringify(clientOnly));
  const divergent = L.canvasPoint({ x: 100, y: 50, clientX: 137, clientY: 61 }, { left: 0, top: 0 });
  ok(divergent.source === "local", "divergent x/y wins as local", JSON.stringify(divergent));
  // Hazard, not a failure: equal x/y and client on an offset canvas is contradictory input,
  // and the code resolves it by subtracting the rect (100 - 37 = 63). Recorded so a device
  // that reports both fields can be recognised from the debug line.
  const equalOffset = L.canvasPoint({ x: 100, y: 50, clientX: 100, clientY: 50 }, off);
  note(equalOffset.x === 63, "equal x/y and client on an offset canvas subtracts the rect", JSON.stringify(equalOffset));
}

// 11. A press that starts outside both targets never becomes an action.
{
  let r = pressStart(L.createPointerState(), 1, 5, VIEW.h - 5);
  ok(r.state.target === null, "press outside targets arms nothing", JSON.stringify(r.state));
  r = L.reducePointer(r.state, ev("end", [touch(1, 5, VIEW.h - 5)], []));
  ok(r.action === null, "release outside targets has no action", String(r.action));
}

// 12. Move without a tracked id is inert.
{
  const r = L.reducePointer(L.createPointerState(), ev("move", [touch(1, cx, cy)], [touch(1, cx, cy)]));
  ok(r.state.id === null && r.action === null, "move with no press is inert", JSON.stringify(r.state));
}

console.log(`p06-adversarial: ${checks - failures.length}/${checks} passed`);
if (notes.length) {
  console.log("notes (recorded behaviour, not failures):");
  for (const item of notes) console.log(`  - ${item}`);
}
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
