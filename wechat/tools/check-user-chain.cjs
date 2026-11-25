/**
 * 原来：check-page-chain 用 openPractice 合成档，再 start("battle")。那只证明战斗场景能被构造。
 * 现在：从档案页的可见按钮和原生名字表单走到学堂、答题、战斗、结算、词卡册、复习桌。
 * 为什么：存档、词卡和胜场要由这些点击写出来。几何用 Chrome measureText 重排，不用 Node 的汉字宽度估算当通过。
 *
 * 来源：Node 里的页面适配器负责点击和存档。Chrome 只提供 canvas.measureText 和一次画布重放。
 * 不是微信开发者工具，不是真机。
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");
const { attach } = require("../pages/game/port.js");
const game = require("../lib/game.cjs.js");

const root = path.join(__dirname, "..");
const views = [
  { w: 844, h: 390 },
  { w: 667, h: 375 },
  { w: 915, h: 412 },
  { w: 1024, h: 768 },
];
const view = views[0];
const lines = [];
function log(message) {
  lines.push(message);
  console.log(message);
}

function estimate(text, fontPx) {
  let width = 0;
  for (const char of text) width += char.charCodeAt(0) > 255 ? fontPx : fontPx * 0.56;
  return Math.max(fontPx, width);
}

function press(port, text) {
  const now = port.paint(null, view);
  const labels = now.texts
    .filter((item) => item.text.includes(text))
    .sort((a, b) => Number(b.nested) - Number(a.nested) || a.text.length - b.text.length);
  const label = labels[0];
  if (!label) return false;
  const x = label.x + Math.min(8, label.w / 2);
  const y = label.y + Math.min(8, label.h / 2);
  if (port.press(x, y, view)) return true;
  let best = null;
  let score = 1e9;
  for (const hit of now.hits) {
    const dist = Math.abs(hit.x + hit.w / 2 - x) + Math.abs(hit.y + hit.h / 2 - y);
    if (dist < score) {
      score = dist;
      best = hit;
    }
  }
  if (!best || score > 120) return false;
  return Boolean(port.press(best.x + best.w / 2, best.y + best.h / 2, view));
}

async function openChrome() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  return { browser, page };
}

async function measuredPlan(scene, size, page) {
  const map = new Map();
  let plan = null;
  for (let pass = 0; pass < 6; pass += 1) {
    const missing = [];
    const seen = new Set();
    plan = game.layoutFrame(scene, size, (text, fontPx, weight, family) => {
      const key = `${weight}|${fontPx}|${family}|${text}`;
      if (!map.has(key)) {
        if (!seen.has(key)) {
          seen.add(key);
          missing.push({ key, text, fontPx, weight, family });
        }
        return estimate(text, fontPx);
      }
      return map.get(key);
    });
    if (missing.length === 0) return plan;
    const widths = await page.evaluate((jobs) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      return jobs.map((job) => {
        const weight = job.weight ? `${job.weight} ` : "";
        ctx.font = `${weight}${job.fontPx}px ${job.family || "sans-serif"}`;
        return ctx.measureText(job.text).width;
      });
    }, missing);
    missing.forEach((job, index) => map.set(job.key, widths[index]));
  }
  throw new Error(`measureText did not converge at ${size.w}x${size.h}`);
}

function assertGeometry(tag, size, plan) {
  assert.strictEqual(plan.measured, true, `${tag} ${size.w} measured`);
  assert.ok(plan.texts.length > 0, `${tag} ${size.w} texts`);
  assert.ok(plan.minFont >= 14, `${tag} ${size.w} font ${plan.minFont}`);
  assert.ok(plan.hits.length === 0 || plan.minHit >= 44, `${tag} ${size.w} hit ${plan.minHit}`);
  assert.ok(plan.minGap === null || plan.minGap >= 8, `${tag} ${size.w} gap ${plan.minGap} pairs ${plan.gapPairs}`);
  if (plan.overflow) {
    const bad = [...plan.texts, ...plan.hits].filter((item) => item.y < 50 || item.y + item.h > size.h - 4 || item.x < 8 || item.x + item.w > size.w - 4);
    for (const item of bad) log(` overflow ${tag} ${item.nested ? "nested" : "root"} ${JSON.stringify(item.text || "")} ${item.x.toFixed(0)},${item.y.toFixed(0)} ${item.w.toFixed(0)}x${item.h.toFixed(0)}`);
  }
  assert.strictEqual(plan.overflow, 0, `${tag} ${size.w} overflow ${plan.overflow}`);
  log(`${tag} ${size.w}x${size.h} font ${plan.minFont} hit ${plan.minHit} gap ${plan.minGap} pairs ${plan.gapPairs} overflow ${plan.overflow} texts ${plan.texts.length} images ${plan.images.length} measured ${plan.measured}`);
}

async function geometry(tag, port, page) {
  const scene = port.runtime.active();
  for (const size of views) {
    const plan = await measuredPlan(scene, size, page);
    assertGeometry(tag, size, plan);
  }
  return measuredPlan(scene, view, page);
}

function mime(file) {
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

async function shoot(page, plan, file) {
  const images = {};
  for (const op of plan.images) {
    if (!op.packed || images[op.url]) continue;
    const full = path.join(root, op.packed);
    if (!fs.existsSync(full)) continue;
    images[op.url] = { mime: mime(full), b64: fs.readFileSync(full).toString("base64") };
  }
  await page.setViewportSize({ width: view.w, height: view.h });
  await page.setContent("<!doctype html><canvas id='c'></canvas>");
  const sample = await page.evaluate(async ({ ops, texts, images: packed, fills, w, h }) => {
    const canvas = document.getElementById("c");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#143d2c";
    ctx.fillRect(0, 0, w, h);
    const bitmaps = {};
    for (const [url, file] of Object.entries(packed)) {
      const image = new Image();
      image.src = `data:${file.mime};base64,${file.b64}`;
      await image.decode();
      bitmaps[url] = image;
    }
    let drawCalls = 0;
    for (const op of ops) {
      const bitmap = bitmaps[op.url];
      if (!bitmap || op.sw <= 0 || op.sh <= 0) continue;
      ctx.save();
      ctx.translate(op.x + op.w / 2, op.y + op.h / 2);
      if (op.rotation) ctx.rotate(op.rotation);
      if (op.flipX) ctx.scale(-1, 1);
      ctx.drawImage(bitmap, op.sx, op.sy, op.sw, op.sh, -op.w / 2, -op.h / 2, op.w, op.h);
      ctx.restore();
      drawCalls += 1;
    }
    for (const fill of fills) {
      ctx.fillStyle = `#${(fill.color >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
      ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
    }
    ctx.textBaseline = "top";
    ctx.fillStyle = "#17352a";
    for (const item of texts) {
      const rows = item.lines && item.lines.length ? item.lines : [item.text];
      ctx.font = `${item.fontPx}px sans-serif`;
      rows.forEach((row, index) => ctx.fillText(row, item.x, item.y + index * item.fontPx));
    }
    const probe = ops.find((op) => op.sw > 0 && op.sh > 0) || { x: 20, y: 80, w: 40, h: 40 };
    const px = Math.max(0, Math.min(w - 8, Math.round(probe.x + probe.w / 2)));
    const py = Math.max(0, Math.min(h - 8, Math.round(probe.y + probe.h / 2)));
    const data = ctx.getImageData(px, py, 8, 8).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return { drawCalls, colors: colors.size, at: [px, py] };
  }, {
    ops: plan.images,
    texts: plan.texts.map((item) => ({ text: item.text, lines: item.lines || [], x: item.x, y: item.y, fontPx: item.fontPx })),
    images,
    fills: plan.fills,
    w: view.w,
    h: view.h,
  });
  await page.screenshot({ path: file });
  return sample;
}

const SKIP = /攻击|格挡|治疗|返回|基础招式|盾击|听一听|正确答案|效果减弱|能量不够|^★/;

async function main() {
  const canvas = {
    width: view.w,
    height: view.h,
    getBoundingClientRect() {
      return { left: 0, top: 0, width: view.w, height: view.h };
    },
    addEventListener() {},
  };
  const port = attach(canvas, view);
  const decoded = port.armImages(canvas);
  assert.strictEqual(decoded, 0, "Node has no canvas.createImage");
  const { browser, page } = await openChrome();
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    const fontRows = await port.fonts;
    log(`fonts ${fontRows.map((row) => `${row.family} ok=${row.ok}`).join(" | ")}`);
    log(`font reasons ${fontRows.map((row) => row.reason).filter((reason, index, list) => list.indexOf(reason) === index).join(" || ")}`);
    assert.ok(fontRows.length >= 12, "packed faces were submitted");
    assert.ok(fontRows.every((row) => row.ok === false), "wx is absent, so loadFontFace cannot succeed");
    assert.ok(fontRows.some((row) => row.reason.includes("https") || row.reason.includes("Data URL") || row.reason.includes("data:")), "the miss names the official source rule");

    assert.ok(press(port, "新建角色"), "新建角色");
    assert.strictEqual(port.runtime.active().key, "grades");
    assert.ok(press(port, "三年级"), "三年级");
    assert.ok(press(port, "选好了"), "选好了");
    assert.strictEqual(port.runtime.active().key, "create");
    const name = port.field("hero-name");
    const form = port.field("name-form");
    assert.strictEqual(typeof form.dispatch, "function");
    name.value = "小林";
    form.dispatch("submit");
    assert.strictEqual(port.runtime.active().key, "overworld");
    const created = port.save();
    assert.strictEqual(created.player.name, "小林");
    assert.deepStrictEqual(created.selectedGrades, ["G3"]);
    log(`created ${created.player.name} ${created.selectedGrades.join(",")} cards ${Object.keys(created.wordCards).length}`);

    assert.ok(press(port, "学堂"), "学堂");
    port.step(500);
    assert.strictEqual(port.runtime.active().key, "learn");
    assert.ok(press(port, "森林冒险"), "森林冒险");
    assert.ok(press(port, "确认"), "确认");
    assert.ok(press(port, "听一听"), "听一听");
    const speech = port.runtime.failures.filter((item) => String(item).includes("word audio"));
    log(`speech ${speech.join(" | ") || "none"}`);
    assert.ok(speech.length >= 1, "missing mp3 is recorded when speak is called");
    const heard = port.paint(null, view).texts.map((item) => item.text);
    log(`listen ${heard.filter((item) => item.length < 24).join(" | ")}`);
    const meaning = heard.find((item) => item.includes("树")) || "n. 树";
    assert.ok(press(port, meaning), meaning);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const learned = port.save();
    assert.ok(learned.wordCards.tree, "学堂答题写入 tree");
    assert.strictEqual(learned.battlesWon, 0);
    log(`learned cards ${Object.keys(learned.wordCards).join(",")} won ${learned.battlesWon}`);
    const study = await geometry("study", port, page);

    assert.ok(press(port, "返回"), "离开学堂");
    port.step(400);
    if (port.runtime.active().key !== "overworld") {
      assert.ok(press(port, "返回") || press(port, "回村子"), "回到村子");
      port.step(400);
    }
    assert.strictEqual(port.runtime.active().key, "overworld");
    assert.ok(press(port, "对战"), "对战");
    port.step(500);
    assert.strictEqual(port.runtime.active().key, "stages");
    assert.ok(press(port, "小战斗"), "小战斗");
    assert.strictEqual(port.runtime.active().key, "battle");
    const battlePlan = await geometry("battle", port, page);
    const before = port.save();

    for (let step = 0; step < 60 && port.runtime.active().key === "battle"; step += 1) {
      const now = port.paint(null, view);
      const prompt = now.texts.find((item) => /怎么说|是什么意思/.test(item.text));
      const pick = prompt && now.texts.find((item) => item.nested && item.text.length > 1 && item.text.length < 28 && !SKIP.test(item.text) && !/^\d+$/.test(item.text));
      if (pick) press(port, pick.text);
      else if (now.texts.some((item) => item.text.includes("1 攻击"))) press(port, "1 攻击");
      port.step(700);
    }
    assert.strictEqual(port.runtime.active().key, "battle-results");
    const fought = port.save();
    assert.strictEqual(fought.battlesWon, before.battlesWon + 1, "one win write");
    assert.strictEqual(fought.battlesLost, before.battlesLost, "no extra loss");
    assert.ok(fought.wordCards.tree, "tree card survives the fight");
    log(`results won ${fought.battlesWon} lost ${fought.battlesLost} cards ${Object.keys(fought.wordCards).join(",")}`);
    port.step(400);
    const results = await geometry("results", port, page);
    const shot = path.join(root, "evidence/w3-browser-canvas.png");
    const artifact = "/opt/cursor/artifacts/wechat-browser-canvas.png";
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
    const sample = await shoot(page, results, shot);
    fs.copyFileSync(shot, artifact);
    log(`browser canvas drawCalls ${sample.drawCalls} colors ${sample.colors} at ${sample.at.join(",")} file ${shot}`);
    assert.ok(sample.drawCalls > 0, "drawImage ran in Chrome");
    assert.ok(sample.colors > 1, "sampled pixels are not one flat color");

    const crops = results.images.filter((op) => op.sw > 0 && op.sh > 0);
    const cropped = crops.filter((op) => op.sx > 0 || op.sy > 0);
    log(`drawImage ops ${results.images.length} with source rect ${crops.length} origin-offset ${cropped.length} rotation ${results.images.filter((op) => op.rotation).length} flip ${results.images.filter((op) => op.flipX).length} tint ${results.images.filter((op) => op.tint !== 0xffffff).length}`);
    assert.ok(crops.length > 0, "atlas frames carry a source rect");
    log(`sample crop ${JSON.stringify(cropped[0] || crops[0])}`);
    log(`battle images ${battlePlan.images.length} study images ${study.images.length}`);

    assert.ok(press(port, "继续") || press(port, "看结局") || press(port, "回地图"), "离开结算");
    log(`after results ${port.runtime.active().key}`);
    if (port.runtime.active().key !== "overworld") {
      assert.ok(press(port, "回村子") || press(port, "返回"), "回村子");
    }
    port.step(400);
    assert.strictEqual(port.runtime.active().key, "overworld");
    assert.ok(press(port, "词卡册"), "词卡册");
    port.step(500);
    assert.strictEqual(port.runtime.active().key, "collection");
    const collection = port.paint(null, view);
    log(`collection ${collection.texts.map((item) => item.text).join(" | ")}`);
    assert.ok(collection.texts.some((item) => item.text.toLowerCase().includes("tree")), "册子里看得到 tree");
    await geometry("collection", port, page);

    assert.ok(press(port, "返回"), "离开册子");
    port.step(400);
    assert.ok(press(port, "复习桌"), "复习桌");
    port.step(500);
    assert.strictEqual(port.runtime.active().key, "review");
    const reviewText = port.paint(null, view).texts.map((item) => item.text).join(" | ");
    log(`review ${reviewText}`);
    assert.ok(reviewText.includes("tree"), "复习桌看得到刚学的词");
    assert.ok(reviewText.includes("现在没有到复习时间的词"), "同一天还没到复习时间");
    const cardsBefore = Object.keys(port.save().wordCards).length;
    assert.ok(press(port, "盖住拼"), "盖住拼");
    assert.strictEqual(Object.keys(port.save().wordCards).length, cardsBefore, "复习不新发词卡");
    assert.ok(port.save().wordCards.tree, "tree 还在");
    log("review clock buttons are drawn only when devModeEnabled(location.search) is on. This run did not set that flag.");
    await geometry("review", port, page);
    assert.strictEqual(port.save().battlesWon, 1);
    assert.strictEqual(port.save().player.name, "小林");

    const nodeGap = port.runtime.failures.find((item) => String(item).includes("createImage"));
    log(`node image gap ${nodeGap}`);
    assert.ok(nodeGap, "Node records that pixels were not decoded");
    log("check-user-chain: profiles, name, learn, battle, results, collection, review");
    log("clicks: Node page adapter. geometry: Chrome canvas measureText. pixels: Chrome canvas drawImage. Not WeChat DevTools. Not a phone.");
    const out = path.join(root, "evidence/w7-user-chain.json");
    fs.writeFileSync(out, JSON.stringify({
      source: "Node clicks through pages/game/port.js. Chrome canvas measureText and one drawImage replay. Not WeChat DevTools and not a phone.",
      name: port.save().player.name,
      grades: port.save().selectedGrades,
      cards: Object.keys(port.save().wordCards),
      battlesWon: port.save().battlesWon,
      battlesLost: port.save().battlesLost,
      speech,
      fontOk: fontRows.filter((row) => row.ok).length,
      drawCalls: sample.drawCalls,
      sampleColors: sample.colors,
    }, null, 2));
    fs.writeFileSync(path.join(root, "evidence/w7-user-chain.log"), `${lines.join("\n")}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  try {
    fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
    fs.writeFileSync(path.join(root, "evidence/w7-user-chain.log"), `${lines.join("\n")}\n${error && error.stack ? error.stack : error}\n`);
  } catch (writeError) {
    console.error(writeError);
  }
  process.exit(1);
});
