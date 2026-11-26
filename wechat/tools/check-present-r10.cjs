/**
 * 原来：标题、给家长、衣柜的适配器图是手画计划层，空镜子和没有密码键被当成了画面。
 * 现在：在 Chrome 画布上走 paintFrame，点数字键，用已有家长密码逻辑保存并再输入一次。
 * 为什么：这是 Node/Chrome 适配器，不是微信开发者工具，也不是真机。考试进入路径这一轮不改。
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
  assert.ok(gameSrc.includes("词境练习家"), "bundle is missing the product name");
  fs.mkdirSync("/tmp/lexi-present-r10", { recursive: true });
  fs.writeFileSync(
    "/tmp/lexi-present-r10/game.js",
    `var module={exports:{}};var exports=module.exports;\ntry{\n${gameSrc}\nwindow.__GAME__=module.exports;\n}catch(error){window.__GAME_ERR__=String(error&&error.stack||error);}\n`,
  );
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><body style='margin:0;background:#143d2c'><canvas id='c'></canvas></body>");
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
    await page.addScriptTag({ path: "/tmp/lexi-present-r10/game.js" });
    const loaded = await page.evaluate(() => ({ err: window.__GAME_ERR__ || "", has: typeof window.__GAME__ }));
    if (loaded.err || loaded.has === "undefined") throw new Error(loaded.err || "game missing");
    const boot = await page.evaluate(async () => {
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
        const textures = [];
        const walk = (node) => {
          if (!node || node.visible === false) return;
          if (node.type === "text" && node.text) texts.push(String(node.text));
          if (node.texture) textures.push(`${node.texture}:${node.frame || ""}`);
          for (const child of node.list || []) walk(child);
        };
        for (const node of scene.children.list) walk(node);
        return { texts, textures };
      }
      function pixel(ctx, x, y) {
        const data = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
      }
      const ids = ["pin-form", "pin-input", "pin-confirm", "pin-answer", "pin-error", "pin-title", "pin-forgot-button", "pin-submit", "pin-confirm-label", "pin-entry", "pin-forgot", "pin-challenge", "pin-cooldown"];
      for (const id of ids) {
        const tag = id === "pin-form" ? "form" : id.includes("input") || id.includes("answer") || id.includes("confirm") && id.endsWith("confirm") ? "input" : "div";
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
      const practice = game.openPractice();
      window.__present = { game, canvas, ctx, runtime, loadBitmaps, collect, pixel, packed };
      return {
        profile: practice.save.player.name,
        classId: practice.save.player.classId,
        outfits: practice.save.ownedOutfitIds,
        chapterId: practice.chapterId,
      };
    });
    log("runtime Chrome canvas, not WeChat DevTools, not a phone");
    log(`profile ${JSON.stringify(boot)}`);
    assert.ok(boot.outfits.includes("traveler"));

    async function show(key) {
      return page.evaluate(async (sceneKey) => {
        const { runtime, loadBitmaps, collect } = window.__present;
        runtime.start(sceneKey);
        const scene = runtime.active();
        if (sceneKey === "title" && scene.textures && !scene.textures.exists("bg_home")) {
          scene.load.image("bg_home", "assets/warm/backgrounds/bg_home_2x.webp");
          scene.load.image("bg_village", "assets/warm/backgrounds/bg_village_2x.webp");
          scene.load.start();
        }
        const missing = await loadBitmaps(scene);
        const found = collect(scene);
        return {
          key: scene && scene.key,
          missing,
          texts: found.texts,
          textures: found.textures.filter((item) => item.startsWith("cls:") || item.startsWith("logo_") || item.includes("旅行")),
          failures: runtime.failures.filter((item) => item.startsWith("asset ") || item.startsWith("atlas ") || item.startsWith("image ")).slice(0, 12),
        };
      }, key);
    }

    async function paint(name, w, h) {
      const payload = await page.evaluate(({ w, h }) => {
        const { game, canvas, ctx, runtime, collect, pixel } = window.__present;
        canvas.width = w;
        canvas.height = h;
        const scene = runtime.active();
        const plan = game.paintFrame(scene, ctx, { w, h });
        const body = collect(scene);
        const hero = game.worldToScreen({ x: scene.key === "wardrobe" ? 1000 : 250, y: scene.key === "wardrobe" ? 430 : 560 }, { w, h });
        const away = game.worldToScreen({ x: scene.key === "wardrobe" ? 1180 : 900, y: scene.key === "wardrobe" ? 180 : 500 }, { w, h });
        const card = game.worldToScreen({ x: 420, y: 216 }, { w, h });
        return {
          png: canvas.toDataURL("image/png"),
          planTexts: plan.texts.map((item) => item.text),
          sceneTexts: body.texts,
          hero: pixel(ctx, hero.x, hero.y),
          away: pixel(ctx, away.x, away.y),
          card: pixel(ctx, card.x, card.y),
          overflow: plan.overflow,
          overflowText: plan.texts.filter((item) => item.y >= h - 8).map((item) => item.text),
        };
      }, { w, h });
      const file = path.join(evidence, name);
      fs.writeFileSync(file, Buffer.from(payload.png.split(",")[1], "base64"));
      fs.mkdirSync(shots, { recursive: true });
      fs.copyFileSync(file, path.join(shots, name));
      log(`screenshot ${name} hero=${payload.hero.join(",")} away=${payload.away.join(",")} card=${payload.card.join(",")} overflow=${payload.overflow} off=${(payload.overflowText || []).join("/")}`);
      return payload;
    }

    async function press(label) {
      return page.evaluate((text) => {
        const { game, runtime } = window.__present;
        const scene = runtime.active();
        const view = { w: 1280, h: 800 };
        const plan = game.layoutFrame(scene, view);
        const hit = plan.hits.find((item) => item.node && item.node.name === `pin:${text}`)
          || plan.hits.find((item) => String(item.text || "") === text);
        if (!hit) return { ok: false, text };
        const pressed = game.pressFrame(scene, view, hit.x + hit.w / 2, hit.y + hit.h / 2);
        const input = document.getElementById("pin-input");
        const again = document.getElementById("pin-confirm");
        return {
          ok: Boolean(pressed),
          text,
          pin: input && input.value,
          again: again && again.value,
          name: pressed && pressed.node ? pressed.node.name : "",
        };
      }, label);
    }

    const title = await show("title");
    log(`title ${JSON.stringify({ key: title.key, missing: title.missing, failures: title.failures, texts: title.texts.filter((item) => item.includes("词") || item.includes("冒险") || item.includes("认识")) })}`);
    assert.strictEqual(title.key, "title");
    assert.deepStrictEqual(title.missing, []);
    assert.ok(title.texts.includes("词境练习家"), "product name missing");
    assert.ok(!title.texts.some((item) => item.includes("词境冒险")), "old product name is still a text");
    assert.ok(!title.textures.some((item) => item.startsWith("logo_title")), "logo_title is still visible");
    const titleShot = await paint("w8-r10-title-1280x800.png", 1280, 800);
    assert.ok(titleShot.planTexts.includes("词境练习家"));
    assert.notDeepStrictEqual(titleShot.hero, titleShot.away, "title character pixel matches the empty background");
    await paint("w8-r10-title-844x390.png", 844, 390);

    const guide = await show("guide");
    log(`guide setup ${JSON.stringify({ key: guide.key, missing: guide.missing, failures: guide.failures, texts: guide.texts.filter((item) => item.includes("家长") || item.includes("密码") || item.includes("确定") || item.includes("给家长")) })}`);
    assert.strictEqual(guide.key, "guide");
    assert.ok(guide.texts.some((item) => item.includes("先设一个家长密码")));
    assert.ok(guide.texts.includes("确定"));
    await paint("w8-r10-guide-setup-1280x800.png", 1280, 800);
    await paint("w8-r10-guide-setup-844x390.png", 844, 390);
    for (const digit of ["2", "5", "8", "0"]) {
      const pressed = await press(digit);
      log(`press ${digit} ${JSON.stringify(pressed)}`);
      assert.strictEqual(pressed.ok, true, digit);
    }
    const filled = await paint("w8-r10-guide-filled-1280x800.png", 1280, 800);
    assert.ok(filled.sceneTexts.some((item) => item.includes("密码 2580")), filled.sceneTexts.join(" | "));
    const again = await press("再输");
    log(`press 再输 ${JSON.stringify(again)}`);
    assert.strictEqual(again.ok, true);
    for (const digit of ["2", "5", "8", "0"]) {
      const pressed = await press(digit);
      assert.strictEqual(pressed.ok, true, `again ${digit} ${JSON.stringify(pressed)}`);
    }
    const ready = await page.evaluate(() => {
      const input = document.getElementById("pin-input");
      const again = document.getElementById("pin-confirm");
      return { pin: input && input.value, again: again && again.value };
    });
    log(`fields before submit ${JSON.stringify(ready)}`);
    assert.strictEqual(ready.pin, "2580");
    assert.strictEqual(ready.again, "2580");
    const submitted = await press("确定");
    log(`press 确定 ${JSON.stringify(submitted)}`);
    assert.strictEqual(submitted.ok, true);
    const unlocked = await page.waitForFunction(() => {
      const { collect, runtime } = window.__present;
      return collect(runtime.active()).texts.some((item) => item.includes("学习进度"));
    }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    const afterSetup = await page.evaluate(() => {
      const { collect, runtime } = window.__present;
      const error = document.getElementById("pin-error");
      const stored = localStorage.getItem("lexiquest.parent-pin.v1");
      return {
        texts: collect(runtime.active()).texts.filter((item) => item.includes("学习") || item.includes("目标") || item.includes("密码") || item.includes("给家长")),
        error: error && error.textContent,
        stored: Boolean(stored),
        storedBytes: stored ? stored.length : 0,
      };
    });
    log(`after setup ${JSON.stringify({ unlocked, ...afterSetup })}`);
    assert.strictEqual(unlocked, true, afterSetup.error || "pin setup did not unlock");
    assert.strictEqual(afterSetup.stored, true);
    await paint("w8-r10-guide-unlocked-1280x800.png", 1280, 800);

    const verify = await show("guide");
    log(`guide verify ${JSON.stringify({ key: verify.key, texts: verify.texts.filter((item) => item.includes("密码") || item.includes("输入") || item.includes("学习")) })}`);
    assert.ok(verify.texts.some((item) => item.includes("输入家长密码")), verify.texts.join(" | "));
    for (const digit of ["2", "5", "8", "0"]) {
      const pressed = await press(digit);
      assert.strictEqual(pressed.ok, true, `verify ${digit}`);
    }
    await press("确定");
    const checked = await page.waitForFunction(() => {
      const { collect, runtime } = window.__present;
      return collect(runtime.active()).texts.some((item) => item.includes("学习进度"));
    }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    const afterCheck = await page.evaluate(() => {
      const error = document.getElementById("pin-error");
      return { error: error && error.textContent };
    });
    log(`after verify ${JSON.stringify({ checked, ...afterCheck })}`);
    assert.strictEqual(checked, true, afterCheck.error || "stored pin did not unlock");
    await paint("w8-r10-guide-verify-1280x800.png", 1280, 800);

    const wardrobe = await show("wardrobe");
    log(`wardrobe ${JSON.stringify({ key: wardrobe.key, missing: wardrobe.missing, failures: wardrobe.failures, texts: wardrobe.texts.filter((item) => item.includes("衣") || item.includes("装备") || item.includes("穿着") || item.includes("整")), cls: wardrobe.textures.filter((item) => item.startsWith("cls:")).slice(0, 6) })}`);
    assert.strictEqual(wardrobe.key, "wardrobe");
    assert.deepStrictEqual(wardrobe.missing, []);
    assert.ok(wardrobe.texts.includes("旅行短衣"), wardrobe.texts.join(" | "));
    assert.ok(wardrobe.texts.includes("穿着"));
    assert.ok(wardrobe.textures.some((item) => item.startsWith("cls:warrior:side")));
    const wardrobeShot = await paint("w8-r10-wardrobe-1280x800.png", 1280, 800);
    assert.notDeepStrictEqual(wardrobeShot.hero, wardrobeShot.away, "wardrobe mirror pixel matches an empty spot");
    assert.ok(wardrobeShot.card[0] > 140 && wardrobeShot.card[1] > 140, `equipment card pixel ${wardrobeShot.card.join(",")}`);
    await paint("w8-r10-wardrobe-844x390.png", 844, 390);

    const stages = await show("stages");
    const stageShot = await paint("w8-r10-stages-1280x800.png", 1280, 800);
    const stageNote = stageShot.sceneTexts.find((item) => item.includes("没有可用题目")) || "";
    log(`exam entry path unchanged. scene=${stages.key}. empty-question notice=${stageNote || "absent"}. not a pass`);
    log(`stages texts ${stageShot.sceneTexts.slice(0, 12).join(" | ")}`);
    if (pageErrors.length) log(`pageerror ${pageErrors.join(" | ")}`);
    log("present r10 done");
  } finally {
    await browser.close();
    server.close();
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, "w8-r10-present.log"), `${lines.join("\n")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  fs.mkdirSync(path.join(__dirname, "..", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "evidence", "w8-r10-present.log"), `${lines.join("\n")}\n${error && error.stack || error}\n`);
  process.exit(1);
});
