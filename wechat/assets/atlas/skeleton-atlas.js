/**
 * 图集描述的 JS 模块版本。
 *
 * 原来：pages/game/index.js 直接 require("../../assets/atlas/skeleton-atlas.json")。
 * 现在：改成 require 本文件。
 * 为什么：小程序 appservice 的 require 只解析 .js 模块，不解析 .json。
 *         DevTools 实测报 "module 'assets/atlas/skeleton-atlas.json.js' is not defined"，
 *         页面在模块加载阶段就抛错，onLoad 不执行，模拟器只剩背景色。
 * 内容与 skeleton-atlas.json 逐字段一致，改图集时两处要一起改。
 */

module.exports = {
  frames: {
    btn_up: { frame: { x: 0, y: 0, w: 88, h: 88 } },
    btn_down: { frame: { x: 88, y: 0, w: 88, h: 88 } },
    mark: { frame: { x: 176, y: 0, w: 44, h: 44 } },
  },
  meta: {
    image: "skeleton-atlas.png",
    size: { w: 220, h: 88 },
  },
};
