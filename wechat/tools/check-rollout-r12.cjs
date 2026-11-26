/**
 * 原来：技能、结局、对战、关卡、复习、词卡还按桌面坐标缩进窗口。
 * 现在：同一套横屏排版铺到这些页，Chrome 画布留下 844×390。
 * 为什么：这是 Node/Chrome 适配器，不是微信开发者工具，也不是真机。
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const evidence = path.join(root, "evidence");
const shots = "/opt/cursor/artifacts";
const lines = [];
function log(message) {
  lines.push(message);
  console.log(message);
}

async function main() {
  const gameSrc = fs.readFileSync(path.join(root, "lib", "game.cjs.js"), "utf8");
  fs.mkdirSync("/tmp/lexi-phone-r12", { recursive: true });
  fs.writeFileSync(
    "/tmp/lexi-phone-r12/game.js",
    `var module={exports:{}};var exports=module.exports;\ntry{\n${gameSrc}\nwindow.__GAME__=module.exports;\n}catch(error){window.__GAME_ERR__=String(error&&error.stack||error);}\n`,
  );
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><body style='margin:0;background:#000'><canvas id='c'></canvas></body>");
      return;
    }
    const file = path.join(root, url.replace(/^\/+/, ""));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const type = file.endsWith(".webp") ? "image/webp" : file.endsWith(".jpg") ? "image/jpeg" : "image/png";
    res.writeHead(200, { "content-type": type });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ path: "/tmp/lexi-phone-r12/game.js" });
    await page.evaluate(async () => {
      function readModule(source) {
        const module = { exports: {} };
        new Function("module", "exports", source)(module, module.exports);
        return module.exports;
      }
      const atlas = readModule(await (await fetch("/assets/atlas-json/index.js")).text());
      const jsonIndex = readModule(await (await fetch("/packages/art-json-index.js")).text());
      const packed = readModule(await (await fetch("/packages/art-index.js")).text());
      const texts = { ...atlas };
      await Promise.all(Object.entries(jsonIndex).map(async ([url, rel]) => {
        const response = await fetch(`/${rel}`);
        texts[url] = response.ok ? await response.text() : null;
      }));
      globalThis.__LEXI_READ_ASSET__ = (url) => (Object.prototype.hasOwnProperty.call(texts, url) ? texts[url] : null);
      globalThis.__LEXI_PACKED_IMAGE__ = (url) => (Object.prototype.hasOwnProperty.call(packed, url) ? packed[url] : null);
      const bitmaps = {};
      globalThis.__LEXI_IMAGE_BITMAPS__ = bitmaps;
      async function loadBitmaps(scene) {
        const urls = new Set();
        const walk = (node) => {
          if (!node || node.visible === false) return;
          if (node.texture && scene.textures) {
            const tex = scene.textures.get(node.texture);
            if (tex && tex.image && !tex.missing) urls.add(tex.image);
          }
          for (const child of node.list || []) walk(child);
        };
        for (const node of scene.children.list) walk(node);
        for (const url of urls) {
          if (bitmaps[url] || !packed[url]) continue;
          const image = new Image();
          image.src = `/${packed[url]}`;
          await image.decode();
          bitmaps[url] = image;
        }
      }
      const game = window.__GAME__;
      const canvas = document.getElementById("c");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const runtime = game.createGame(canvas, { width: 844, height: 390 });
      game.openPractice();
      window.__roll = { game, canvas, ctx, runtime, loadBitmaps };
    });
    log("runtime Chrome canvas, not WeChat DevTools, not a phone. viewport 844x390");
    const keys = ["skills", "ending", "stages", "review", "collection", "battle", "duel", "overworld", "learn", "battle-results", "profiles", "grades", "create", "exam-battle"];
    for (const key of keys) {
      const result = await page.evaluate(async (sceneKey) => {
        const { game, canvas, ctx, runtime, loadBitmaps } = window.__roll;
        try {
          runtime.start(sceneKey);
        } catch (error) {
          return { key: sceneKey, error: String(error && error.message || error) };
        }
        const scene = runtime.active();
        if (!scene || scene.key !== sceneKey) return { key: scene && scene.key, error: "scene did not start" };
        await loadBitmaps(scene);
        canvas.width = 844;
        canvas.height = 390;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 844, 390);
        const plan = game.paintFrame(scene, ctx, { w: 844, h: 390 });
        const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
        const labels = plan.texts.map((item) => item.text);
        const hits = plan.hits.filter((item) => item.w >= 1 && item.h >= 1);
        const clipped = hits.filter((item) => item.x < 4 || item.y < 4 || item.x + item.w > 840 || item.y + item.h > 386);
        return {
          key: scene.key,
          png: canvas.toDataURL("image/png"),
          labels: labels.slice(0, 16),
          boxes: hits.map((item) => `${item.text || "?"}@${Math.round(item.x)},${Math.round(item.y)} ${Math.round(item.w)}x${Math.round(item.h)}`).join(" | "),
          shortcuts: labels.filter((item) => /Enter|Esc|这台电脑/.test(item)),
          hits: hits.length,
          smallHits: hits.filter((item) => item.w < 44 || item.h < 44).map((item) => item.text || (item.node && item.node.name) || "").slice(0, 8),
          clipped: clipped.map((item) => item.text || (item.node && item.node.name) || "").slice(0, 8),
          overflow: plan.overflow,
          left: pixel(2, 195),
          right: pixel(841, 195),
        };
      }, key);
      if (result.error) {
        log(`${key} did not start: ${result.error}`);
        continue;
      }
      const name = `w8-r12-${key}-844x390.png`;
      fs.writeFileSync(path.join(evidence, name), Buffer.from(result.png.split(",")[1], "base64"));
      fs.mkdirSync(shots, { recursive: true });
      fs.copyFileSync(path.join(evidence, name), path.join(shots, name));
      log(`${key} overflow=${result.overflow} hits=${result.hits} small=${result.smallHits.join("/") || "-"} clipped=${result.clipped.join("/") || "-"} shortcuts=${result.shortcuts.join("/") || "-"} edge=${result.left.join(",")} | ${result.right.join(",")} texts=${result.labels.join(" / ")}`);
      if (result.boxes) log(`  boxes ${result.boxes}`);
      assert.deepStrictEqual(result.shortcuts, [], `${key} still has desktop copy`);
    }
    log("rollout r12 done. Chrome adapter, not WeChat, not a phone.");
  } finally {
    await browser.close();
    server.close();
    fs.writeFileSync(path.join(evidence, "w8-r12-rollout.log"), `${lines.join("\n")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  fs.writeFileSync(path.join(__dirname, "..", "evidence", "w8-r12-rollout.log"), `${lines.join("\n")}\n${error && error.stack || error}\n`);
  process.exit(1);
});
