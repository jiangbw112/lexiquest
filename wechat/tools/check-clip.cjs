/**
 * 原来：setMask 只把 mask 放进 data，paint 不调用 ctx.clip，滚出列表的行仍会画出来。
 * 现在：在 Chrome 的 canvas 上跑打包后的 game.cjs.js，画真实衣柜场景，再用 getImageData 比较裁剪前后。
 * 为什么：不能用一份手写日志代替像素。这里不是微信开发者工具，也不是真机。
 *
 * 多出来的 6 件衣服是目录里的真实 id，写进 WardrobeScene 已经在读的那个存档。默认存档只有 traveler，列表不会溢出。
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const view = { w: 844, h: 390 };
const evidence = path.join(root, "evidence");
const shots = "/opt/cursor/artifacts";
const lines = [];
function log(message) {
  lines.push(message);
  console.log(message);
}

function fileOf(url) {
  const packed = require(path.join(root, "packages", "art-index.js"));
  const rel = packed[url];
  if (!rel) return null;
  return path.join(root, rel);
}

function mime(file) {
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

function packedJsonText() {
  const index = require(path.join(root, "packages", "art-json-index.js"));
  const texts = {};
  for (const [url, rel] of Object.entries(index)) {
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), url);
    texts[url] = fs.readFileSync(file, "utf8");
  }
  return texts;
}

async function main() {
  const atlas = require(path.join(root, "assets", "atlas-json", "index.js"));
  const texts = { ...packedJsonText() };
  for (const key of ["assets/warm/atlas/atlas_ui_core.json", "assets/warm/atlas/atlas_wardrobe.json"]) {
    assert.ok(atlas[key], key);
    texts[key] = atlas[key];
  }
  const packedIndex = require(path.join(root, "packages", "art-index.js"));
  const images = {};
  for (const url of [
    "assets/warm/atlas/atlas_wardrobe.png",
    "assets/warm/atlas/atlas_ui_core.png",
    "assets/warm/backgrounds/bg_room_2x.webp",
  ]) {
    const file = fileOf(url);
    assert.ok(file && fs.existsSync(file), url);
    images[url] = { mime: mime(file), b64: fs.readFileSync(file).toString("base64") };
  }
  const gameSrc = fs.readFileSync(path.join(root, "lib", "game.cjs.js"), "utf8");
  assert.ok(gameSrc.includes("clip"), "built game bundle has no clip call");
  fs.mkdirSync("/tmp/lexi-clip", { recursive: true });
  fs.writeFileSync("/tmp/lexi-clip/game.js", `var module={exports:{}};var exports=module.exports;\ntry{\n${gameSrc}\nwindow.__GAME__=module.exports;\n}catch(error){window.__GAME_ERR__=String(error&&error.stack||error);}\n`);

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: view.w, height: view.h } });
  try {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><body style='margin:0'><canvas id='c'></canvas></body>");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    page.once("close", () => server.close());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ path: "/tmp/lexi-clip/game.js" });
    const loaded = await page.evaluate(() => ({ has: typeof window.__GAME__, err: window.__GAME_ERR__ || "", keys: window.__GAME__ ? Object.keys(window.__GAME__).slice(0, 8) : [] }));
    if (!loaded.has || loaded.has === "undefined") throw new Error(`game bundle did not load ${loaded.err} ${pageErrors.join(" | ")}`);
    const boot = await page.evaluate(async ({ texts, images, packedIndex, w, h }) => {
      const canvas = document.getElementById("c");
      canvas.width = w;
      canvas.height = h;
      const game = window.__GAME__;
      if (typeof game.paintFrame !== "function" || typeof game.pressFrame !== "function") throw new Error("paint entry missing");
      const ctx = canvas.getContext("2d");
      if (typeof ctx.clip !== "function" || typeof ctx.save !== "function") throw new Error("canvas has no clip");
      globalThis.__LEXI_READ_ASSET__ = (url) => (Object.prototype.hasOwnProperty.call(texts, url) ? texts[url] : null);
      globalThis.__LEXI_PACKED_IMAGE__ = (url) => (Object.prototype.hasOwnProperty.call(packedIndex, url) ? packedIndex[url] : null);
      const bitmaps = {};
      for (const [url, file] of Object.entries(images)) {
        const image = new Image();
        image.src = `data:${file.mime};base64,${file.b64}`;
        await image.decode();
        bitmaps[url] = image;
      }
      globalThis.__LEXI_IMAGE_BITMAPS__ = bitmaps;
      const runtime = game.createGame(canvas, { width: w, height: h });
      game.openPractice();
      const save = game.getSave();
      const beforeIds = {
        outfits: [...save.ownedOutfitIds],
        cosmetics: [...save.unlockedCosmeticIds],
      };
      for (const id of ["forest-cape", "star-sash"]) {
        if (!save.ownedOutfitIds.includes(id)) save.ownedOutfitIds.push(id);
      }
      for (const id of ["forest_leaf_cape", "acorn_pin", "forest_wreath"]) {
        if (!save.unlockedCosmeticIds.includes(id)) save.unlockedCosmeticIds.push(id);
      }
      runtime.start("wardrobe");
      const scene = runtime.active();
      window.__clip = { game, canvas, ctx, runtime, scene, view: { w, h }, save };
      return {
        clip: typeof ctx.clip,
        scene: scene && scene.key,
        owned: save.ownedOutfitIds,
        cosmetics: save.unlockedCosmeticIds,
        beforeIds,
        failures: runtime.failures.slice(0, 12),
        failureCount: runtime.failures.length,
        missingAssets: runtime.failures.filter((item) => item.startsWith("asset text missing") || item.startsWith("atlas pixels not in package") || item.startsWith("image not in package")),
      };
    }, { texts, images, packedIndex, w: view.w, h: view.h });
    log(`runtime Chrome canvas, not WeChat DevTools, not a phone`);
    log(`boot ${JSON.stringify(boot)}`);
    assert.deepStrictEqual(boot.missingAssets, [], `packed class/chapter assets still missing ${boot.missingAssets.join(" | ")}`);
    assert.strictEqual(boot.scene, "wardrobe");
    assert.ok(boot.owned.includes("traveler") && boot.owned.includes("forest-cape") && boot.owned.includes("star-sash"));
    assert.strictEqual(boot.cosmetics.length, 3);

    async function shot(name) {
      const file = path.join(evidence, name);
      await page.screenshot({ path: file });
      fs.mkdirSync(shots, { recursive: true });
      fs.copyFileSync(file, path.join(shots, name));
      log(`screenshot ${name}`);
    }

    const full = await page.evaluate(() => {
      const { game, ctx, scene, view, canvas } = window.__clip;
      canvas.width = canvas.width;
      const plan = game.paintFrame(scene, ctx, view);
      const names = plan.hits.map((hit) => hit.node && hit.node.name).filter(Boolean);
      return { texts: plan.texts.length, images: plan.images.length, hits: names, overflow: plan.overflow, overlap: plan.overlap };
    });
    log(`full scene ${JSON.stringify(full)}`);
    await shot("w3-wardrobe-full-r7.png");
    fs.copyFileSync(path.join(evidence, "w3-wardrobe-full-r7.png"), path.join(evidence, "w3-wardrobe-overlap-after-r7.png"));
    fs.copyFileSync(path.join(evidence, "w3-wardrobe-full-r7.png"), path.join(shots, "w3-wardrobe-overlap-after-r7.png"));
    assert.ok(full.hits.some((name) => name.startsWith("wardrobe:")), "wardrobe hits missing");

    const composition = await page.evaluate(() => {
      const { game, scene, view, canvas, ctx } = window.__clip;
      const plan = game.layoutFrame(scene, view);
      const board = scene.children.list.find((node) => node.type === "container" && node.data.get("mask"));
      const fill = (board.data.get("mask").graphics.commands || []).find((command) => command.op === "fillRect");
      const origin = game.worldToScreen({ x: fill.x, y: fill.y }, view);
      const scale = game.worldScale(view);
      const mask = { x: origin.x, y: origin.y, w: fill.w * scale, h: fill.h * scale };
      function hitsMask(box) {
        return box.x < mask.x + mask.w && mask.x < box.x + box.w && box.y < mask.y + mask.h && mask.y < box.y + box.h;
      }
      const texts = plan.texts.map((item) => ({
        text: item.text,
        x: Math.round(item.x * 10) / 10,
        y: Math.round(item.y * 10) / 10,
        w: Math.round(item.w * 10) / 10,
        h: Math.round(item.h * 10) / 10,
        hitsMask: hitsMask(item),
      }));
      const buttons = plan.hits
        .filter((item) => !(item.node && item.node.name && item.node.name.startsWith("wardrobe:")))
        .map((item) => ({
          name: item.node && item.node.name,
          text: item.text,
          x: Math.round(item.x * 10) / 10,
          y: Math.round(item.y * 10) / 10,
          w: Math.round(item.w * 10) / 10,
          h: Math.round(item.h * 10) / 10,
          hitsMask: hitsMask(item),
        }));
      const back = texts.find((item) => item.text.includes("返回"));
      const title = texts.find((item) => item.text === "衣柜");
      const owned = texts.find((item) => item.text === "已有装备");
      function pixel(x, y) {
        const data = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
      }
      const slot = game.worldToScreen({ x: 480, y: 216 }, view);
      return {
        mask: { x: Math.round(mask.x * 10) / 10, y: Math.round(mask.y * 10) / 10, w: Math.round(mask.w * 10) / 10, h: Math.round(mask.h * 10) / 10 },
        texts,
        buttons,
        back,
        title,
        owned,
        slotPixel: pixel(slot.x, slot.y),
        backPixel: back ? pixel(back.x + Math.min(8, back.w / 2), back.y + back.h / 2) : null,
        overlap: plan.overlap,
        canvas: `${canvas.width}x${canvas.height}`,
      };
    });
    log(`composition ${JSON.stringify(composition)}`);
    assert.ok(composition.texts.every((item) => item.hitsMask === false), "shelf text still intersects the list mask");
    assert.ok(composition.buttons.every((item) => item.hitsMask === false), "a control still intersects the list mask");
    assert.ok(composition.title, "title missing");
    assert.ok(composition.owned, "已有装备 missing");
    assert.ok(composition.back, "返回 missing");
    assert.strictEqual(composition.overlap, 0, "wardrobe text still intersects a panel or the list");
    assert.ok(composition.slotPixel[0] > 140 && composition.slotPixel[1] > 140, "first row pixel is not the slot");

    const pixels = await page.evaluate(() => {
      const { game, ctx, scene, view, canvas } = window.__clip;
      const board = scene.children.list.find((node) => node.type === "container" && node.data.get("mask"));
      if (!board) throw new Error("board mask missing");
      const mask = board.data.get("mask");
      const fill = (mask.graphics.commands || []).find((command) => command.op === "fillRect");
      if (!fill) throw new Error("mask fillRect missing");
      const slots = (board.list || []).filter((node) => node.type === "nineslice").slice().sort((a, b) => a.y - b.y);
      if (slots.length < 4) throw new Error(`slots ${slots.length}`);
      function world(node) {
        let x = node.x;
        let y = node.y;
        let parent = node.parent;
        while (parent) {
          x += parent.x;
          y += parent.y;
          parent = parent.parent;
        }
        return { x, y };
      }
      function screen(point) {
        return game.worldToScreen(point, view);
      }
      const inside = screen(world(slots[0]));
      const outside = screen(world(slots[3]));
      const maskScreen = screen({ x: fill.x, y: fill.y });
      const scale = game.worldScale(view);
      const maskBox = { x: maskScreen.x, y: maskScreen.y, w: fill.w * scale, h: fill.h * scale };
      const mark = (board.list || []).find((node) => node.frame === "icon_check" && node.visible);
      const markAt = mark ? screen(world(mark)) : null;
      function wipe() {
        canvas.width = canvas.width;
        ctx.fillStyle = "#202020";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      function pixel(x, y) {
        const data = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
      }
      function differ(x, y) {
        let best = null;
        for (let dy = -4; dy <= 4; dy += 1) {
          for (let dx = -4; dx <= 4; dx += 1) {
            const p = pixel(x + dx, y + dy);
            const score = Math.abs(p[0] - 32) + Math.abs(p[1] - 32) + Math.abs(p[2] - 32);
            if (!best || score > best.score) best = { p, dx, dy, score };
          }
        }
        return best;
      }
      const hidden = [];
      for (const node of scene.children.list) {
        if (node === board || !node.visible) continue;
        hidden.push(node);
        node.visible = false;
      }
      const muted = [];
      const mute = (node) => {
        if (node.inputEnabled) {
          muted.push(node);
          node.inputEnabled = false;
        }
        for (const child of node.list || []) mute(child);
      };
      mute(board);
      const held = board.data.get("mask");
      board.clearMask(false);
      wipe();
      game.paintFrame(scene, ctx, view);
      const beforeIn = differ(inside.x, inside.y);
      const beforeOut = differ(outside.x, outside.y);
      const beforeMark = markAt ? pixel(markAt.x, markAt.y) : null;
      board.setMask(held);
      wipe();
      game.paintFrame(scene, ctx, view);
      const afterIn = pixel(inside.x + beforeIn.dx, inside.y + beforeIn.dy);
      const afterOut = pixel(outside.x + beforeOut.dx, outside.y + beforeOut.dy);
      const afterMark = markAt ? pixel(markAt.x, markAt.y) : null;
      window.__clip.samples = { inside, outside, beforeIn, beforeOut };
      window.__clip.board = board;
      window.__clip.held = held;
      window.__clip.hidden = hidden;
      window.__clip.muted = muted;
      window.__clip.maskBox = maskBox;
      window.__clip.markAt = markAt;
      return {
        slots: slots.length,
        boardY: board.y,
        maskBox,
        inside,
        outside,
        beforeIn,
        beforeOut,
        afterIn,
        afterOut,
        beforeMark,
        afterMark,
        childCount: (board.list || []).length,
        sceneRoots: scene.children.list.length,
      };
    });
    log(`pixels ${JSON.stringify(pixels)}`);
    assert.ok(pixels.beforeIn.score > 40, "inside row has no pixels before clip");
    assert.ok(pixels.beforeOut.score > 40, "overflow row has no pixels before clip");
    assert.ok(pixels.afterIn[0] + pixels.afterIn[1] + pixels.afterIn[2] > 96, "inside row clipped away");
    const outScore = Math.abs(pixels.afterOut[0] - 32) + Math.abs(pixels.afterOut[1] - 32) + Math.abs(pixels.afterOut[2] - 32);
    assert.ok(outScore < 12, `overflow still drawn ${pixels.afterOut}`);
    assert.ok(pixels.outside.y > pixels.maskBox.y + pixels.maskBox.h - 1, "outside sample is not below the mask");
    assert.ok(pixels.inside.y > pixels.maskBox.y && pixels.inside.y < pixels.maskBox.y + pixels.maskBox.h, "inside sample missed the mask");

    await page.evaluate(() => {
      const { canvas, ctx } = window.__clip;
      const image = canvas.toDataURL("image/png");
      window.__clip.afterUrl = image;
    });
    const afterPng = await page.evaluate(() => window.__clip.afterUrl);
    fs.writeFileSync(path.join(evidence, "w3-wardrobe-after-r7.png"), Buffer.from(afterPng.split(",")[1], "base64"));

    await page.evaluate(() => {
      const { game, ctx, scene, view, canvas, board, held } = window.__clip;
      board.clearMask(false);
      canvas.width = canvas.width;
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.paintFrame(scene, ctx, view);
      board.setMask(held);
    });
    const beforePng = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
    fs.writeFileSync(path.join(evidence, "w3-wardrobe-before-r7.png"), Buffer.from(beforePng.split(",")[1], "base64"));
    for (const name of ["w3-wardrobe-before-r7.png", "w3-wardrobe-after-r7.png"]) {
      fs.copyFileSync(path.join(evidence, name), path.join(shots, name));
    }
    log("screenshot w3-wardrobe-before-r7.png");
    log("screenshot w3-wardrobe-after-r7.png");

    const scroll = await page.evaluate(() => {
      const { game, ctx, scene, view, canvas, board, held, markAt } = window.__clip;
      board.setMask(held);
      for (const node of window.__clip.hidden) node.visible = false;
      const y0 = board.y;
      scene.input.emit("wheel", { x: 400, y: 300, event: { preventDefault() {} } }, [], 0, 200);
      canvas.width = canvas.width;
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.paintFrame(scene, ctx, view);
      function pixel(x, y) {
        const data = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
      }
      const moved = markAt ? pixel(markAt.x, markAt.y) : null;
      const y1 = board.y;
      const scrolled = scene.scroll;
      scene.input.emit("wheel", { x: 400, y: 300, event: { preventDefault() {} } }, [], 0, -1000);
      return { y0, y1, scroll: scrolled, maxScroll: scene.maxScroll, moved };
    });
    log(`scroll ${JSON.stringify(scroll)}`);
    const scrolledPng = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
    fs.writeFileSync(path.join(evidence, "w3-wardrobe-scrolled-r7.png"), Buffer.from(scrolledPng.split(",")[1], "base64"));
    fs.copyFileSync(path.join(evidence, "w3-wardrobe-scrolled-r7.png"), path.join(shots, "w3-wardrobe-scrolled-r7.png"));
    assert.ok(scroll.maxScroll > 0, "list does not overflow");
    assert.ok(scroll.y1 < scroll.y0, "wheel did not move the nested board");
    assert.ok(scroll.scroll > 0, "scroll stayed 0");
    if (pixels.beforeMark && scroll.moved) {
      const same = pixels.beforeMark.every((channel, index) => Math.abs(channel - scroll.moved[index]) < 8);
      assert.ok(!same, "scrolled pixel matches the unscrolled check mark");
    }

    const clicks = await page.evaluate(() => {
      const { game, scene, view, save } = window.__clip;
      for (const node of window.__clip.hidden) node.visible = true;
      for (const node of window.__clip.muted) node.inputEnabled = true;
      const plan = game.layoutFrame(scene, view);
      const cape = plan.hits.find((hit) => hit.node && hit.node.name === "wardrobe:forest-cape");
      const names = plan.hits.map((hit) => hit.node && hit.node.name).filter((name) => name && name.startsWith("wardrobe:"));
      const outside = names.map((name) => plan.hits.find((hit) => hit.node && hit.node.name === name)).find((hit) => !hit);
      const outfit0 = save.equippedOutfitId;
      scene.input.activePointer = { x: 10, y: 10 };
      if (cape) {
        cape.node.emit("pointerdown", { x: 10, y: 10 });
        cape.node.emit("pointerup", { x: 10, y: 10 });
      }
      const outfitRejected = save.equippedOutfitId;
      let pressed = null;
      if (cape) pressed = game.pressFrame(scene, view, cape.x + Math.min(8, cape.w / 2), cape.y + Math.min(8, cape.h / 2));
      const outfitInside = game.getSave().equippedOutfitId;
      const below = window.__clip.samples.outside;
      const missed = game.pressFrame(scene, view, below.x, below.y);
      const outfitOutside = game.getSave().equippedOutfitId;
      return {
        names,
        outfit0,
        outfitRejected,
        pressed: pressed ? pressed.node.name : null,
        outfitInside,
        missed: missed ? missed.node.name : null,
        outfitOutside,
        cape: cape ? { x: cape.x, y: cape.y, w: cape.w, h: cape.h } : null,
      };
    });
    log(`clicks ${JSON.stringify(clicks)}`);
    assert.ok(clicks.cape, "forest-cape hit missing");
    assert.strictEqual(clicks.outfitRejected, clicks.outfit0, "outside pointer still equipped");
    assert.strictEqual(clicks.pressed, "wardrobe:forest-cape");
    assert.notStrictEqual(clicks.outfitInside, clicks.outfit0, "inside click did not change the outfit");
    assert.strictEqual(clicks.missed, null, "clipped row accepted a click");
    assert.strictEqual(clicks.outfitOutside, clicks.outfitInside, "outside click changed the outfit");

    const leak = await page.evaluate(() => {
      const { game, ctx, scene, view, canvas } = window.__clip;
      const sceneNow = window.__clip.runtime.active();
      const board = sceneNow.children.list.find((node) => node.type === "container" && node.data.get("mask"));
      const held = board.data.get("mask");
      for (const node of sceneNow.children.list) {
        if (node !== board) node.visible = false;
      }
      canvas.width = canvas.width;
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.paintFrame(sceneNow, ctx, view);
      ctx.fillStyle = "#00cc44";
      ctx.fillRect(8, 8, 24, 24);
      const data = ctx.getImageData(12, 12, 1, 1).data;
      const kept = [data[0], data[1], data[2], data[3]];
      board.clearMask(false);
      canvas.width = canvas.width;
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.paintFrame(sceneNow, ctx, view);
      const sample = window.__clip.samples;
      const back = ctx.getImageData(Math.round(sample.outside.x + sample.beforeOut.dx), Math.round(sample.outside.y + sample.beforeOut.dy), 1, 1).data;
      board.setMask(held);
      return { sentinel: kept, unmasked: [back[0], back[1], back[2], back[3]] };
    });
    log(`leak ${JSON.stringify(leak)}`);
    assert.ok(leak.sentinel[1] > 160 && leak.sentinel[0] < 40, "clip leaked onto the following fill");
    const unmasked = Math.abs(leak.unmasked[0] - 32) + Math.abs(leak.unmasked[1] - 32) + Math.abs(leak.unmasked[2] - 32);
    assert.ok(unmasked > 40, "removing the mask still hides the overflow row");

    const probe = await page.evaluate(() => {
      const { game, ctx, scene, view, canvas } = window.__clip;
      const sceneNow = window.__clip.runtime.active();
      sceneNow.children.removeAll(true);
      const swatch = document.createElement("canvas");
      swatch.width = 80;
      swatch.height = 40;
      const pen = swatch.getContext("2d");
      pen.fillStyle = "#ff0000";
      pen.fillRect(0, 0, 40, 40);
      pen.fillStyle = "#0000ff";
      pen.fillRect(40, 0, 40, 40);
      const left = pen.getImageData(10, 20, 1, 1).data;
      const right = pen.getImageData(60, 20, 1, 1).data;
      globalThis.__LEXI_IMAGE_BITMAPS__["probe://swatch"] = swatch;
      sceneNow.textures.add("swatch", null, "probe://swatch", "probe://swatch");
      const mask = sceneNow.make.graphics({ x: 0, y: 0 });
      mask.fillStyle(0xffffff);
      mask.fillRect(80, 80, 160, 160);
      const board = sceneNow.add.container(0, 0);
      board.setMask(mask.createGeometryMask());
      const flipped = sceneNow.add.image(140, 120, "swatch").setDisplaySize(80, 40).setFlipX(true);
      const turned = sceneNow.add.image(140, 190, "swatch").setDisplaySize(80, 40).setRotation(Math.PI / 2);
      const crossing = sceneNow.add.image(230, 140, "swatch").setDisplaySize(100, 30);
      board.add([flipped, turned, crossing]);
      const later = sceneNow.add.rectangle(460, 140, 36, 36, 0x00cc44);
      canvas.width = canvas.width;
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.paintFrame(sceneNow, ctx, view);
      function at(worldX, worldY) {
        const point = game.worldToScreen({ x: worldX, y: worldY }, view);
        const data = ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
      }
      const clipped = {
        flipLeft: at(120, 120),
        flipRight: at(160, 120),
        rotUp: at(140, 174),
        rotDown: at(140, 206),
        crossIn: at(200, 140),
        crossOut: at(260, 140),
        later: at(460, 140),
      };
      board.clearMask(false);
      canvas.width = canvas.width;
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.paintFrame(sceneNow, ctx, view);
      const opened = { crossOut: at(260, 140), later: at(460, 140) };
      return {
        sourceLeft: [left[0], left[1], left[2]],
        sourceRight: [right[0], right[1], right[2]],
        clipped,
        opened,
        laterName: later.type,
      };
    });
    log(`transform ${JSON.stringify(probe)}`);
    const transformPng = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
    fs.writeFileSync(path.join(evidence, "w3-clip-transform-r7.png"), Buffer.from(transformPng.split(",")[1], "base64"));
    fs.copyFileSync(path.join(evidence, "w3-clip-transform-r7.png"), path.join(shots, "w3-clip-transform-r7.png"));
    function close(found, expected) {
      return Math.abs(found[0] - expected[0]) < 20 && Math.abs(found[1] - expected[1]) < 20 && Math.abs(found[2] - expected[2]) < 20;
    }
    assert.ok(close(probe.clipped.flipLeft, probe.sourceRight), "flipX did not swap the left side");
    assert.ok(close(probe.clipped.flipRight, probe.sourceLeft), "flipX did not swap the right side");
    assert.ok(close(probe.clipped.rotUp, probe.sourceLeft), "rotation did not move red upward");
    assert.ok(close(probe.clipped.rotDown, probe.sourceRight), "rotation did not move blue downward");
    assert.ok(close(probe.clipped.crossIn, probe.sourceLeft), "the inside half of the crossing image is missing");
    assert.ok(close(probe.clipped.crossOut, [32, 32, 32]), "the outside half of the crossing image was drawn");
    assert.ok(close(probe.clipped.later, [0, 204, 68]), "the rectangle after the mask was clipped");
    assert.ok(close(probe.opened.crossOut, probe.sourceRight), "clearMask still clips the crossing image");
    assert.ok(close(probe.opened.later, [0, 204, 68]), "clearMask changed the following rectangle");

    const nested = await page.evaluate(() => {
      const { game, ctx, view, canvas } = window.__clip;
      const sceneNow = window.__clip.runtime.active();
      sceneNow.children.removeAll(true);
      const outerGraphics = sceneNow.make.graphics({ x: 0, y: 0 });
      outerGraphics.fillStyle(0xffffff);
      outerGraphics.fillRect(100, 100, 70, 70);
      outerGraphics.fillRect(210, 100, 70, 70);
      const outer = sceneNow.add.container(0, 0);
      outer.setMask(outerGraphics.createGeometryMask());
      const innerGraphics = sceneNow.make.graphics({ x: 0, y: 0 });
      innerGraphics.fillStyle(0xffffff);
      innerGraphics.fillCircle(135, 135, 24);
      const inner = sceneNow.add.container(0, 0);
      inner.setMask(innerGraphics.createGeometryMask());
      const blob = sceneNow.add.rectangle(170, 135, 220, 80, 0xffcc00).setName("nested-blob");
      blob.setInteractive();
      inner.add(blob);
      outer.add(inner);
      canvas.width = canvas.width;
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.paintFrame(sceneNow, ctx, view);
      function at(worldX, worldY) {
        const point = game.worldToScreen({ x: worldX, y: worldY }, view);
        const data = ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
        return { rgba: [data[0], data[1], data[2], data[3]], screen: point };
      }
      const samples = {
        center: at(135, 135),
        circleCorner: at(111, 111),
        gap: at(190, 135),
        secondRect: at(245, 135),
      };
      function press(worldX, worldY) {
        const point = game.worldToScreen({ x: worldX, y: worldY }, view);
        const hit = game.pressFrame(sceneNow, view, point.x, point.y);
        return hit && hit.node ? hit.node.name : null;
      }
      const hits = {
        center: press(135, 135),
        circleCorner: press(111, 111),
        gap: press(190, 135),
        secondRect: press(245, 135),
      };
      ctx.fillStyle = "#00cc44";
      ctx.fillRect(8, 8, 18, 18);
      const sentinel = ctx.getImageData(12, 12, 1, 1).data;
      return { samples, hits, sentinel: [sentinel[0], sentinel[1], sentinel[2], sentinel[3]] };
    });
    log(`nested ${JSON.stringify(nested)}`);
    const nestedPng = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
    fs.writeFileSync(path.join(evidence, "w3-clip-nested-r7.png"), Buffer.from(nestedPng.split(",")[1], "base64"));
    fs.copyFileSync(path.join(evidence, "w3-clip-nested-r7.png"), path.join(shots, "w3-clip-nested-r7.png"));
    assert.ok(close(nested.samples.center.rgba, [255, 204, 0]), "nested intersection did not draw");
    assert.ok(close(nested.samples.circleCorner.rgba, [32, 32, 32]), "circle mask used its bounding square");
    assert.ok(close(nested.samples.gap.rgba, [32, 32, 32]), "two fillRects were replaced by their union box");
    assert.ok(close(nested.samples.secondRect.rgba, [32, 32, 32]), "inner mask was ignored after the outer clip");
    assert.strictEqual(nested.hits.center, "nested-blob");
    assert.strictEqual(nested.hits.circleCorner, null);
    assert.strictEqual(nested.hits.gap, null);
    assert.strictEqual(nested.hits.secondRect, null);
    assert.ok(close(nested.sentinel, [0, 204, 68]), "nested clip leaked after paintFrame");

    const transformed = await page.evaluate(() => {
      const { game, ctx, view, canvas } = window.__clip;
      const sceneNow = window.__clip.runtime.active();
      sceneNow.children.removeAll(true);
      function rig(name, x, y, rotation, flipX, mask) {
        const graphics = sceneNow.make.graphics({ x: 0, y: 0 });
        graphics.fillStyle(0xffffff);
        graphics.fillRect(mask.x, mask.y, mask.w, mask.h);
        const board = sceneNow.add.container(x, y).setName(name);
        board.setOrigin(0, 0);
        board.setRotation(rotation);
        board.setFlipX(flipX);
        board.setMask(graphics.createGeometryMask());
        const child = sceneNow.add.rectangle(80, 0, 72, 16, name === "flipped-board" ? 0xff0000 : 0x0000ff);
        board.add(child);
        board.setInteractive({ x: 44, y: -8, width: 72, height: 16 });
        return board;
      }
      rig("flipped-board", 240, 200, 0, true, { x: 120, y: 160, w: 80, h: 80 });
      rig("turned-board", 640, 220, Math.PI / 2, false, { x: 600, y: 284, w: 80, h: 32 });
      canvas.width = canvas.width;
      ctx.fillStyle = "#202020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      game.paintFrame(sceneNow, ctx, view);
      function at(worldX, worldY) {
        const point = game.worldToScreen({ x: worldX, y: worldY }, view);
        const data = ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
      }
      function press(worldX, worldY) {
        const point = game.worldToScreen({ x: worldX, y: worldY }, view);
        const hit = game.pressFrame(sceneNow, view, point.x, point.y);
        return hit && hit.node ? hit.node.name : null;
      }
      return {
        flipAt: at(160, 200),
        flipAway: at(320, 200),
        turnAt: at(640, 300),
        turnAway: at(720, 220),
        turnOutside: at(640, 330),
        hitFlip: press(160, 200),
        hitFlipAway: press(320, 200),
        hitTurn: press(640, 300),
        hitTurnAway: press(720, 220),
        hitTurnOutside: press(640, 330),
      };
    });
    log(`container-transform ${JSON.stringify(transformed)}`);
    const turnedPng = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
    fs.writeFileSync(path.join(evidence, "w3-clip-container-r7.png"), Buffer.from(turnedPng.split(",")[1], "base64"));
    fs.copyFileSync(path.join(evidence, "w3-clip-container-r7.png"), path.join(shots, "w3-clip-container-r7.png"));
    assert.ok(close(transformed.flipAt, [255, 0, 0]), "container flipX did not move the child");
    assert.ok(close(transformed.flipAway, [32, 32, 32]), "container flipX left the child in place");
    assert.ok(close(transformed.turnAt, [0, 0, 255]), "container rotation did not move the child");
    assert.ok(close(transformed.turnAway, [32, 32, 32]), "container rotation left the child in place");
    assert.ok(close(transformed.turnOutside, [32, 32, 32]), "rotated child drew outside its mask");
    assert.strictEqual(transformed.hitFlip, "flipped-board");
    assert.strictEqual(transformed.hitFlipAway, null);
    assert.strictEqual(transformed.hitTurn, "turned-board");
    assert.strictEqual(transformed.hitTurnAway, null);
    assert.strictEqual(transformed.hitTurnOutside, null);
    log("clip checks passed on a Chrome canvas");
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(evidence, "w3-clip-r7.log"), `${lines.join("\n")}\n`);
}

main().catch((error) => {
  log(`FAIL ${error && error.stack ? error.stack : error}`);
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, "w3-clip-r7.log"), `${lines.join("\n")}\n`);
  process.exit(1);
});
