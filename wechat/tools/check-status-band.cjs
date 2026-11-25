/**
 * Status-band geometry with Chrome canvas measureText.
 *
 * Positions come from pages/game/layout.js. Widths and glyph extents come from
 * Chrome's CanvasRenderingContext2D.measureText. This is a browser canvas,
 * not WeChat, not a simulator, and not a phone. If Chrome cannot start, the
 * script exits 1. It does not fall back to the ASCII/CJK width estimate.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require("playwright");

const filename = path.join(__dirname, "..", "pages/game/layout.js");
const sandbox = { module: { exports: {} }, exports: {}, console, Math, Number, String };
vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
const api = sandbox.module.exports;
const failureText = api.atlasFailure("/assets/atlas/skeleton-atlas.png");
const titleText = "词境练习家";
const views = [
  { name: "844x390", w: 844, h: 390, safe: null },
  { name: "667x375", w: 667, h: 375, safe: null },
  { name: "915x412", w: 915, h: 412, safe: null },
  { name: "1024x768", w: 1024, h: 768, safe: null },
  { name: "844x390-recorded-safe", w: 844, h: 390, safe: { left: 47, top: 0, right: 797, bottom: 369 }, recorded: true },
];

function fontPx(size) {
  return `${size}px sans-serif`;
}

async function measure(jobs) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    return await page.evaluate((items) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      return items.map((item) => {
        ctx.font = item.font;
        const metrics = ctx.measureText(item.text);
        const ascent = metrics.actualBoundingBoxAscent || 0;
        const descent = metrics.actualBoundingBoxDescent || 0;
        return { width: metrics.width, height: ascent + descent };
      });
    }, jobs);
  } finally {
    await browser.close();
  }
}

function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

async function main() {
  const jobs = [];
  const plans = views.map((view) => {
    const layout = api.layoutView(view.w, view.h, view.safe, 1);
    const safe = view.safe || { left: 0, top: 0, right: view.w, bottom: view.h };
    const band = api.statusBoxes(safe);
    const titleFont = layout.title.size * layout.scale;
    const failIndex = jobs.push({ text: failureText, font: fontPx(band.failure.font) }) - 1;
    const titleIndex = jobs.push({ text: titleText, font: fontPx(titleFont) }) - 1;
    const probes = ["title", "grade", "battle"].map((frame) => {
      const probe = api.layoutProbe(frame, view.w, view.h, view.safe);
      return {
        frame,
        probe,
        textJobs: probe.texts.map((text) => {
          const sample = text.lines[0] || "";
          const index = jobs.push({ text: sample, font: fontPx(text.fontPx) }) - 1;
          return { text, index };
        }),
      };
    });
    return { view, layout, safe, band, titleFont, failIndex, titleIndex, probes };
  });
  const measured = await measure(jobs);
  const problems = [];
  const rows = [];
  for (const plan of plans) {
    const failM = measured[plan.failIndex];
    const titleM = measured[plan.titleIndex];
    const failure = {
      x: plan.band.failure.x,
      y: plan.band.failure.y,
      w: failM.width,
      h: Math.max(failM.height, plan.band.failure.font),
    };
    const title = {
      x: plan.layout.offsetX + plan.layout.title.x * plan.layout.scale,
      y: plan.layout.offsetY + plan.layout.title.y * plan.layout.scale,
      w: titleM.width,
      h: Math.max(titleM.height, plan.titleFont),
    };
    if (plan.view.recorded && failure.x < 59) problems.push(`${plan.view.name} failure x ${failure.x} < 59`);
    if (overlap(failure, title)) problems.push(`${plan.view.name} failure overlaps skeleton title`);
    if (title.x < -0.01 || title.y < -0.01 || title.x + title.w > plan.view.w + 0.01 || title.y + title.h > plan.view.h + 0.01) {
      problems.push(`${plan.view.name} skeleton title clipped`);
    }
    for (const probe of plan.probes) {
      const audit = api.auditProbe(probe.probe);
      if (audit.length) problems.push(`${plan.view.name} ${probe.frame} audit ${audit.join("; ")}`);
      for (const item of probe.textJobs) {
        const box = {
          x: item.text.x,
          y: item.text.y,
          w: measured[item.index].width,
          h: Math.max(measured[item.index].height, item.text.fontPx),
        };
        if (overlap(failure, box)) problems.push(`${plan.view.name} ${probe.frame} ${item.text.id} overlaps failure`);
        if (box.x < -0.01 || box.y < -0.01 || box.x + box.w > plan.view.w + 0.01 || box.y + box.h > plan.view.h + 0.01) {
          problems.push(`${plan.view.name} ${probe.frame} ${item.text.id} clipped`);
        }
      }
    }
    rows.push({
      viewport: plan.view.name,
      recordedSafeInput: Boolean(plan.view.recorded),
      scale: plan.layout.scale,
      offsetX: plan.layout.offsetX,
      offsetY: plan.layout.offsetY,
      failure,
      skeletonTitle: title,
    });
    console.log(
      `${plan.view.name} fail ${failure.x},${failure.y} ${failure.w.toFixed(2)}x${failure.h.toFixed(2)} `
      + `title ${title.x.toFixed(2)},${title.y.toFixed(2)} ${title.w.toFixed(2)}x${title.h.toFixed(2)}`,
    );
  }
  const outDir = path.join(__dirname, "..", "evidence");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "w1-status-band.json"), JSON.stringify({
    source: "Chrome canvas measureText via Playwright. Not WeChat DevTools, not a simulator, not a phone.",
    chrome: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    rows,
    problems,
  }, null, 2));
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`check-status-band: ${rows.length} view rows, 0 problems`);
  console.log("source: browser canvas (Chrome). Not WeChat.");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  console.error("check-status-band: no heuristic fallback");
  process.exit(1);
});
