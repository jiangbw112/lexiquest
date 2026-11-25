/**
 * 原来：只断言缓存 key 的 12 个字段，绘制仍是每帧 fillText。
 * 现在：在 Chrome 里把同一句画两遍，第二遍必须 drawImage 已有纹理，主画布 fillText 保持 0。
 * 为什么：离屏 canvas 上的那一次 fillText 不算主画布逐帧写字。这里不是微信开发者工具，也不是真机。
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const lines = [];
function log(message) {
  lines.push(message);
  console.log(message);
}

async function main() {
  const gameSrc = fs.readFileSync(path.join(root, "lib", "game.cjs.js"), "utf8");
  fs.mkdirSync("/tmp/lexi-glyph", { recursive: true });
  fs.writeFileSync("/tmp/lexi-glyph/game.js", `var module={exports:{}};var exports=module.exports;\ntry{\n${gameSrc}\nwindow.__GAME__=module.exports;\n}catch(error){window.__GAME_ERR__=String(error&&error.stack||error);}\n`);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  try {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><canvas id='c'></canvas>");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    page.once("close", () => server.close());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ path: "/tmp/lexi-glyph/game.js" });
    const result = await page.evaluate(() => {
      const game = window.__GAME__;
      if (!game || game.__GAME_ERR__) throw new Error(window.__GAME_ERR__ || "bundle missing");
      game.resetGlyphCache();
      const canvas = document.getElementById("c");
      canvas.width = 844;
      canvas.height = 390;
      const ctx = canvas.getContext("2d");
      let fill = 0;
      let draw = 0;
      const fillText = ctx.fillText.bind(ctx);
      const drawImage = ctx.drawImage.bind(ctx);
      ctx.fillText = (...args) => {
        fill += 1;
        return fillText(...args);
      };
      ctx.drawImage = (...args) => {
        draw += 1;
        return drawImage(...args);
      };
      class Probe extends game.Phaser.Scene {
        constructor() {
          super("probe-text");
        }
        create() {
          const rows = [
            ["词境练习", "20px", "#17352a"],
            ["胜利", "28px", "#17352a"],
            ["答对 3 题", "16px", "#1f7a4d"],
            ["复习桌", "18px", "#6d5bd0"],
          ];
          rows.forEach(([text, fontSize, color], index) => {
            this.add.text(20, 24 + index * 36, text, { fontFamily: "sans-serif", fontSize, color });
          });
        }
      }
      const runtime = new game.Phaser.Game({ canvas, width: 844, height: 390, scene: [Probe] });
      const live = runtime.start("probe-text");
      game.paintFrame(live, ctx, { w: 844, h: 390 });
      const first = { fill, draw, stats: game.glyphStats() };
      fill = 0;
      draw = 0;
      game.paintFrame(live, ctx, { w: 844, h: 390 });
      const second = { fill, draw, stats: game.glyphStats() };
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 3; i < data.length; i += 16) if (data[i] > 0) ink += 1;
      return { first, second, ink };
    });
    log(`runtime Chrome canvas, not WeChat DevTools, not a phone`);
    log(`first ${JSON.stringify(result.first)}`);
    log(`second ${JSON.stringify(result.second)}`);
    log(`ink samples ${result.ink}`);
    assert.strictEqual(result.first.fill, 0, "first paint wrote fillText on the main canvas");
    assert.strictEqual(result.first.draw, 4, "first paint did not draw four distinct textures");
    assert.strictEqual(result.first.stats.created, 4, "four strings did not create four textures");
    assert.strictEqual(result.first.stats.reused, 0, "first paint reused a texture before it existed");
    assert.strictEqual(result.second.fill, 0, "second paint fell back to fillText");
    assert.strictEqual(result.second.draw, 4, "second paint did not redraw the four textures");
    assert.strictEqual(result.second.stats.created, 4, "second paint created more textures");
    assert.strictEqual(result.second.stats.reused, 4, "second paint did not reuse each texture");
    assert.ok(result.ink > 0, "cached glyph left the canvas blank");
    const out = path.join(root, "evidence/w3-glyph-r2.log");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${lines.join("\n")}\n`);
    fs.copyFileSync(out, "/opt/cursor/artifacts/w3-glyph-r2.log");
  } finally {
    await browser.close();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
