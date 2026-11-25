/**
 * 原来：页面只画 P0.6 骨架，不加载 lib。
 * 现在：页面和检查脚本都从这里 require domain.cjs.js 与 game.cjs.js。
 * 为什么：场景类在 game 包里，词表在 domain 包里。两边都要进页面用的这条链，不能只在单独的检查里 require。
 */

const domain = require("../../lib/domain.cjs.js");
const game = require("../../lib/game.cjs.js");
const atlasText = require("../../assets/atlas-json/index.js");

if (typeof globalThis.__LEXI_READ_ASSET__ !== "function") {
  globalThis.__LEXI_READ_ASSET__ = (url) => (Object.prototype.hasOwnProperty.call(atlasText, url) ? atlasText[url] : null);
}

function box(view) {
  return { w: view && view.w > 0 ? view.w : 844, h: view && view.h > 0 ? view.h : 390 };
}

function attach(canvas, view) {
  const catalog = domain.CATALOG_WORDS.length;
  if (catalog !== 863) throw new Error(`catalog ${catalog}`);
  const runtime = game.createGame(canvas, box(view));
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
    stop() {
      const scene = runtime.active();
      if (scene && typeof scene.shutdown === "function") scene.shutdown();
    },
  };
}

module.exports = { attach };
