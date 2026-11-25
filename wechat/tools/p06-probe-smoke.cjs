/**
 * Smoke test for pages/game/probe.js with a recording 2d context.
 *
 * This is not the WeChat runtime and not a canvas: it only proves that the
 * probe renderer runs without throwing, emits the expected number of
 * fillText calls, and never positions text outside the content box.
 *
 * Usage: node tools/p06-probe-smoke.cjs
 */

const path = require("path");
const { drawProbe } = require(path.join(__dirname, "..", "pages", "game", "probe.js"));
const L = require(path.join(__dirname, "..", "pages", "game", "layout.js"));

function makeCtx() {
  const calls = { fillText: [], strokeRect: [], fillRect: [], fonts: [] };
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, textBaseline: "",
    font: "",
    setTransform() {},
    clearRect() {},
    setLineDash() {},
    measureText(text) {
      const px = Number((ctx.font.match(/(\d+(?:\.\d+)?)px/) || [])[1]) || 14;
      let width = 0;
      for (const ch of Array.from(String(text))) width += ch.codePointAt(0) <= 0x7f ? px * 0.56 : px;
      return { width };
    },
    fillText(text, x, y) {
      calls.fillText.push({ text, x, y, font: ctx.font, fill: ctx.fillStyle });
      calls.fonts.push(ctx.font);
    },
    strokeRect(x, y, w, h) { calls.strokeRect.push({ x, y, w, h }); },
    fillRect(x, y, w, h) { calls.fillRect.push({ x, y, w, h }); },
  };
  return { ctx, calls };
}

const views = [[844, 390], [667, 375], [1180, 820], [390, 844]];
const frames = ["title", "grade", "battle"];
let checks = 0;
const failures = [];
function ok(cond, name, detail) {
  checks += 1;
  if (!cond) failures.push(detail ? `${name} — ${detail}` : name);
}

for (const [w, h] of views) {
  for (const frame of frames) {
    const { ctx, calls } = makeCtx();
    let problems;
    try {
      problems = drawProbe(ctx, frame, w, h, { left: 0, top: 0, right: w, bottom: h }, 2);
    } catch (err) {
      failures.push(`${frame} ${w}x${h} threw ${err.message}`);
      checks += 1;
      continue;
    }
    ok(Array.isArray(problems) && problems.length === 0, `${frame} ${w}x${h} audit clean`, JSON.stringify(problems));

    const probe = L.layoutProbe(frame, w, h, null);
    const expected = probe.texts.reduce((n, t) => n + t.lines.length, 0) + probe.hits.length;
    ok(calls.fillText.length === expected, `${frame} ${w}x${h} fillText count`, `${calls.fillText.length} vs ${expected}`);
    ok(calls.strokeRect.length === probe.hits.length + 1, `${frame} ${w}x${h} one box per hit plus the content frame`);

    const outside = calls.fillText.filter((c) => c.x < probe.content.x - 0.01
      || c.x > probe.content.x + probe.content.w + 0.01
      || c.y < probe.content.y - 1
      || c.y > probe.content.y + probe.content.h + 0.01);
    ok(outside.length === 0, `${frame} ${w}x${h} text inside content`, JSON.stringify(outside.slice(0, 2)));

    const fonts = calls.fillText.map((c) => Number((c.font.match(/(\d+(?:\.\d+)?)px/) || [])[1]));
    ok(fonts.every((n) => n >= 14), `${frame} ${w}x${h} all fonts >= 14`, String(Math.min(...fonts)));
  }
}

// An unsupported frame name lays out nothing. The page guards the name with
// isProbeFrame before it calls this, so this is a renderer-level note only.
{
  const { ctx, calls } = makeCtx();
  const problems = drawProbe(ctx, "nope", 844, 390, null, 2);
  ok(problems.length === 0, "unknown frame audits clean but empty", JSON.stringify(problems));
  ok(calls.fillText.length === 0, "unknown frame draws no text");
  const { ctx: ctx2, calls: calls2 } = makeCtx();
  drawProbe(ctx2, "battle", 844, 390, null, 2);
  ok(calls2.fillText.length > 0, "known frame still draws text");
}

console.log(`p06-probe-smoke: ${checks - failures.length}/${checks} passed (recording ctx, not a real canvas)`);
if (failures.length) {
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
