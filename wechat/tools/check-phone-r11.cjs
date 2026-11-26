/**
 * 原来：844×390 把桌面界面缩进黑边，标题、给家长、衣柜都挤在顶栏或左右栏里。
 * 现在：Chrome 画布重放横屏排版，对照 1280×800 和 844×390。
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

function mime(file) {
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

async function main() {
  const gameSrc = fs.readFileSync(path.join(root, "lib", "game.cjs.js"), "utf8");
  assert.ok(gameSrc.includes("词境练习家"));
  fs.mkdirSync("/tmp/lexi-phone-r11", { recursive: true });
  fs.writeFileSync(
    "/tmp/lexi-phone-r11/game.js",
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
    res.writeHead(200, { "content-type": mime(file) });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.addScriptTag({ path: "/tmp/lexi-phone-r11/game.js" });
    const loaded = await page.evaluate(() => ({ err: window.__GAME_ERR__ || "", has: typeof window.__GAME__ }));
    if (loaded.err || loaded.has === "undefined") throw new Error(loaded.err || "game missing");
    await page.evaluate(async () => {
      function readModule(source) {
        const module = { exports: {} };
        const fn = new Function("module", "exports", source);
        fn(module, module.exports);
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
          const key = node.texture;
          if (key && scene.textures) {
            const tex = scene.textures.get(key);
            if (tex && tex.image && !tex.missing) urls.add(tex.image);
          }
          for (const child of node.list || []) walk(child);
        };
        for (const node of scene.children.list) walk(node);
        const missing = [];
        for (const url of urls) {
          if (bitmaps[url]) continue;
          const rel = packed[url];
          if (!rel) {
            missing.push(url);
            continue;
          }
          const image = new Image();
          image.src = `/${rel}`;
          await image.decode();
          bitmaps[url] = image;
        }
        return missing;
      }
      function collect(scene) {
        const texts = [];
        const walk = (node) => {
          if (!node || node.visible === false) return;
          if (node.type === "text" && node.text) texts.push(String(node.text));
          for (const child of node.list || []) walk(child);
        };
        for (const node of scene.children.list) walk(node);
        return texts;
      }
      const ids = ["pin-form", "pin-input", "pin-confirm", "pin-answer", "pin-error", "pin-title", "pin-forgot-button", "pin-submit", "pin-confirm-label", "pin-entry", "pin-forgot", "pin-challenge", "pin-cooldown"];
      for (const id of ids) {
        const tag = id === "pin-form" ? "form" : id.includes("input") || id === "pin-answer" || id === "pin-confirm" ? "input" : "div";
        const node = document.createElement(tag);
        node.id = id;
        node.style.position = "absolute";
        node.style.left = "-4000px";
        document.body.appendChild(node);
      }
      const game = window.__GAME__;
      for (const id of ids) game.bindField(id);
      const canvas = document.getElementById("c");
      canvas.width = 1280;
      canvas.height = 800;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const runtime = game.createGame(canvas, { width: 1280, height: 800 });
      game.openPractice();
      window.__phone = { game, canvas, ctx, runtime, loadBitmaps, collect };
    });
    log("runtime Chrome canvas, not WeChat DevTools, not a phone");

    async function show(key) {
      return page.evaluate(async (sceneKey) => {
        const { runtime, loadBitmaps } = window.__phone;
        runtime.start(sceneKey);
        const scene = runtime.active();
        if (sceneKey === "title" && scene.textures && !scene.textures.exists("bg_home")) {
          scene.load.image("bg_home", "assets/warm/backgrounds/bg_home_2x.webp");
          scene.load.image("bg_village", "assets/warm/backgrounds/bg_village_2x.webp");
          scene.load.start();
        }
        if (sceneKey === "wardrobe" && scene.textures && !scene.textures.exists("bg_room")) {
          scene.load.image("bg_room", "assets/warm/backgrounds/bg_room_2x.webp");
          scene.load.start();
        }
        const missing = await loadBitmaps(scene);
        return { key: scene && scene.key, missing };
      }, key);
    }

    async function paint(name, w, h) {
      const payload = await page.evaluate(({ w, h }) => {
        const { game, canvas, ctx, runtime } = window.__phone;
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        const scene = runtime.active();
        const plan = game.paintFrame(scene, ctx, { w, h });
        const pixel = (x, y) => Array.from(ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), 1, 1).data);
        const texts = plan.texts.map((item) => ({ text: item.text, x: item.x, y: item.y, w: item.w, h: item.h, font: item.fontPx }));
        const hits = plan.hits.filter((item) => item.w > 0).map((item) => ({
          text: item.text || (item.node && item.node.name) || "",
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        }));
        const sheets = (plan.fills || []).filter((fill) => fill.role === "sheet").map((fill) => ({ x: fill.x, y: fill.y, w: fill.w, h: fill.h }));
        const outside = [...texts, ...hits].filter((item) => item.y < 4 || item.y + item.h > h - 4 || item.x < 4 || item.x + item.w > w - 4);
        return {
          png: canvas.toDataURL("image/png"),
          texts,
          hits,
          sheets,
          left: pixel(2, Math.round(h / 2)),
          right: pixel(w - 3, Math.round(h / 2)),
          overflow: plan.overflow,
          outside,
        };
      }, { w, h });
      const file = path.join(evidence, name);
      fs.writeFileSync(file, Buffer.from(payload.png.split(",")[1], "base64"));
      fs.mkdirSync(shots, { recursive: true });
      fs.copyFileSync(file, path.join(shots, name));
      log(`shot ${name} overflow=${payload.overflow} left=${payload.left.join(",")} right=${payload.right.join(",")} outside=${JSON.stringify(payload.outside)}`);
      if (name.includes("wardrobe-844")) log(`wardrobe texts ${JSON.stringify(payload.texts.map((item) => [item.text, Math.round(item.x), Math.round(item.y), Math.round(item.w), Math.round(item.h)]))}`);
      return payload;
    }

    function inside(item, w, h) {
      return item.x >= 4 && item.y >= 4 && item.x + item.w <= w - 4 && item.y + item.h <= h - 4;
    }

    function dark(pixel) {
      return pixel[0] < 12 && pixel[1] < 12 && pixel[2] < 12;
    }

    async function press(label, w, h) {
      return page.evaluate(({ text, w, h }) => {
        const { game, runtime } = window.__phone;
        const scene = runtime.active();
        const view = { w, h };
        const plan = game.layoutFrame(scene, view);
        const hit = plan.hits.find((item) => item.node && item.node.name === `pin:${text}`)
          || plan.hits.find((item) => String(item.text || "") === text);
        if (!hit) return { ok: false, text };
        const pressed = game.pressFrame(scene, view, hit.x + hit.w / 2, hit.y + hit.h / 2);
        const input = document.getElementById("pin-input");
        const again = document.getElementById("pin-confirm");
        return { ok: Boolean(pressed), text, pin: input && input.value, again: again && again.value };
      }, { text: label, w, h });
    }

    const title = await show("title");
    assert.strictEqual(title.key, "title");
    assert.deepStrictEqual(title.missing, []);
    for (const [w, h, name] of [[1280, 800, "w8-r11-title-1280x800.png"], [844, 390, "w8-r11-title-844x390.png"]]) {
      const shot = await paint(name, w, h);
      const labels = shot.texts.map((item) => item.text);
      assert.ok(labels.includes("词境练习家"), labels.join("|"));
      assert.ok(labels.includes("LexiQuest"));
      assert.ok(labels.some((item) => item.includes("认识单词")));
      assert.ok(labels.includes("继续冒险") || labels.includes("开始冒险"));
      assert.ok(labels.includes("新的冒险"));
      assert.ok(labels.includes("换角色"));
      assert.ok(!labels.some((item) => /Enter|Esc|\sN$/.test(item)), labels.join("|"));
      const brand = shot.texts.find((item) => item.text === "词境练习家");
      const tag = shot.texts.find((item) => item.text.includes("认识单词"));
      const buttons = shot.hits.filter((item) => ["继续冒险", "开始冒险", "新的冒险", "换角色"].includes(item.text));
      assert.ok(tag.y > brand.y + brand.h - 1);
      assert.ok(buttons.every((item) => item.y > tag.y + tag.h - 1));
      assert.ok(buttons.every((item) => item.w >= 44 && item.h >= 44 && inside(item, w, h)));
      const banner = shot.sheets.find((sheet) => sheet.w > w * 0.85 && sheet.y < 80);
      assert.ok(!banner, `full-width top banner ${JSON.stringify(shot.sheets)}`);
      assert.ok(!dark(shot.left) && !dark(shot.right), `letterbox ${shot.left} ${shot.right}`);
    }

    await show("guide");
    for (const [w, h, name] of [[1280, 800, "w8-r11-guide-setup-1280x800.png"], [844, 390, "w8-r11-guide-setup-844x390.png"]]) {
      const shot = await paint(name, w, h);
      const again = shot.hits.find((item) => item.text === "再输" || item.text === "pin:再输");
      assert.ok(again, shot.hits.map((item) => item.text).join("|"));
      assert.ok(again.w >= 52 && again.h >= 44 && inside(again, w, h), JSON.stringify(again));
      const note = shot.texts.find((item) => item.text.includes("不是安全登录"));
      assert.ok(note && note.y + note.h <= again.y, "keys overlap the note");
      const keys = shot.hits.filter((item) => String(item.text).startsWith("pin:") || /^[0-9]$/.test(item.text) || ["退格", "再输", "确定"].includes(item.text));
      const span = Math.max(...keys.map((item) => item.x + item.w)) - Math.min(...keys.map((item) => item.x));
      assert.ok(span > w * 0.55, `keypad still a narrow column ${span}`);
      assert.ok(!dark(shot.left) && !dark(shot.right));
      assert.ok(shot.texts.some((item) => item.text.includes("再输入一次") || item.text.includes("再输")));
    }

    for (const digit of ["2", "5", "8", "0"]) {
      const pressed = await press(digit, 844, 390);
      assert.strictEqual(pressed.ok, true, JSON.stringify(pressed));
    }
    await paint("w8-r11-guide-filled-844x390.png", 844, 390);
    await paint("w8-r11-guide-filled-1280x800.png", 1280, 800);
    assert.strictEqual((await press("再输", 844, 390)).ok, true);
    for (const digit of ["2", "5", "8", "0"]) assert.strictEqual((await press(digit, 844, 390)).ok, true);
    const ready = await page.evaluate(() => ({
      pin: document.getElementById("pin-input").value,
      again: document.getElementById("pin-confirm").value,
    }));
    log(`fields ${JSON.stringify(ready)}`);
    assert.strictEqual(ready.pin, "2580");
    assert.strictEqual(ready.again, "2580");
    assert.strictEqual((await press("确定", 844, 390)).ok, true);
    const unlocked = await page.waitForFunction(() => window.__phone.collect(window.__phone.runtime.active()).some((item) => item.includes("学习进度")), null, { timeout: 15000 }).then(() => true).catch(() => false);
    assert.strictEqual(unlocked, true, "pin setup did not unlock");
    const stored = await page.evaluate(() => localStorage.getItem("lexiquest.parent-pin.v1"));
    assert.ok(stored && stored.length > 0);
    log(`stored ${stored.length}`);
    for (const [w, h, name] of [[1280, 800, "w8-r11-guide-unlocked-1280x800.png"], [844, 390, "w8-r11-guide-unlocked-844x390.png"]]) {
      const shot = await paint(name, w, h);
      const labels = shot.texts.map((item) => item.text).join("\n");
      assert.ok(!labels.includes("这台电脑"), labels);
      assert.ok(labels.includes("数据保存在当前设备"), labels);
      assert.ok(shot.texts.every((item) => item.font >= 14));
      assert.ok(shot.hits.filter((item) => item.h > 0).every((item) => item.h >= 44 && item.w >= 44 && inside(item, w, h)));
    }

    const wardrobe = await show("wardrobe");
    assert.strictEqual(wardrobe.key, "wardrobe");
    for (const [w, h, name] of [[1280, 800, "w8-r11-wardrobe-1280x800.png"], [844, 390, "w8-r11-wardrobe-844x390.png"]]) {
      const shot = await paint(name, w, h);
      const by = (text) => shot.texts.find((item) => item.text === text || item.text.includes(text));
      const heading = by("衣柜");
      const wreath = by("花环戴在帽外");
      const owned = by("已有装备");
      const card = by("旅行短衣");
      const worn = by("穿着");
      const title = by("称号");
      assert.ok(heading && wreath && owned && card && worn && title);
      assert.ok(heading.y < wreath.y && wreath.y < owned.y && owned.y < card.y && card.y < title.y, JSON.stringify(shot.texts.map((item) => [item.text, item.y])));
      const back = shot.hits.find((item) => item.text === "返回");
      assert.ok(back && back.h >= 44 && inside(back, w, h));
      assert.ok(!shot.texts.some((item) => item.text.includes("Esc") || item.text.includes("Enter")));
      assert.ok(!dark(shot.left) && !dark(shot.right));
      const mirrorLeft = Math.max(...shot.hits.filter((item) => item.text === "返回").map((item) => item.x + item.w));
      assert.ok(card.x + card.w <= w - 40, "card ate the mirror column");
      assert.ok(back.x + back.w + 8 <= mirrorLeft || back.y + back.h < card.y);
    }
    if (pageErrors.length) log(`pageerror ${pageErrors.join(" | ")}`);
    log("phone r11 three pages done. Chrome adapter, not WeChat, not a phone.");
  } finally {
    await browser.close();
    server.close();
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, "w8-r11-phone.log"), `${lines.join("\n")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  fs.mkdirSync(path.join(__dirname, "..", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "evidence", "w8-r11-phone.log"), `${lines.join("\n")}\n${error && error.stack || error}\n`);
  process.exit(1);
});
