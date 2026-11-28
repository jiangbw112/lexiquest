/**
 * Chrome wechat-adapter replay of academy 「拼一拼」 help at 844×390.
 * Four states: idle-0, pressed-0, idle-1, disabled-all.
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
  fs.mkdirSync("/tmp/lexi-academy-spell-help", { recursive: true });
  fs.writeFileSync(
    "/tmp/lexi-academy-spell-help/game.js",
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
    await page.addScriptTag({ path: "/tmp/lexi-academy-spell-help/game.js" });
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
      game.bindField("spell-form");
      game.bindField("spell-input");
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
    if (!booted || String(booted).includes("Error")) throw new Error(String(booted));
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
        return { ok: true, from: scene && scene.key, key: next && next.key, text: hit.text, phase: next && next.phase, shown: next && next.spellHelpShown, input: (document.getElementById("spell-input") || {}).value || "" };
      }, label);
      log(`press ${label} -> ${result.ok ? `${result.text} phase=${result.phase || "-"} shown=${result.shown ?? "-"} input=${result.input}` : `missing [${(result.labels || []).join(" / ")}]`}`);
      if (!result.ok) throw new Error(`could not press ${label}`);
      return result;
    }
    async function gesture(kind) {
      const result = await page.evaluate((action) => {
        const { game, runtime } = window.__close;
        const scene = runtime.active();
        const view = { w: 844, h: 390 };
        const plan = game.layoutFrame(scene, view);
        const hits = plan.hits.filter((item) => item.w >= 1 && item.h >= 1);
        const hit = hits.find((item) => item.text === "求助");
        if (!hit && action !== "release") return { ok: false, labels: hits.map((item) => item.text), shown: scene.spellHelpShown, pressed: scene.spellHelpPressed };
        const x = hit ? hit.x + hit.w / 2 : 10;
        const y = hit ? hit.y + hit.h / 2 : 10;
        if (action === "hold") game.holdFrame(scene, view, x, y);
        else if (action === "release") game.releaseFrame(scene, view, hit ? x : 8, hit ? y : 8);
        else game.pressFrame(scene, view, x, y);
        return {
          ok: true,
          action,
          shown: scene.spellHelpShown,
          pressed: !!scene.spellHelpPressed,
          input: (document.getElementById("spell-input") || {}).value || "",
          x: Math.round(x),
          y: Math.round(y),
        };
      }, kind);
      log(`gesture ${kind} -> ${JSON.stringify(result)}`);
      if (!result.ok) throw new Error(`gesture ${kind} failed`);
      return result;
    }
    async function shot(name) {
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
        const help = plan.hits.find((item) => item.text === "求助") || plan.texts.find((item) => item.text === "求助");
        const hx = help ? Math.round(help.x + help.w / 2) : 444;
        const hy = help ? Math.round(help.y + help.h / 2) : 208;
        return {
          phase: scene && scene.phase,
          shown: scene && scene.spellHelpShown,
          pressed: !!(scene && scene.spellHelpPressed),
          input: (document.getElementById("spell-input") || {}).value || "",
          png: canvas.toDataURL("image/png"),
          texts: plan.texts.filter((item) => item.w > 0 && item.h > 0).map(box),
          hits: plan.hits.filter((item) => item.w >= 20 && item.h >= 20).map(box),
          helpHit: Boolean(plan.hits.find((item) => item.text === "求助")),
          confirm: Boolean(plan.hits.find((item) => item.text === "确认")),
          gloss: (plan.texts.find((item) => item.text === "胳膊") || {}).text || "",
          letters: plan.texts.filter((item) => /^[a-z]$/.test(item.text || "")).map((item) => item.text),
          upper: plan.texts.filter((item) => item.text === "A" || item.text === "R" || item.text === "M" || item.text === "ARM" || item.text === "arm").map((item) => item.text),
          helpCenter: pixel(hx, hy),
          helpLabel: pixel(hx, hy - 2),
          slot0: pixel(240, 208),
          confirmCenter: pixel(620, 332),
        };
      });
      const file = path.join(evidence, name);
      fs.mkdirSync(evidence, { recursive: true });
      fs.mkdirSync(shots, { recursive: true });
      fs.writeFileSync(file, Buffer.from(shot.png.split(",")[1], "base64"));
      fs.copyFileSync(file, path.join(shots, name));
      log(`saved ${name} phase=${shot.phase} shown=${shot.shown} pressed=${shot.pressed} input=${shot.input} letters=${shot.letters.join("")} upper=${shot.upper.join(",") || "-"} helpHit=${shot.helpHit} confirm=${shot.confirm} gloss=${shot.gloss}`);
      log(`pixels help=${shot.helpCenter.join(",")} slot0=${shot.slot0.join(",")} confirm=${shot.confirmCenter.join(",")}`);
      log(`texts ${shot.texts.map((item) => `${item.text}@${item.x},${item.y} ${item.w}x${item.h} f${item.font}`).join(" | ")}`);
      const bad = [...shot.texts, ...shot.hits].map((item) => item.text).filter((text) => /脸膊|词境冒险|用键盘|输入框|Enter|Esc/.test(text));
      if (bad.length) log(`PROBLEM copy ${bad.join(" / ")}`);
      return shot;
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
    await press("拼一拼");
    const idle0 = await shot("chrome-adapter-replay-academy-spell-help-idle-0-844x390.png");
    await gesture("hold");
    const pressed0 = await shot("chrome-adapter-replay-academy-spell-help-pressed-0-844x390.png");
    await gesture("release");
    const idle1 = await shot("chrome-adapter-replay-academy-spell-help-idle-1-844x390.png");
    await press("求助");
    await press("求助");
    const disabled = await shot("chrome-adapter-replay-academy-spell-help-disabled-all-844x390.png");
    await press("学一学");
    await press("拼一拼");
    const typed = await page.evaluate(() => {
      const { game, runtime } = window.__close;
      const scene = runtime.active();
      const input = document.getElementById("spell-input");
      input.value = "a";
      const view = { w: 844, h: 390 };
      const before = game.layoutFrame(scene, view);
      const beforeLetters = before.texts.filter((item) => /^[a-z]$/.test(item.text || "")).map((item) => item.text).join("");
      const hit = before.hits.find((item) => item.text === "求助");
      game.pressFrame(scene, view, hit.x + hit.w / 2, hit.y + hit.h / 2);
      const after = game.layoutFrame(scene, view);
      const afterLetters = after.texts.filter((item) => /^[a-z]$/.test(item.text || "")).map((item) => item.text).join("");
      scene.draw();
      return { beforeLetters, afterLetters, kept: input.value };
    });
    log(`typed path before=${typed.beforeLetters} afterHelp=${typed.afterLetters} keptAcrossDraw=${typed.kept}`);
    await press("学一学");
    await press("拼一拼");
    const wrong = await page.evaluate(() => {
      const { game, runtime } = window.__close;
      const scene = runtime.active();
      const input = document.getElementById("spell-input");
      input.value = "x";
      const view = { w: 844, h: 390 };
      const plan = game.layoutFrame(scene, view);
      const letters = plan.texts.filter((item) => /^[a-z]$/.test(item.text || "")).map((item) => item.text).join("");
      const help = plan.hits.find((item) => item.text === "求助");
      game.pressFrame(scene, view, help.x + help.w / 2, help.y + help.h / 2);
      return { letters, replaced: input.value };
    });
    log(`wrong letter shown=${wrong.letters} replaced=${wrong.replaced}`);
    const problems = [];
    if (typed.beforeLetters !== "a" || typed.afterLetters !== "ar" || typed.kept !== "ar") problems.push(`typed path ${JSON.stringify(typed)}`);
    if (wrong.letters !== "x" || wrong.replaced !== "a") problems.push(`wrong letter ${JSON.stringify(wrong)}`);
    if (idle0.letters.join("") !== "") problems.push(`idle-0 letters ${idle0.letters.join("")}`);
    if (idle0.input !== "") problems.push(`idle-0 input ${idle0.input}`);
    if (!idle0.helpHit || !idle0.confirm || idle0.gloss !== "胳膊") problems.push("idle-0 chrome");
    if (pressed0.letters.join("") !== "" || pressed0.shown !== 0 || !pressed0.pressed) problems.push(`pressed-0 shown=${pressed0.shown} pressed=${pressed0.pressed} letters=${pressed0.letters.join("")}`);
    if (idle1.letters.join("") !== "a" || idle1.input !== "a" || idle1.pressed) problems.push(`idle-1 letters=${idle1.letters.join("")} input=${idle1.input}`);
    if (disabled.letters.join("") !== "arm" || disabled.input !== "arm" || disabled.helpHit || !disabled.confirm) problems.push(`disabled letters=${disabled.letters.join("")} input=${disabled.input} helpHit=${disabled.helpHit}`);
    if (disabled.upper.some((text) => text === "A" || text === "R" || text === "M" || text === "ARM")) problems.push(`uppercase ${disabled.upper.join(",")}`);
    if (problems.length) {
      log(`PROBLEM ${problems.join(" || ")}`);
      throw new Error(problems.join(" || "));
    }
    log("spell help states matched idle-0, pressed-0, idle-1, disabled-all");
    fs.writeFileSync(path.join(evidence, "academy-spell-help-replay.log"), `${lines.join("\n")}\n`);
    fs.copyFileSync(path.join(evidence, "academy-spell-help-replay.log"), path.join(shots, "academy-spell-help-replay.log"));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
