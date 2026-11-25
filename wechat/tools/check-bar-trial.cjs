/**
 * 原来：有人说过穿过经验条会让 915/1024 的 overlap 变成 9 和 6。本包日志里没有这两行。
 * 现在：用冻结的同一局结算，分别量「穿过经验条」和「经验条整段挡住」的 overlap。页面不打开 trial。
 * 为什么：那两个数字不能当已经证死的上限。这里留下可核的试验日志。不是微信开发者工具，也不是真机。
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const { attach } = require(path.join(root, "pages/game/port.js"));
const game = require(path.join(root, "lib/game.cjs.js"));

globalThis.__LEXI_READ_FILE__ = (rel) => {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
};

const views = [
  { w: 844, h: 390 },
  { w: 667, h: 375 },
  { w: 915, h: 412 },
  { w: 1024, h: 768 },
];
const lines = [];
function log(message) {
  lines.push(message);
  console.log(message);
}

const canvas = {
  width: 844,
  height: 390,
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 844, height: 390 };
  },
  addEventListener() {},
};

async function planAt(scene, size, page, trial) {
  const map = new Map();
  let plan = null;
  for (let pass = 0; pass < 20; pass += 1) {
    const seen = new Set();
    plan = game.layoutFrame(scene, size, (text, fontPx, weight, family) => {
      const key = `${weight}|${fontPx}|${family}|${text}`;
      if (!map.has(key)) {
        seen.add(key);
        return 0;
      }
      return map.get(key);
    }, trial ? { trial } : undefined);
    if (seen.size === 0) return plan;
    for (const key of seen) {
      const parts = key.split("|");
      const text = parts.slice(3).join("|");
      const width = await page.evaluate(
        ({ text, fontPx, weight, family }) => {
          const node = document.createElement("canvas");
          const ctx = node.getContext("2d");
          ctx.font = `${weight} ${fontPx}px ${family}`;
          return ctx.measureText(text).width;
        },
        { text, fontPx: Number(parts[1]), weight: parts[0], family: parts[2] },
      );
      map.set(key, width);
    }
  }
  throw new Error(`did not converge ${size.w} ${trial || "final"}`);
}

async function main() {
  const port = attach(canvas, views[0]);
  port.armImages(canvas);
  const frozen = JSON.parse(fs.readFileSync(path.join(root, "evidence/w3-results-r5-view.json"), "utf8"));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  try {
    await new Promise((resolve) => setTimeout(resolve, 80));
    port.runtime.start("battle-results", frozen);
    port.step(200);
    const scene = port.runtime.active();
    const joined = scene.children.list.map((node) => (node.text ? String(node.text) : "")).join("\n");
    log(`frozen questions ${joined.includes("一共 7 题")} correct ${joined.includes("答对 3 题")} new words ${joined.includes("5 个新词")}`);
    log("trial cross-bar lets text cross the XP bar. The page does not pass this option.");
    for (const trial of ["cross-bar", null]) {
      log(trial || "final");
      for (const size of views) {
        const plan = await planAt(scene, size, page, trial);
        const texts = plan.texts.filter((item) => !item.nested);
        const off = texts.filter((item) => !item.onPaper).length;
        const labels = plan.overlapLabels || [];
        const bar = labels.filter((label) => label.includes("progress_frame")).length;
        const row = labels.filter((label) => label.includes("list_row")).length;
        log(`${size.w}x${size.h} off ${off} overlap ${plan.overlap} bar ${bar} row ${row} font ${plan.minFont} gap ${plan.minGap} overflow ${plan.overflow} sheet ${plan.fills.some((fill) => fill.role === "sheet")}`);
        if (labels.length) log(`  ${labels.join(" | ")}`);
      }
    }
    const out = path.join(root, "evidence/w3-results-r6-bar-trial.log");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${lines.join("\n")}\n`);
    log(`wrote ${out}`);
  } finally {
    await browser.close();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
