/**
 * P0.6 probe screenshot + real-metric harness.
 *
 * What this is: a Chromium canvas that draws the numbers produced by
 * pages/game/layout.js (layoutProbe), at the exact logical viewport size,
 * with real ctx.measureText() for the metrics report.
 *
 * What this is NOT: WeChat DevTools, the WeChat runtime, or a device.
 * WeChat's canvas is also Chromium-based, but font fallback and canvas
 * implementation can differ. Treat every number here as a proxy, not as
 * a device result.
 *
 * Usage:
 *   node wechat/tools/p06-shots.cjs [outDir]
 *
 * Requires a local Chrome/Chromium (not a project dependency). Set
 * CHROME_PATH to override the default macOS location.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const layoutPath = path.join(root, "pages/game/layout.js");
const code = fs.readFileSync(layoutPath, "utf8");
const sandbox = { module: { exports: {} }, exports: {}, console, Math, Number, String };
vm.runInNewContext(code, sandbox, { filename: layoutPath });
const api = sandbox.module.exports;

const outDir = path.resolve(process.argv[2] || path.join(root, "..", "p06-evidence"));
fs.mkdirSync(outDir, { recursive: true });

const VIEWS = [
  { w: 844, h: 390, name: "844x390" },
  { w: 667, h: 375, name: "667x375" },
  { w: 1180, h: 820, name: "1180x820" },
  { w: 390, h: 844, name: "390x844" },
];
const FRAMES = ["title", "grade", "battle"];

const CHROME = process.env.CHROME_PATH
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) {
  console.error(`p06-shots: chrome not found at ${CHROME}; set CHROME_PATH`);
  process.exit(2);
}

function html() {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#000;overflow:hidden}
  canvas{display:block}
  #metrics{display:none;white-space:pre}
</style>
<canvas id="c"></canvas>
<pre id="metrics"></pre>
<script>
var module = { exports: {} }, exports = module.exports;
${code}
var L = module.exports;

var q = new URLSearchParams(location.search);
var w = Number(q.get("w")) || 844;
var h = Number(q.get("h")) || 390;
var frame = q.get("frame") || "title";

var FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",sans-serif';
var c = document.getElementById("c");
c.width = w; c.height = h;
c.style.width = w + "px"; c.style.height = h + "px";
var ctx = c.getContext("2d");

var probe = L.layoutProbe(frame, w, h, null);
ctx.fillStyle = "#143d2c";
ctx.fillRect(0, 0, w, h);
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, w, h);

function fontFor(px, bold) { return (bold ? "bold " : "") + px + "px " + FONT; }

// Heuristic width from layout.js, kept only for the delta report.
function heuristic(text, px) {
  var n = 0, chars = Array.from(String(text));
  for (var i = 0; i < chars.length; i += 1) {
    n += chars[i].codePointAt(0) <= 0x7f ? px * 0.56 : px;
  }
  return n;
}

var report = { viewport: { w: w, h: h }, frame: frame, portrait: probe.portrait,
  font: FONT, texts: [], hits: [], shapes: [], problems: L.auditProbe(probe), realWrap: [] };

// Draw text with the lines layout.js produced, then measure those lines for real.
ctx.textBaseline = "top";
probe.texts.forEach(function (t) {
  ctx.font = fontFor(t.fontPx, false);
  ctx.fillStyle = "#17352a";
  t.lines.forEach(function (line, i) {
    ctx.fillText(line, t.x, t.y + i * t.lineH);
  });
  var widths = t.lines.map(function (line) { return ctx.measureText(line).width; });
  // Real-metric re-wrap of the same string, to see whether the heuristic
  // would have broken it somewhere else.
  var chars = Array.from(t.text), lines = [], cur = "";
  for (var i = 0; i < chars.length; i += 1) {
    var next = cur + chars[i];
    if (cur && ctx.measureText(next).width > t.maxWidth) { lines.push(cur); cur = chars[i]; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  report.texts.push({
    id: t.id, fontPx: t.fontPx, maxWidth: t.maxWidth,
    linesHeuristic: t.lines, linesReal: lines,
    sameBreaks: JSON.stringify(t.lines) === JSON.stringify(lines),
    realMaxLine: Math.max.apply(null, widths),
    heuristicMaxLine: Math.max.apply(null, t.lines.map(function (l) { return heuristic(l, t.fontPx); })),
    overMax: widths.some(function (x) { return x > t.maxWidth + 0.5; }),
    ascent: ctx.measureText("字Ag").actualBoundingBoxAscent,
    descent: ctx.measureText("字Ag").actualBoundingBoxDescent,
    h: t.h, y: t.y, x: t.x
  });
});

probe.hits.forEach(function (hit) {
  ctx.strokeStyle = "#c4533a";
  ctx.lineWidth = 2;
  ctx.strokeRect(hit.x + 1, hit.y + 1, hit.w - 2, hit.h - 2);
  ctx.font = fontFor(hit.fontPx, true);
  ctx.fillStyle = "#8c3a28";
  var tw = ctx.measureText(hit.label).width;
  ctx.fillText(hit.label, hit.x + (hit.w - tw) / 2, hit.y + (hit.h - hit.fontPx * 1.35) / 2);
  report.hits.push({
    id: hit.id, w: hit.w, h: hit.h, label: hit.label, fontPx: hit.fontPx,
    labelReal: tw, labelHeuristic: heuristic(hit.label, hit.fontPx),
    fits: tw + 8 <= hit.w
  });
});

probe.shapes.forEach(function (s) {
  ctx.fillStyle = "#c4533a";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = "#ffffff";
  ctx.font = fontFor(12, false);
  ctx.fillText("HP", s.x + 6, s.y + 2);
  report.shapes.push({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h });
});

// Safe-area / content box for visual inspection.
ctx.strokeStyle = "#1f7a4d";
ctx.setLineDash([6, 6]);
ctx.lineWidth = 1;
ctx.strokeRect(probe.content.x + 0.5, probe.content.y + 0.5, probe.content.w - 1, probe.content.h - 1);
ctx.setLineDash([]);

document.getElementById("metrics").textContent = JSON.stringify(report);
document.title = "p06 " + frame + " " + w + "x" + h;
</script>`;
}

const pagePath = path.join(outDir, "p06-probe.html");
fs.writeFileSync(pagePath, html(), "utf8");

const rows = [];
for (const view of VIEWS) {
  for (const frame of FRAMES) {
    const base = `p06-${view.name}-${frame}`;
    const url = `file://${pagePath}?w=${view.w}&h=${view.h}&frame=${frame}`;
    const png = path.join(outDir, `${base}.png`);
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--no-first-run", "--no-default-browser-check",
      `--window-size=${view.w},${view.h}`,
      "--virtual-time-budget=1500",
      `--screenshot=${png}`,
      url,
    ], { stdio: ["ignore", "ignore", "pipe"] });

    const dom = execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--no-first-run", "--no-default-browser-check",
      `--window-size=${view.w},${view.h}`,
      "--virtual-time-budget=1500",
      "--dump-dom", url,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const m = dom.match(/<pre id="metrics">([\s\S]*?)<\/pre>/);
    if (!m) throw new Error(`no metrics for ${base}`);
    const report = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    fs.writeFileSync(path.join(outDir, `${base}.json`), JSON.stringify(report, null, 2));
    rows.push({ base, view: view.name, frame, ...report });
    console.log(`${base}: ${report.problems.length ? "PROBLEMS " + report.problems.join("; ") : "ok"}`);
  }
}

fs.writeFileSync(path.join(outDir, "p06-shots.json"), JSON.stringify(rows, null, 2));
console.log(`p06-shots: ${rows.length} frames -> ${outDir}`);
