/**
 * Chrome wechat-adapter replay of the academy study page at 844×390.
 * This is not WeChat DevTools and not a phone.
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
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
  fs.mkdirSync("/tmp/lexi-academy-v05", { recursive: true });
  fs.writeFileSync(
    "/tmp/lexi-academy-v05/game.js",
    `var module={exports:{}};var exports=module.exports;\ntry{\n${gameSrc}\nwindow.__GAME__=module.exports;\n}catch(error){window.__GAME_ERR__=String(error&&error.stack||error);}\n`,
  );
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><body style="margin:0;background:#000"><canvas id="c"></canvas>
        <form id="spell-form"><input id="spell-input"></form>
        <form id="name-form"><input id="hero-name"><p id="name-error"></p></form>
        <form id="pin-form"><p id="pin-title"></p><input id="pin-input"><input id="pin-confirm"><p id="pin-error"></p></form>
      </body>`);
      return;
    }
    const file = path.join(root, url.replace(/^\/+/, ""));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const type = file.endsWith(".webp") ? "image/webp" : file.endsWith(".ttf") ? "font/ttf" : file.endsWith(".js") ? "text/javascript" : "image/png";
    res.writeHead(200, { "content-type": type });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  const port = server.address().port;
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.addScriptTag({ path: "/tmp/lexi-academy-v05/game.js" });
    const booted = await page.evaluate(async () => {
      if (window.__GAME_ERR__) return window.__GAME_ERR__;
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
        if (scene.textures) {
          for (const key of ["atlas_ui_core", "atlas_ui_pages", "atlas_battle", "atlas_parent"]) {
            const tex = scene.textures.get(key);
            if (tex && tex.image && !tex.missing) urls.add(tex.image);
          }
        }
        for (const url of urls) {
          if (bitmaps[url] || !packed[url]) continue;
          const image = new Image();
          image.src = `/${packed[url]}`;
          await image.decode();
          bitmaps[url] = image;
        }
      }
      const faces = [
        ["Noto Sans SC", "/packages/fonts/NotoSansSC-Regular-core.ttf", "400"],
        ["Noto Sans SC", "/packages/fonts/NotoSansSC-Regular-g3.ttf", "400"],
        ["Noto Sans SC", "/packages/fonts/NotoSansSC-Bold-core.ttf", "700"],
        ["Noto Sans SC", "/packages/fonts/NotoSansSC-Bold-g3.ttf", "700"],
        ["Nunito", "/packages/fonts/Nunito-latin.ttf", "400"],
        ["ZCOOL KuaiLe", "/packages/fonts/ZCOOLKuaiLe-ui.ttf", "400"],
      ];
      for (const [family, url, weight] of faces) {
        const face = new FontFace(family, `url(${url})`, { weight });
        await face.load();
        document.fonts.add(face);
      }
      const game = window.__GAME__;
      for (const id of ["pin-input", "pin-confirm", "pin-answer", "pin-error", "pin-title", "pin-forgot-button", "pin-submit"]) {
        const node = document.createElement(id.includes("input") || id === "pin-answer" || id === "pin-confirm" ? "input" : "div");
        node.id = id;
        node.style.position = "absolute";
        node.style.left = "-4000px";
        document.body.appendChild(node);
        game.bindField(id);
      }
      game.bindField("pin-form");
      const canvas = document.getElementById("c");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const runtime = game.createGame(canvas, { width: 844, height: 390 });
      game.openPractice();
      runtime.start("title");
      const scene = runtime.active();
      const warm = {
        bg_home: "assets/warm/backgrounds/bg_home_2x.webp",
        bg_village: "assets/warm/backgrounds/bg_village_2x.webp",
        bg_learn: "assets/warm/backgrounds/bg_learn_blur_2x.webp",
      };
      for (const [key, url] of Object.entries(warm)) {
        if (scene.textures && !scene.textures.exists(key)) scene.load.image(key, url);
      }
      if (scene.load.totalToLoad > 0) scene.load.start();
      window.__close = { game, canvas, ctx, runtime, loadBitmaps };
      return runtime.active() && runtime.active().key;
    });
    log(`runtime Chrome canvas, not WeChat DevTools, not a phone. viewport 844x390. boot ${booted}`);
    async function press(label) {
      const result = await page.evaluate((wanted) => {
        const { game, runtime } = window.__close;
        const scene = runtime.active();
        const plan = game.layoutFrame(scene, { w: 844, h: 390 });
        const hits = plan.hits.filter((item) => item.w >= 1 && item.h >= 1);
        const hit = hits.find((item) => item.text === wanted) || hits.find((item) => item.text.includes(wanted));
        if (!hit) return { ok: false, key: scene && scene.key, labels: hits.map((item) => item.text) };
        game.pressFrame(scene, { w: 844, h: 390 }, hit.x + hit.w / 2, hit.y + hit.h / 2);
        if (scene.update) scene.update(0, 400);
        const next = runtime.active();
        return { ok: true, from: scene && scene.key, key: next && next.key, text: hit.text, phase: next && next.phase, picking: next && next.picking };
      }, label);
      log(`press ${label} -> ${result.ok ? `${result.text} (${result.from} -> ${result.key} phase=${result.phase || "-"} picking=${result.picking})` : `missing [${(result.labels || []).join(" / ")}]`}`);
      if (!result.ok) throw new Error(`could not press ${label}`);
      return result;
    }
    await press("继续学习");
    await press("学堂");
    const chapter = await page.evaluate(() => {
      const { game, runtime } = window.__close;
      const scene = runtime.active();
      const plan = game.layoutFrame(scene, { w: 844, h: 390 });
      const hits = plan.hits.filter((item) => item.w >= 1 && item.h >= 1);
      const hit = hits.find((item) => item.text.includes("朋友")) || hits.find((item) => item.text.includes("森林"));
      return hit ? hit.text : "";
    });
    if (!chapter) throw new Error("no chapter button");
    await press(chapter);
    await press("确认");
    const shot = await page.evaluate(async () => {
      const { game, canvas, ctx, runtime, loadBitmaps } = window.__close;
      const scene = runtime.active();
      await loadBitmaps(scene);
      const view = { w: 844, h: 390 };
      canvas.width = view.w;
      canvas.height = view.h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, view.w, view.h);
      const plan = game.paintFrame(scene, ctx, view);
      const box = (item) => ({
        text: item.text || "",
        x: Math.round(item.x),
        y: Math.round(item.y),
        w: Math.round(item.w),
        h: Math.round(item.h),
        font: item.fontPx || 0,
      });
      const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
      return {
        key: scene && scene.key,
        phase: scene && scene.phase,
        picking: scene && scene.picking,
        png: canvas.toDataURL("image/png"),
        texts: plan.texts.filter((item) => item.w > 0 && item.h > 0).map(box),
        hits: plan.hits.filter((item) => item.w >= 20 && item.h >= 20).map(box),
        overflow: plan.overflow,
        minFont: plan.minFont,
        minHit: plan.minHit,
        minGap: plan.minGap,
        overlap: plan.overlap,
        overlapLabels: plan.overlapLabels,
        well: pixel(230, 150),
        aaEdge: pixel(86, 240),
        aaFace: pixel(110, 220),
        book: pixel(400, 250),
        gap: pixel(524, 240),
        outside: pixel(20, 200),
        gloss: (plan.texts.find((item) => item.text && item.fontPx >= 36 && /[\u4e00-\u9fff]/.test(item.text)) || {}).text || "",
        word: (plan.texts.find((item) => item.fontPx >= 40 && /^[A-Za-z]/.test(item.text || "")) || {}).text || "",
      };
    });
    const name = "chrome-adapter-replay-academy-learn-v05-844x390.png";
    const file = path.join(evidence, name);
    fs.mkdirSync(evidence, { recursive: true });
    fs.mkdirSync(shots, { recursive: true });
    fs.writeFileSync(file, Buffer.from(shot.png.split(",")[1], "base64"));
    fs.copyFileSync(file, path.join(shots, name));
    log(`saved ${name} scene=${shot.key} phase=${shot.phase} picking=${shot.picking} overflow=${shot.overflow} minFont=${shot.minFont} minHit=${Math.round(shot.minHit)} minGap=${shot.minGap} overlap=${shot.overlap}`);
    log(`live word=${shot.word} gloss=${shot.gloss}`);
    log(`pixels well=${shot.well.join(",")} aaEdge=${shot.aaEdge.join(",")} aaFace=${shot.aaFace.join(",")} book=${shot.book.join(",")} divider=${shot.gap.join(",")} outside=${shot.outside.join(",")}`);
    log(`overlap labels ${(shot.overlapLabels || []).join(" || ")}`);
    log(`texts ${shot.texts.map((item) => `${item.text}@${item.x},${item.y} ${item.w}x${item.h} f${item.font}`).join(" | ")}`);
    log(`hits ${shot.hits.map((item) => `${item.text}@${item.x},${item.y} ${item.w}x${item.h}`).join(" | ")}`);
    const bad = [...shot.texts, ...shot.hits].map((item) => item.text).filter((text) => /腕膊|脸膊|词境冒险|Enter|Esc|这台电脑/.test(text));
    if (bad.length) log(`PROBLEM copy ${bad.join(" / ")}`);
    if (shot.gloss && shot.gloss !== "胳膊" && shot.word === "arm") log(`PROBLEM arm gloss ${shot.gloss}`);
    fs.writeFileSync(path.join(evidence, "academy-v05-replay.log"), `${lines.join("\n")}\n`);
    fs.copyFileSync(path.join(evidence, "academy-v05-replay.log"), path.join(shots, "academy-v05-replay.log"));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
