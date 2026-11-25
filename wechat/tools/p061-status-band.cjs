/**
 * Node geometry for the status band against the skeleton title and the probe frames.
 * Widths use layout.js textWidth (ASCII 0.56em, other characters 1em). Not ctx.measureText.
 * The 47/0/797/369 rect is the number recorded in the Mac P0.6 report, used only as an input.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const filename = path.join(__dirname, "..", "pages/game/layout.js");
const sandbox = { module: { exports: {} }, exports: {}, console, Math, Number, String };
vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
const api = sandbox.module.exports;
const failureText = api.atlasFailure("/assets/atlas/skeleton-atlas.png");
const views = [
  { name: "844x390", w: 844, h: 390, safe: null },
  { name: "667x375", w: 667, h: 375, safe: null },
  { name: "915x412", w: 915, h: 412, safe: null },
  { name: "1024x768", w: 1024, h: 768, safe: null },
  {
    name: "844x390-recorded-safe",
    w: 844,
    h: 390,
    safe: { left: 47, top: 0, right: 797, bottom: 369 },
    recorded: true,
  },
];
const problems = [];
const rows = [];

function fail(message) {
  problems.push(message);
}

for (const view of views) {
  const layout = api.layoutView(view.w, view.h, view.safe, 1);
  if (!layout || !layout.fits) fail(`${view.name} skeleton does not fit`);
  const safe = view.safe || { left: 0, top: 0, right: view.w, bottom: view.h };
  const band = api.statusBoxes(safe);
  const title = api.skeletonTitleViewBox(layout);
  const failure = {
    x: band.failure.x,
    y: band.failure.y,
    w: api.textWidth(failureText, band.failure.font),
    h: band.failure.h,
  };
  const debug = {
    x: band.debug.x,
    y: band.debug.y,
    w: 0,
    h: band.debug.h,
  };
  const play = api.viewRect(layout, layout.hits.play);
  const reset = api.viewRect(layout, layout.hits.reset);
  const dx = Math.max(0, Math.max(play.x - (reset.x + reset.w), reset.x - (play.x + play.w)));
  const dy = Math.max(0, Math.max(play.y - (reset.y + reset.h), reset.y - (play.y + play.h)));
  const gap = dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy);
  if (failure.x < safe.left + 12 - 0.01) fail(`${view.name} failure x ${failure.x}`);
  if (api.boxesOverlap(failure, title)) fail(`${view.name} failure overlaps skeleton title`);
  if (api.boxesOverlap(debug, title)) fail(`${view.name} debug band overlaps skeleton title`);
  if (title.x < -0.01 || title.y < -0.01 || title.x + title.w > view.w + 0.01 || title.y + title.h > view.h + 0.01) {
    fail(`${view.name} skeleton title clipped`);
  }
  if (play.w < 44 - 1e-6 || play.h < 44 - 1e-6 || gap < 8 - 1e-6) fail(`${view.name} skeleton hit/gap`);
  const frames = {};
  for (const frame of ["title", "grade", "battle"]) {
    const probe = api.layoutProbe(frame, view.w, view.h, view.safe);
    const audit = api.auditProbe(probe);
    if (audit.length) fail(`${view.name} ${frame} audit ${audit.join("; ")}`);
    const texts = probe.texts.map((text) => ({
      id: text.id,
      fontPx: text.fontPx,
      x: text.x,
      y: text.y,
      w: text.w,
      h: text.h,
    }));
    for (const text of texts) {
      if (api.boxesOverlap(failure, text)) fail(`${view.name} ${frame} ${text.id} overlaps failure`);
      if (api.boxesOverlap(debug, text)) fail(`${view.name} ${frame} ${text.id} overlaps debug band`);
      if (text.fontPx < 14) fail(`${view.name} ${frame} ${text.id} font ${text.fontPx}`);
      if (text.x < -0.01 || text.y < -0.01 || text.x + text.w > view.w + 0.01 || text.y + text.h > view.h + 0.01) {
        fail(`${view.name} ${frame} ${text.id} clipped`);
      }
    }
    for (const hit of probe.hits) {
      if (hit.w < 44 - 0.01 || hit.h < 44 - 0.01) fail(`${view.name} ${frame} ${hit.id} hit`);
      if (api.boxesOverlap(failure, hit)) fail(`${view.name} ${frame} ${hit.id} overlaps failure`);
    }
    frames[frame] = {
      fonts: texts.map((text) => `${text.id}:${text.fontPx}`).join(","),
      texts,
      hits: probe.hits.map((hit) => ({ id: hit.id, x: hit.x, y: hit.y, w: hit.w, h: hit.h, fontPx: hit.fontPx })),
    };
  }
  rows.push({
    viewport: view.name,
    recordedSafeInput: !!view.recorded,
    widthSource: "layout.textWidth estimate, not measureText",
    scale: layout.scale,
    offsetX: layout.offsetX,
    offsetY: layout.offsetY,
    failure,
    debug,
    skeletonTitle: title,
    play: { x: play.x, y: play.y, w: play.w, h: play.h },
    reset: { x: reset.x, y: reset.y, w: reset.w, h: reset.h },
    skeletonGap: gap,
    frames,
  });
  console.log(
    `${view.name} scale ${layout.scale} off ${layout.offsetX},${layout.offsetY} `
    + `fail ${failure.x},${failure.y} ${failure.w}x${failure.h} `
    + `skeletonTitle ${title.x},${title.y} ${title.w}x${title.h} `
    + `play ${play.w}x${play.h} gap ${gap} `
    + `probeTitleY ${frames.title.texts[0].y}`
  );
}

const out = {
  layer: "Node layout math",
  not: "Not ctx.measureText, not a DevTools screenshot, not a device capture, not a new getWindowInfo read.",
  failureText,
  rows,
  problems,
};
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`p061-status-band: ${rows.length} view rows, 0 problems`);
console.log("layer: Node. Red-text visibility is unverified.");
