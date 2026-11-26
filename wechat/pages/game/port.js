/**
 * 原来：页面只画 P0.6 骨架，不加载 lib。
 * 现在：页面和检查脚本都从这里 require domain.cjs.js 与 game.cjs.js。
 * 为什么：场景类在 game 包里，词表在 domain 包里。两边都要进页面用的这条链，不能只在单独的检查里 require。
 */

const domain = require("../../lib/domain.cjs.js");
const game = require("../../lib/game.cjs.js");
const { readAsset } = require("../../platform/read-asset.js");
const packedImages = require("../../packages/art-index.js");

if (typeof globalThis.__LEXI_READ_ASSET__ !== "function") {
  globalThis.__LEXI_READ_ASSET__ = (url) => readAsset(url);
}
globalThis.__LEXI_PACKED_IMAGE__ = (url) => (Object.prototype.hasOwnProperty.call(packedImages, url) ? packedImages[url] : null);
globalThis.__LEXI_WORD_ID__ = (english) => {
  const word = domain.CATALOG_WORDS.find((item) => item.english === english);
  return word ? word.id : "";
};
globalThis.__LEXI_HAS_WORD_AUDIO__ = () => false;
const NATIVE_FIELDS = ["name-form", "hero-name", "name-error", "spell-form", "spell-input", "spell-give-up", "spell-replay", "pin-form", "pin-input", "pin-confirm", "pin-answer", "pin-error", "pin-title", "pin-forgot-button", "pin-submit", "profile-import"];
for (const id of NATIVE_FIELDS) game.bindField(id);

function box(view) {
  return { w: view && view.w > 0 ? view.w : 844, h: view && view.h > 0 ? view.h : 390 };
}

function attach(canvas, view) {
  const catalog = domain.CATALOG_WORDS.length;
  if (catalog !== 863) throw new Error(`catalog ${catalog}`);
  const early = [];
  globalThis.__LEXI_SPEECH_GAP__ = (reason) => early.push(reason);
  const runtime = game.createGame(canvas, box(view));
  globalThis.__LEXI_SPEECH_GAP__ = (reason) => runtime.failures.push(reason);
  for (const reason of early) runtime.failures.push(reason);
  const fonts = game.bootFonts();
  fonts.then((rows) => {
    for (const row of rows) if (!row.ok) runtime.failures.push(`font: ${row.family}: ${row.reason}`);
  });
  let practice = null;
  let route = "boot";
  if (view && view.route === "practice") {
    practice = game.openPractice(view.now);
    route = "learn";
    runtime.start("learn");
  } else {
    runtime.start("boot");
  }
  return {
    catalog,
    route,
    practice,
    runtime,
    copy: game.shellCopy(false).pinNote,
    screenFontPx: game.screenFontPx,
    save: () => game.getSave(),
    fonts,
    field(id) {
      return game.bindField(id);
    },
    packedImages: () => packedImages,
    armImages(canvas) {
      if (!canvas || typeof canvas.createImage !== "function") {
        runtime.failures.push("canvas.createImage is not available; packed images were not decoded in this runtime");
        return 0;
      }
      const table = globalThis.__LEXI_IMAGE_BITMAPS__ || (globalThis.__LEXI_IMAGE_BITMAPS__ = {});
      let started = 0;
      for (const url of Object.keys(packedImages)) {
        const image = canvas.createImage();
        image.onload = () => {
          table[url] = image;
        };
        image.onerror = () => runtime.failures.push(`image decode failed: ${packedImages[url]}`);
        image.src = `/${packedImages[url]}`;
        started += 1;
      }
      return started;
    },
    start(key, data) {
      return runtime.start(key, data);
    },
    step(delta) {
      const scene = runtime.active();
      if (scene && typeof scene.update === "function") scene.update(0, delta);
    },
    paint(ctx, next) {
      return game.paintFrame(runtime.active(), ctx, box(next || view));
    },
    press(x, y, next) {
      return game.pressFrame(runtime.active(), box(next || view), x, y);
    },
    wordScroll(phase, x, y, dy) {
      const scene = runtime.active();
      if (!scene || scene.key !== "battle-results") return false;
      if (phase === "start") {
        const clip = scene.__resultsWordClip;
        const max = scene.__resultsWordMax || 0;
        scene.__resultsWordDrag = Boolean(clip && max > 0 && x >= clip.x && x < clip.x + clip.w && y >= clip.y && y < clip.y + clip.h);
        scene.__resultsWordMoved = false;
        return false;
      }
      if (phase === "move") {
        if (!scene.__resultsWordDrag) return false;
        const max = scene.__resultsWordMax || 0;
        const prev = scene.__resultsWordScroll || 0;
        const next = Math.max(0, Math.min(max, prev - dy));
        if (next === prev) return scene.__resultsWordMoved === true;
        scene.__resultsWordScroll = next;
        scene.__resultsWordMoved = true;
        return true;
      }
      const moved = scene.__resultsWordMoved === true;
      scene.__resultsWordDrag = false;
      scene.__resultsWordMoved = false;
      return moved;
    },
    stop() {
      const scene = runtime.active();
      if (scene && typeof scene.shutdown === "function") scene.shutdown();
    },
  };
}

module.exports = { attach };
